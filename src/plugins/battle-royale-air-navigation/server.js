export const manifest = {
  id: "battle-royale-air-navigation",
  version: "1.0.0",
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

const AIR_CHECKPOINT_REACHED = 12;
const BRAKE_GLIDE_RATIO = 0.34;
const BRAKE_MARGIN_METERS = 5;
const BRAKE_ENTER_MARGIN = 4;
const BRAKE_EXIT_MARGIN = 14;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function horizontalDistance(a, b) {
  return Math.hypot(
    finite(a?.x) - finite(b?.x),
    finite(a?.z) - finite(b?.z),
  );
}

export async function setup(ctx) {
  const navigation = ctx.services.get("navigation");
  const parachute = ctx.services.get("parachute");
  const matchApi = ctx.services.get("match-api");
  const movement = ctx.services.get("movement");

  const originalNavigationStateFor = navigation.stateFor.bind(navigation);
  const originalAvailableTargets = navigation.availableTargets.bind(navigation);
  const originalSnapshotFor = matchApi.snapshotFor.bind(matchApi);
  const originalSetInput = movement.setInput.bind(movement);

  const guidanceEnabled = new Set();
  const braking = new Set();
  const lastState = new Map();

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

  function guidedInput(playerId, input = {}) {
    if (!guidanceEnabled.has(playerId)) return input;
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

    let brakingNow = braking.has(playerId);
    if (!brakingNow && distance <= brakeDistance + BRAKE_ENTER_MARGIN) brakingNow = true;
    if (brakingNow && distance > brakeDistance + BRAKE_EXIT_MARGIN) brakingNow = false;

    if (brakingNow) braking.add(playerId);
    else braking.delete(playerId);

    lastState.set(playerId, {
      airborne: true,
      phase: flight.phase,
      targetId: target.id,
      targetName: target.name,
      distance,
      groundDistance: flight.groundDistance,
      brakeDistance,
      braking: brakingNow,
    });

    if (!brakingNow) return input;
    return {
      ...input,
      forward: -1,
      sprint: false,
    };
  }

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
    };
  };

  ctx.events.on("navigation:guidance-enabled", ({ entityId }) => {
    guidanceEnabled.add(entityId);
  });
  ctx.events.on("navigation:guidance-disabled", ({ entityId }) => {
    guidanceEnabled.delete(entityId);
    braking.delete(entityId);
  });
  ctx.events.on("navigation:reached", ({ entityId }) => {
    braking.delete(entityId);
  });
  ctx.events.on("parachute:landed", ({ entityId, now }) => {
    braking.delete(entityId);
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
    lastState.delete(entityId);
  });
  ctx.events.on("entity:removed", ({ entityId }) => {
    guidanceEnabled.delete(entityId);
    braking.delete(entityId);
    lastState.delete(entityId);
  });

  ctx.services.provide("air-navigation", {
    stateFor(playerId) {
      const flight = flightFor(playerId);
      const navState = originalNavigationStateFor(playerId);
      const target = rawTargetFor(playerId, navState);
      const transform = transformFor(playerId);
      return {
        airborne: Boolean(flight?.airborne),
        phase: flight?.phase ?? null,
        guidanceEnabled: guidanceEnabled.has(playerId),
        targetId: target?.id ?? null,
        targetName: target?.name ?? null,
        distance: transform && target ? horizontalDistance(transform, target.position) : null,
        brakeDistance: target ? brakeDistanceFor(playerId, target) : null,
        braking: braking.has(playerId),
        checkpointReachedRadius: AIR_CHECKPOINT_REACHED,
        last: lastState.get(playerId) ?? null,
      };
    },
  });
}
