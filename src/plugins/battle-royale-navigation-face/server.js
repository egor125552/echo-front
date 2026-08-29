export const manifest = {
  id: "battle-royale-navigation-face",
  version: "1.3.0",
  requires: [
    "match-api",
    "battle-royale-navigation",
    "battle-royale-vehicle",
    "battle-royale-parachute",
    "battle-royale-ragdoll",
    "movement",
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
const MANUAL_STEER_THRESHOLD = 0.12;
const VEHICLE_FULL_STEER_ERROR = 0.72;
const PARACHUTE_FULL_STEER_ERROR = 0.58;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
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

function steeringForError(error, fullError) {
  const safe = Math.max(0.08, Number(fullError) || 0.6);
  const value = clamp(error / safe, -1, 1);
  return Math.abs(value) < 0.025 ? 0 : value;
}

export async function setup(ctx) {
  const matchApi = ctx.services.get("match-api");
  const navigation = ctx.services.get("navigation");
  const vehicles = ctx.services.get("vehicles");
  const parachute = ctx.services.get("parachute");
  const ragdoll = ctx.services.get("ragdoll");
  const movement = ctx.services.get("movement");
  const entities = ctx.services.get("entities");
  const originalHandleInput = matchApi.handleInput.bind(matchApi);
  const originalStep = matchApi.step.bind(matchApi);
  const originalSnapshotFor = matchApi.snapshotFor.bind(matchApi);
  const lastResult = new Map();
  const trackedPlayers = new Set();
  const guidanceEnabled = new Set();
  const autoGuideStats = new Map();
  const manualInputs = new Map();

  function emitFor(playerId, event, payload = {}) {
    ctx.events.emit(event, { entityId: playerId, ...payload });
  }

  function rememberInput(playerId, input = {}) {
    manualInputs.set(playerId, {
      forward: clamp(input.forward, -1, 1),
      strafe: clamp(input.strafe, -1, 1),
      sprint: Boolean(input.sprint),
      fireHeld: Boolean(input.fireHeld),
    });
  }

  function manualInputFor(playerId) {
    return manualInputs.get(playerId) ?? {
      forward: 0,
      strafe: 0,
      sprint: false,
      fireHeld: false,
    };
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

  function playerAvailable(playerId) {
    const entity = entities.get(playerId);
    const transform = ctx.components.get(playerId, "Transform");
    if (!entity?.alive || entity.bot || !transform) {
      return { ok: false, reason: "player-unavailable", transform };
    }
    return { ok: true, transform };
  }

  function modeFor(playerId) {
    if (ragdoll.isActive?.(playerId)) return "ragdoll";
    if (vehicles.isDriving?.(playerId)) return "vehicle";
    if (parachute.stateFor?.(playerId)?.airborne) return "parachute";
    return "foot";
  }

  function alignToRoute(playerId, now = Date.now()) {
    const available = playerAvailable(playerId);
    if (!available.ok) return null;
    const resolved = targetAndPointFor(playerId);
    if (!resolved.target || !resolved.facePoint) return null;
    if (distance2(available.transform, resolved.facePoint) < MIN_FACE_DISTANCE) return null;

    const mode = modeFor(playerId);
    const previousAngle = finite(available.transform.angle);
    const angle = angleTo(available.transform, resolved.facePoint);
    if (mode === "foot") available.transform.angle = angle;

    return {
      targetId: resolved.target.id,
      targetName: resolved.target.name,
      targetKind: resolved.target.kind,
      source: resolved.source,
      mode,
      x: finite(resolved.facePoint.x),
      y: finite(resolved.facePoint.y),
      z: finite(resolved.facePoint.z),
      angle,
      previousAngle,
      turnedRadians: mode === "foot"
        ? Math.abs(shortestAngleDelta(angle, previousAngle))
        : 0,
      distance: distance2(available.transform, resolved.facePoint),
      now,
    };
  }

  function enableGuidance(playerId, now = Date.now()) {
    trackedPlayers.add(playerId);
    const available = playerAvailable(playerId);
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
      mode: modeFor(playerId),
      aligned: Boolean(alignment),
      now,
    };
    lastResult.set(playerId, result);
    emitFor(playerId, "navigation:guidance-enabled", result);
    return result;
  }

  function restoreManualControl(playerId) {
    const manual = manualInputFor(playerId);
    if (vehicles.isDriving?.(playerId)) {
      vehicles.setInput(playerId, manual);
      return;
    }
    if (parachute.stateFor?.(playerId)?.airborne) movement.setInput(playerId, manual);
  }

  function disableGuidance(playerId, now = Date.now(), reason = "toggle") {
    const wasEnabled = guidanceEnabled.delete(playerId);
    restoreManualControl(playerId);
    const result = { ok: true, enabled: false, reason, now };
    lastResult.set(playerId, result);
    if (wasEnabled) emitFor(playerId, "navigation:guidance-disabled", result);
    return result;
  }

  function toggleGuidance(playerId, now = Date.now()) {
    if (guidanceEnabled.has(playerId)) return disableGuidance(playerId, now, "toggle");
    return enableGuidance(playerId, now);
  }

  function recordAutoGuide(playerId, resolved, details, now) {
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
      mode: details.mode,
      angle: details.angle ?? null,
      desiredAngle: details.desiredAngle ?? null,
      correctionRadians: details.correctionRadians ?? null,
      steering: details.steering ?? null,
      manualOverride: Boolean(details.manualOverride),
      distance: details.distance,
    });
  }

  function guideVehicle(playerId, resolved, now) {
    const vehicle = vehicles.vehicleForDriver?.(playerId)
      ?? (vehicles.driverId?.() === playerId ? vehicles.stateFor?.() : null);
    if (!vehicle) return null;
    const manual = manualInputFor(playerId);
    if (Math.abs(manual.strafe) > MANUAL_STEER_THRESHOLD) {
      recordAutoGuide(playerId, resolved, {
        mode: "vehicle",
        angle: finite(vehicle.angle),
        desiredAngle: angleTo(vehicle, resolved.facePoint),
        correctionRadians: 0,
        steering: manual.strafe,
        manualOverride: true,
        distance: distance2(vehicle, resolved.facePoint),
      }, now);
      return { restore: false, mode: "vehicle", manualOverride: true };
    }

    const desiredAngle = angleTo(vehicle, resolved.facePoint);
    const error = shortestAngleDelta(desiredAngle, finite(vehicle.angle));
    const steering = steeringForError(error, VEHICLE_FULL_STEER_ERROR);
    vehicles.setInput(playerId, { ...manual, strafe: steering });
    recordAutoGuide(playerId, resolved, {
      mode: "vehicle",
      angle: finite(vehicle.angle),
      desiredAngle,
      correctionRadians: Math.abs(error),
      steering,
      distance: distance2(vehicle, resolved.facePoint),
    }, now);
    return { restore: true, mode: "vehicle" };
  }

  function guideParachute(playerId, resolved, now) {
    const transform = ctx.components.get(playerId, "Transform");
    const state = parachute.stateFor?.(playerId);
    if (!transform || !state?.airborne) return null;
    const manual = manualInputFor(playerId);
    const desiredAngle = angleTo(transform, resolved.facePoint);
    const error = shortestAngleDelta(desiredAngle, finite(transform.angle));

    if (state.phase !== "deployed") {
      if (Math.abs(manual.strafe) <= MANUAL_STEER_THRESHOLD) transform.angle = desiredAngle;
      recordAutoGuide(playerId, resolved, {
        mode: "parachute",
        angle: finite(transform.angle),
        desiredAngle,
        correctionRadians: Math.abs(error),
        steering: 0,
        manualOverride: Math.abs(manual.strafe) > MANUAL_STEER_THRESHOLD,
        distance: distance2(transform, resolved.facePoint),
      }, now);
      return { restore: false, mode: "parachute" };
    }

    if (Math.abs(manual.strafe) > MANUAL_STEER_THRESHOLD) {
      recordAutoGuide(playerId, resolved, {
        mode: "parachute",
        angle: finite(transform.angle),
        desiredAngle,
        correctionRadians: Math.abs(error),
        steering: manual.strafe,
        manualOverride: true,
        distance: distance2(transform, resolved.facePoint),
      }, now);
      return { restore: false, mode: "parachute", manualOverride: true };
    }

    const steering = steeringForError(error, PARACHUTE_FULL_STEER_ERROR);
    movement.setInput(playerId, { ...manual, strafe: steering });
    recordAutoGuide(playerId, resolved, {
      mode: "parachute",
      angle: finite(transform.angle),
      desiredAngle,
      correctionRadians: Math.abs(error),
      steering,
      distance: distance2(transform, resolved.facePoint),
    }, now);
    return { restore: true, mode: "parachute" };
  }

  function guideFoot(playerId, resolved, now, { record = true } = {}) {
    const transform = ctx.components.get(playerId, "Transform");
    const input = ctx.components.get(playerId, "Input");
    if (!transform || finite(input?.forward) <= AUTO_GUIDE_FORWARD_THRESHOLD) return null;
    const desiredAngle = angleTo(transform, resolved.facePoint);
    const previousAngle = finite(transform.angle);
    transform.angle = desiredAngle;
    if (record) {
      recordAutoGuide(playerId, resolved, {
        mode: "foot",
        angle: previousAngle,
        desiredAngle,
        correctionRadians: Math.abs(shortestAngleDelta(desiredAngle, previousAngle)),
        steering: null,
        distance: distance2(transform, resolved.facePoint),
      }, now);
    }
    return { restore: false, mode: "foot" };
  }

  function autoGuide(playerId, now = Date.now(), { record = true } = {}) {
    if (!guidanceEnabled.has(playerId)) return null;
    const available = playerAvailable(playerId);
    if (!available.ok) return null;
    if (ragdoll.isActive?.(playerId)) return { restore: false, mode: "ragdoll" };

    const resolved = targetAndPointFor(playerId);
    if (!resolved.state?.active || !resolved.facePoint || !resolved.target) return null;
    if (distance2(available.transform, resolved.facePoint) < MIN_FACE_DISTANCE) return null;

    if (vehicles.isDriving?.(playerId)) return guideVehicle(playerId, resolved, now);
    if (parachute.stateFor?.(playerId)?.airborne) return guideParachute(playerId, resolved, now);
    return guideFoot(playerId, resolved, now, { record });
  }

  function stateFor(playerId) {
    const transform = ctx.components.get(playerId, "Transform");
    const resolved = targetAndPointFor(playerId);
    const input = ctx.components.get(playerId, "Input");
    const stats = autoGuideStats.get(playerId) ?? null;
    const desiredAngle = transform && resolved.facePoint ? angleTo(transform, resolved.facePoint) : null;
    const mode = modeFor(playerId);
    const active = Boolean(
      guidanceEnabled.has(playerId)
      && resolved.state?.active
      && mode !== "ragdoll"
      && (mode !== "foot" || finite(input?.forward) > AUTO_GUIDE_FORWARD_THRESHOLD)
    );
    return {
      playerId,
      enabled: guidanceEnabled.has(playerId),
      mode,
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
        active,
        forward: finite(input?.forward),
        applications: stats?.applications ?? 0,
        checkpointChanges: stats?.checkpointChanges ?? 0,
        lastCheckpointIndex: stats?.lastCheckpointIndex ?? null,
        lastAt: stats?.lastAt ?? null,
        correctionRadians: stats?.correctionRadians ?? null,
        steering: stats?.steering ?? null,
        manualOverride: Boolean(stats?.manualOverride),
        mode: stats?.mode ?? mode,
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
    rememberInput(playerId, input);
    const result = originalHandleInput(playerId, input, now);
    if (input.navigationFacePressed) toggleGuidance(playerId, now);
    return result;
  };

  matchApi.step = (dt, now = Date.now()) => {
    const restore = [];
    for (const playerId of trackedPlayers) {
      const applied = autoGuide(playerId, now, { record: true });
      if (applied?.restore) restore.push(playerId);
    }

    const result = originalStep(dt, now);

    for (const playerId of restore) restoreManualControl(playerId);

    // Ground movement can change checkpoint during this step. Snap to the new
    // route segment immediately so the next frame starts in the right heading.
    for (const playerId of trackedPlayers) {
      if (!guidanceEnabled.has(playerId) || modeFor(playerId) !== "foot") continue;
      autoGuide(playerId, now, { record: false });
    }
    return result;
  };

  matchApi.snapshotFor = (playerId, now = Date.now()) => {
    const snapshot = originalSnapshotFor(playerId, now);
    const guidance = stateFor(playerId);
    return {
      ...snapshot,
      navigationGuidance: {
        enabled: guidance.enabled,
        mode: guidance.mode,
        targetId: guidance.targetId,
        targetName: guidance.targetName,
        active: guidance.autoGuide.active,
        manualOverride: guidance.autoGuide.manualOverride,
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
    manualInputs.delete(entityId);
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
