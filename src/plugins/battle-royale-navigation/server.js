export const NAVIGATION_CHECKPOINT_SPACING = 24;
export const NAVIGATION_CHECKPOINT_REACHED = 4.25;
export const NAVIGATION_ROUTE_REPLAN_MS = 1800;
export const NAVIGATION_MOVING_TARGET_REPLAN_DISTANCE = 4.5;
export const NAVIGATION_DETOUR_CLEARANCE = 2.6;

const MAX_ROUTE_ANCHORS = 14;
const MAX_RAY_SKIP_HITS = 8;
const ROUTE_RAY_HEIGHT = 1.05;
const TARGET_REACHED_DEFAULT = 5.5;

export const manifest = {
  id: "battle-royale-navigation",
  version: "1.0.0",
  requires: [
    "match-api",
    "battle-royale-ground-navigation",
    "rapier-physics",
    "map-test-arena",
    "battle-royale-vehicle",
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

function distance2(a, b) {
  return Math.hypot(finite(a?.x) - finite(b?.x), finite(a?.z) - finite(b?.z));
}

function copyPoint(value) {
  const p = point(value);
  return { x: p.x, y: p.y, z: p.z };
}

function routeLength(from, checkpoints = []) {
  let total = 0;
  let cursor = from;
  for (const checkpoint of checkpoints) {
    total += distance2(cursor, checkpoint);
    cursor = checkpoint;
  }
  return total;
}

function roundedDistance(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}

export async function setup(ctx) {
  const matchApi = ctx.services.get("match-api");
  const groundNavigation = ctx.services.get("ground-navigation");
  const physics = ctx.services.get("physics");
  const map = ctx.services.get("map");
  const vehicles = ctx.services.get("vehicles");
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

  function availableTargets(playerId) {
    const transform = transformFor(playerId);
    const targets = [];
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
      target.distance = transform ? distance2(transform, target.position) : Infinity;
    }

    targets.sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
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
    if (kind === "vehicle-ballast") return true;
    if (kind === "vehicle-chassis") {
      if (target?.vehicleId && String(object.vehicleId) === String(target.vehicleId)) return true;
      return true;
    }
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

  function detourCandidates(hit, from) {
    const object = hit?.worldObject ?? null;
    if (!object) return [];
    const y = Math.max(0, finite(from?.y));
    const kind = String(object.kind ?? "");
    if (kind.startsWith("building-") && map.building) {
      return expandedCorners(map.building, y, NAVIGATION_DETOUR_CLEARANCE);
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
      }, y, NAVIGATION_DETOUR_CLEARANCE);
    }
    return [];
  }

  function semanticCandidate(from, targetPosition) {
    const waypoint = groundNavigation.waypoint(from, targetPosition);
    if (!waypoint || distance2(from, waypoint) < 0.75) return null;
    return point(waypoint);
  }

  function chooseDetour(from, target, hit, used) {
    const candidates = [];
    const semantic = semanticCandidate(from, target.position);
    if (semantic) candidates.push({ point: semantic, semantic: true });
    for (const candidate of detourCandidates(hit, from)) {
      candidates.push({ point: candidate, semantic: false });
    }

    let best = null;
    let bestScore = Infinity;
    for (const candidate of candidates) {
      const p = candidate.point;
      const key = `${Math.round(p.x * 10)}:${Math.round(p.z * 10)}`;
      if (used.has(key)) continue;
      if (!segmentClear(from, p, target)) continue;
      const score = distance2(from, p)
        + distance2(p, target.position)
        + (candidate.semantic ? -1.25 : 0);
      if (score >= bestScore) continue;
      best = { ...p, key };
      bestScore = score;
    }
    return best;
  }

  function buildAnchors(from, target) {
    const anchors = [];
    const used = new Set();
    let cursor = point(from);
    let detours = 0;
    let rapierBlockedSegments = 0;

    for (let depth = 0; depth < MAX_ROUTE_ANCHORS; depth += 1) {
      const hit = firstBlockingHit(cursor, target.position, target);
      if (!hit) {
        anchors.push(copyPoint(target.position));
        break;
      }
      rapierBlockedSegments += 1;
      const detour = chooseDetour(cursor, target, hit, used);
      if (!detour) {
        anchors.push(copyPoint(target.position));
        break;
      }
      used.add(detour.key);
      anchors.push({ x: detour.x, y: detour.y, z: detour.z });
      cursor = detour;
      detours += 1;
    }

    if (!anchors.length) anchors.push(copyPoint(target.position));
    const last = anchors.at(-1);
    if (distance2(last, target.position) > 0.6) anchors.push(copyPoint(target.position));
    return { anchors, detours, rapierBlockedSegments };
  }

  function subdivideRoute(from, anchors) {
    const checkpoints = [];
    let cursor = point(from);
    for (const anchor of anchors) {
      const end = point(anchor);
      const distance = distance2(cursor, end);
      const pieces = Math.max(1, Math.ceil(distance / NAVIGATION_CHECKPOINT_SPACING));
      for (let i = 1; i <= pieces; i += 1) {
        const t = i / pieces;
        checkpoints.push({
          x: cursor.x + (end.x - cursor.x) * t,
          y: cursor.y + (end.y - cursor.y) * t,
          z: cursor.z + (end.z - cursor.z) * t,
        });
      }
      cursor = end;
    }
    return checkpoints;
  }

  function buildRoute(from, target) {
    const start = point(from);
    const built = buildAnchors(start, target);
    const checkpoints = subdivideRoute(start, built.anchors);
    return {
      checkpoints,
      anchors: built.anchors,
      detours: built.detours,
      rapierBlockedSegments: built.rapierBlockedSegments,
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

  function activate(playerId, target, now = Date.now()) {
    const transform = transformFor(playerId);
    if (!transform || !target) return false;
    const state = playerState(playerId);
    const replacing = Boolean(state.activeTargetId && state.activeTargetId !== target.id);
    const route = buildRoute(transform, target);
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
      now,
    });
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
    const route = buildRoute(transform, target);
    state.checkpoints = route.checkpoints;
    state.checkpointIndex = 0;
    state.lastRouteAt = now;
    state.lastTargetPosition = copyPoint(target.position);
    state.routeMeta = {
      anchors: route.anchors,
      detours: route.detours,
      rapierBlockedSegments: route.rapierBlockedSegments,
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

    const targetDistance = distance2(transform, target.position);
    if (targetDistance <= target.arriveDistance) {
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
      if (distance2(transform, checkpoint) > NAVIGATION_CHECKPOINT_REACHED) break;
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
    if (exhausted || staleMovingTarget || staleRoute) replan(playerId, target, now);
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
        ? distance2(transform, active.position)
        : 0;
    return {
      available: targets.length,
      selected: selected ? {
        id: selected.id,
        name: selected.name,
        kind: selected.kind,
        distance: selected.distance,
      } : null,
      active: Boolean(active),
      target: active ? {
        id: active.id,
        name: active.name,
        kind: active.kind,
        distance: transform ? distance2(transform, active.position) : active.distance,
      } : null,
      checkpoint: checkpoint ? {
        ...copyPoint(checkpoint),
        index: state.checkpointIndex + 1,
        total: state.checkpoints.length,
        distance: transform ? distance2(transform, checkpoint) : null,
      } : null,
      remainingDistance: remaining,
      route: state.routeMeta ? {
        detours: state.routeMeta.detours,
        rapierBlockedSegments: state.routeMeta.rapierBlockedSegments,
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
      checkpoints: state.checkpoints.map(copyPoint),
      routeMeta: state.routeMeta ? {
        ...state.routeMeta,
        anchors: state.routeMeta.anchors.map(copyPoint),
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
      metadata: { buildingId: building.id ?? "warehouse" },
    });
  }

  registerProvider("vehicles", () => {
    const counts = new Map();
    return (vehicles.snapshot?.() ?? []).map((vehicle) => {
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
        metadata: { vehicleKind: kind },
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
      }, null);
      return target ? buildRoute(from, target) : null;
    },
    stateFor,
    assertState,
    constants: {
      checkpointSpacing: NAVIGATION_CHECKPOINT_SPACING,
      checkpointReached: NAVIGATION_CHECKPOINT_REACHED,
      routeReplanMs: NAVIGATION_ROUTE_REPLAN_MS,
    },
  });
}
