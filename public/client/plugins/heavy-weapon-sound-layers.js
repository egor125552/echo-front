// Independent recorded heavy-weapon sound pack mixer.
// Balances per-layer gain weights and micro-staggered onset delays so
// Mini-Nuke, Smertonos launch/impact/pierce layers sound cinematic,
// directional, and punchy without masking or digital clipping.
const ROOT = "/assets/audio/heavy-weapons/";

const LAYER_GROUPS = Object.freeze({
  launch: Object.freeze([
    { key: "cannon-launch-crack", gainScale: 0.98, delayMs: 0, rateScale: 1.0 },
    { key: "cannon-launch-body", gainScale: 1.08, delayMs: 12, rateScale: 0.98 },
    { key: "cannon-launch-metal", gainScale: 0.76, delayMs: 28, rateScale: 1.02 },
  ]),
  impact: Object.freeze([
    { key: "cannon-impact-crack", gainScale: 0.98, delayMs: 0, rateScale: 1.0 },
    { key: "cannon-impact-weight", gainScale: 1.12, delayMs: 18, rateScale: 0.96 },
    { key: "cannon-impact-debris", gainScale: 0.88, delayMs: 125, rateScale: 0.98 },
  ]),
  pierce: Object.freeze([
    { key: "cannon-pierce-contact", gainScale: 1.04, delayMs: 0, rateScale: 1.02 },
    { key: "cannon-pierce-debris", gainScale: 0.9, delayMs: 72, rateScale: 0.98 },
  ]),
  nuke: Object.freeze([
    { key: "nuke-explosion-pressure", gainScale: 1.08, delayMs: 0, rateScale: 0.96 },
    { key: "nuke-explosion-crack", gainScale: 0.98, delayMs: 0, rateScale: 1.0 },
    { key: "nuke-explosion-body", gainScale: 1.06, delayMs: 36, rateScale: 0.94 },
    { key: "nuke-explosion-thunder", gainScale: 0.82, delayMs: 145, rateScale: 0.92 },
    { key: "nuke-explosion-debris", gainScale: 0.68, delayMs: 315, rateScale: 0.95 },
  ]),
  nukeFlight: Object.freeze([
    { key: "nuke-flight", gainScale: 1.0, delayMs: 0, rateScale: 1.0 },
  ]),
  cannonFlight: Object.freeze([
    { key: "cannon-flight", gainScale: 1.0, delayMs: 0, rateScale: 1.0 },
  ]),
});

export function createHeavyWeaponSoundLayers(audio) {
  const buffers = new Map();
  const pending = new Map();
  const keys = [...new Set(Object.values(LAYER_GROUPS).flatMap((layers) => layers.map((l) => l.key)))];

  function load(key) {
    if (buffers.has(key)) return Promise.resolve(buffers.get(key));
    if (pending.has(key)) return pending.get(key);
    const url = ROOT + key + (key === "cannon-flight" ? ".wav" : ".mp3");
    const request = Promise.resolve()
      .then(() => audio.load(url))
      .then((buffer) => {
        if (!buffer) throw new Error("Empty heavy weapon sound: " + key);
        buffers.set(key, buffer);
        return buffer;
      })
      .finally(() => pending.delete(key));
    pending.set(key, request);
    return request;
  }

  function ready(group) {
    return Boolean(LAYER_GROUPS[group]?.every((layer) => buffers.has(layer.key)));
  }

  function buffer(group) {
    return ready(group) ? buffers.get(LAYER_GROUPS[group][0].key) : null;
  }

  function play(group, position, options = {}) {
    const layers = LAYER_GROUPS[group];
    if (!layers || !ready(group)) {
      for (const layer of layers ?? []) void load(layer.key).catch(() => {});
      return false;
    }
    const method = position ? "playSpatialBuffer" : "playCenteredBuffer";
    if (typeof audio[method] !== "function") return false;

    const baseGain = Number.isFinite(Number(options.gain)) ? Number(options.gain) : 0.95;
    const baseRate = Number.isFinite(Number(options.playbackRate)) ? Number(options.playbackRate) : 1;

    for (const layer of layers) {
      const fireLayer = () => {
        const buf = buffers.get(layer.key);
        if (!buf) return;
        const config = {
          ...options,
          gain: Math.max(0.05, Math.min(1.65, baseGain * layer.gainScale)),
          playbackRate: Math.max(0.62, Math.min(1.5, baseRate * layer.rateScale)),
          replace: false,
        };
        try {
          if (position) audio[method](buf, position, config);
          else audio[method](buf, config);
        } catch {}
      };
      if (layer.delayMs > 0) setTimeout(fireLayer, layer.delayMs);
      else fireLayer();
    }
    return true;
  }

  return {
    ready,
    buffer,
    play,
    warm: () => Promise.allSettled(keys.map(load)),
  };
}
