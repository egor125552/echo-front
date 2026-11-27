// Independent recorded sound pack. The existing audio service owns all playback,
// spatialization, channels, and volume. No game or projectile rules live here.
const ROOT = "/assets/audio/heavy-weapons/";
const groups = Object.freeze({
  launch: ["cannon-launch-crack", "cannon-launch-body", "cannon-launch-metal"],
  impact: ["cannon-impact-crack", "cannon-impact-weight", "cannon-impact-debris"],
  pierce: ["cannon-pierce-contact", "cannon-pierce-debris"],
  nuke: ["nuke-explosion-crack", "nuke-explosion-body", "nuke-explosion-thunder",
    "nuke-explosion-debris", "nuke-explosion-pressure"],
  nukeFlight: ["nuke-flight"],
  cannonFlight: ["cannon-flight"],
});
export function createHeavyWeaponSoundLayers(audio) {
  const buffers = new Map();
  const pending = new Map();
  const keys = [...new Set(Object.values(groups).flat())];
  function load(key) {
    if (buffers.has(key)) return Promise.resolve(buffers.get(key));
    if (pending.has(key)) return pending.get(key);
    const url = ROOT + key + (key === "cannon-flight" ? ".wav" : ".mp3");
    const request = Promise.resolve().then(() => audio.load(url)).then(buffer => {
      if (!buffer) throw new Error("Empty heavy weapon sound: " + key);
      buffers.set(key, buffer);
      return buffer;
    }).finally(() => pending.delete(key));
    pending.set(key, request);
    return request;
  }
  function ready(group) {
    return Boolean(groups[group]?.every(key => buffers.has(key)));
  }
  function buffer(group) {
    return ready(group) ? buffers.get(groups[group][0]) : null;
  }
  function play(group, position, options = {}) {
    if (!ready(group)) {
      for (const key of groups[group] ?? []) void load(key).catch(() => {});
      return false;
    }
    const method = position ? "playSpatialBuffer" : "playCenteredBuffer";
    if (typeof audio[method] !== "function") return false;
    for (const key of groups[group]) {
      // Each layer is a separate decoded asset with its own onset and tail.
      // Never replace a previous layer sharing the same channel.
      const config = { ...options, replace: false };
      if (position) audio[method](buffers.get(key), position, config);
      else audio[method](buffers.get(key), config);
    }
    return true;
  }
  return {
    ready, buffer, play,
    warm: () => Promise.allSettled(keys.map(load)),
  };
}
