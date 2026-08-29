export const manifest = {
  id: "battle-royale-navigation-face",
  version: "1.2.1",
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
  const originalSnapshotFor = matchApi.snapshotFor.bind(matchApi);
  const lastResult = new Map();
  const trackedPlayers = new Set();
  const guidanceEnabled = new Set();
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
      return { state, target, facePoint: state.checkpoint, source: "checkpoint" };
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

  function controlAvailable(playerId) {
    const entity = entities.get(playerId);
    const transform = ctx.components.get(playerId, "Transform");
    if (!entity?.alive || entity.bot || !transform) return { ok: false, reason: "player-unavailable", transform };
    if (vehicles.isDriving?.(playerId)) return { ok: false, reason: "driving", transform };
    if (parachute.stateFor?.(playerId)?.airborne) return { ok: false, reason: "airborne", transform };
    if (ragdoll.isActive?.(playerId)) return { ok: false, reason: "ragdoll", transform };
    return { ok: true, transform };
  }

  function alignToRoute(playerId, now = Date.now()) {
    const available = controlAvailable(playerId);
    if (!available.ok) return null;
    const resolved = targetAndPointFor(playerId);
    if (!resolved.target || !resolved.facePoint) return null;
    if (distance2(available.transform, resolved.facePoint) < MIN_FACE_DISTANCE) return null;

    const previousAngle = finite(available.transform.angle);
    const angle = angleTo(available.transform, resolved.facePoint);
    available.transform.angle = angle;
    return {
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
      distance: distance2(available.transform, resolved.facePoint),
      now,
    };
  }

  function enableGuidance(playerId, now = Date.now()) {
    trackedPlayers.add(playerId);
    const available = controlAvailable(playerId);
    if (!available.ok) return unavailable(playerId, available.reason, now);

    let state = navigation.stateFor(playerId);
    if (!state.active) {
      if (!state.selectedTargetId) return unavailable(playerId, "no-target", now);
      navigation.toggle(playerId, now);
      state = navigation.stateFor(playerId);
    }
    if (!state.active) return unavailable(playerId, "no-route", now);

    guidanceEnabled.add(playerId);
    const alignment = alignToRoute(playerId, now);
    const target = navigation.stateFor(playerId).target;
    const result = {
      ok: true,
      enabled: true,
      targetId: target?.id ?? state.activeTargetId ?? null,
      targetName: target?.name ?? "цель",
      aligned: Boolean(alignment),
      now,
    };
    lastResult.set(playerId, result);
    emitFor(playerId, "navigation:guidance-enabled", result);
    return result;
  }

  function disableGuidance(playerId, now = Date.now(), reason = "toggle") {
    const wasEnabled = guidanceEnabled.delete(playerId);
    const result = { ok: true, enabled: false, reason, now };
    lastResult.set(playerId, result);
    if (wasEnabled) emitFor(playerId, "navigation:guidance-disabled", result);
    return result;
  }

  function toggleGuidance(playerId, now = Date.now()) {
    if (guidanceEnabled.has(playerId)) return disableGuidance(playerId, now, "toggle");
    return enableGuidance(playerId, now);
  }

  function autoGuide(playerId, now = Date.now()) {
    if (!guidanceEnabled.has(playerId)) return false;
    const available = controlAvailable(playerId);
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
    autoGuideStats.set(playerId, {
      applications: previousStats.applications + 1,
      checkpointChanges: previousStats.checkpointChanges + (checkpointChanged ? 1 : 0),
      lastCheckpointIndex: checkpointIndex,
      lastAt: now,
      targetId: resolved.target.id,
      targetName: resolved.target.name,
      previousAngle,
      angle,
      correctionRadians: Math.abs(shortestAngleDelta(angle, previousAngle)),
      distance: distance2(available.transform, resolved.facePoint),
    });
    return true;
  }

  function stateFor(playerId) {
    const transform = ctx.components.get(playerId, "Transform");
    const resolved = targetAndPointFor(playerId);
    const input = ctx.components.get(playerId, "Input");
    const stats = autoGuideStats.get(playerId) ?? null;
    const desiredAngle = transform && resolved.facePoint ? angleTo(transform, resolved.facePoint) : null;
    return {
      playerId,
      enabled: guidanceEnabled.has(playerId),
      hasTarget: Boolean(resolved.target),
      targetId: resolved.target?.id ?? null,
      targetName: resolved.target?.name ?? null,
      source: resolved.source,
      angle: transform ? finite(transform.angle) : null,
      desiredAngle,
      errorRadians: desiredAngle == null || !transform
        ? null
        : Math.abs(shortestAngleDelta(transform.angle, desiredAngle)),
      autoGuide: {
        active: Boolean(
          guidanceEnabled.has(playerId)
          && resolved.state?.active
          && finite(input?.forward) > AUTO_GUIDE_FORWARD_THRESHOLD
        ),
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

  function assertGuidance(playerId, expectedEnabled = true, minimumApplications = 0) {
    const state = stateFor(playerId);
    if (state.enabled !== Boolean(expectedEnabled)) {
      throw new Error(`Expected guidance enabled=${Boolean(expectedEnabled)}, got ${state.enabled}`);
    }
    const minimum = Math.max(0, Math.floor(Number(minimumApplications) || 0));
    if (state.autoGuide.applications < minimum) {
      throw new Error(`Expected at least ${minimum} guidance applications, got ${state.autoGuide.applications}`);
    }
    return state;
  }

  matchApi.handleInput = (playerId, input = {}, now = Date.now()) => {
    trackedPlayers.add(playerId);
    const result = originalHandleInput(playerId, input, now);
    if (input.navigationFacePressed) toggleGuidance(playerId, now);
    return result;
  };

  matchApi.step = (dt, now = Date.now()) => {
    for (const playerId of trackedPlayers) autoGuide(playerId, now);
    const result = originalStep(dt, now);
    for (const playerId of trackedPlayers) autoGuide(playerId, now);
    return result;
  };

  matchApi.snapshotFor = (playerId, now = Date.now()) => {
    const snapshot = originalSnapshotFor(playerId, now);
    const guidance = stateFor(playerId);
    return {
      ...snapshot,
      navigationGuidance: {
        enabled: guidance.enabled,
        targetId: guidance.targetId,
        targetName: guidance.targetName,
        active: guidance.autoGuide.active,
      },
    };
  };

  ctx.events.on("navigation:stopped", ({ entityId }) => {
    if (guidanceEnabled.has(entityId)) disableGuidance(entityId, Date.now(), "navigation-stopped");
  });
  ctx.events.on("navigation:reached", ({ entityId }) => {
    if (guidanceEnabled.has(entityId)) disableGuidance(entityId, Date.now(), "reached");
  });
  ctx.events.on("entity:removed", ({ entityId }) => {
    lastResult.delete(entityId);
    autoGuideStats.delete(entityId);
    trackedPlayers.delete(entityId);
    guidanceEnabled.delete(entityId);
  });

  ctx.services.provide("navigation-face", {
    toggleGuidance,
    enableGuidance,
    disableGuidance,
    autoGuide,
    stateFor,
    assertGuidance,
  });
}
