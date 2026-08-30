export const manifest = {
  id: "battle-royale-navigation-stability",
  version: "1.0.1",
  requires: [
    "match-api",
    "battle-royale-navigation",
    "battle-royale-navigation-face",
    "battle-royale-vehicle",
    "battle-royale-parachute",
  ],
  capabilities: [
    "services.consume", "services.provide", "components.read", "events.on", "events.emit",
  ],
};

const MANUAL_INPUT_DEPTH_NONE = 0;
const MISSED_CHECKPOINT_REPLAN_COOLDOWN_MS = 850;
const MISSED_CHECKPOINT_STALE_MS = 1150;
const CHECKPOINT_BEHIND_RADIANS = 1.72;
const CHECKPOINT_STALE_BEHIND_RADIANS = 2.0;
const MIN_RECOVERY_SPEED = 4.5;
const MIN_RECOVERY_DISTANCE = 9;
const MIN_DISTANCE_GROWTH = 4;
const MAX_AUTO_BRAKE_DISTANCE = 68;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, finite(value)));
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

function routeDistanceFrom(from, checkpoints = []) {
  let total = 0;
  let cursor = from;
  for (const checkpoint of checkpoints) {
    total += Math.hypot(
      finite(cursor?.x) - finite(checkpoint?.x),
      finite(cursor?.y) - finite(checkpoint?.y),
      finite(cursor?.z) - finite(checkpoint?.z),
    );
    cursor = checkpoint;
  }
  return total;
}

export async function setup(ctx) {
  const matchApi = ctx.services.get("match-api");
  const navigation = ctx.services.get("navigation");
  const navigationFace = ctx.services.get("navigation-face");
  const vehicles = ctx.services.get("vehicles");
  const parachute = ctx.services.get("parachute");

  const originalHandleInput = matchApi.handleInput.bind(matchApi);
  const originalStep = matchApi.step.bind(matchApi);
  const originalSnapshotFor = matchApi.snapshotFor.bind(matchApi);
  const originalVehicleSetInput = vehicles.setInput.bind(vehicles);

  const recoveryTrackers = new Map();
  const assistStats = new Map();
  let humanInputDepth = MANUAL_INPUT_DEPTH_NONE;

  function statsFor(playerId) {
    let stats = assistStats.get(playerId);
    if (stats) return stats;
    stats = {
      automaticSteeringApplications: 0,
      brakeApplications: 0,
      missedCheckpointRecoveries: 0,
      lastBrakeAt: null,
      lastRecoveryAt: null,
      peakGuidedSpeed: 0,
      lastCornerSeverity: 0,
      lastPreviewDistance: null,
      lastPreviewDirectDistance: null,
    };
    assistStats.set(playerId, stats);
    return stats;
  }

  function previewRouteDistance(playerId, selected) {
    if (!selected?.id) return null;
    const transform = ctx.components.get(playerId, "Transform");
    if (!transform) return Number.isFinite(Number(selected.distance)) ? Number(selected.distance) : null;

    if (parachute.stateFor?.(playerId)?.airborne) {
      return Number.isFinite(Number(selected.distance)) ? Number(selected.distance) : null;
    }

    const target = navigation.availableTargets(playerId)
      .find((entry) => entry.id === selected.id) ?? null;
    if (!target) return Number.isFinite(Number(selected.distance)) ? Number(selected.distance) : null;

    const mode = vehicles.isDriving?.(playerId) ? "vehicle" : "foot";
    const route = navigation.buildRoute(transform, {
      ...target,
      mode,
    });
    const distance = Number(route?.distance);
    if (Number.isFinite(distance)) return distance;
    if (Array.isArray(route?.checkpoints)) return routeDistanceFrom(transform, route.checkpoints);
    return Number.isFinite(Number(selected.distance)) ? Number(selected.distance) : null;
  }

  function decorateNavigationSnapshot(playerId, snapshot) {
    const nav = snapshot?.navigation;
    if (!nav?.selected) return snapshot;
    const directDistance = Number(nav.selected.distance);
    const previewDistance = previewRouteDistance(playerId, nav.selected);
    if (!Number.isFinite(previewDistance)) return snapshot;

    const stats = statsFor(playerId);
    stats.lastPreviewDistance = previewDistance;
    stats.lastPreviewDirectDistance = Number.isFinite(directDistance) ? directDistance : null;

    return {
      ...snapshot,
      navigation: {
        ...nav,
        selected: {
          ...nav.selected,
          directDistance: Number.isFinite(directDistance) ? directDistance : null,
          distance: previewDistance,
          distanceModel: parachute.stateFor?.(playerId)?.airborne ? "air-direct" : "planned-route",
        },
      },
    };
  }

  function guidedVehicleInput(playerId, raw = {}) {
    if (humanInputDepth > MANUAL_INPUT_DEPTH_NONE) return raw;

    const face = navigationFace.stateFor?.(playerId);
    if (!face?.enabled || face.mode !== "vehicle" || face.autoGuide?.manualOverride) return raw;

    const state = navigation.stateFor(playerId);
    if (!state?.active || !state.checkpoint) return raw;

    const vehicle = vehicles.vehicleForDriver?.(playerId);
    if (!vehicle) return raw;

    const checkpoint = state.checkpoint;
    const currentIndex = Math.max(0, Number(state.checkpointIndex) || 0);
    const nextCheckpoint = state.checkpoints?.[currentIndex + 1] ?? null;
    const speed = Math.max(0, Math.abs(finite(vehicle.forwardSpeed, vehicle.speed)));
    const distance = distance2(vehicle, checkpoint);
    const desiredAngle = angleTo(vehicle, checkpoint);
    const headingError = shortestAngleDelta(desiredAngle, finite(vehicle.angle));

    const fullCommandError = clamp(0.56 - speed * 0.012, 0.21, 0.56);
    let steering = clamp(headingError / fullCommandError, -1, 1);
    if (Math.abs(steering) < 0.025) steering = 0;

    let cornerSeverity = Math.abs(headingError) * 0.78;
    if (nextCheckpoint) {
      const outgoingAngle = angleTo(checkpoint, nextCheckpoint);
      cornerSeverity = Math.max(
        cornerSeverity,
        Math.abs(shortestAngleDelta(outgoingAngle, desiredAngle)),
      );
    }

    const stoppingDistance = clamp(
      9 + speed * 1.35 + (speed * speed) / 13,
      11,
      MAX_AUTO_BRAKE_DISTANCE,
    );
    const finalApproach = !nextCheckpoint;
    const finalApproachDistance = clamp(8 + speed * 1.3, 10, 42);
    const severityRatio = clamp(cornerSeverity / 1.45, 0, 1);
    const targetTurnSpeed = clamp(17 - severityRatio * 10.5, 6.2, 17);
    const needsCornerBrake = cornerSeverity > 0.38
      && distance <= stoppingDistance
      && speed > targetTurnSpeed + 1.2;
    const needsFinalBrake = finalApproach
      && distance <= finalApproachDistance
      && speed > 7.5;

    let forward = raw.forward;
    let fireHeld = raw.fireHeld;
    let braking = false;
    if ((needsCornerBrake || needsFinalBrake) && finite(raw.forward) > 0.08 && !raw.sprint) {
      const desiredSpeed = needsFinalBrake ? 5.5 : targetTurnSpeed;
      const brakeStrength = clamp(0.24 + (speed - desiredSpeed) / 16, 0.25, 0.9);
      forward = -brakeStrength;
      fireHeld = false;
      braking = true;
    }

    const stats = statsFor(playerId);
    stats.automaticSteeringApplications += 1;
    stats.peakGuidedSpeed = Math.max(stats.peakGuidedSpeed, speed);
    stats.lastCornerSeverity = cornerSeverity;
    if (braking) {
      stats.brakeApplications += 1;
      stats.lastBrakeAt = Date.now();
    }

    return {
      ...raw,
      forward,
      strafe: steering,
      fireHeld,
    };
  }

  function restartRouteFromCurrentPosition(playerId, state, now) {
    const targetId = state?.activeTargetId;
    if (!targetId) return false;
    navigation.stop(playerId, now, "missed-checkpoint", { announce: false });
    const selected = navigation.selectTarget(playerId, targetId, now, { announce: false });
    if (!selected) return false;
    const started = navigation.toggle(playerId, now);
    if (!started) return false;

    const stats = statsFor(playerId);
    stats.missedCheckpointRecoveries += 1;
    stats.lastRecoveryAt = now;
    recoveryTrackers.delete(playerId);
    ctx.events.emit("navigation:vehicle-replanned", {
      entityId: playerId,
      targetId,
      reason: "missed-checkpoint",
      now,
    });
    return true;
  }

  function monitorVehicleRoute(playerId, vehicle, now) {
    const state = navigation.stateFor(playerId);
    if (!state?.active || !state.checkpoint || !state.activeTargetId) {
      recoveryTrackers.delete(playerId);
      return;
    }

    const checkpoint = state.checkpoint;
    const distance = distance2(vehicle, checkpoint);
    const speed = Math.max(0, Math.abs(finite(vehicle.forwardSpeed, vehicle.speed)));
    const error = Math.abs(shortestAngleDelta(angleTo(vehicle, checkpoint), finite(vehicle.angle)));
    const checkpointKey = `${state.activeTargetId}:${state.checkpointIndex}`;
    let tracker = recoveryTrackers.get(playerId);

    if (!tracker || tracker.checkpointKey !== checkpointKey) {
      tracker = {
        checkpointKey,
        firstAt: now,
        lastAt: now,
        lastDistance: distance,
        minimumDistance: distance,
        lastReplanAt: -Infinity,
      };
      recoveryTrackers.set(playerId, tracker);
      return;
    }

    tracker.minimumDistance = Math.min(tracker.minimumDistance, distance);
    const growth = distance - tracker.minimumDistance;
    const increasing = distance > tracker.lastDistance + 0.2;
    const elapsed = now - tracker.firstAt;
    const cooldownReady = now - tracker.lastReplanAt >= MISSED_CHECKPOINT_REPLAN_COOLDOWN_MS;
    const passedCloseEnough = tracker.minimumDistance <= Math.max(18, speed * 1.15);
    const clearlyPassed = error >= CHECKPOINT_BEHIND_RADIANS
      && passedCloseEnough
      && growth >= Math.max(MIN_DISTANCE_GROWTH, speed * 0.22)
      && increasing;
    const staleBehind = elapsed >= MISSED_CHECKPOINT_STALE_MS
      && error >= CHECKPOINT_STALE_BEHIND_RADIANS
      && distance >= MIN_RECOVERY_DISTANCE
      && increasing;

    tracker.lastDistance = distance;
    tracker.lastAt = now;

    if (speed < MIN_RECOVERY_SPEED || !cooldownReady || (!clearlyPassed && !staleBehind)) return;
    tracker.lastReplanAt = now;
    restartRouteFromCurrentPosition(playerId, state, now);
  }

  function monitorDrivenRoutes(now) {
    const seen = new Set();
    for (const vehicle of vehicles.snapshot?.() ?? []) {
      const playerId = vehicle?.driverId;
      if (!playerId || seen.has(playerId)) continue;
      seen.add(playerId);
      monitorVehicleRoute(playerId, vehicle, now);
    }
    for (const playerId of recoveryTrackers.keys()) {
      if (!seen.has(playerId)) recoveryTrackers.delete(playerId);
    }
  }

  matchApi.handleInput = (playerId, input = {}, now = Date.now()) => {
    humanInputDepth += 1;
    try {
      return originalHandleInput(playerId, input, now);
    } finally {
      humanInputDepth -= 1;
    }
  };

  vehicles.setInput = (playerId, raw = {}) => (
    originalVehicleSetInput(playerId, guidedVehicleInput(playerId, raw))
  );

  matchApi.step = (dt, now = Date.now()) => {
    const result = originalStep(dt, now);
    monitorDrivenRoutes(now);
    return result;
  };

  matchApi.snapshotFor = (playerId, now = Date.now()) => (
    decorateNavigationSnapshot(playerId, originalSnapshotFor(playerId, now))
  );

  ctx.events.on("navigation:stopped", ({ entityId }) => recoveryTrackers.delete(entityId));
  ctx.events.on("navigation:reached", ({ entityId }) => recoveryTrackers.delete(entityId));
  ctx.events.on("entity:removed", ({ entityId }) => {
    recoveryTrackers.delete(entityId);
    assistStats.delete(entityId);
  });

  ctx.services.provide("navigation-stability", {
    stateFor(playerId) {
      return {
        playerId,
        ...(assistStats.get(playerId) ?? statsFor(playerId)),
        recoveryTracker: recoveryTrackers.get(playerId) ?? null,
      };
    },
    previewDistance(playerId) {
      const state = navigation.stateFor(playerId);
      return state.active
        ? state.remainingDistance
        : previewRouteDistance(playerId, state.selected);
    },
    constants: {
      missedCheckpointStaleMs: MISSED_CHECKPOINT_STALE_MS,
      maxAutoBrakeDistance: MAX_AUTO_BRAKE_DISTANCE,
    },
  });
}
