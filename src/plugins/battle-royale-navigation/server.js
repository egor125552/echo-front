export const NAVIGATION_CHECKPOINT_SPACING = 72;
export const NAVIGATION_CHECKPOINT_REACHED = 5.25;
export const NAVIGATION_ROUTE_REPLAN_MS = 2200;
export const NAVIGATION_MOVING_TARGET_REPLAN_DISTANCE = 6;
export const NAVIGATION_DETOUR_CLEARANCE = 3.2;
export const NAVIGATION_VEHICLE_DETOUR_CLEARANCE = 7;

const MAX_ROUTE_ANCHORS = 24;
const MAX_RAY_SKIP_HITS = 10;
const ROUTE_RAY_HEIGHT = 1.05;
const TARGET_REACHED_DEFAULT = 5.5;
const TARGET_VERTICAL_TOLERANCE = 2.15;
const CHECKPOINT_VERTICAL_TOLERANCE = 1.2;
const MAX_VISIBLE_VEHICLE_TARGETS = 5;

export const manifest = {
  id: "battle-royale-navigation",
  version: "1.2.0",
  requires: [
    "match-api",
    "battle-royale-ground-navigation",
    "rapier-physics",
    "map-test-arena",
    "battle-royale-vehicle",
    "battle-royale",
    "entities",
    "battle-royale-vehicle-integration",
    "battle-royale-parachute-integration",
    "battle-royale-ragdoll-integration",
  ],
  capabilities: [
    "services.consume", "services.provide", "components.read", "events.emit",
  ],
};

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function point(value = {}) {
  return {
    x: finite(value.x),
    y: finite(value.y),
    z: finite(value.z),
  };
}

function waypoint(value = {}) {
  return {
    ...point(value),
    kind: value.kind ? String(value.kind) : null,
    doorId: value.doorId ? String(value.doorId) : null,
    transitionId: value.transitionId ? String(value.transitionId) : null,
    buildingId: value.buildingId ? String(value.buildingId) : null,
    mandatory: Boolean(value.mandatory),
  };
}

function distance2(a, b) {
  return Math.hypot(finite(a?.x) - finite(b?.x), finite(a?.z) - finite(b?.z));
}

function distance3(a, b) {
  return Math.hypot(
    finite(a?.x) - finite(b?.x),
    finite(a?.y) - finite(b?.y),
    finite(a?.z) - finite(b?.z),
  );
}

function copyPoint(value) {
  const p = point(value);
  return { x: p.x, y: p.y, z: p.z };
}

function copyWaypoint(value) {
  const p = waypoint(value);
  return {
    x: p.x,
    y: p.y,
    z: p.z,
    ...(p.kind ? { kind: p.kind } : {}),
    ...(p.doorId ? { doorId: p.doorId } : {}),
    ...(p.transitionId ? { transitionId: p.transitionId } : {}),
    ...(p.buildingId ? { buildingId: p.buildingId } : {}),
    ...(p.mandatory ? { mandatory: true } : {}),
  };
}

function routeLength(from, checkpoints = []) {
  let total = 0;
  let cursor = from;
  for (const checkpoint of checkpoints) {
    total += distance3(cursor, checkpoint);
    cursor = checkpoint;
  }
  return total;
}

function roundedDistance(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}

function targetReached(transform, target) {
  if (!transform || !target) return false;
  if (distance2(transform, target.position) > target.arriveDistance) return false;
  const tolerance = Math.max(
    TARGET_VERTICAL_TOLERANCE,
    finite(target.metadata?.verticalTolerance, TARGET_VERTICAL_TOLERANCE),
  );
  return Math.abs(finite(transform.y) - finite(target.position.y)) <= tolerance;
}

function checkpointReached(transform, checkpoint) {
  if (!transform || !checkpoint) return false;
  if (distance2(transform, checkpoint) > NAVIGATION_CHECKPOINT_REACHED) return false;
  return Math.abs(finite(transform.y) - finite(checkpoint.y)) <= CHECKPOINT_VERTICAL_TOLERANCE;
}

export async function setup(ctx) {
  const matchApi = ctx.services.get("match-api");
  const groundNavigation = ctx.services.get("ground-navigation");
  const physics = ctx.services.get("physics");
  const map = ctx.services.get("map");
  const vehicles = ctx.services.get("vehicles");
  const battleRoyale = ctx.services.get("battle-royale");
  const entities = ctx.services.get("entities");

  const originalHandleInput = matchApi.handleInput.bind(matchApi);
  const originalStep = matchApi.step.bind(matchApi);
  const originalSnapshot = matchApi.snapshot.bind(matchApi);
  const originalSnapshotFor = matchApi.snapshotFor.bind(matchApi);
  const originalEventsForPlayer = matchApi.eventsForPlayer.bind(matchApi);

  const staticTargets = new Map();
  const targetProviders = new Map();
  const playerStates = new Map();

  function registerTarget(spec = {}) {
    const id = String(spec.id ?? "").trim();
    if (!id) throw new Error("Navigation target requires an id");
    staticTargets.set(id, {
      id,
      name: String(spec.name ?? id),
      kind: String(spec.kind ?? "point"),
      order: finite(spec.order, 100),
      arriveDistance: Math.max(1, finite(spec.arriveDistance, TARGET_REACHED_DEFAULT)),
      position: spec.position ? copyPoint(spec.position) : null,
      getPosition: typeof spec.getPosition === "function" ? spec.getPosition : null,
      metadata: spec.metadata ?? null,
    });
    return id;
  }

  function unregisterTarget(id) {
    return staticTargets.delete(String(id));
  }

  function registerProvider(id, provider) {
    const key = String(id ?? "").trim();
    if (!key || typeof provider !== "function") {
      throw new Error("Navigation provider requires an id and function");
    }
    targetProviders.set(key, provider);
    return key;
  }

  function normalizeTarget(raw, playerId, index = 0) {
    if (!raw) return null;
    const id = String(raw.id ?? "").trim();
    if (!id) return null;
    const resolved = typeof raw.getPosition === "function"
      ? raw.getPosition(playerId)
      : raw.position;
    if (!resolved) return null;
    const position = point(resolved);
    if (![position.x, position.y, position.z].every(Number.isFinite)) return null;
    return {
      id,
      name: String(raw.name ?? id),
      kind: String(raw.kind ?? "point"),
      order: finite(raw.order, 100 + index),
      arriveDistance: Math.max(1, finite(raw.arriveDistance, TARGET_REACHED_DEFAULT)),
      position,
      vehicleId: raw.vehicleId ? String(raw.vehicleId) : null,
      metadata: raw.metadata ?? null,
    };
  }

  function transformFor(playerId) {
    return ctx.components.get(playerId, "Transform") ?? null;
  }

  function zoneRisk(target, now = Date.now()) {
    const zone = battleRoyale.status?.(now)?.zone ?? null;
    if (!zone || !Number.isFinite(Number(zone.radius))) return false;
    return Math.hypot(
      finite(target?.position?.x) - finite(zone.x),
      finite(target?.position?.z) - finite(zone.z),
    ) > finite(zone.radius);
  }

  function availableTargets(playerId) {
    const transform = transformFor(playerId);
    let targets = [];
    let serial = 0;

    for (const raw of staticTargets.values()) {
      const target = normalizeTarget(raw, playerId, serial++);
      if (target) targets.push(target);
    }

    for (const provider of targetProviders.values()) {
      let supplied = [];
      try {
        supplied = provider(playerId) ?? [];
      } catch {
        supplied = [];
      }
      for (const raw of supplied) {
        const target = normalizeTarget(raw, playerId, serial++);
        if (target) targets.push(target);
      }
    }

    for (const target of targets) {
      target.distance = transform ? distance3(transform, target.position) : Infinity;
      target.outsideSafeZone = zoneRisk(target);
    }

    const currentVehicleId = vehicles.vehicleForDriver?.(playerId)?.id ?? null;
    if (currentVehicleId) {
      targets = targets.filter((target) => target.vehicleId !== currentVehicleId);
    }

    const state = playerStates.get(playerId) ?? null;
    const pinned = new Set([state?.selectedTargetId, state?.activeTargetId].filter(Boolean));
    const nonVehicles = targets.filter((target) => target.kind !== "vehicle");
    const vehicleTargets = targets
      .filter((target) => target.kind === "vehicle")
      .filter((target) => !target.metadata?.occupiedByOther)
      .sort((a, b) => {
        if (a.outsideSafeZone !== b.outsideSafeZone) return a.outsideSafeZone ? 1 : -1;
        return a.distance - b.distance;
      });
    const visibleVehicles = vehicleTargets.filter((target, index) => (
      index < MAX_VISIBLE_VEHICLE_TARGETS || pinned.has(target.id)
    ));
    targets = [...nonVehicles, ...visibleVehicles];

    targets.sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      if (a.outsideSafeZone !== b.outsideSafeZone) return a.outsideSafeZone ? 1 : -1;
      if (a.kind === "vehicle" && b.kind === "vehicle" && a.distance !== b.distance) {
        return a.distance - b.distance;
      }
      return a.name.localeCompare(b.name, "ru");
    });
    return targets;
  }

  function resolveTarget(playerId, targetId) {
    return availableTargets(playerId).find((target) => target.id === targetId) ?? null;
  }

  function playerState(playerId) {
    let state = playerStates.get(playerId);
    if (state) return state;
    state = {
      selectedTargetId: null,
      activeTargetId: null,
      checkpoints: [],
      checkpointIndex: 0,
      lastRouteAt: 0,
      lastTargetPosition: null,
      routeMeta: null,
    };
    playerStates.set(playerId, state);
    return state;
  }

  function routeObstacleCanBeSkipped(hit, target) {
    const object = hit?.worldObject ?? null;
    const kind = String(object?.kind ?? "");
    if (!object) return false;
    if (kind === "ground" || kind === "building-floor" || kind === "building-stair") return true;
    if (kind === "building-door" && target?.allowDoorId) {
      return String(object.doorId ?? "") === String(target.allowDoorId);
    }
    if (kind === "vehicle-ballast") return true;
    if (kind === "vehicle-chassis") return true;
    if (kind === "crate" || kind === "loot-crate") return true;
    return false;
  }

  function firstBlockingHit(from, to, target = null) {
    const start = point(from);
    const end = point(to);
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const fullDistance = Math.hypot(dx, dz);
    if (fullDistance < 0.8) return null;

    const ux = dx / fullDistance;
    const uz = dz / fullDistance;
    let travelled = 0;
    let origin = {
      x: start.x,
      y: Math.max(ROUTE_RAY_HEIGHT, start.y + ROUTE_RAY_HEIGHT),
      z: start.z,
    };

    for (let attempt = 0; attempt < MAX_RAY_SKIP_HITS; attempt += 1) {
      const remaining = fullDistance - travelled - 0.55;
      if (remaining <= 0.2) return null;
      const hit = physics.raycastWorld(
        origin,
        { x: ux, y: 0, z: uz },
        remaining,
      );
      if (!hit) return null;
      if (!routeObstacleCanBeSkipped(hit, target)) {
        return { ...hit, travelled: travelled + finite(hit.distance) };
      }
      const advance = Math.max(0.7, finite(hit.distance) + 0.75);
      travelled += advance;
      if (travelled >= fullDistance - 0.55) return null;
      origin = {
        x: start.x + ux * travelled,
        y: origin.y,
        z: start.z + uz * travelled,
      };
    }
    return null;
  }

  function segmentClear(from, to, target = null) {
    return firstBlockingHit(from, to, target) === null;
  }

  function expandedCorners(rect, y = 0, clearance = NAVIGATION_DETOUR_CLEARANCE) {
    if (!rect) return [];
    const minX = finite(rect.minX, finite(rect.x) - Math.abs(finite(rect.hx)));
    const maxX = finite(rect.maxX, finite(rect.x) + Math.abs(finite(rect.hx)));
    const minZ = finite(rect.minZ, finite(rect.z) - Math.abs(finite(rect.hz)));
    const maxZ = finite(rect.maxZ, finite(rect.z) + Math.abs(finite(rect.hz)));
    if (![minX, maxX, minZ, maxZ].every(Number.isFinite)) return [];
    return [
      { x: minX - clearance, y, z: minZ - clearance },
      { x: maxX + clearance, y, z: minZ - clearance },
      { x: maxX + clearance, y, z: maxZ + clearance },
      { x: minX - clearance, y, z: maxZ + clearance },
    ];
  }

  function detourCandidates(hit, from, options = {}) {
    const object = hit?.worldObject ?? null;
    if (!object) return [];
    const y = Math.max(0, finite(from?.y));
    const kind = String(object.kind ?? "");
    const clearance = options.mode === "vehicle"
      ? NAVIGATION_VEHICLE_DETOUR_CLEARANCE
      : NAVIGATION_DETOUR_CLEARANCE;
    if (kind.startsWith("building-") && map.building) {
      return expandedCorners(map.building, y, clearance);
    }
    if (
      Number.isFinite(Number(object.x))
      && Number.isFinite(Number(object.z))
      && Number.isFinite(Number(object.hx))
      && Number.isFinite(Number(object.hz))
    ) {
      return expandedCorners({
        minX: Number(object.x) - Math.abs(Number(object.hx)),
        maxX: Number(object.x) + Math.abs(Number(object.hx)),
        minZ: Number(object.z) - Math.abs(Number(object.hz)),
        maxZ: Number(object.z) + Math.abs(Number(object.hz)),
      }, y, clearance);
    }
    return [];
  }

  function semanticCandidate(from, targetPosition) {
    const candidate = groundNavigation.waypoint(from, targetPosition);
    if (!candidate || distance3(from, candidate) < 0.55) return null;
    return waypoint(candidate);
  }

  function chooseDetour(from, target, hit, used, options = {}) {
    const candidates = [];
    const semantic = options.mode === "vehicle" ? null : semanticCandidate(from, target.position);
    if (semantic) candidates.push({ point: semantic, semantic: true });
    for (const candidate of detourCandidates(hit, from, options)) {
      candidates.push({ point: waypoint(candidate), semantic: false });
    }

    let best = null;
    let bestScore = Infinity;
    for (const candidate of candidates) {
      const p = candidate.point;
      const key = `${Math.round(p.x * 10)}:${Math.round(p.y * 10)}:${Math.round(p.z * 10)}`;
      if (used.has(key)) continue;
      const candidateTarget = p.doorId ? { ...target, allowDoorId: p.doorId } : target;
      if (!segmentClear(from, p, candidateTarget)) continue;
      const score = distance3(from, p)
        + distance3(p, target.position)
        + (candidate.semantic ? -2.5 : 0);
      if (score >= bestScore) continue;
      best = { ...p, key };
      bestScore = score;
    }
    return best;
  }

  function buildSegmentAnchors(from, target, options = {}) {
    const anchors = [];
    const used = new Set();
    let cursor = point(from);
    let detours = 0;
    let rapierBlockedSegments = 0;

    for (let depth = 0; depth < MAX_ROUTE_ANCHORS; depth += 1) {
      const hit = firstBlockingHit(cursor, target.position, target);
      if (!hit) {
        anchors.push(copyWaypoint(target.position));
        break;
      }
      rapierBlockedSegments += 1;
      const detour = chooseDetour(cursor, target, hit, used, options);
      if (!detour) {
        anchors.push(copyWaypoint(target.position));
        break;
      }
      used.add(detour.key);
      anchors.push(copyWaypoint(detour));
      cursor = detour;
      detours += 1;
    }

    if (!anchors.length) anchors.push(copyWaypoint(target.position));
    const last = anchors.at(-1);
    if (distance3(last, target.position) > 0.6) anchors.push(copyWaypoint(target.position));
    return { anchors, detours, rapierBlockedSegments };
  }

  function buildAnchors(from, target, options = {}) {
    const start = point(from);
    const required = options.mode === "vehicle"
      ? []
      : (groundNavigation.requiredWaypoints?.(start, target.position) ?? []).map(waypoint);
    const goals = [...required, waypoint(target.position)];
    const anchors = [];
    let cursor = start;
    let detours = 0;
    let rapierBlockedSegments = 0;

    for (const goal of goals) {
      if (distance3(cursor, goal) < 0.45) {
        cursor = goal;
        continue;
      }
      const segmentTarget = {
        ...target,
        position: goal,
        allowDoorId: goal.doorId ?? null,
      };
      const segment = buildSegmentAnchors(cursor, segmentTarget, options);
      for (const anchor of segment.anchors) {
        const previous = anchors.at(-1) ?? cursor;
        if (distance3(previous, anchor) < 0.25) continue;
        anchors.push(anchor);
      }
      detours += segment.detours;
      rapierBlockedSegments += segment.rapierBlockedSegments;
      cursor = goal;
    }

    return {
      anchors,
      detours,
      rapierBlockedSegments,
      semanticTransitions: required.length,
    };
  }

  function subdivideRoute(from, anchors) {
    const checkpoints = [];
    let cursor = point(from);
    for (const rawAnchor of anchors) {
      const anchor = waypoint(rawAnchor);
      const distance = distance3(cursor, anchor);
      const pieces = Math.max(1, Math.ceil(distance / NAVIGATION_CHECKPOINT_SPACING));
      for (let i = 1; i <= pieces; i += 1) {
        const t = i / pieces;
        const finalPiece = i === pieces;
        checkpoints.push({
          x: cursor.x + (anchor.x - cursor.x) * t,
          y: cursor.y + (anchor.y - cursor.y) * t,
          z: cursor.z + (anchor.z - cursor.z) * t,
          ...(finalPiece && anchor.kind ? { kind: anchor.kind } : {}),
          ...(finalPiece && anchor.doorId ? { doorId: anchor.doorId } : {}),
          ...(finalPiece && anchor.transitionId ? { transitionId: anchor.transitionId } : {}),
          ...(finalPiece && anchor.buildingId ? { buildingId: anchor.buildingId } : {}),
          ...(finalPiece && anchor.mandatory ? { mandatory: true } : {}),
        });
      }
      cursor = anchor;
    }
    return checkpoints;
  }

  function buildRoute(from, target, options = {}) {
    const start = point(from);
    const built = buildAnchors(start, target, options);
    const checkpoints = subdivideRoute(start, built.anchors);
    return {
      checkpoints,
      anchors: built.anchors,
      detours: built.detours,
      rapierBlockedSegments: built.rapierBlockedSegments,
      semanticTransitions: built.semanticTransitions,
      mode: options.mode ?? "foot",
      distance: routeLength(start, checkpoints),
    };
  }

  function emitFor(playerId, event, payload = {}) {
    ctx.events.emit(event, { entityId: playerId, ...payload });
  }

  function selectTarget(playerId, targetId, now = Date.now(), { announce = true } = {}) {
    const target = resolveTarget(playerId, targetId);
    if (!target) return null;
    const state = playerState(playerId);
    state.selectedTargetId = target.id;
    if (announce) {
      emitFor(playerId, "navigation:selected", {
        targetId: target.id,
        targetName: target.name,
        targetKind: target.kind,
        distance: target.distance,
        distanceMeters: roundedDistance(target.distance),
        outsideSafeZone: Boolean(target.outsideSafeZone),
        now,
      });
    }
    return target;
  }

  function selectNext(playerId, now = Date.now()) {
    const targets = availableTargets(playerId);
    if (!targets.length) {
      emitFor(playerId, "navigation:unavailable", { reason: "no-targets", now });
      return null;
    }
    const state = playerState(playerId);
    const current = targets.findIndex((target) => target.id === state.selectedTargetId);
    const next = targets[(current + 1 + targets.length) % targets.length];
    return selectTarget(playerId, next.id, now);
  }

  function stop(playerId, now = Date.now(), reason = "toggle", { announce = true } = {}) {
    const state = playerState(playerId);
    const previous = state.activeTargetId
      ? resolveTarget(playerId, state.activeTargetId)
      : null;
    if (!state.activeTargetId) return false;
    state.activeTargetId = null;
    state.checkpoints = [];
    state.checkpointIndex = 0;
    state.routeMeta = null;
    state.lastTargetPosition = null;
    state.lastRouteAt = 0;
    if (announce) {
      emitFor(playerId, "navigation:stopped", {
        targetId: previous?.id ?? null,
        targetName: previous?.name ?? null,
        reason,
        now,
      });
    }
    return true;
  }

  function routeModeFor(playerId) {
    return vehicles.isDriving?.(playerId) ? "vehicle" : "foot";
  }

  function activate(playerId, target, now = Date.now()) {
    const transform = transformFor(playerId);
    if (!transform || !target) return false;
    const state = playerState(playerId);
    const replacing = Boolean(state.activeTargetId && state.activeTargetId !== target.id);
    const route = buildRoute(transform, target, { mode: routeModeFor(playerId) });
    state.activeTargetId = target.id;
    state.selectedTargetId = target.id;
    state.checkpoints = route.checkpoints;
    state.checkpointIndex = 0;
    state.lastRouteAt = now;
    state.lastTargetPosition = copyPoint(target.position);
    state.routeMeta = {
      anchors: route.anchors,
      detours: route.detours,
      rapierBlockedSegments: route.rapierBlockedSegments,
      semanticTransitions: route.semanticTransitions,
      mode: route.mode,
      initialDistance: route.distance,
    };
    emitFor(playerId, "navigation:started", {
      targetId: target.id,
      targetName: target.name,
      targetKind: target.kind,
      replaced: replacing,
      distance: route.distance,
      distanceMeters: roundedDistance(route.distance),
      checkpointCount: route.checkpoints.length,
      detours: route.detours,
      semanticTransitions: route.semanticTransitions,
      mode: route.mode,
      now,
    });
    if (target.outsideSafeZone) {
      emitFor(playerId, "navigation:warning", {
        reason: "outside-safe-zone",
        targetId: target.id,
        targetName: target.name,
        now,
      });
    }
    return true;
  }

  function toggle(playerId, now = Date.now()) {
    const state = playerState(playerId);
    let selected = state.selectedTargetId
      ? resolveTarget(playerId, state.selectedTargetId)
      : null;
    if (!selected) selected = selectNext(playerId, now);
    if (!selected) return false;

    if (state.activeTargetId === selected.id) {
      return stop(playerId, now, "toggle");
    }
    return activate(playerId, selected, now);
  }

  function replan(playerId, target, now) {
    const state = playerState(playerId);
    const transform = transformFor(playerId);
    if (!transform || !target) return false;
    const route = buildRoute(transform, target, { mode: routeModeFor(playerId) });
    state.checkpoints = route.checkpoints;
    state.checkpointIndex = 0;
    state.lastRouteAt = now;
    state.lastTargetPosition = copyPoint(target.position);
    state.routeMeta = {
      anchors: route.anchors,
      detours: route.detours,
      rapierBlockedSegments: route.rapierBlockedSegments,
      semanticTransitions: route.semanticTransitions,
      mode: route.mode,
      initialDistance: route.distance,
    };
    return true;
  }

  function updatePlayer(playerId, now = Date.now()) {
    const state = playerState(playerId);
    if (!state.activeTargetId) return;
    const entity = entities.get(playerId);
    const transform = transformFor(playerId);
    if (!entity?.alive || !transform) {
      stop(playerId, now, "unavailable", { announce: false });
      return;
    }

    const target = resolveTarget(playerId, state.activeTargetId);
    if (!target) {
      stop(playerId, now, "target-unavailable", { announce: false });
      emitFor(playerId, "navigation:unavailable", { reason: "target-unavailable", now });
      return;
    }

    if (targetReached(transform, target)) {
      state.activeTargetId = null;
      state.checkpoints = [];
      state.checkpointIndex = 0;
      state.routeMeta = null;
      emitFor(playerId, "navigation:reached", {
        targetId: target.id,
        targetName: target.name,
        targetKind: target.kind,
        now,
      });
      return;
    }

    while (state.checkpointIndex < state.checkpoints.length) {
      const checkpoint = state.checkpoints[state.checkpointIndex];
      if (!checkpointReached(transform, checkpoint)) break;
      state.checkpointIndex += 1;
    }

    const targetMoved = state.lastTargetPosition
      ? distance2(state.lastTargetPosition, target.position)
      : Infinity;
    const exhausted = state.checkpointIndex >= state.checkpoints.length;
    const staleMovingTarget = target.kind === "vehicle"
      && targetMoved >= NAVIGATION_MOVING_TARGET_REPLAN_DISTANCE;
    const staleRoute = now - state.lastRouteAt >= NAVIGATION_ROUTE_REPLAN_MS
      && state.checkpointIndex > 0;
    const modeChanged = state.routeMeta?.mode !== routeModeFor(playerId);
    if (exhausted || staleMovingTarget || staleRoute || modeChanged) replan(playerId, target, now);
  }

  function checkpointFor(playerId) {
    const state = playerState(playerId);
    return state.checkpoints[state.checkpointIndex] ?? null;
  }

  function publicState(playerId, now = Date.now()) {
    const state = playerState(playerId);
    const targets = availableTargets(playerId);
    const selected = targets.find((target) => target.id === state.selectedTargetId) ?? null;
    const active = targets.find((target) => target.id === state.activeTargetId) ?? null;
    const transform = transformFor(playerId);
    const checkpoint = checkpointFor(playerId);
    const remaining = transform && checkpoint
      ? routeLength(transform, state.checkpoints.slice(state.checkpointIndex))
      : active && transform
        ? distance3(transform, active.position)
        : 0;
    return {
      available: targets.length,
      selected: selected ? {
        id: selected.id,
        name: selected.name,
        kind: selected.kind,
        distance: selected.distance,
        outsideSafeZone: Boolean(selected.outsideSafeZone),
      } : null,
      active: Boolean(active),
      target: active ? {
        id: active.id,
        name: active.name,
        kind: active.kind,
        distance: transform ? distance3(transform, active.position) : active.distance,
        outsideSafeZone: Boolean(active.outsideSafeZone),
      } : null,
      checkpoint: checkpoint ? {
        ...copyWaypoint(checkpoint),
        index: state.checkpointIndex + 1,
        total: state.checkpoints.length,
        distance: transform ? distance3(transform, checkpoint) : null,
      } : null,
      remainingDistance: remaining,
      route: state.routeMeta ? {
        detours: state.routeMeta.detours,
        rapierBlockedSegments: state.routeMeta.rapierBlockedSegments,
        semanticTransitions: state.routeMeta.semanticTransitions,
        mode: state.routeMeta.mode,
        checkpointCount: state.checkpoints.length,
      } : null,
      now,
    };
  }

  function stateFor(playerId, now = Date.now()) {
    const state = playerState(playerId);
    return {
      ...publicState(playerId, now),
      selectedTargetId: state.selectedTargetId,
      activeTargetId: state.activeTargetId,
      checkpointIndex: state.checkpointIndex,
      checkpoints: state.checkpoints.map(copyWaypoint),
      routeMeta: state.routeMeta ? {
        ...state.routeMeta,
        anchors: state.routeMeta.anchors.map(copyWaypoint),
      } : null,
    };
  }

  function assertState(playerId, expected = {}) {
    const state = stateFor(playerId);
    if (expected.selectedTargetId && state.selectedTargetId !== expected.selectedTargetId) {
      throw new Error(`Expected selected ${expected.selectedTargetId}, got ${state.selectedTargetId}`);
    }
    if (expected.active !== undefined && state.active !== Boolean(expected.active)) {
      throw new Error(`Expected navigation active=${Boolean(expected.active)}, got ${state.active}`);
    }
    if (expected.activeKind && state.target?.kind !== expected.activeKind) {
      throw new Error(`Expected active kind ${expected.activeKind}, got ${state.target?.kind ?? "none"}`);
    }
    if (Number.isFinite(expected.minCheckpoints) && state.checkpoints.length < Number(expected.minCheckpoints)) {
      throw new Error(`Expected at least ${expected.minCheckpoints} checkpoints, got ${state.checkpoints.length}`);
    }
    if (Number.isFinite(expected.maxCheckpoints) && state.checkpoints.length > Number(expected.maxCheckpoints)) {
      throw new Error(`Expected at most ${expected.maxCheckpoints} checkpoints, got ${state.checkpoints.length}`);
    }
    if (Number.isFinite(expected.minSemanticTransitions)
      && finite(state.routeMeta?.semanticTransitions) < Number(expected.minSemanticTransitions)) {
      throw new Error(
        `Expected at least ${expected.minSemanticTransitions} semantic transitions, got ${state.routeMeta?.semanticTransitions ?? 0}`,
      );
    }
    if (Number.isFinite(expected.minDetours) && finite(state.routeMeta?.detours) < Number(expected.minDetours)) {
      throw new Error(`Expected at least ${expected.minDetours} detours, got ${state.routeMeta?.detours ?? 0}`);
    }
    if (Number.isFinite(expected.minRapierBlocks)
      && finite(state.routeMeta?.rapierBlockedSegments) < Number(expected.minRapierBlocks)) {
      throw new Error(
        `Expected at least ${expected.minRapierBlocks} Rapier blocked segments, got ${state.routeMeta?.rapierBlockedSegments ?? 0}`,
      );
    }
    return state;
  }

  const building = map.building;
  if (building) {
    registerTarget({
      id: "warehouse",
      name: "Склад",
      kind: "building",
      order: 10,
      arriveDistance: 4.5,
      getPosition() {
        return {
          x: finite(building.maxX) + 2.8,
          y: 0,
          z: (finite(building.minZ) + finite(building.maxZ)) / 2,
        };
      },
      metadata: {
        buildingId: building.id ?? "warehouse",
        verticalTolerance: 1.8,
      },
    });
  }

  registerProvider("vehicles", (playerId) => {
    const counts = new Map();
    const currentVehicleId = vehicles.vehicleForDriver?.(playerId)?.id ?? null;
    return (vehicles.snapshot?.() ?? [])
      .filter((vehicle) => vehicle.id !== currentVehicleId)
      .filter((vehicle) => !vehicle.occupied || vehicle.driverId === playerId)
      .map((vehicle) => {
        const kind = vehicle.kind === "supercar" ? "supercar" : "offroad";
        const next = (counts.get(kind) ?? 0) + 1;
        counts.set(kind, next);
        const baseName = kind === "supercar" ? "Суперкар" : "Внедорожник";
        return {
          id: `vehicle:${vehicle.id}`,
          name: `${baseName} ${next}`,
          kind: "vehicle",
          order: 20,
          arriveDistance: 5.25,
          position: { x: vehicle.x, y: vehicle.y ?? 0, z: vehicle.z },
          vehicleId: vehicle.id,
          metadata: {
            vehicleKind: kind,
            occupiedByOther: Boolean(vehicle.occupied && vehicle.driverId !== playerId),
            verticalTolerance: 2.2,
          },
        };
      });
  });

  matchApi.handleInput = (playerId, input = {}, now = Date.now()) => {
    if (input.navigationNextPressed) selectNext(playerId, now);
    if (input.navigationTogglePressed) toggle(playerId, now);
    return originalHandleInput(playerId, input, now);
  };

  matchApi.step = (dt, now = Date.now()) => {
    const result = originalStep(dt, now);
    for (const [playerId, state] of playerStates) {
      if (state.activeTargetId) updatePlayer(playerId, now);
    }
    return result;
  };

  matchApi.snapshot = (now = Date.now()) => ({
    ...originalSnapshot(now),
    navigationCatalog: {
      staticTargets: staticTargets.size,
      providers: targetProviders.size,
    },
  });

  matchApi.snapshotFor = (playerId, now = Date.now()) => ({
    ...originalSnapshotFor(playerId, now),
    navigation: publicState(playerId, now),
  });

  matchApi.eventsForPlayer = (playerId, packets = []) => {
    const selected = originalEventsForPlayer(playerId, packets);
    const seen = new Set(selected);
    for (const packet of packets) {
      if (!String(packet?.event ?? "").startsWith("navigation:")) continue;
      if (packet?.payload?.entityId !== playerId) continue;
      if (seen.has(packet)) continue;
      seen.add(packet);
      selected.push(packet);
    }
    return selected;
  };

  ctx.events.on("entity:removed", ({ entityId }) => {
    playerStates.delete(entityId);
  });

  ctx.services.provide("navigation", {
    registerTarget,
    unregisterTarget,
    registerProvider,
    availableTargets,
    selectNext,
    selectTarget,
    toggle,
    stop,
    buildRoute(from, targetSpec) {
      const target = normalizeTarget({
        id: targetSpec?.id ?? "debug-target",
        name: targetSpec?.name ?? "Debug target",
        kind: targetSpec?.kind ?? "point",
        position: targetSpec?.position ?? targetSpec,
        vehicleId: targetSpec?.vehicleId ?? null,
        metadata: targetSpec?.metadata ?? null,
      }, null);
      return target ? buildRoute(from, target, { mode: targetSpec?.mode ?? "foot" }) : null;
    },
    stateFor,
    assertState,
    constants: {
      checkpointSpacing: NAVIGATION_CHECKPOINT_SPACING,
      checkpointReached: NAVIGATION_CHECKPOINT_REACHED,
      routeReplanMs: NAVIGATION_ROUTE_REPLAN_MS,
      vehicleDetourClearance: NAVIGATION_VEHICLE_DETOUR_CLEARANCE,
    },
  });
}
