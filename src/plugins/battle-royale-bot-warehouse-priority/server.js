export const WAREHOUSE_NEAR_PRIORITY_RADIUS = 25;
export const WAREHOUSE_NEAR_PRIORITY_CAP = 4;
export const WAREHOUSE_NEAR_PRIORITY_VISIT_MS = 34_000;
export const WAREHOUSE_NEAR_PRIORITY_REACHED = 2.5;

export const manifest = {
  id: "battle-royale-bot-warehouse-priority",
  version: "1.1.0",
  requires: ["battle-royale-bot-interest", "map-test-arena"],
  capabilities: ["services.consume", "services.provide", "events.on"],
};

function distance3(a, b) {
  return Math.hypot(
    (Number(a?.x) || 0) - (Number(b?.x) || 0),
    (Number(a?.y) || 0) - (Number(b?.y) || 0),
    (Number(a?.z) || 0) - (Number(b?.z) || 0),
  );
}

export function distanceToBuilding(position, building) {
  if (!position || !building) return Infinity;
  const x = Number(position.x) || 0;
  const z = Number(position.z) || 0;
  const dx = x < building.minX ? building.minX - x : x > building.maxX ? x - building.maxX : 0;
  const dz = z < building.minZ ? building.minZ - z : z > building.maxZ ? z - building.maxZ : 0;
  return Math.hypot(dx, dz);
}

export async function setup(ctx) {
  const interest = ctx.services.get("bot-interest");
  const map = ctx.services.get("map");
  const getEntities = () => (ctx.services.has("entities") ? ctx.services.get("entities") : null);
  const originalTargetFor = interest.targetFor.bind(interest);
  const visits = new Map();

  function clearExpired(now) {
    for (const [botId, visit] of visits) {
      if (visit.expiresAt <= now) visits.delete(botId);
    }
  }

  function activeCount(now) {
    clearExpired(now);
    return visits.size;
  }

  function warehousePoints(transform) {
    const all = (interest.points ?? []).filter((point) => point?.group === map.building?.id);
    const ground = all
      .filter((point) => Math.abs(Number(point.y) || 0) < 0.2)
      .sort((a, b) => distance3(transform, a) - distance3(transform, b));
    const upper = all
      .filter((point) => Number(point.y) >= 1.5)
      .sort((a, b) => distance3(transform, a) - distance3(transform, b));
    return [...ground.slice(0, 2), ...upper.slice(0, 2), ...ground.slice(2)];
  }

  function beginVisit(botId, transform, now) {
    if (getEntities()?.get(botId)?.humanSquad) return null;
    if (distanceToBuilding(transform, map.building) > WAREHOUSE_NEAR_PRIORITY_RADIUS) return null;
    if (activeCount(now) >= WAREHOUSE_NEAR_PRIORITY_CAP) return null;
    const points = warehousePoints(transform);
    if (!points.length) return null;
    const visit = {
      points: points.map((point) => ({ ...point })),
      index: 0,
      expiresAt: now + WAREHOUSE_NEAR_PRIORITY_VISIT_MS,
    };
    visits.set(botId, visit);
    return visit;
  }

  function priorityTarget(botId, transform, now) {
    clearExpired(now);
    let visit = visits.get(botId) ?? null;
    if (!visit) visit = beginVisit(botId, transform, now);
    if (!visit) return null;

    while (
      visit.index < visit.points.length
      && distance3(transform, visit.points[visit.index]) <= WAREHOUSE_NEAR_PRIORITY_REACHED
    ) {
      visit.index += 1;
    }
    if (visit.index >= visit.points.length) {
      visits.delete(botId);
      return null;
    }

    const point = visit.points[visit.index];
    return {
      kind: "poi-interest",
      priorityVisit: true,
      group: point.group,
      pointId: point.id,
      x: point.x,
      y: point.y,
      z: point.z,
      expiresAt: visit.expiresAt,
    };
  }

  interest.targetFor = function targetForWithNearWarehousePriority(botId, transform, now = Date.now()) {
    const base = originalTargetFor(botId, transform, now);
    if (base?.kind === "sound-interest") {
      visits.delete(botId);
      return base;
    }

    const priority = priorityTarget(botId, transform, now);
    return priority ?? base;
  };

  function clearBot({ entityId } = {}) {
    if (entityId) visits.delete(entityId);
  }
  ctx.events.on("entity:died", clearBot);
  ctx.events.on("entity:removed", clearBot);
  ctx.events.on("entity:respawned", clearBot);
  ctx.events.on("battle-royale:started", () => visits.clear());

  ctx.services.provide("warehouse-priority", {
    activeCount,
    visitFor(botId) { return visits.get(botId) ?? null; },
  });
}
