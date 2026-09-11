export const manifest = {
  id: "battle-royale-crate-interaction-client",
  requires: ["keyboard-input", "cloudflare-session", "spatial-audio-web"],
};

const DRAG_URL = "/audio/gdc2026/METLFric_Large Metal Box, Drag, Geofon_344 Audio_Extreme Winds Vol 1.mp3";
const START_RATTLE_URL = "/audio/gdc2026/MACHMech_Mechanism Counting Machine Interact Loose Container Short 01_ESM_HDLM.mp3";
const LIGHT_IMPACT_URL = "/audio/gdc2026/METLImpt_Metal Old File Impact Tap Against Tire Iron Metallic Hit 01_ESM_HDGM.mp3";
const HARD_IMPACT_URL = "/audio/gdc2026/METLImpt_METAL SWING HIT Weapon Swing To Metallic Body Impact And Resonant Tail 01_DDUMAIS_MWP2.mp3";
const BODY_IMPACT_URL = "/audio/environment/metal-hit.mp3";
const LOOP_STALE_MS = 340;
const LOW_SPEED_STOP_MS = 220;
const MIN_DRAG_SPEED = 0.055;

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}

function positionOf(payload = {}) {
  return {
    x: Number(payload.x) || 0,
    y: Number(payload.y) || 0,
    z: Number(payload.z) || 0,
  };
}

export async function setup(ctx) {
  const input = ctx.services.get("input");
  const audio = ctx.services.get("audio");
  let interactHeld = false;
  let interactReleased = false;
  const dragLoops = new Map();
  const dragGeneration = new Map();

  const originalSample = input.sample.bind(input);
  input.sample = () => {
    const sampled = originalSample();
    const result = {
      ...sampled,
      interactHeld,
      interactReleased,
    };
    interactReleased = false;
    return result;
  };

  ctx.events.on("input:key", ({ code, down }) => {
    if (code !== "KeyE") return;
    if (down) {
      interactHeld = true;
      interactReleased = false;
    } else {
      interactHeld = false;
      interactReleased = true;
    }
  });

  ctx.events.on("input:reset", () => {
    if (interactHeld) interactReleased = true;
    interactHeld = false;
    stopAllDrags();
  });

  function nextGeneration(crateId) {
    const next = (dragGeneration.get(crateId) ?? 0) + 1;
    dragGeneration.set(crateId, next);
    return next;
  }

  function stopDrag(crateId) {
    if (!crateId) return;
    nextGeneration(crateId);
    const current = dragLoops.get(crateId);
    dragLoops.delete(crateId);
    audio.stopChannel(`crate-drag:${crateId}`);
    try { current?.handle?.source?.stop?.(); } catch {}
  }

  function stopAllDrags() {
    for (const crateId of [...dragLoops.keys()]) stopDrag(crateId);
  }

  async function startDrag(payload) {
    const crateId = String(payload.crateId ?? "");
    if (!crateId) return;
    const speed = clamp(payload.speed, 0, 2.5);
    if (speed < MIN_DRAG_SPEED) return;
    stopDrag(crateId);
    const generation = nextGeneration(crateId);
    const gain = 0.46 + speed * 0.13;
    const position = positionOf(payload);

    try {
      const handle = await audio.playSpatial(DRAG_URL, position, {
        radius: payload.radius ?? 46,
        gain,
        referenceDistance: 2.4,
        rolloffFactor: 0.46,
        airAbsorptionMinHz: 3300,
        occlusion: clamp(payload.occlusion, 0, 1),
        channel: `crate-drag:${crateId}`,
        replace: true,
        loop: true,
      });
      if (dragGeneration.get(crateId) !== generation) {
        try { handle?.source?.stop?.(); } catch {}
        return;
      }
      if (handle) {
        dragLoops.set(crateId, {
          handle,
          lastUpdateAt: performance.now(),
          lowSpeedSince: null,
        });
      }
    } catch (error) {
      console.error("Echo Front crate drag audio error", error);
    }
  }

  function updateDrag(payload) {
    const crateId = String(payload.crateId ?? "");
    const speed = clamp(payload.speed, 0, 2.5);
    const current = dragLoops.get(crateId);
    if (!current) {
      if (speed >= MIN_DRAG_SPEED) void startDrag(payload);
      return;
    }
    const now = performance.now();
    current.lastUpdateAt = now;
    if (speed < MIN_DRAG_SPEED) {
      if (current.lowSpeedSince == null) current.lowSpeedSince = now;
      if (now - current.lowSpeedSince >= LOW_SPEED_STOP_MS) stopDrag(crateId);
      return;
    }
    current.lowSpeedSince = null;
    current.handle?.update?.(positionOf(payload));
  }

  async function playStartRattle(payload) {
    try {
      await audio.playSpatial(START_RATTLE_URL, positionOf(payload), {
        radius: 22,
        gain: 0.24,
        referenceDistance: 2,
        rolloffFactor: 0.58,
        airAbsorptionMinHz: 3900,
        occlusion: clamp(payload.occlusion, 0, 1),
      });
    } catch (error) {
      console.error("Echo Front crate start audio error", error);
    }
  }

  async function playImpact(payload) {
    const intensity = clamp(payload.intensity, 0.18, 1);
    const tier = String(payload.tier ?? "light");
    const position = positionOf(payload);
    const common = {
      radius: tier === "hard" ? 52 : tier === "medium" ? 42 : 30,
      referenceDistance: 2.6,
      rolloffFactor: 0.42,
      airAbsorptionMinHz: 3000,
      occlusion: clamp(payload.occlusion, 0, 1),
    };

    try {
      if (tier === "hard") {
        const body = audio.playSpatial(BODY_IMPACT_URL, position, {
          ...common,
          gain: 0.34 + intensity * 0.28,
        });
        const ring = new Promise((resolve) => setTimeout(resolve, 14)).then(() =>
          audio.playSpatial(HARD_IMPACT_URL, position, {
            ...common,
            gain: 0.62 + intensity * 0.35,
          }));
        await Promise.allSettled([body, ring]);
        return;
      }

      if (tier === "medium") {
        await Promise.allSettled([
          audio.playSpatial(LIGHT_IMPACT_URL, position, {
            ...common,
            gain: 0.48 + intensity * 0.28,
          }),
          audio.playSpatial(BODY_IMPACT_URL, position, {
            ...common,
            gain: 0.16 + intensity * 0.16,
          }),
        ]);
        return;
      }

      await audio.playSpatial(LIGHT_IMPACT_URL, position, {
        ...common,
        gain: 0.3 + intensity * 0.32,
      });
    } catch (error) {
      console.error("Echo Front crate impact audio error", error);
    }
  }

  ctx.events.on("game:event", (packet) => {
    const payload = packet?.payload ?? {};
    if (packet.event === "crate:push-start") {
      void playStartRattle(payload);
      if (Number(payload.speed) >= MIN_DRAG_SPEED) void startDrag(payload);
      return;
    }
    if (packet.event === "crate:push-update") {
      updateDrag(payload);
      return;
    }
    if (packet.event === "crate:push-stop") {
      stopDrag(String(payload.crateId ?? ""));
      return;
    }
    if (packet.event === "crate:impact") void playImpact(payload);
  });

  ctx.events.on("network:disconnected", stopAllDrags);

  setInterval(() => {
    const now = performance.now();
    for (const [crateId, current] of dragLoops) {
      if (now - current.lastUpdateAt > LOOP_STALE_MS) stopDrag(crateId);
    }
  }, 140);

  ctx.services.provide?.("crate-interaction-audio", {
    dragUrl: DRAG_URL,
    impactUrls: {
      light: LIGHT_IMPACT_URL,
      hard: HARD_IMPACT_URL,
      body: BODY_IMPACT_URL,
    },
    stopAllDrags,
  });
}
