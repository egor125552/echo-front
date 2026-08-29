export const manifest = {
  id: "building-acoustics",
  version: "1.1.0",
  requires: ["spatial-audio-web", "cloudflare-session"],
};

const LEGACY_REVERB_BY_ZONE = {
  "warehouse-ground": 0.46,
  "warehouse-upper": 0.58,
  "warehouse-stairs": 0.52,
  outdoor: 0,
};

function clamp01(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, number));
}

export async function setup(ctx) {
  const audio = ctx.services.get("audio");
  const network = ctx.services.get("network");
  let currentZone = "outdoor";
  let currentReverbMix = 0;

  function setEnvironment(zone, profile = null) {
    const requestedZone = String(profile?.zone ?? zone ?? "outdoor");
    const fallbackMix = LEGACY_REVERB_BY_ZONE[requestedZone]
      ?? LEGACY_REVERB_BY_ZONE[zone]
      ?? 0;
    const reverbMix = clamp01(profile?.reverbMix, fallbackMix);
    if (requestedZone === currentZone && Math.abs(reverbMix - currentReverbMix) < 0.001) return;
    currentZone = requestedZone;
    currentReverbMix = reverbMix;
    audio.setEnvironmentReverbMix(reverbMix);
    ctx.events.emit("acoustics:zone-changed", {
      zone: requestedZone,
      reverbMix,
      profile: profile ?? null,
    });
  }

  ctx.events.on("game:snapshot", (snapshot) => {
    const observedId = snapshot?.spectator?.active ? snapshot.spectator.targetId : network.playerId;
    const self = snapshot?.entities?.find((entity) => entity.id === observedId);
    setEnvironment(self?.acousticZone ?? "outdoor", self?.acousticProfile ?? null);
  });
  ctx.events.on("network:disconnected", () => setEnvironment("outdoor", { zone: "outdoor", reverbMix: 0 }));

  ctx.services.provide("building-acoustics", {
    get zone() { return currentZone; },
    get reverbMix() { return currentReverbMix; },
  });
}
