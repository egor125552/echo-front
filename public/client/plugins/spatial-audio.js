export const manifest = {
  id: "spatial-audio-web",
  requires: ["cloudflare-session"],
};

export const HRTF_START_ANGLE = 0.95;
export const HRTF_FULL_ANGLE = 1.45;
export const MASTER_FILTER_MIN_HZ = 80;
export const MASTER_FILTER_MAX_HZ = 18000;

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function smoothstep(edge0, edge1, value) {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function wrappedAbsAngle(azimuth) {
  return Math.abs(Math.atan2(Math.sin(azimuth), Math.cos(azimuth)));
}

function createReverbImpulse(audioContext, durationSeconds = 2.4, decay = 3.2) {
  const length = Math.max(1, Math.floor(audioContext.sampleRate * durationSeconds));
  const impulse = audioContext.createBuffer(2, length, audioContext.sampleRate);

  for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      const envelope = Math.pow(1 - i / length, decay);
      data[i] = (Math.random() * 2 - 1) * envelope;
    }
  }

  return impulse;
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
  let reverbMix = 0;
  let muffleCutoff = MASTER_FILTER_MAX_HZ;

  // Every game sound is routed through one persistent master bus. The low-pass
  // lives before both dry and reverb paths, so critical-health muffling affects
  // the entire game mix without recreating or restarting any audio source.
  // Speech synthesis is outside WebAudio and stays clear for accessibility.
  const masterInput = audioContext.createGain();
  const masterLowpass = audioContext.createBiquadFilter();
  const dryGain = audioContext.createGain();
  const reverb = audioContext.createConvolver();
  const wetGain = audioContext.createGain();
  masterLowpass.type = "lowpass";
  masterLowpass.Q.value = 0.7;
  masterLowpass.frequency.value = MASTER_FILTER_MAX_HZ;
  reverb.buffer = createReverbImpulse(audioContext);
  dryGain.gain.value = 1;
  wetGain.gain.value = 0;
  masterInput.connect(masterLowpass);
  masterLowpass.connect(dryGain).connect(audioContext.destination);
  masterLowpass.connect(reverb).connect(wetGain).connect(audioContext.destination);

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

  // Archipelago deliberately uses setTargetAtTime for continuously changing
  // combat audio. A later target bends the same exponential curve instead of
  // cancelling a finite ramp and starting a new one, which avoids zippering.
  function targetParam(param, value, timeConstant = 0.25) {
    const constant = Math.max(0.01, Number(timeConstant) || 0.25);
    param.setTargetAtTime(value, audioContext.currentTime, constant);
  }

  function setReverbMix(value) {
    reverbMix = clamp01(value);
    targetParam(dryGain.gain, 1 - reverbMix * 0.32, 0.28);
    targetParam(wetGain.gain, reverbMix * 0.9, 0.34);
  }

  function setMuffleCutoff(value) {
    const numeric = Number(value);
    muffleCutoff = Math.max(
      MASTER_FILTER_MIN_HZ,
      Math.min(MASTER_FILTER_MAX_HZ, Number.isFinite(numeric) ? numeric : MASTER_FILTER_MAX_HZ),
    );
    targetParam(masterLowpass.frequency, muffleCutoff, 0.36);
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
    source.connect(gainNode).connect(masterInput);
    trackSource(source, channel, replace);
    source.start();
    return {
      source,
      setGain(nextGain, timeConstant = 0.18) {
        targetParam(gainNode.gain, Math.max(0, Number(nextGain) || 0), timeConstant);
      },
      stop() {
        try { source.stop(); } catch {}
      },
    };
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
    distanceGain.connect(stereoPanner).connect(stereoGain).connect(masterInput);
    distanceGain.connect(hrtfPanner).connect(rearFilter).connect(hrtfGain).connect(masterInput);
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
    setReverbMix,
    getReverbMix() {
      return reverbMix;
    },
    setMuffleCutoff,
    getMuffleCutoff() {
      return muffleCutoff;
    },
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
