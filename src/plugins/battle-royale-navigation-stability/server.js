export const manifest = {
  id: "battle-royale-navigation-stability",
  version: "1.1.2",
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
const MAX_AUTO_BRAKE_DISTANCE = 360;
const AUTO_NITRO_MAX_SPEED = 48;
const LOOKAHEAD_CHECKPOINTS = 6;
const ARRIVAL_HOLD_DISTANCE = 7.5;
const ARRIVAL_CRAWL_DISTANCE = 4.35;
const ARRIVAL_BRAKE_RELEASE_SPEED = 1.25;

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

function routeLookahead(vehicle, state) {
  const index = Math.max(0, Number(state?.checkpointIndex) || 0);
  const checkpoints = (state?.checkpoints ?? []).slice(index, index + LOOKAHEAD_CHECKPOINTS);
  if (!checkpoints.length) return { nearestTurn: null, pathDistance: 0 };

  let cursor = vehicle;
  let incomingAngle = angleTo(cursor, checkpoints[0]);
  let cumulative = distance2(cursor, checkpoints[0]);
  let nearestTurn = null;

  for (let i = 0; i < checkpoints.length - 1; i += 1) {
    const corner = checkpoints[i];
    const next = checkpoints[i + 1];
    const outgoingAngle = angleTo(corner, next);
    const severity = Math.abs(shortestAngleDelta(outgoingAngle, incomingAngle));
    if (severity >= 0.24 && (!nearestTurn || cumulative < nearestTurn.distance)) {
      nearestTurn = { severity, distance: cumulative, checkpointIndex: index + i };
    }
    incomingAngle = outgoingAngle;
    cumulative += distance2(corner, next);
  }

  return { nearestTurn, pathDistance: cumulative };
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
  const postArrivalBrakes = new Map();
  let humanInputDepth = MANUAL_INPUT_DEPTH_NONE;

  function statsFor(playerId) {
    let stats = assistStats.get(playerId);
    if (stats) return stats;
    stats = {
      automaticSteeringApplications: 0,
      brakeApplications: 0,
      finalBrakeApplications: 0,
      cornerBrakeApplications: 0,
      arrivalHoldApplications: 0,
      postArrivalBrakeApplications: 0,
      nitroSuppressions: 0,
      missedCheckpointRecoveries: 0,
      lastBrakeAt: null,
      lastRecoveryAt: null,
      peakGuidedSpeed: 0,
      lastCornerSeverity: 0,
      lastCornerDistance: null,
      lastRemainingDistance: null,
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

  function postArrivalInput(playerId, raw = {}) {
    if (!postArrivalBrakes.has(playerId)) return null;

    // Y is normally driven while the player keeps the accelerator held. After
    // announcing arrival, keep the car stopped until a real input sample shows
    // that the driver released the accelerator once. This prevents the restored
    // held key from immediately launching the car into the destination wall.
    if (humanInputDepth > MANUAL_INPUT_DEPTH_NONE && Math.abs(finite(raw.forward)) <= 0.08) {
      postArrivalBrakes.delete(playerId);
      return null;
    }

    const vehicle = vehicles.vehicleForDriver?.(playerId);
    if (!vehicle) {
      postArrivalBrakes.delete(playerId);
      return null;
    }
    const forwardSpeed = finite(vehicle.forwardSpeed);
    const speed = Math.max(0, finite(vehicle.speed));
    let forward = 0;
    if (forwardSpeed > ARRIVAL_BRAKE_RELEASE_SPEED) {
      forward = -clamp(0.38 + speed / 14, 0.42, 1);
    } else if (forwardSpeed < -ARRIVAL_BRAKE_RELEASE_SPEED) {
      forward = clamp(0.34 + speed / 16, 0.38, 0.8);
    }
    const stats = statsFor(playerId);
    stats.postArrivalBrakeApplications += 1;
    return {
      ...raw,
      forward,
      sprint: false,
      fireHeld: false,
    };
  }

  function guidedVehicleInput(playerId, raw = {}) {
    const postArrival = postArrivalInput(playerId, raw);
    if (postArrival) return postArrival;
    if (humanInputDepth > MANUAL_INPUT_DEPTH_NONE) return raw;

    const face = navigationFace.stateFor?.(playerId);
    if (!face?.enabled || face.mode !== "vehicle" || face.autoGuide?.manualOverride) return raw;

    const state = navigation.stateFor(playerId);
    if (!state?.active || !state.checkpoint) return raw;

    const vehicle = vehicles.vehicleForDriver?.(playerId);
    if (!vehicle) return raw;

    const checkpoint = state.checkpoint;
    const speed = Math.max(0, Math.abs(finite(vehicle.forwardSpeed, vehicle.speed)));
    const forwardSpeed = finite(vehicle.forwardSpeed);
    const distance = distance2(vehicle, checkpoint);
    const remainingDistance = Math.max(distance, finite(state.remainingDistance, distance));
    const desiredAngle = angleTo(vehicle, checkpoint);
    const headingError = shortestAngleDelta(desiredAngle, finite(vehicle.angle));

    const fullCommandError = clamp(0.56 - speed * 0.012, 0.18, 0.56);
    let steering = clamp(headingError / fullCommandError, -1, 1);
    if (Math.abs(steering) < 0.025) steering = 0;

    const lookahead = routeLookahead(vehicle, state);
    const nearestTurn = lookahead.nearestTurn;
    const headingSeverity = Math.abs(headingError) * 0.78;
    const cornerSeverity = Math.max(headingSeverity, finite(nearestTurn?.severity));
    const cornerDistance = nearestTurn?.distance ?? Infinity;

    const stoppingDistance = clamp(
      12 + speed * 1.45 + (speed * speed) / 13,
      14,
      MAX_AUTO_BRAKE_DISTANCE,
    );
    const severityRatio = clamp(cornerSeverity / 1.45, 0, 1);
    const targetTurnSpeed = clamp(22 - severityRatio * 14.5, 6.5, 22);
    const cornerBrakeWindow = stoppingDistance * clamp(0.72 + severityRatio * 0.42, 0.72, 1.14);
    const needsCornerBrake = cornerSeverity > 0.34
      && cornerDistance <= cornerBrakeWindow
      && speed > targetTurnSpeed + 1.1;

    const desiredApproachSpeed = clamp((remainingDistance - 3.5) * 0.22, 1.1, 28);
    const needsFinalBrake = remainingDistance <= stoppingDistance
      && speed > desiredApproachSpeed + 0.8;
    const arrivalHold = remainingDistance <= ARRIVAL_HOLD_DISTANCE;

    const nitroSafetyDistance = Math.max(170, stoppingDistance * 1.08);
    const turnNeedsNitroCut = nearestTurn
      && nearestTurn.distance <= Math.max(150, stoppingDistance * 0.92);
    const suppressNitro = Boolean(raw.fireHeld) && (
      speed >= AUTO_NITRO_MAX_SPEED
      || remainingDistance <= nitroSafetyDistance
      || turnNeedsNitroCut
      || arrivalHold
    );

    let forward = raw.forward;
    let fireHeld = suppressNitro ? false : raw.fireHeld;
    let braking = false;

    if (arrivalHold) {
      fireHeld = false;
      if (forwardSpeed > ARRIVAL_BRAKE_RELEASE_SPEED) {
        forward = -clamp(0.42 + (speed - 1) / 10, 0.45, 1);
        braking = true;
      } else if (forwardSpeed < -ARRIVAL_BRAKE_RELEASE_SPEED) {
        forward = clamp(0.32 + speed / 16, 0.36, 0.72);
        braking = true;
      } else if (remainingDistance > ARRIVAL_CRAWL_DISTANCE) {
        forward = 0.16;
      } else {
        forward = 0;
        steering = 0;
      }
    } else if ((needsCornerBrake || needsFinalBrake) && finite(raw.forward) > 0.08) {
      const desiredSpeed = needsFinalBrake
        ? Math.min(desiredApproachSpeed, needsCornerBrake ? targetTurnSpeed : desiredApproachSpeed)
        : targetTurnSpeed;
      const brakeStrength = clamp(0.28 + (speed - desiredSpeed) / 18, 0.3, 1);
      forward = -brakeStrength;
      fireHeld = false;
      braking = true;
    }

    const stats = statsFor(playerId);
    stats.automaticSteeringApplications += 1;
    stats.peakGuidedSpeed = Math.max(stats.peakGuidedSpeed, speed);
    stats.lastCornerSeverity = cornerSeverity;
    stats.lastCornerDistance = Number.isFinite(cornerDistance) ? cornerDistance : null;
    stats.lastRemainingDistance = remainingDistance;
    if (suppressNitro) stats.nitroSuppressions += 1;
    if (arrivalHold) stats.arrivalHoldApplications += 1;
    if (braking) {
      stats.brakeApplications += 1;
      if (needsFinalBrake || arrivalHold) stats.finalBrakeApplications += 1;
      if (needsCornerBrake) stats.cornerBrakeApplications += 1;
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

  ctx.events.on("navigation:stopped", ({ entityId }) => {
    recoveryTrackers.delete(entityId);
    postArrivalBrakes.delete(entityId);
  });
  ctx.events.on("navigation:reached", ({ entityId }) => {
    recoveryTrackers.delete(entityId);
    if (vehicles.isDriving?.(entityId)) {
      postArrivalBrakes.set(entityId, { waitingForForwardRelease: true });
    }
  });
  ctx.events.on("entity:removed", ({ entityId }) => {
    recoveryTrackers.delete(entityId);
    postArrivalBrakes.delete(entityId);
    assistStats.delete(entityId);
  });

  ctx.services.provide("navigation-stability", {
    stateFor(playerId) {
      return {
        playerId,
        ...(assistStats.get(playerId) ?? statsFor(playerId)),
        recoveryTracker: recoveryTrackers.get(playerId) ?? null,
        postArrivalBrake: postArrivalBrakes.get(playerId) ?? null,
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
      autoNitroMaxSpeed: AUTO_NITRO_MAX_SPEED,
      lookaheadCheckpoints: LOOKAHEAD_CHECKPOINTS,
      arrivalHoldDistance: ARRIVAL_HOLD_DISTANCE,
      postArrivalRequiresForwardRelease: true,
    },
  });
}
