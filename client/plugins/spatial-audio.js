export const manifest = {
  id: "spatial-audio-web",
  requires: ["cloudflare-session"],
};

function smoothstep(edge0, edge1, value) {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
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

  function playSpatialBuffer(buffer, position, { radius = 40, gainValue = 1 } = {}) {
    const dx = position.x - listener.x;
    const dz = position.z - listener.z;
    const distance = Math.hypot(dx, dz);
    if (distance > radius) return null;

    const rightX = Math.cos(listener.angle);
    const rightZ = Math.sin(listener.angle);
    const forwardX = Math.sin(listener.angle);
    const forwardZ = -Math.cos(listener.angle);
    const localRight = dx * rightX + dz * rightZ;
    const localForward = dx * forwardX + dz * forwardZ;
    const azimuth = Math.atan2(localRight, localForward || 0.000001);
    const side = Math.abs(Math.sin(azimuth));
    const stereoBlend = smoothstep(0.58, 0.97, side);
    const stereoTarget = Math.sin(stereoBlend * Math.PI / 2);
    const hrtfTarget = Math.cos(stereoBlend * Math.PI / 2);
    const attenuation = gainValue * Math.max(0.025, 1 / (1 + distance * 0.16));

    const source = audioContext.createBufferSource();
    const distanceGain = audioContext.createGain();
    const stereoPanner = audioContext.createStereoPanner();
    const stereoGain = audioContext.createGain();
    const hrtfPanner = audioContext.createPanner();
    const hrtfGain = audioContext.createGain();

    source.buffer = buffer;
    distanceGain.gain.value = attenuation;
    stereoPanner.pan.value = Math.max(-1, Math.min(1, Math.sin(azimuth)));

    hrtfPanner.panningModel = "HRTF";
    hrtfPanner.distanceModel = "inverse";
    hrtfPanner.refDistance = 1;
    hrtfPanner.maxDistance = 10000;
    hrtfPanner.rolloffFactor = 0;
    hrtfPanner.positionX.value = localRight;
    hrtfPanner.positionY.value = 0;
    hrtfPanner.positionZ.value = -localForward;

    const now = audioContext.currentTime;
    stereoGain.gain.setValueAtTime(stereoTarget, now);
    hrtfGain.gain.setValueAtTime(hrtfTarget, now);

    source.connect(distanceGain);
    distanceGain.connect(stereoPanner).connect(stereoGain).connect(audioContext.destination);
    distanceGain.connect(hrtfPanner).connect(hrtfGain).connect(audioContext.destination);
    source.start();

    return {
      source,
      update(nextPosition) {
        const ndx = nextPosition.x - listener.x;
        const ndz = nextPosition.z - listener.z;
        const nr = ndx * Math.cos(listener.angle) + ndz * Math.sin(listener.angle);
        const nf = ndx * Math.sin(listener.angle) - ndz * Math.cos(listener.angle);
        const nextAzimuth = Math.atan2(nr, nf || 0.000001);
        const nextSide = Math.abs(Math.sin(nextAzimuth));
        const nextBlend = smoothstep(0.58, 0.97, nextSide);
        const nextStereo = Math.sin(nextBlend * Math.PI / 2);
        const nextHrtf = Math.cos(nextBlend * Math.PI / 2);
        const at = audioContext.currentTime + 0.035;
        stereoPanner.pan.linearRampToValueAtTime(Math.sin(nextAzimuth), at);
        stereoGain.gain.linearRampToValueAtTime(nextStereo, at);
        hrtfGain.gain.linearRampToValueAtTime(nextHrtf, at);
        hrtfPanner.positionX.linearRampToValueAtTime(nr, at);
        hrtfPanner.positionZ.linearRampToValueAtTime(-nf, at);
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
