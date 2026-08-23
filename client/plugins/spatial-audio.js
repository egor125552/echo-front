export const manifest = {
  id: "spatial-audio-web",
  requires: ["cloudflare-session"],
};

export const HRTF_START_ANGLE = 0.95;
export const HRTF_FULL_ANGLE = 1.45;

function smoothstep(edge0, edge1, value) {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function wrappedAbsAngle(azimuth) {
  return Math.abs(Math.atan2(Math.sin(azimuth), Math.cos(azimuth)));
}

export function hybridSpatialMix(azimuth) {
  const angle = wrappedAbsAngle(azimuth);
  const blend = smoothstep(HRTF_START_ANGLE, HRTF_FULL_ANGLE, angle);
  return {
    pan: Math.max(-1, Math.min(1, Math.sin(azimuth))),
    stereo: Math.cos(blend * Math.PI / 2),
    hrtf: Math.sin(blend * Math.PI / 2),
  };
}

export function localizeForListener(listener, position) {
  const dx = position.x - listener.x;
  const dz = position.z - listener.z;
  const localRight = dx * Math.cos(listener.angle) + dz * Math.sin(listener.angle);
  const localForward = dx * Math.sin(listener.angle) - dz * Math.cos(listener.angle);
  const azimuth = Math.atan2(localRight, localForward || 0.000001);
  return { dx, dz, localRight, localForward, azimuth, distance: Math.hypot(dx, dz) };
}

export async function setup(ctx) {
  const network = ctx.services.get("network");
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const audioContext = new AudioContextClass();
  const buffers = new Map();
  const activeChannels = new Map();
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

  function stopChannel(channel) {
    const sources = activeChannels.get(channel);
    if (!sources) return;
    activeChannels.delete(channel);
    for (const source of sources) {
      try { source.stop(); } catch {}
    }
  }

  function trackSource(source, channel, replace = false) {
    if (!channel) return;
    if (replace) stopChannel(channel);
    const sources = activeChannels.get(channel) ?? new Set();
    sources.add(source);
    activeChannels.set(channel, sources);
    source.addEventListener("ended", () => {
      const current = activeChannels.get(channel);
      if (!current) return;
      current.delete(source);
      if (!current.size) activeChannels.delete(channel);
    }, { once: true });
  }

  function playCenteredBuffer(buffer, {
    gain = 1,
    channel = null,
    replace = false,
    loop = false,
  } = {}) {
    const source = audioContext.createBufferSource();
    const gainNode = audioContext.createGain();
    source.buffer = buffer;
    source.loop = Boolean(loop);
    gainNode.gain.value = gain;
    source.connect(gainNode).connect(audioContext.destination);
    trackSource(source, channel, replace);
    source.start();
    return source;
  }

  function localize(position) {
    return localizeForListener(listener, position);
  }

  function rearCutoff(local) {
    if (local.distance < 0.001) return 18000;
    const rearAmount = Math.max(0, Math.min(1, -local.localForward / local.distance));
    return 18000 - rearAmount * 7000;
  }

  function playSpatialBuffer(buffer, position, {
    radius = 40,
    gain = 1,
    channel = null,
    replace = false,
    loop = false,
  } = {}) {
    const local = localize(position);
    if (local.distance > radius) return null;

    const mix = hybridSpatialMix(local.azimuth);
    const attenuation = gain * Math.max(0.025, 1 / (1 + local.distance * 0.16));

    const source = audioContext.createBufferSource();
    const distanceGain = audioContext.createGain();
    const stereoPanner = audioContext.createStereoPanner();
    const stereoGain = audioContext.createGain();
    const hrtfPanner = audioContext.createPanner();
    const rearFilter = audioContext.createBiquadFilter();
    const hrtfGain = audioContext.createGain();

    source.buffer = buffer;
    source.loop = Boolean(loop);
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

    rearFilter.type = "lowpass";
    rearFilter.Q.value = 0.35;
    rearFilter.frequency.value = rearCutoff(local);

    const now = audioContext.currentTime;
    stereoGain.gain.setValueAtTime(mix.stereo, now);
    hrtfGain.gain.setValueAtTime(mix.hrtf, now);

    source.connect(distanceGain);
    distanceGain.connect(stereoPanner).connect(stereoGain).connect(audioContext.destination);
    distanceGain.connect(hrtfPanner).connect(rearFilter).connect(hrtfGain).connect(audioContext.destination);
    trackSource(source, channel, replace);
    source.start();

    return {
      source,
      update(nextPosition) {
        const next = localize(nextPosition);
        const nextMix = hybridSpatialMix(next.azimuth);
        const at = audioContext.currentTime + 0.06;
        stereoPanner.pan.linearRampToValueAtTime(nextMix.pan, at);
        stereoGain.gain.linearRampToValueAtTime(nextMix.stereo, at);
        hrtfGain.gain.linearRampToValueAtTime(nextMix.hrtf, at);
        hrtfPanner.positionX.linearRampToValueAtTime(next.localRight, at);
        hrtfPanner.positionZ.linearRampToValueAtTime(-next.localForward, at);
        rearFilter.frequency.linearRampToValueAtTime(rearCutoff(next), at);
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
    stopChannel,
    async playCentered(url, options = {}) {
      const buffer = await load(url);
      return playCenteredBuffer(buffer, options);
    },
    async playSpatial(url, position, options = {}) {
      const buffer = await load(url);
      return playSpatialBuffer(buffer, position, options);
    },
  });
}
