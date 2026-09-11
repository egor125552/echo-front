const RAGDOLL_SOUNDS = Object.freeze({
  "ragdoll.impact.soft": "/assets/audio/core/ragdoll/ragdoll-impact-soft.mp3",
  "ragdoll.impact.1": "/assets/audio/core/ragdoll/ragdoll-impact-1.mp3",
  "ragdoll.impact.2": "/assets/audio/core/ragdoll/ragdoll-impact-2.mp3",
  "ragdoll.impact.heavy": "/assets/audio/core/ragdoll/ragdoll-impact-2.mp3",
});

export const manifest = {
  id: "battle-royale-ragdoll-audio",
  requires: ["spatial-audio-web", "cloudflare-session"],
};

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}

export async function setup(ctx) {
  const audio = ctx.services.get("audio");
  const network = ctx.services.get("network");

  Promise.allSettled(
    [...new Set(Object.values(RAGDOLL_SOUNDS))].map((url) => audio.load(url)),
  ).catch(() => {});

  ctx.events.on("game:event", async (packet) => {
    if (packet.event !== "sound:spatial") return;
    const payload = packet.payload ?? {};
    const url = RAGDOLL_SOUNDS[payload.key];
    if (!url) return;

    const heavy = payload.key === "ragdoll.impact.heavy";
    const catastrophic = payload.impactClass === "catastrophic";
    const intensity = heavy
      ? clamp(payload.intensity, 0.8, 1.8)
      : clamp(payload.intensity, 0.25, 1.25);
    const gain = heavy
      ? (catastrophic ? 1.38 : 1.12) + (intensity - 0.8) * 0.22
      : 0.48 + intensity * 0.52;

    try {
      if (payload.entityId === network.playerId) {
        await audio.playCentered(url, { gain });
        return;
      }

      const physicalOcclusion = Number(payload.occlusion);
      await audio.playSpatial(
        url,
        { x: payload.x, y: payload.y ?? 0, z: payload.z },
        {
          radius: payload.radius ?? (heavy ? 62 : 30),
          gain,
          referenceDistance: heavy ? 1.7 : 1.35,
          rolloffFactor: heavy ? 0.58 : 0.72,
          airAbsorptionMinHz: heavy ? 3000 : 3600,
          occlusion: Number.isFinite(physicalOcclusion)
            ? clamp(physicalOcclusion, 0, 1)
            : 0,
        },
      );
    } catch (error) {
      console.error("Echo Front ragdoll audio error", error);
    }
  });

  ctx.services.provide("ragdoll-audio", {
    sounds: RAGDOLL_SOUNDS,
  });
}
