export const manifest = {
  id: "spatial-audio-web",
  requires: ["cloudflare-session"],
};

function smoothstep(edge0, edge1, value) {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function hybridSpatialMix(azimuth) {
  const side = Math.abs(Math.sin(azimuth));
  const blend = smoothstep(0.58, 0.97, side);
  return {
    pan: Math.max(-1, Math.min(1, Math.sin(azimuth))),
    stereo: Math.sin(blend * Math.PI / 2),
    hrtf: Math.cos(blend * Math.PI / 2),
  };
}

export async function setup(ctx) {
  const network = ctx.services.get("network");
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const audioContext = new AudioContextClass();
  const buffers = new Map();
  let listener = { x: 0, z: 0, angle: 0 };

  ctx.events.on("game:snapshot", (snapshot) => {
    const self = snapshot?.entities?.find((entity) => entity.id === network.playerId);
    if (self) listener = { x: self.x, z: self.z, angle: self.angle };
  });

  async function load(url) {
    if (buffers.has(url)) return buffers.get(url);
    const promise = fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`Audio HTTP ${response.status}: ${url}`);
        return response.arrayBuffer();
      })
      .then((data) => audioContext.decodeAudioData(data));
    buffers.set(url, promise);
    return promise;
  }

  function playCenteredBuffer(buffer, gainValue = 1) {
    const source = audioContext.createBufferSource();
    const gain = audioContext.createGain();
    source.buffer = buffer;
    gain.gain.value = gainValue;
    source.connect(gain).connect(audioContext.destination);
    source.start();
    return source;
  }

  function localize(position) {
    const dx = position.x - listener.x;
    const dz = position.z - listener.z;
    const localRight = dx * Math.cos(listener.angle) + dz * Math.sin(listener.angle);
    const localForward = dx * Math.sin(listener.angle) - dz * Math.cos(listener.angle);
    const azimuth = Math.atan2(localRight, localForward || 0.000001);
    return { dx, dz, localRight, localForward, azimuth, distance: Math.hypot(dx, dz) };
  }

  function playSpatialBuffer(buffer, position, { radius = 40, gain = 1 } = {}) {
    const local = localize(position);
    if (local.distance > radius) return null;

    const mix = hybridSpatialMix(local.azimuth);
    const attenuation = gain * Math.max(0.025, 1 / (1 + local.distance * 0.16));

    const source = audioContext.createBufferSource();
    const distanceGain = audioContext.createGain();
    const stereoPanner = audioContext.createStereoPanner();
    const stereoGain = audioContext.createGain();
    const hrtfPanner = audioContext.createPanner();
    const hrtfGain = audioContext.createGain();

    source.buffer = buffer;
    distanceGain.gain.value = attenuation;
    stereoPanner.pan.value = mix.pan;

    hrtfPanner.panningModel = "HRTF";
    hrtfPanner.distanceModel = "inverse";
    hrtfPanner.refDistance = 1;
    hrtfPanner.maxDistance = 10000;
    hrtfPanner.rolloffFactor = 0;
    hrtfPanner.positionX.value = local.localRight;
    hrtfPanner.positionY.value = 0;
    hrtfPanner.positionZ.value = -local.localForward;

    const now = audioContext.currentTime;
    stereoGain.gain.setValueAtTime(mix.stereo, now);
    hrtfGain.gain.setValueAtTime(mix.hrtf, now);

    source.connect(distanceGain);
    distanceGain.connect(stereoPanner).connect(stereoGain).connect(audioContext.destination);
    distanceGain.connect(hrtfPanner).connect(hrtfGain).connect(audioContext.destination);
    source.start();

    return {
      source,
      update(nextPosition) {
        const next = localize(nextPosition);
        const nextMix = hybridSpatialMix(next.azimuth);
        const at = audioContext.currentTime + 0.035;
        stereoPanner.pan.linearRampToValueAtTime(nextMix.pan, at);
        stereoGain.gain.linearRampToValueAtTime(nextMix.stereo, at);
        hrtfGain.gain.linearRampToValueAtTime(nextMix.hrtf, at);
        hrtfPanner.positionX.linearRampToValueAtTime(next.localRight, at);
        hrtfPanner.positionZ.linearRampToValueAtTime(-next.localForward, at);
        distanceGain.gain.linearRampToValueAtTime(
          gain * Math.max(0.025, 1 / (1 + next.distance * 0.16)),
          at,
        );
      },
    };
  }

  ctx.services.provide("audio", {
    context: audioContext,
    async resume() {
      if (audioContext.state !== "running") await audioContext.resume();
    },
    load,
    async playCentered(url, options = {}) {
      const buffer = await load(url);
      return playCenteredBuffer(buffer, options.gain ?? 1);
    },
    async playSpatial(url, position, options = {}) {
      const buffer = await load(url);
      return playSpatialBuffer(buffer, position, options);
    },
  });
}
