export const manifest = {
  id: "battle-royale-navigation-face",
  version: "1.1.0",
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
const AUTO_GUIDE_FORWARD_THRESHOLD = 0.08;

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
  const originalStep = matchApi.step.bind(matchApi);
  const lastResult = new Map();
  const trackedPlayers = new Set();
  const autoGuideStats = new Map();

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

  function navigationControlAvailable(playerId) {
    const entity = entities.get(playerId);
    const transform = ctx.components.get(playerId, "Transform");
    if (!entity?.alive || entity.bot || !transform) return { ok: false, reason: "player-unavailable", transform };
    if (vehicles.isDriving?.(playerId)) return { ok: false, reason: "driving", transform };
    if (parachute.stateFor?.(playerId)?.airborne) return { ok: false, reason: "airborne", transform };
    if (ragdoll.isActive?.(playerId)) return { ok: false, reason: "ragdoll", transform };
    return { ok: true, transform };
  }

  function face(playerId, now = Date.now()) {
    trackedPlayers.add(playerId);
    const available = navigationControlAvailable(playerId);
    if (!available.ok) return unavailable(playerId, available.reason, now);
    const transform = available.transform;

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

  function autoGuide(playerId, now = Date.now()) {
    const available = navigationControlAvailable(playerId);
    if (!available.ok) return false;

    const input = ctx.components.get(playerId, "Input");
    if (finite(input?.forward) <= AUTO_GUIDE_FORWARD_THRESHOLD) return false;

    const resolved = targetAndPointFor(playerId);
    if (!resolved.state?.active || !resolved.facePoint || !resolved.target) return false;
    if (distance2(available.transform, resolved.facePoint) < MIN_FACE_DISTANCE) return false;

    const previousAngle = finite(available.transform.angle);
    const angle = angleTo(available.transform, resolved.facePoint);
    available.transform.angle = angle;

    const previousStats = autoGuideStats.get(playerId) ?? {
      applications: 0,
      checkpointChanges: 0,
      lastCheckpointIndex: null,
    };
    const checkpointIndex = resolved.state?.checkpoint?.index ?? null;
    const checkpointChanged = previousStats.lastCheckpointIndex !== null
      && checkpointIndex !== previousStats.lastCheckpointIndex;
    const stats = {
      applications: previousStats.applications + 1,
      checkpointChanges: previousStats.checkpointChanges + (checkpointChanged ? 1 : 0),
      lastCheckpointIndex: checkpointIndex,
      lastAt: now,
      targetId: resolved.target.id,
      targetName: resolved.target.name,
      source: resolved.source,
      previousAngle,
      angle,
      correctionRadians: Math.abs(shortestAngleDelta(angle, previousAngle)),
      x: finite(resolved.facePoint.x),
      y: finite(resolved.facePoint.y),
      z: finite(resolved.facePoint.z),
      distance: distance2(available.transform, resolved.facePoint),
    };
    autoGuideStats.set(playerId, stats);
    return true;
  }

  function facingState(playerId) {
    const transform = ctx.components.get(playerId, "Transform");
    const resolved = targetAndPointFor(playerId);
    const input = ctx.components.get(playerId, "Input");
    const stats = autoGuideStats.get(playerId) ?? null;
    if (!transform || !resolved.facePoint) {
      return {
        playerId,
        hasTarget: Boolean(resolved.target),
        angle: transform ? finite(transform.angle) : null,
        desiredAngle: null,
        errorRadians: null,
        autoGuide: {
          enabled: true,
          active: false,
          forward: finite(input?.forward),
          applications: stats?.applications ?? 0,
          checkpointChanges: stats?.checkpointChanges ?? 0,
          lastAt: stats?.lastAt ?? null,
        },
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
      autoGuide: {
        enabled: true,
        active: Boolean(resolved.state?.active && finite(input?.forward) > AUTO_GUIDE_FORWARD_THRESHOLD),
        forward: finite(input?.forward),
        applications: stats?.applications ?? 0,
        checkpointChanges: stats?.checkpointChanges ?? 0,
        lastCheckpointIndex: stats?.lastCheckpointIndex ?? null,
        lastAt: stats?.lastAt ?? null,
        correctionRadians: stats?.correctionRadians ?? null,
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

  function assertAutoGuiding(playerId, minimumApplications = 1) {
    const state = facingState(playerId);
    const minimum = Math.max(1, Math.floor(Number(minimumApplications) || 1));
    if (!state.autoGuide.active) {
      throw new Error(`Expected navigation auto-guide to be active for ${playerId}`);
    }
    if (state.autoGuide.applications < minimum) {
      throw new Error(
        `Expected at least ${minimum} auto-guide applications, got ${state.autoGuide.applications}`,
      );
    }
    return state;
  }

  matchApi.handleInput = (playerId, input = {}, now = Date.now()) => {
    trackedPlayers.add(playerId);
    const result = originalHandleInput(playerId, input, now);
    if (input.navigationFacePressed) face(playerId, now);
    return result;
  };

  matchApi.step = (dt, now = Date.now()) => {
    for (const playerId of trackedPlayers) autoGuide(playerId, now);
    const result = originalStep(dt, now);
    // Navigation advances checkpoints after movement. Re-aim once more so the
    // next physics frame already starts on the new route segment.
    for (const playerId of trackedPlayers) autoGuide(playerId, now);
    return result;
  };

  ctx.events.on("entity:removed", ({ entityId }) => {
    lastResult.delete(entityId);
    autoGuideStats.delete(entityId);
    trackedPlayers.delete(entityId);
  });

  ctx.services.provide("navigation-face", {
    face,
    autoGuide,
    stateFor: facingState,
    assertFacing,
    assertAutoGuiding,
  });
}
