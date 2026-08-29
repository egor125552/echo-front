export const manifest = {
  id: "battle-royale-air-navigation",
  version: "1.1.0",
  requires: [
    "battle-royale-navigation",
    "battle-royale-parachute",
    "match-api",
    "movement",
  ],
  capabilities: [
    "services.consume", "services.provide",
    "components.read", "events.on",
  ],
};

const BRAKE_GLIDE_RATIO = 0.34;
const BRAKE_MARGIN_METERS = 5;
const BRAKE_ENTER_MARGIN = 4;
const BRAKE_EXIT_MARGIN = 14;
const HOLD_RADIUS_MIN = 8;
const HOLD_RADIUS_MAX = 14;
const HOLD_RADIUS_RATIO = 0.18;
const HOLD_EXIT_MARGIN = 8;
const STEERING_REVERSAL_THRESHOLD = 0.2;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}

function horizontalDistance(a, b) {
  return Math.hypot(
    finite(a?.x) - finite(b?.x),
    finite(a?.z) - finite(b?.z),
  );
}

function steeringSign(value) {
  const steering = finite(value);
  if (Math.abs(steering) < STEERING_REVERSAL_THRESHOLD) return 0;
  return steering > 0 ? 1 : -1;
}

export async function setup(ctx) {
  const navigation = ctx.services.get("navigation");
  const parachute = ctx.services.get("parachute");
  const matchApi = ctx.services.get("match-api");
  const movement = ctx.services.get("movement");

  const originalNavigationStateFor = navigation.stateFor.bind(navigation);
  const originalAvailableTargets = navigation.availableTargets.bind(navigation);
  const originalSnapshotFor = matchApi.snapshotFor.bind(matchApi);
  const originalHandleInput = matchApi.handleInput.bind(matchApi);
  const originalSetInput = movement.setInput.bind(movement);

  const guidanceEnabled = new Set();
  const braking = new Set();
  const holding = new Set();
  const lastState = new Map();
  const stats = new Map();
  let humanInputDepth = 0;

  function transformFor(playerId) {
    return ctx.components.get(playerId, "Transform") ?? null;
  }

  function flightFor(playerId) {
    return parachute.stateFor?.(playerId) ?? null;
  }

  function isAirborne(playerId) {
    return Boolean(flightFor(playerId)?.airborne);
  }

  function rawTargetFor(playerId, state = null) {
    const navState = state ?? originalNavigationStateFor(playerId);
    const targetId = navState.activeTargetId ?? navState.selectedTargetId;
    if (!targetId) return null;
    return originalAvailableTargets(playerId).find((target) => target.id === targetId) ?? null;
  }

  function airCheckpointFor(playerId, state = null) {
    const transform = transformFor(playerId);
    const target = rawTargetFor(playerId, state);
    if (!transform || !target) return null;
    return {
      x: finite(target.position?.x),
      y: finite(transform.y),
      z: finite(target.position?.z),
      index: 1,
      total: 1,
      kind: "air-target",
      mandatory: true,
      distance: horizontalDistance(transform, target.position),
    };
  }

  function decorateState(playerId, state) {
    if (!state || !isAirborne(playerId) || !state.active) return state;
    const transform = transformFor(playerId);
    const target = rawTargetFor(playerId, state);
    const checkpoint = airCheckpointFor(playerId, state);
    if (!transform || !target || !checkpoint) return state;
    const distance = horizontalDistance(transform, target.position);
    return {
      ...state,
      selected: state.selected ? { ...state.selected, distance } : state.selected,
      target: state.target ? { ...state.target, distance } : state.target,
      checkpoint,
      checkpoints: [checkpoint],
      checkpointIndex: 0,
      remainingDistance: distance,
      route: state.route ? {
        ...state.route,
        mode: "parachute",
        checkpointCount: 1,
        detours: 0,
        rapierBlockedSegments: 0,
        semanticTransitions: 0,
      } : state.route,
      routeMeta: state.routeMeta ? {
        ...state.routeMeta,
        mode: "parachute",
        detours: 0,
        rapierBlockedSegments: 0,
        semanticTransitions: 0,
        anchors: [checkpoint],
      } : state.routeMeta,
    };
  }

  navigation.stateFor = (playerId, now = Date.now()) => (
    decorateState(playerId, originalNavigationStateFor(playerId, now))
  );

  navigation.availableTargets = (playerId) => {
    const targets = originalAvailableTargets(playerId);
    if (!isAirborne(playerId)) return targets;
    const transform = transformFor(playerId);
    if (!transform) return targets;
    return targets.map((target) => ({
      ...target,
      distance: horizontalDistance(transform, target.position),
    }));
  };

  function brakeDistanceFor(playerId, target) {
    const flight = flightFor(playerId);
    if (!flight || !target) return null;
    const clearance = Number.isFinite(Number(flight.groundDistance))
      ? Math.max(0, Number(flight.groundDistance))
      : Math.max(0, finite(flight.altitude));
    return Math.max(12, clearance * BRAKE_GLIDE_RATIO + BRAKE_MARGIN_METERS);
  }

  function holdRadiusFor(brakeDistance) {
    return clamp(
      finite(brakeDistance) * HOLD_RADIUS_RATIO,
      HOLD_RADIUS_MIN,
      HOLD_RADIUS_MAX,
    );
  }

  function freshStats() {
    return {
      controlSamples: 0,
      steeringReversals: 0,
      brakeEntries: 0,
      holdEntries: 0,
      lastSteeringSign: 0,
      peakDistanceAfterHold: 0,
    };
  }

  function recordControl(playerId, details) {
    const current = stats.get(playerId) ?? freshStats();
    const sign = steeringSign(details.steering);
    const previousSign = current.lastSteeringSign;
    if (sign && previousSign && sign !== previousSign) current.steeringReversals += 1;
    if (sign) current.lastSteeringSign = sign;
    current.controlSamples += 1;
    if (details.enteredBraking) current.brakeEntries += 1;
    if (details.enteredHolding) current.holdEntries += 1;
    if (details.holding) {
      current.peakDistanceAfterHold = Math.max(current.peakDistanceAfterHold, details.distance);
    }
    stats.set(playerId, current);
  }

  function guidedInput(playerId, input = {}) {
    if (!guidanceEnabled.has(playerId) || humanInputDepth > 0) return input;
    const flight = flightFor(playerId);
    if (!flight?.airborne || flight.phase !== "deployed") return input;
    const state = originalNavigationStateFor(playerId);
    if (!state?.active) return input;
    const target = rawTargetFor(playerId, state);
    const transform = transformFor(playerId);
    if (!target || !transform) return input;

    const distance = horizontalDistance(transform, target.position);
    const brakeDistance = brakeDistanceFor(playerId, target);
    if (!Number.isFinite(brakeDistance)) return input;
    const holdRadius = holdRadiusFor(brakeDistance);

    const wasBraking = braking.has(playerId);
    let brakingNow = wasBraking;
    if (!brakingNow && distance <= brakeDistance + BRAKE_ENTER_MARGIN) brakingNow = true;
    if (brakingNow && distance > brakeDistance + BRAKE_EXIT_MARGIN) brakingNow = false;

    const wasHolding = holding.has(playerId);
    let holdingNow = wasHolding;
    if (!holdingNow && brakingNow && distance <= holdRadius) holdingNow = true;
    if (holdingNow && distance > holdRadius + HOLD_EXIT_MARGIN) holdingNow = false;
    if (!brakingNow) holdingNow = false;

    if (brakingNow) braking.add(playerId);
    else braking.delete(playerId);
    if (holdingNow) holding.add(playerId);
    else holding.delete(playerId);

    const output = {
      ...input,
      ...(brakingNow ? { forward: -1, sprint: false } : {}),
      ...(holdingNow ? { strafe: 0 } : {}),
    };

    const details = {
      airborne: true,
      phase: flight.phase,
      targetId: target.id,
      targetName: target.name,
      distance,
      groundDistance: flight.groundDistance,
      brakeDistance,
      holdRadius,
      braking: brakingNow,
      holding: holdingNow,
      enteredBraking: brakingNow && !wasBraking,
      enteredHolding: holdingNow && !wasHolding,
      steering: finite(output.strafe),
      requestedForward: finite(input.forward),
      appliedForward: finite(output.forward),
    };
    lastState.set(playerId, details);
    recordControl(playerId, details);
    return output;
  }

  matchApi.handleInput = (playerId, input = {}, now = Date.now()) => {
    humanInputDepth += 1;
    try {
      return originalHandleInput(playerId, input, now);
    } finally {
      humanInputDepth = Math.max(0, humanInputDepth - 1);
    }
  };

  movement.setInput = (playerId, input = {}) => originalSetInput(playerId, guidedInput(playerId, input));

  matchApi.snapshotFor = (playerId, now = Date.now()) => {
    const snapshot = originalSnapshotFor(playerId, now);
    if (!snapshot?.navigation || !isAirborne(playerId)) return snapshot;
    return {
      ...snapshot,
      navigation: decorateState(playerId, {
        ...originalNavigationStateFor(playerId, now),
        selected: snapshot.navigation.selected,
        target: snapshot.navigation.target,
        route: snapshot.navigation.route,
      }),
      airNavigation: stateFor(playerId),
    };
  };

  function stateFor(playerId) {
    const flight = flightFor(playerId);
    const navState = originalNavigationStateFor(playerId);
    const target = rawTargetFor(playerId, navState);
    const transform = transformFor(playerId);
    const brakeDistance = target ? brakeDistanceFor(playerId, target) : null;
    const controlStats = stats.get(playerId) ?? freshStats();
    return {
      airborne: Boolean(flight?.airborne),
      phase: flight?.phase ?? null,
      guidanceEnabled: guidanceEnabled.has(playerId),
      targetId: target?.id ?? null,
      targetName: target?.name ?? null,
      distance: transform && target ? horizontalDistance(transform, target.position) : null,
      brakeDistance,
      holdRadius: Number.isFinite(brakeDistance) ? holdRadiusFor(brakeDistance) : null,
      braking: braking.has(playerId),
      holding: holding.has(playerId),
      controlSamples: controlStats.controlSamples,
      steeringReversals: controlStats.steeringReversals,
      brakeEntries: controlStats.brakeEntries,
      holdEntries: controlStats.holdEntries,
      peakDistanceAfterHold: controlStats.peakDistanceAfterHold,
      last: lastState.get(playerId) ?? null,
    };
  }

  function assertStable(playerId, expected = {}) {
    const state = stateFor(playerId);
    if (Number.isFinite(expected.maxSteeringReversals)
      && state.steeringReversals > Number(expected.maxSteeringReversals)) {
      throw new Error(
        `Expected at most ${expected.maxSteeringReversals} air steering reversals, got ${state.steeringReversals}`,
      );
    }
    if (Number.isFinite(expected.minControlSamples)
      && state.controlSamples < Number(expected.minControlSamples)) {
      throw new Error(
        `Expected at least ${expected.minControlSamples} air control samples, got ${state.controlSamples}`,
      );
    }
    if (expected.braking !== undefined && state.braking !== Boolean(expected.braking)) {
      throw new Error(`Expected air braking=${Boolean(expected.braking)}, got ${state.braking}`);
    }
    if (expected.holding !== undefined && state.holding !== Boolean(expected.holding)) {
      throw new Error(`Expected air holding=${Boolean(expected.holding)}, got ${state.holding}`);
    }
    if (Number.isFinite(expected.minBrakeEntries)
      && state.brakeEntries < Number(expected.minBrakeEntries)) {
      throw new Error(`Expected at least ${expected.minBrakeEntries} brake entries, got ${state.brakeEntries}`);
    }
    if (Number.isFinite(expected.minHoldEntries)
      && state.holdEntries < Number(expected.minHoldEntries)) {
      throw new Error(`Expected at least ${expected.minHoldEntries} hold entries, got ${state.holdEntries}`);
    }
    return state;
  }

  ctx.events.on("navigation:guidance-enabled", ({ entityId }) => {
    guidanceEnabled.add(entityId);
    braking.delete(entityId);
    holding.delete(entityId);
    lastState.delete(entityId);
    stats.set(entityId, freshStats());
  });
  ctx.events.on("navigation:guidance-disabled", ({ entityId }) => {
    guidanceEnabled.delete(entityId);
    braking.delete(entityId);
    holding.delete(entityId);
  });
  ctx.events.on("navigation:reached", ({ entityId }) => {
    braking.delete(entityId);
    holding.delete(entityId);
  });
  ctx.events.on("parachute:landed", ({ entityId, now }) => {
    braking.delete(entityId);
    holding.delete(entityId);
    const state = originalNavigationStateFor(entityId, Number(now) || Date.now());
    if (!state?.activeTargetId) return;
    const targetId = state.activeTargetId;
    navigation.stop(entityId, Number(now) || Date.now(), "air-landed-replan", { announce: false });
    navigation.selectTarget(entityId, targetId, Number(now) || Date.now(), { announce: false });
    navigation.toggle(entityId, Number(now) || Date.now());
  });
  ctx.events.on("entity:died", ({ entityId }) => {
    guidanceEnabled.delete(entityId);
    braking.delete(entityId);
    holding.delete(entityId);
    lastState.delete(entityId);
    stats.delete(entityId);
  });
  ctx.events.on("entity:removed", ({ entityId }) => {
    guidanceEnabled.delete(entityId);
    braking.delete(entityId);
    holding.delete(entityId);
    lastState.delete(entityId);
    stats.delete(entityId);
  });

  ctx.services.provide("air-navigation", {
    stateFor,
    assertStable,
  });
}
