export const manifest = {
  id: "building-acoustics",
  requires: ["spatial-audio-web", "cloudflare-session"],
};

const REVERB_BY_ZONE = {
  "warehouse-ground": 0.46,
  "warehouse-upper": 0.58,
  "warehouse-stairs": 0.52,
  outdoor: 0,
};

export async function setup(ctx) {
  const audio = ctx.services.get("audio");
  const network = ctx.services.get("network");
  let currentZone = "outdoor";

  function setZone(zone) {
    const normalized = REVERB_BY_ZONE[zone] == null ? "outdoor" : zone;
    if (normalized === currentZone) return;
    currentZone = normalized;
    audio.setEnvironmentReverbMix(REVERB_BY_ZONE[normalized]);
    ctx.events.emit("acoustics:zone-changed", { zone: normalized });
  }

  ctx.events.on("game:snapshot", (snapshot) => {
    const observedId = snapshot?.spectator?.active ? snapshot.spectator.targetId : network.playerId;
    const self = snapshot?.entities?.find((entity) => entity.id === observedId);
    setZone(self?.acousticZone ?? "outdoor");
  });
  ctx.events.on("network:disconnected", () => setZone("outdoor"));

  ctx.services.provide("building-acoustics", {
    get zone() { return currentZone; },
  });
}
