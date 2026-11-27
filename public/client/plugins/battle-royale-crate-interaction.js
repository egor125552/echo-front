export const manifest = {
  id: "battle-royale-crate-interaction-client",
  requires: ["keyboard-input", "cloudflare-session", "spatial-audio-web"],
};

const DRAG_URL = "/audio/gdc2026/METLFric_Large Metal Box, Drag, Geofon_344 Audio_Extreme Winds Vol 1.mp3";
const START_RATTLE_URL = "/audio/gdc2026/MACHMech_Mechanism Counting Machine Interact Loose Container Short 01_ESM_HDLM.mp3";
const LIGHT_IMPACT_URL = "/audio/gdc2026/METLImpt_Metal Old File Impact Tap Against Tire Iron Metallic Hit 01_ESM_HDGM.mp3";
const HARD_IMPACT_URL = "/audio/gdc2026/METLImpt_METAL SWING HIT Weapon Swing To Metallic Body Impact And Resonant Tail 01_DDUMAIS_MWP2.mp3";
const BODY_IMPACT_URL = "/audio/environment/metal-hit.mp3";
const LOOP_STALE_MS = 380;
const LOW_SPEED_STOP_MS = 220;
const MIN_DRAG_SPEED = 0.055;
export const MAX_CRATE_SOUND_DURATION_MS = 5000;
export const CRATE_FADE_OUT_MS = 650;
const RATTLE_COOLDOWN_MS = 550;
const IMPACT_COOLDOWN_MS = 220;

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}

export function crateDragGainForSpeed(speed) {
  const s = clamp(speed, 0, 2.5);
  if (s < MIN_DRAG_SPEED) return 0;
  const normalized = clamp((s - MIN_DRAG_SPEED) / 1.55, 0.08, 1);
  return Number((0.16 + normalized * 0.56).toFixed(3));
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
  const destructionAudio = ctx.services.has?.("destruction-audio") ? ctx.services.get("destruction-audio") : null;
  let interactHeld = false;
  let interactReleased = false;
  const dragLoops = new Map();
  const dragInFlight = new Map();
  const dragGeneration = new Map();
  const lastRattleAt = new Map();
  const lastImpactAt = new Map();

  const originalSample = input.sample.bind(input);
  input.sample = () => {
    const sampled = originalSample();
    const result = {
      ...sampled,
      interactHeld: Boolean(sampled.interactHeld || interactHeld),
      interactReleased: Boolean(sampled.interactReleased || interactReleased),
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

  ctx.events.on("input:touch", ({ control, down } = {}) => {
    if (control !== "interact-hold") return;
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

  function clearDragTimers(entry) {
    if (!entry) return;
    if (entry.maxDurationTimer) {
      clearTimeout(entry.maxDurationTimer);
      entry.maxDurationTimer = null;
    }
    if (entry.cleanupTimer) {
      clearTimeout(entry.cleanupTimer);
      entry.cleanupTimer = null;
    }
  }

  function fadeOutDrag(crateId, fadeDurationMs = CRATE_FADE_OUT_MS) {
    if (!crateId) return;
    nextGeneration(crateId);
    dragInFlight.delete(crateId);
    const current = dragLoops.get(crateId);
    if (!current) {
      audio.stopChannel(`crate-drag:${crateId}`);
      return;
    }
    if (current.fadingOut) return;
    current.fadingOut = true;
    clearDragTimers(current);
    const fadeSec = Math.max(0.08, (Number(fadeDurationMs) || CRATE_FADE_OUT_MS) / 1000);
    if (typeof current.handle?.fadeOut === "function") {
      try { current.handle.fadeOut(fadeSec); } catch {}
      current.cleanupTimer = setTimeout(() => {
        if (dragLoops.get(crateId) === current) {
          dragLoops.delete(crateId);
        }
      }, Math.ceil(fadeSec * 1000) + 40);
    } else {
      dragLoops.delete(crateId);
      audio.stopChannel(`crate-drag:${crateId}`);
      try { current.handle?.source?.stop?.(); } catch {}
    }
  }

  function stopDragImmediate(crateId) {
    if (!crateId) return;
    nextGeneration(crateId);
    dragInFlight.delete(crateId);
    const current = dragLoops.get(crateId);
    clearDragTimers(current);
    dragLoops.delete(crateId);
    audio.stopChannel(`crate-drag:${crateId}`);
    try { current?.handle?.source?.stop?.(); } catch {}
  }

  function stopAllDrags() {
    for (const crateId of new Set([...dragLoops.keys(), ...dragInFlight.keys()])) {
      stopDragImmediate(crateId);
    }
  }

  async function startDrag(payload) {
    const crateId = String(payload.crateId ?? "");
    if (!crateId) return;
    const speed = clamp(payload.speed, 0, 2.5);
    if (speed < MIN_DRAG_SPEED) return;

    const existing = dragLoops.get(crateId);
    if (existing && !existing.fadingOut) {
      updateDrag(payload);
      return;
    }
    if (dragInFlight.has(crateId)) {
      dragInFlight.set(crateId, payload);
      return;
    }
    if (existing?.fadingOut) {
      stopDragImmediate(crateId);
    }

    const generation = nextGeneration(crateId);
    dragInFlight.set(crateId, payload);
    const gain = crateDragGainForSpeed(speed);
    const position = positionOf(payload);

    try {
      const options = {
        radius: payload.radius ?? 46,
        gain,
        referenceDistance: 2.4,
        rolloffFactor: 0.46,
        airAbsorptionMinHz: 3300,
        occlusion: clamp(payload.occlusion, 0, 1),
        channel: `crate-drag:${crateId}`,
        replace: true,
        loop: true,
      };
      const handle = destructionAudio?.crateReady()
        ? await destructionAudio.crateLoop(position, options)
        : await audio.playSpatial(DRAG_URL, position, options);
      const latestPayload = dragInFlight.get(crateId) ?? payload;
      dragInFlight.delete(crateId);
      if (dragGeneration.get(crateId) !== generation) {
        try { handle?.source?.stop?.(); } catch {}
        return;
      }
      if (handle) {
        const startedAt = performance.now();
        const maxDurationMs = clamp(payload.maxDurationMs ?? MAX_CRATE_SOUND_DURATION_MS, 1000, MAX_CRATE_SOUND_DURATION_MS);
        const fadeStartDelay = Math.max(200, maxDurationMs - CRATE_FADE_OUT_MS);
        const entry = {
          handle,
          startedAt,
          maxDurationMs,
          lastUpdateAt: startedAt,
          lowSpeedSince: null,
          fadingOut: false,
          maxDurationTimer: setTimeout(() => {
            if (dragLoops.get(crateId) === entry) {
              fadeOutDrag(crateId, CRATE_FADE_OUT_MS);
            }
          }, fadeStartDelay),
          cleanupTimer: null,
        };
        dragLoops.set(crateId, entry);
        if (latestPayload !== payload) {
          updateDrag(latestPayload);
        }
      }
    } catch (error) {
      dragInFlight.delete(crateId);
      console.error("Echo Front crate drag audio error", error);
    }
  }

  function updateDrag(payload) {
    const crateId = String(payload.crateId ?? "");
    if (!crateId) return;
    const speed = clamp(payload.speed, 0, 2.5);
    if (dragInFlight.has(crateId)) {
      dragInFlight.set(crateId, payload);
      return;
    }
    const current = dragLoops.get(crateId);
    if (!current || current.fadingOut) {
      if (!current && speed >= MIN_DRAG_SPEED && Number(payload.elapsedMs ?? 0) < MAX_CRATE_SOUND_DURATION_MS - CRATE_FADE_OUT_MS) {
        void startDrag(payload);
      }
      return;
    }
    const now = performance.now();
    current.lastUpdateAt = now;
    if (
      now - current.startedAt >= current.maxDurationMs - CRATE_FADE_OUT_MS
      || Number(payload.elapsedMs ?? 0) >= current.maxDurationMs - CRATE_FADE_OUT_MS
    ) {
      fadeOutDrag(crateId, CRATE_FADE_OUT_MS);
      return;
    }
    if (speed < MIN_DRAG_SPEED) {
      if (current.lowSpeedSince == null) current.lowSpeedSince = now;
      if (now - current.lowSpeedSince >= LOW_SPEED_STOP_MS) fadeOutDrag(crateId, CRATE_FADE_OUT_MS);
      return;
    }
    current.lowSpeedSince = null;
    current.handle?.update?.(positionOf(payload));
    current.handle?.setGain?.(crateDragGainForSpeed(speed), 0.08);
    if (payload.occlusion != null) {
      current.handle?.updateOcclusion?.(clamp(payload.occlusion, 0, 1));
    }
  }

  async function playStartRattle(payload) {
    const crateId = String(payload.crateId ?? "default");
    const now = performance.now();
    if (now - (lastRattleAt.get(crateId) ?? -Infinity) < RATTLE_COOLDOWN_MS) return;
    lastRattleAt.set(crateId, now);
    try {
      const options = {
        radius: 22,
        gain: clamp(0.16 + (Number(payload.speed) || 0.3) * 0.14, 0.16, 0.34),
        referenceDistance: 2,
        rolloffFactor: 0.58,
        airAbsorptionMinHz: 3900,
        occlusion: clamp(payload.occlusion, 0, 1),
        channel: `crate-rattle:${crateId}`,
        replace: true,
      };
      if (!destructionAudio?.crateStart(positionOf(payload), options)) await audio.playSpatial(START_RATTLE_URL, positionOf(payload), options);
    } catch (error) {
      console.error("Echo Front crate start audio error", error);
    }
  }

  async function playImpact(payload) {
    const crateId = String(payload.crateId ?? "default");
    const now = performance.now();
    if (now - (lastImpactAt.get(crateId) ?? -Infinity) < IMPACT_COOLDOWN_MS) return;
    lastImpactAt.set(crateId, now);
    const intensity = clamp(payload.intensity, 0.18, 1);
    const tier = String(payload.tier ?? "light");
    const position = positionOf(payload);
    const common = {
      radius: tier === "hard" ? 52 : tier === "medium" ? 42 : 30,
      referenceDistance: 2.6,
      rolloffFactor: 0.42,
      airAbsorptionMinHz: 3000,
      occlusion: clamp(payload.occlusion, 0, 1),
      channel: `crate-impact:${crateId}`,
      replace: true,
    };

    try {
      if (tier === "hard") {
        await audio.playSpatial(HARD_IMPACT_URL, position, {
          ...common,
          gain: 0.48 + intensity * 0.34,
        });
        return;
      }

      if (tier === "medium") {
        await audio.playSpatial(LIGHT_IMPACT_URL, position, {
          ...common,
          gain: 0.38 + intensity * 0.28,
        });
        return;
      }

      await audio.playSpatial(LIGHT_IMPACT_URL, position, {
        ...common,
        gain: 0.26 + intensity * 0.28,
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
      const crateId = String(payload.crateId ?? "");
      if(dragLoops.has(crateId)) destructionAudio?.crateStop(positionOf(payload), {radius:24,gain:.28,referenceDistance:2,rolloffFactor:.55,channel:`crate-stop:${crateId}`,replace:true});
      fadeOutDrag(crateId, CRATE_FADE_OUT_MS);
      return;
    }
    if (packet.event === "crate:impact") void playImpact(payload);
  });

  ctx.events.on("network:disconnected", stopAllDrags);

  setInterval(() => {
    const now = performance.now();
    for (const [crateId, current] of dragLoops) {
      if (current.fadingOut) continue;
      if (
        now - current.lastUpdateAt > LOOP_STALE_MS
        || now - current.startedAt >= current.maxDurationMs - CRATE_FADE_OUT_MS
      ) {
        fadeOutDrag(crateId, CRATE_FADE_OUT_MS);
      }
    }
  }, 120);

  ctx.services.provide?.("crate-interaction-audio", {
    dragUrl: DRAG_URL,
    maxDurationMs: MAX_CRATE_SOUND_DURATION_MS,
    fadeOutMs: CRATE_FADE_OUT_MS,
    crateDragGainForSpeed,
    impactUrls: {
      light: LIGHT_IMPACT_URL,
      hard: HARD_IMPACT_URL,
      body: BODY_IMPACT_URL,
    },
    activeDragCount() {
      return dragLoops.size;
    },
    stopAllDrags,
  });
}
