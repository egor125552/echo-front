export const BUILDING_AI_ACTIVATION_RADIUS = 110;
export const BUILDING_AI_VISIT_MS = 40_000;
export const BUILDING_AI_COOLDOWN_MS = 24_000;
export const BUILDING_AI_CAPACITY = 2;
export const BUILDING_AI_REACHED_DISTANCE = 2.4;
export const BUILDING_AI_VISIT_CHANCE = 42;

export const manifest = {
  id: "battle-royale-building-ai-portability",
  version: "1.0.0",
  requires: [
    "battle-royale-building-factory",
    "battle-royale-bot-interest",
    "bot-brain",
    "entities",
    "map-test-arena",
  ],
  capabilities: [
    "services.consume", "services.provide",
    "components.read", "events.on",
  ],
};

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function stableHash(value) {
  let hash = 2166136261;
  for (const char of String(value ?? "")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function distance3(a, b) {
  return Math.hypot(
    finite(a?.x) - finite(b?.x),
    finite(a?.y) - finite(b?.y),
    finite(a?.z) - finite(b?.z),
  );
}

function contains(position, bounds, padding = 0) {
  if (!position || !bounds) return false;
  const minY = Number.isFinite(Number(bounds.minY)) ? Number(bounds.minY) : -Infinity;
  const maxY = Number.isFinite(Number(bounds.maxY)) ? Number(bounds.maxY) : Infinity;
  return finite(position.x) >= finite(bounds.minX) - padding
    && finite(position.x) <= finite(bounds.maxX) + padding
    && finite(position.z) >= finite(bounds.minZ) - padding
    && finite(position.z) <= finite(bounds.maxZ) + padding
    && finite(position.y) >= minY - padding
    && finite(position.y) <= maxY + padding;
}

function distanceToBounds(position, bounds) {
  if (!position || !bounds) return Infinity;
  const x = finite(position.x);
  const z = finite(position.z);
  const dx = x < finite(bounds.minX)
    ? finite(bounds.minX) - x
    : x > finite(bounds.maxX)
      ? x - finite(bounds.maxX)
      : 0;
  const dz = z < finite(bounds.minZ)
    ? finite(bounds.minZ) - z
    : z > finite(bounds.maxZ)
      ? z - finite(bounds.maxZ)
      : 0;
  return Math.hypot(dx, dz);
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function usableRegions(building) {
  return (building?.regions ?? [])
    .filter((region) => region?.id)
    .filter((region) => !String(region.id).startsWith("stair:"))
    .filter((region) => finite(region.priority) < 90)
    .filter((region) => region.bounds);
}

function transitionPointsForRegion(building, regionId) {
  const points = [];
  for (const transition of building?.transitions ?? []) {
    if (transition.from === regionId && transition.fromPoint) points.push(transition.fromPoint);
    if (transition.to === regionId && transition.toPoint) points.push(transition.toPoint);
  }
  return points;
}

function representativePoint(building, region, preferred = null) {
  const bounds = region?.bounds ?? building?.bounds;
  if (!bounds) return null;
  const xMargin = Math.min(1.5, Math.max(0.35, (finite(bounds.maxX) - finite(bounds.minX)) * 0.12));
  const zMargin = Math.min(1.5, Math.max(0.35, (finite(bounds.maxZ) - finite(bounds.minZ)) * 0.12));
  const x = preferred
    ? clamp(finite(preferred.x), finite(bounds.minX) + xMargin, finite(bounds.maxX) - xMargin)
    : (finite(bounds.minX) + finite(bounds.maxX)) / 2;
  const z = preferred
    ? clamp(finite(preferred.z), finite(bounds.minZ) + zMargin, finite(bounds.maxZ) - zMargin)
    : (finite(bounds.minZ) + finite(bounds.maxZ)) / 2;

  const transitionPoints = transitionPointsForRegion(building, region.id);
  let y = finite(preferred?.y);
  if (transitionPoints.length) {
    const referenceY = preferred ? finite(preferred.y) : finite(transitionPoints[0]?.y);
    y = [...transitionPoints]
      .sort((a, b) => Math.abs(finite(a?.y) - referenceY) - Math.abs(finite(b?.y) - referenceY))[0]?.y;
  } else if (!preferred) {
    const minY = Number.isFinite(Number(bounds.minY)) ? Number(bounds.minY) : 0;
    const maxY = Number.isFinite(Number(bounds.maxY)) ? Number(bounds.maxY) : minY;
    y = Math.abs(minY) < 0.95 ? 0 : (minY + maxY) / 2;
  }

  return {
    id: `${building.id}:${region.id}`,
    buildingId: String(building.id),
    regionId: String(region.id),
    x,
    y: finite(y),
    z,
  };
}

function buildingVisitPoints(building, transform, botId) {
  const points = usableRegions(building)
    .map((region) => representativePoint(building, region))
    .filter(Boolean);
  if (!points.length) return [];
  points.sort((a, b) => distance3(transform, a) - distance3(transform, b));
  if (points.length <= 1) return points;
  const offset = stableHash(`${botId}:${building.id}:visit-order`) % points.length;
  const rotated = [...points.slice(offset), ...points.slice(0, offset)];
  rotated.sort((a, b) => {
    const aNear = distance3(transform, a) <= distance3(transform, points[0]) + 5 ? 0 : 1;
    const bNear = distance3(transform, b) <= distance3(transform, points[0]) + 5 ? 0 : 1;
    return aNear - bNear;
  });
  return rotated;
}

function soundSearchPoints(building, sound) {
  const regions = usableRegions(building);
  if (!regions.length) return [];
  const current = regions.find((region) => contains(sound, region.bounds, 0.2)) ?? null;
  const primary = current ?? [...regions]
    .sort((a, b) => distanceToBounds(sound, a.bounds) - distanceToBounds(sound, b.bounds))[0];
  if (!primary) return [];

  const bounds = primary.bounds;
  const base = representativePoint(building, primary, sound);
  if (!base) return [];
  const spanX = Math.max(1.2, Math.min(5, (finite(bounds.maxX) - finite(bounds.minX)) * 0.28));
  const spanZ = Math.max(1.2, Math.min(5, (finite(bounds.maxZ) - finite(bounds.minZ)) * 0.28));
  const marginX = Math.min(1.2, Math.max(0.3, spanX * 0.3));
  const marginZ = Math.min(1.2, Math.max(0.3, spanZ * 0.3));
  const inBounds = (x, z) => ({
    x: clamp(x, finite(bounds.minX) + marginX, finite(bounds.maxX) - marginX),
    y: base.y,
    z: clamp(z, finite(bounds.minZ) + marginZ, finite(bounds.maxZ) - marginZ),
  });

  const points = [
    inBounds(base.x, base.z),
    inBounds(base.x + spanX, base.z),
    inBounds(base.x, base.z + spanZ),
    inBounds(base.x - spanX, base.z),
    inBounds(base.x, base.z - spanZ),
  ];

  const thorough = (finite(sound?.priority) >= 3 || finite(sound?.confidence) >= 3);
  if (thorough) {
    const others = regions
      .filter((region) => region.id !== primary.id)
      .map((region) => representativePoint(building, region))
      .filter(Boolean)
      .sort((a, b) => distance3(sound, a) - distance3(sound, b));
    points.push(...others.slice(0, 3));
  }

  const deduped = [];
  for (const point of points) {
    if (deduped.some((entry) => distance3(entry, point) < 0.7)) continue;
    deduped.push(point);
  }
  return deduped;
}

export async function setup(ctx) {
  const interest = ctx.services.get("bot-interest");
  const brain = ctx.services.get("bot-brain");
  const entities = ctx.services.get("entities");
  const map = ctx.services.get("map");
  const originalTargetFor = interest.targetFor.bind(interest);
  const originalDecide = brain.decide.bind(brain);
  const visits = new Map();
  const cooldowns = new Map();
  const searches = new Map();
  const counters = {
    visitsStarted: 0,
    visitsCompleted: 0,
    soundSearches: 0,
    soundSearchSteps: 0,
  };

  function buildings() {
    const legacyId = String(map?.building?.id ?? "warehouse");
    return (map.navigationBuildings ?? [])
      .filter((building) => building?.id && building?.bounds)
      .filter((building) => String(building.id) !== legacyId);
  }

  function activeCount(buildingId, now) {
    let count = 0;
    for (const visit of visits.values()) {
      if (visit.expiresAt > now && visit.buildingId === buildingId) count += 1;
    }
    return count;
  }

  function clearExpired(botId, now) {
    const visit = visits.get(botId);
    if (visit && visit.expiresAt <= now) {
      visits.delete(botId);
      cooldowns.set(botId, now + BUILDING_AI_COOLDOWN_MS);
    }
  }

  function advanceVisit(botId, transform, now) {
    clearExpired(botId, now);
    const visit = visits.get(botId);
    if (!visit) return null;
    while (
      visit.index < visit.points.length
      && distance3(transform, visit.points[visit.index]) <= BUILDING_AI_REACHED_DISTANCE
    ) visit.index += 1;
    if (visit.index >= visit.points.length) {
      visits.delete(botId);
      cooldowns.set(botId, now + BUILDING_AI_COOLDOWN_MS);
      counters.visitsCompleted += 1;
      return null;
    }
    return visit;
  }

  function maybeStartVisit(botId, transform, now) {
    if ((cooldowns.get(botId) ?? 0) > now) return null;
    const candidates = buildings()
      .map((building) => ({ building, distance: distanceToBounds(transform, building.bounds) }))
      .filter((entry) => entry.distance <= BUILDING_AI_ACTIVATION_RADIUS)
      .filter((entry) => activeCount(String(entry.building.id), now) < BUILDING_AI_CAPACITY)
      .sort((a, b) => a.distance - b.distance);
    if (!candidates.length) return null;

    const cycle = Math.floor(now / 30_000);
    for (const candidate of candidates) {
      const chance = candidate.distance <= 35 ? 100 : BUILDING_AI_VISIT_CHANCE;
      if ((stableHash(`${botId}:${candidate.building.id}:${cycle}`) % 100) >= chance) continue;
      const points = buildingVisitPoints(candidate.building, transform, botId);
      if (!points.length) continue;
      const visit = {
        buildingId: String(candidate.building.id),
        points,
        index: 0,
        startedAt: now,
        expiresAt: now + BUILDING_AI_VISIT_MS,
      };
      visits.set(botId, visit);
      counters.visitsStarted += 1;
      return visit;
    }
    return null;
  }

  interest.targetFor = function targetForPortableBuildings(botId, transform, now = Date.now()) {
    const base = originalTargetFor(botId, transform, now);
    if (base?.kind === "sound-interest" || base?.kind === "poi-interest") return base;

    let visit = advanceVisit(botId, transform, now);
    if (!visit && (!base || base.kind === "explore-interest")) {
      visit = maybeStartVisit(botId, transform, now);
    }
    if (!visit) return base;

    const point = visit.points[visit.index];
    return {
      kind: "poi-interest",
      portableBuilding: true,
      group: visit.buildingId,
      pointId: point.id,
      regionId: point.regionId,
      x: point.x,
      y: point.y,
      z: point.z,
      expiresAt: visit.expiresAt,
    };
  };

  function buildingFor(position) {
    return buildings().find((building) => contains(position, building.bounds, 0.15)) ?? null;
  }

  function searchKey(origin, building) {
    return `${building.id}:${origin?.sourceId ?? "unknown"}:${finite(origin?.heardAt, -1)}`;
  }

  function portableSearch(botId, decision, transform, now) {
    const origin = decision?.searchOrigin;
    if (decision?.goal !== "search" || origin?.kind !== "sound-interest") {
      searches.delete(botId);
      return decision;
    }
    const building = buildingFor(origin);
    if (!building) {
      searches.delete(botId);
      return decision;
    }

    const key = searchKey(origin, building);
    let state = searches.get(botId);
    if (!state || state.key !== key) {
      const points = soundSearchPoints(building, origin);
      if (!points.length) return decision;
      state = { key, buildingId: String(building.id), points, index: 0 };
      searches.set(botId, state);
      counters.soundSearches += 1;
    }

    while (
      state.index < state.points.length
      && distance3(transform, state.points[state.index]) <= 1.8
    ) {
      state.index += 1;
      counters.soundSearchSteps += 1;
    }
    if (state.index >= state.points.length) {
      searches.delete(botId);
      return decision;
    }

    return {
      ...decision,
      portableBuildingSearch: true,
      portableBuildingId: state.buildingId,
      searchPoints: state.points.map((point) => ({ ...point })),
      searchIndex: state.index,
      target: { ...state.points[state.index] },
    };
  }

  brain.decide = function decideWithPortableBuildingSearch(botId, context = {}, now = Date.now()) {
    const decision = originalDecide(botId, context, now);
    if (!decision) return decision;
    const transform = ctx.components.get(botId, "Transform");
    return transform ? portableSearch(botId, decision, transform, now) : decision;
  };

  function clearBot({ entityId } = {}) {
    if (!entityId) return;
    visits.delete(entityId);
    cooldowns.delete(entityId);
    searches.delete(entityId);
  }

  ctx.events.on("entity:died", clearBot);
  ctx.events.on("entity:removed", clearBot);
  ctx.events.on("entity:respawned", clearBot);
  ctx.events.on("battle-royale:started", () => {
    visits.clear();
    cooldowns.clear();
    searches.clear();
  });

  ctx.services.provide("building-ai-portability", {
    buildings() { return buildings().map((building) => String(building.id)); },
    visitFor(botId) {
      const visit = visits.get(botId);
      return visit ? structuredClone(visit) : null;
    },
    searchFor(botId) {
      const search = searches.get(botId);
      return search ? structuredClone(search) : null;
    },
    summary() {
      return {
        ...counters,
        activeVisits: visits.size,
        activeSearches: searches.size,
        buildingCount: buildings().length,
      };
    },
  });
}