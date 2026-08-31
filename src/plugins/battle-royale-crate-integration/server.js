export const manifest = {
  id: "battle-royale-crate-integration",
  version: "1.0.0",
  requires: [
    "match-api",
    "battle-royale-crate-physics",
    "battle-royale-vehicle-fleet",
    "battle-royale",
    "movement",
    "map-test-arena",
  ],
  capabilities: [
    "services.consume", "components.read", "events.on", "events.emit",
  ],
};

const PUSH_FORWARD_THRESHOLD = 0.12;
const PUSH_AUDIO_UPDATE_MS = 90;
const PUSH_AUDIO_RADIUS = 46;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function distance2(a, b) {
  return Math.hypot(finite(a?.x) - finite(b?.x), finite(a?.z) - finite(b?.z));
}

export async function setup(ctx) {
  const matchApi = ctx.services.get("match-api");
  const cratePhysics = ctx.services.get("crate-physics");
  const vehicles = ctx.services.get("vehicles");
  const battleRoyale = ctx.services.get("battle-royale");
  const map = ctx.services.get("map");

  const originalHandleInput = matchApi.handleInput.bind(matchApi);
  const originalStep = matchApi.step.bind(matchApi);
  const originalEventsForPlayer = matchApi.eventsForPlayer.bind(matchApi);
  const states = new Map();

  function stateFor(playerId) {
    let state = states.get(playerId);
    if (!state) {
      state = {
        armedCrateId: null,
        requested: false,
        forward: 0,
        pushed: false,
        startedCrateId: null,
        lastAudioUpdateAt: 0,
      };
      states.set(playerId, state);
    }
    return state;
  }

  function spatialPayload(payload = {}) {
    const position = {
      x: finite(payload.x),
      y: finite(payload.y),
      z: finite(payload.z),
    };
    return {
      ...payload,
      ...position,
      radius: PUSH_AUDIO_RADIUS,
      acousticZone: map.acousticZoneAt?.(position) ?? "outdoor",
    };
  }

  function stopPush(playerId, now = Date.now(), reason = "released") {
    const state = states.get(playerId);
    if (!state) return false;
    state.requested = false;
    state.forward = 0;
    if (!state.startedCrateId) return false;
    const crateId = state.startedCrateId;
    const crate = cratePhysics.crate(crateId);
    cratePhysics.syncAll?.();
    ctx.events.emit("crate:push-stop", spatialPayload({
      entityId: playerId,
      crateId,
      material: "metal",
      reason,
      x: crate?.x ?? 0,
      y: crate?.y ?? 0,
      z: crate?.z ?? 0,
      now,
    }));
    state.startedCrateId = null;
    return true;
  }

  function clearState(playerId, now = Date.now(), reason = "cleared") {
    stopPush(playerId, now, reason);
    states.delete(playerId);
  }

  function armNearestCrate(playerId) {
    const transform = ctx.components.get(playerId, "Transform");
    if (!transform) return null;
    return cratePhysics.nearestPushable(transform);
  }

  matchApi.handleInput = (playerId, input = {}, now = Date.now()) => {
    if (vehicles.isDriving?.(playerId)) {
      clearState(playerId, now, "vehicle");
      originalHandleInput(playerId, input, now);
      return;
    }

    const keyboardHeld = Boolean(input.interactHeld);
    const released = Boolean(input.interactReleased);
    const pressed = Boolean(input.interactPressed);
    const state = stateFor(playerId);

    // A momentary touch/virtual interaction has no held state, so preserve the
    // old immediate E-like behavior for touch controls, doors, loot and cars.
    if (pressed && !keyboardHeld) {
      clearState(playerId, now, "tap");
      originalHandleInput(playerId, input, now);
      return;
    }

    if (pressed && keyboardHeld) {
      const candidate = armNearestCrate(playerId);
      if (!candidate) {
        clearState(playerId, now, "no-crate");
        originalHandleInput(playerId, input, now);
        return;
      }
      state.armedCrateId = candidate.crateId;
      state.pushed = false;
      state.forward = Math.max(0, finite(input.forward));
      state.requested = state.forward >= PUSH_FORWARD_THRESHOLD;

      // Suppress the normal press while a nearby crate is armed. If the player
      // simply taps and releases E, we replay the normal interaction on release.
      // If they walk forward while holding E, it becomes a physical push instead.
      originalHandleInput(playerId, { ...input, interactPressed: false }, now);
      return;
    }

    if (released) {
      const shouldTapInteract = Boolean(state.armedCrateId && !state.pushed);
      stopPush(playerId, now, "released");
      states.delete(playerId);
      if (shouldTapInteract) {
        originalHandleInput(playerId, {
          ...input,
          interactPressed: true,
          interactHeld: false,
          interactReleased: false,
        }, now);
      } else {
        originalHandleInput(playerId, {
          ...input,
          interactPressed: false,
          interactHeld: false,
          interactReleased: false,
        }, now);
      }
      return;
    }

    if (keyboardHeld) {
      if (!state.armedCrateId) {
        const candidate = armNearestCrate(playerId);
        if (candidate) state.armedCrateId = candidate.crateId;
      }
      state.forward = Math.max(0, finite(input.forward));
      state.requested = Boolean(
        state.armedCrateId
        && state.forward >= PUSH_FORWARD_THRESHOLD
        && battleRoyale.isActive?.()
      );
      if (!state.requested) stopPush(playerId, now, "movement-stopped");
      originalHandleInput(playerId, { ...input, interactPressed: false }, now);
      return;
    }

    clearState(playerId, now, "interaction-ended");
    originalHandleInput(playerId, input, now);
  };

  matchApi.step = (dt, now = Date.now()) => {
    if (battleRoyale.isActive?.()) {
      for (const [playerId, state] of states) {
        if (!state.requested || !state.armedCrateId) continue;
        const transform = ctx.components.get(playerId, "Transform");
        if (!transform) {
          stopPush(playerId, now, "missing-player");
          continue;
        }
        const pushed = cratePhysics.applyPush(
          state.armedCrateId,
          transform,
          state.forward,
          dt,
        );
        if (!pushed) {
          stopPush(playerId, now, "out-of-reach");
          state.armedCrateId = null;
          state.requested = false;
          continue;
        }

        state.pushed = true;
        if (state.startedCrateId !== pushed.crateId) {
          if (state.startedCrateId) stopPush(playerId, now, "switched-crate");
          state.startedCrateId = pushed.crateId;
          state.lastAudioUpdateAt = now;
          ctx.events.emit("crate:push-start", spatialPayload({
            entityId: playerId,
            crateId: pushed.crateId,
            material: "metal",
            speed: pushed.speed,
            force: pushed.force,
            x: pushed.x,
            y: pushed.y,
            z: pushed.z,
            now,
          }));
        } else if (now - state.lastAudioUpdateAt >= PUSH_AUDIO_UPDATE_MS) {
          state.lastAudioUpdateAt = now;
          ctx.events.emit("crate:push-update", spatialPayload({
            entityId: playerId,
            crateId: pushed.crateId,
            material: "metal",
            speed: pushed.speed,
            force: pushed.force,
            x: pushed.x,
            y: pushed.y,
            z: pushed.z,
            now,
          }));
        }
      }
    } else {
      for (const playerId of states.keys()) stopPush(playerId, now, "match-inactive");
    }

    // Forces must be queued before the vehicle integration advances the shared
    // Rapier world. Capture velocity immediately before that physics step so
    // wall impacts can be classified from real contact force + speed loss.
    cratePhysics.capturePreStep?.();
    const result = originalStep(dt, now);
    cratePhysics.afterPhysics?.(now);
    return result;
  };

  matchApi.eventsForPlayer = (playerId, packets = []) => {
    const base = originalEventsForPlayer(playerId, packets);
    const seen = new Set(base);
    const listener = ctx.components.get(playerId, "Transform");
    const crateEvents = new Set([
      "crate:push-start",
      "crate:push-update",
      "crate:push-stop",
      "crate:impact",
    ]);

    const additional = [];
    for (const packet of packets) {
      if (seen.has(packet) || !crateEvents.has(packet.event)) continue;
      const payload = packet.payload ?? {};
      const own = payload.entityId === playerId;
      if (!own && (!listener || distance2(listener, payload) > finite(payload.radius, PUSH_AUDIO_RADIUS) + 4)) continue;

      let enriched = packet;
      if (listener && Number.isFinite(payload.x) && Number.isFinite(payload.z)) {
        const occlusion = Number(map.acousticOcclusionBetween?.(listener, payload));
        enriched = {
          ...packet,
          payload: {
            ...payload,
            acousticZone: payload.acousticZone ?? map.acousticZoneAt?.(payload) ?? "outdoor",
            occlusion: Number.isFinite(occlusion) ? Math.max(0, Math.min(1, occlusion)) : 0,
          },
        };
      }
      additional.push(enriched);
    }
    return [...base, ...additional];
  };

  ctx.events.on("entity:died", ({ entityId, now }) => clearState(entityId, now, "died"));
  ctx.events.on("entity:removed", ({ entityId }) => clearState(entityId, Date.now(), "removed"));
}
