const RAGDOLL_SOUNDS = Object.freeze({
  "ragdoll.impact.soft": "/assets/audio/core/ragdoll/ragdoll-impact-soft.mp3",
  "ragdoll.impact.1": "/assets/audio/core/ragdoll/ragdoll-impact-1.mp3",
  "ragdoll.impact.2": "/assets/audio/core/ragdoll/ragdoll-impact-2.mp3",
  "ragdoll.impact.heavy": "/assets/audio/core/ragdoll/ragdoll-impact-2.mp3",
  "ragdoll.impact.body": "/assets/audio/core/parachute/landing/body-impact.mp3",
  "ragdoll.impact.thump": "/assets/audio/core/parachute/landing/ground-thump.mp3",
  "ragdoll.impact.gear": "/assets/audio/core/parachute/landing/gear-clatter.mp3",
  "ragdoll.eject.launch": "/assets/audio/core/parachute/open-air/debris-whoosh.mp3",
  "ragdoll.air.wind": "/assets/audio/core/parachute/wind/wind-rush.mp3",
  "ragdoll.air.flap": "/assets/audio/core/parachute/cloth/canvas-flap.mp3",
});

const TUMBLE_BURST_URLS = Object.freeze([
  "/assets/audio/core/ragdoll/ragdoll-impact-1.mp3",
  "/assets/audio/core/parachute/landing/body-impact.mp3",
  "/assets/audio/core/ragdoll/ragdoll-impact-2.mp3",
  "/assets/audio/core/parachute/landing/ground-thump.mp3",
  "/assets/audio/core/parachute/landing/gear-clatter.mp3",
]);

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

  let airWindHandle = null;
  let airFlapHandle = null;
  let airGeneration = 0;
  let tumbleTimers = [];

  Promise.allSettled(
    [...new Set(Object.values(RAGDOLL_SOUNDS))].map((url) => audio.load(url)),
  ).catch(() => {});

  function clearTumbleTimers() {
    for (const timer of tumbleTimers) clearTimeout(timer);
    tumbleTimers = [];
  }

  function stopAirborneWind(fadeSeconds = 0.14) {
    airGeneration += 1;
    const wind = airWindHandle;
    const flap = airFlapHandle;
    airWindHandle = null;
    airFlapHandle = null;
    if (wind) {
      if (typeof wind.fadeOut === "function") wind.fadeOut(fadeSeconds);
      else wind.stop?.();
    }
    if (flap) {
      if (typeof flap.fadeOut === "function") flap.fadeOut(fadeSeconds);
      else flap.stop?.();
    }
  }

  async function startAirborneWind(intensity = 0.85) {
    stopAirborneWind(0.05);
    const generation = ++airGeneration;
    try {
      await audio.resume?.();
      const [wind, flap] = await Promise.all([
        audio.playCentered(RAGDOLL_SOUNDS["ragdoll.air.wind"], {
          gain: clamp(0.32 + intensity * 0.36, 0.32, 0.78),
          loop: true,
          foreground: true,
        }),
        audio.playCentered(RAGDOLL_SOUNDS["ragdoll.air.flap"], {
          gain: clamp(0.16 + intensity * 0.22, 0.16, 0.44),
          loop: true,
          foreground: true,
        }),
      ]);
      if (generation !== airGeneration) {
        wind?.stop?.();
        flap?.stop?.();
        return;
      }
      airWindHandle = wind;
      airFlapHandle = flap;
    } catch {
      // Ignore audio context readiness errors in headless/test runs
    }
  }

  function scheduleLowSpeedTumbleBurst(speedKph = 30) {
    clearTumbleTimers();
    const baseGain = clamp(0.54 + (speedKph / 65) * 0.38, 0.52, 0.96);
    const delaysMs = [75, 160, 255, 360];
    delaysMs.forEach((delayMs, index) => {
      const timer = setTimeout(() => {
        const url = TUMBLE_BURST_URLS[index % TUMBLE_BURST_URLS.length];
        const stepGain = clamp(baseGain * (1 - index * 0.11), 0.36, 0.98);
        void audio.playCentered(url, { gain: stepGain });
      }, delayMs);
      tumbleTimers.push(timer);
    });
  }

  ctx.events.on("game:event", async (packet) => {
    const payload = packet.payload ?? {};

    if (
      (packet.event === "ragdoll:vehicle-eject" || packet.event === "ragdoll:vehicle-crash-eject")
      && payload.entityId === network.playerId
    ) {
      const speedKph = Math.max(
        0,
        Number(payload.speedKph) || (Number(payload.speedBefore) || 0) * 3.6,
      );
      const upwardDelta = Math.max(0, Number(payload.upwardDelta) || 0);
      const crashSeverity = Math.max(0, Number(payload.crashSeverity) || 0);
      const highFlight = speedKph >= 55 || upwardDelta >= 5.0 || crashSeverity >= 12;

      try {
        await audio.playCentered(RAGDOLL_SOUNDS["ragdoll.eject.launch"], {
          gain: clamp(0.58 + speedKph / 140, 0.58, 1.15),
        });
        await audio.playCentered(RAGDOLL_SOUNDS["ragdoll.impact.gear"], {
          gain: clamp(0.42 + speedKph / 180, 0.42, 0.88),
        });
      } catch {
        // Ignore audio context errors
      }

      if (highFlight) {
        void startAirborneWind(clamp(speedKph / 110, 0.45, 1.2));
      } else {
        scheduleLowSpeedTumbleBurst(speedKph);
      }
      return;
    }

    if (
      (packet.event === "ragdoll:ended" || packet.event === "parachute:deployed")
      && payload.entityId === network.playerId
    ) {
      clearTumbleTimers();
      stopAirborneWind(0.1);
      return;
    }

    if (packet.event === "ragdoll:impact" && payload.entityId === network.playerId) {
      stopAirborneWind(0.12);
      return;
    }

    if (packet.event !== "sound:spatial") return;
    const url = RAGDOLL_SOUNDS[payload.key];
    if (!url) return;

    if (payload.entityId === network.playerId && payload.key !== "ragdoll.eject.launch") {
      stopAirborneWind(0.12);
    }

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

  ctx.events.on("network:disconnected", () => {
    clearTumbleTimers();
    stopAirborneWind(0.05);
  });

  ctx.services.provide("ragdoll-audio", {
    sounds: RAGDOLL_SOUNDS,
  });
}
