export const manifest = {
  id: "battle-royale-navigation-face",
  version: "1.0.1",
  requires: [
    "match-api",
    "battle-royale-navigation",
    "battle-royale-vehicle",
    "battle-royale-parachute",
    "battle-royale-ragdoll",
    "entities",
  ],
  capabilities: [
    "services.consume", "services.provide",
    "components.read", "components.write",
    "events.on", "events.emit",
  ],
};

const MIN_FACE_DISTANCE = 0.2;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function distance2(a, b) {
  return Math.hypot(finite(a?.x) - finite(b?.x), finite(a?.z) - finite(b?.z));
}

function angleTo(from, target) {
  const dx = finite(target?.x) - finite(from?.x);
  const dz = finite(target?.z) - finite(from?.z);
  return Math.atan2(dx, -dz);
}

function shortestAngleDelta(a, b) {
  let delta = finite(a) - finite(b);
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

export async function setup(ctx) {
  const matchApi = ctx.services.get("match-api");
  const navigation = ctx.services.get("navigation");
  const vehicles = ctx.services.get("vehicles");
  const parachute = ctx.services.get("parachute");
  const ragdoll = ctx.services.get("ragdoll");
  const entities = ctx.services.get("entities");
  const originalHandleInput = matchApi.handleInput.bind(matchApi);
  const lastResult = new Map();

  function emitFor(playerId, event, payload = {}) {
    ctx.events.emit(event, { entityId: playerId, ...payload });
  }

  function targetAndPointFor(playerId) {
    const state = navigation.stateFor(playerId);
    const targets = navigation.availableTargets(playerId);
    const targetId = state.activeTargetId ?? state.selectedTargetId;
    const target = targets.find((entry) => entry.id === targetId) ?? null;
    if (!target) return { state, target: null, facePoint: null, source: null };

    if (state.active && state.checkpoint) {
      return {
        state,
        target,
        facePoint: state.checkpoint,
        source: "checkpoint",
      };
    }

    const transform = ctx.components.get(playerId, "Transform");
    const route = transform ? navigation.buildRoute(transform, target) : null;
    const first = route?.checkpoints?.[0] ?? target.position ?? null;
    return {
      state,
      target,
      facePoint: first,
      source: route?.checkpoints?.length ? "preview-checkpoint" : "target",
    };
  }

  function unavailable(playerId, reason, now) {
    const result = { ok: false, reason, now };
    lastResult.set(playerId, result);
    emitFor(playerId, "navigation:face-unavailable", { reason, now });
    return result;
  }

  function face(playerId, now = Date.now()) {
    const entity = entities.get(playerId);
    const transform = ctx.components.get(playerId, "Transform");
    if (!entity?.alive || !transform) return unavailable(playerId, "player-unavailable", now);
    if (vehicles.isDriving?.(playerId)) return unavailable(playerId, "driving", now);
    if (parachute.stateFor?.(playerId)?.airborne) return unavailable(playerId, "airborne", now);
    if (ragdoll.isActive?.(playerId)) return unavailable(playerId, "ragdoll", now);

    const resolved = targetAndPointFor(playerId);
    if (!resolved.target || !resolved.facePoint) return unavailable(playerId, "no-target", now);
    if (distance2(transform, resolved.facePoint) < MIN_FACE_DISTANCE) {
      return unavailable(playerId, "already-there", now);
    }

    const previousAngle = finite(transform.angle);
    const angle = angleTo(transform, resolved.facePoint);
    transform.angle = angle;
    const result = {
      ok: true,
      targetId: resolved.target.id,
      targetName: resolved.target.name,
      targetKind: resolved.target.kind,
      source: resolved.source,
      x: finite(resolved.facePoint.x),
      y: finite(resolved.facePoint.y),
      z: finite(resolved.facePoint.z),
      angle,
      previousAngle,
      turnedRadians: Math.abs(shortestAngleDelta(angle, previousAngle)),
      distance: distance2(transform, resolved.facePoint),
      now,
    };
    lastResult.set(playerId, result);
    emitFor(playerId, "navigation:faced", result);
    return result;
  }

  function facingState(playerId) {
    const transform = ctx.components.get(playerId, "Transform");
    const resolved = targetAndPointFor(playerId);
    if (!transform || !resolved.facePoint) {
      return {
        playerId,
        hasTarget: Boolean(resolved.target),
        angle: transform ? finite(transform.angle) : null,
        desiredAngle: null,
        errorRadians: null,
        lastResult: lastResult.get(playerId) ?? null,
      };
    }
    const desiredAngle = angleTo(transform, resolved.facePoint);
    return {
      playerId,
      hasTarget: true,
      targetId: resolved.target?.id ?? null,
      targetName: resolved.target?.name ?? null,
      source: resolved.source,
      angle: finite(transform.angle),
      desiredAngle,
      errorRadians: Math.abs(shortestAngleDelta(transform.angle, desiredAngle)),
      facePoint: {
        x: finite(resolved.facePoint.x),
        y: finite(resolved.facePoint.y),
        z: finite(resolved.facePoint.z),
      },
      lastResult: lastResult.get(playerId) ?? null,
    };
  }

  function assertFacing(playerId, maxErrorRadians = 0.0001) {
    const state = facingState(playerId);
    if (!state.hasTarget || state.desiredAngle == null) {
      throw new Error(`Navigation face target unavailable for ${playerId}`);
    }
    if (state.errorRadians > Math.max(0, Number(maxErrorRadians) || 0)) {
      throw new Error(
        `Expected ${playerId} to face navigation point; angular error ${state.errorRadians}`,
      );
    }
    return state;
  }

  matchApi.handleInput = (playerId, input = {}, now = Date.now()) => {
    const result = originalHandleInput(playerId, input, now);
    if (input.navigationFacePressed) face(playerId, now);
    return result;
  };

  ctx.events.on("entity:removed", ({ entityId }) => lastResult.delete(entityId));

  ctx.services.provide("navigation-face", {
    face,
    stateFor: facingState,
    assertFacing,
  });
}
