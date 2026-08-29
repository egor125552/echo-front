export const manifest = {
  id: "battle-royale-building-navigation",
  version: "1.0.0",
  requires: ["map-test-arena"],
  capabilities: ["services.consume", "services.provide"],
};

const OUTSIDE_REGION = "outside";
const MAX_PATH_DEPTH = 16;

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

function distance3(a, b) {
  return Math.hypot(
    finite(a?.x) - finite(b?.x),
    finite(a?.y) - finite(b?.y),
    finite(a?.z) - finite(b?.z),
  );
}

function rectContains(position, bounds, padding = 0) {
  if (!position || !bounds) return false;
  const y = finite(position.y);
  const minY = Number.isFinite(Number(bounds.minY)) ? Number(bounds.minY) : -Infinity;
  const maxY = Number.isFinite(Number(bounds.maxY)) ? Number(bounds.maxY) : Infinity;
  return finite(position.x) >= finite(bounds.minX) - padding
    && finite(position.x) <= finite(bounds.maxX) + padding
    && finite(position.z) >= finite(bounds.minZ) - padding
    && finite(position.z) <= finite(bounds.maxZ) + padding
    && y >= minY - padding
    && y <= maxY + padding;
}

function horizontalArea(bounds = {}) {
  return Math.max(0.01, finite(bounds.maxX) - finite(bounds.minX))
    * Math.max(0.01, finite(bounds.maxZ) - finite(bounds.minZ));
}

function normalizeRegion(raw = {}) {
  const id = String(raw.id ?? "").trim();
  if (!id || id === OUTSIDE_REGION) return null;
  const bounds = raw.bounds ?? raw;
  return {
    id,
    name: String(raw.name ?? id),
    priority: finite(raw.priority),
    bounds: {
      minX: finite(bounds.minX),
      maxX: finite(bounds.maxX),
      minZ: finite(bounds.minZ),
      maxZ: finite(bounds.maxZ),
      minY: Number.isFinite(Number(bounds.minY)) ? Number(bounds.minY) : -Infinity,
      maxY: Number.isFinite(Number(bounds.maxY)) ? Number(bounds.maxY) : Infinity,
    },
  };
}

function normalizeTransition(raw = {}) {
  const id = String(raw.id ?? "").trim();
  const from = String(raw.from ?? "").trim();
  const to = String(raw.to ?? "").trim();
  if (!id || !from || !to || from === to || !raw.fromPoint || !raw.toPoint) return null;
  return {
    id,
    from,
    to,
    fromPoint: point(raw.fromPoint),
    toPoint: point(raw.toPoint),
    kind: String(raw.kind ?? "passage"),
    doorId: raw.doorId ? String(raw.doorId) : null,
    metadata: raw.metadata ?? null,
  };
}

function normalizeBuilding(raw = {}) {
  const id = String(raw.id ?? "").trim();
  if (!id) throw new Error("Building navigation topology requires an id");
  const regions = (raw.regions ?? []).map(normalizeRegion).filter(Boolean);
  const regionIds = new Set(regions.map((region) => region.id));
  const transitions = (raw.transitions ?? []).map(normalizeTransition).filter((transition) => (
    (transition.from === OUTSIDE_REGION || regionIds.has(transition.from))
    && (transition.to === OUTSIDE_REGION || regionIds.has(transition.to))
  ));
  if (!regions.length) throw new Error(`Building ${id} has no navigation regions`);
  return {
    id,
    name: String(raw.name ?? id),
    bounds: raw.bounds ? {
      minX: finite(raw.bounds.minX),
      maxX: finite(raw.bounds.maxX),
      minZ: finite(raw.bounds.minZ),
      maxZ: finite(raw.bounds.maxZ),
      minY: Number.isFinite(Number(raw.bounds.minY)) ? Number(raw.bounds.minY) : -Infinity,
      maxY: Number.isFinite(Number(raw.bounds.maxY)) ? Number(raw.bounds.maxY) : Infinity,
    } : null,
    regions,
    transitions,
    metadata: raw.metadata ?? null,
  };
}

function orientedTransition(transition, regionId) {
  if (transition.from === regionId) {
    return {
      transition,
      next: transition.to,
      fromPoint: transition.fromPoint,
      toPoint: transition.toPoint,
      reversed: false,
    };
  }
  if (transition.to === regionId) {
    return {
      transition,
      next: transition.from,
      fromPoint: transition.toPoint,
      toPoint: transition.fromPoint,
      reversed: true,
    };
  }
  return null;
}

function transitionWaypoints(oriented, buildingId) {
  const common = {
    kind: oriented.transition.kind,
    doorId: oriented.transition.doorId,
    transitionId: oriented.transition.id,
    buildingId,
    mandatory: true,
  };
  return [
    { ...point(oriented.fromPoint), ...common, transitionSide: "approach" },
    { ...point(oriented.toPoint), ...common, transitionSide: "cross" },
  ];
}

function pathCost(start, target, waypoints) {
  let cost = 0;
  let cursor = start;
  for (const waypoint of waypoints) {
    cost += distance3(cursor, waypoint);
    cursor = waypoint;
  }
  cost += distance3(cursor, target);
  return cost;
}

function bestRegionPath(building, startRegion, endRegion, startPoint, targetPoint) {
  if (startRegion === endRegion) return [];
  let best = null;
  const visit = (regionId, visited, waypoints, depth) => {
    if (depth > MAX_PATH_DEPTH) return;
    if (regionId === endRegion) {
      const cost = pathCost(startPoint, targetPoint, waypoints);
      if (!best || cost < best.cost) best = { cost, waypoints };
      return;
    }
    for (const transition of building.transitions) {
      const oriented = orientedTransition(transition, regionId);
      if (!oriented || visited.has(oriented.next)) continue;
      const nextVisited = new Set(visited);
      nextVisited.add(oriented.next);
      visit(
        oriented.next,
        nextVisited,
        [...waypoints, ...transitionWaypoints(oriented, building.id)],
        depth + 1,
      );
    }
  };
  visit(startRegion, new Set([startRegion]), [], 0);
  return best?.waypoints ?? null;
}

function dedupeWaypoints(start, waypoints = []) {
  const result = [];
  let cursor = start;
  for (const waypoint of waypoints) {
    if (distance3(cursor, waypoint) < 0.35) {
      cursor = waypoint;
      continue;
    }
    result.push(waypoint);
    cursor = waypoint;
  }
  return result;
}

function stairBounds(stair) {
  if (!stair) return null;
  const run = Math.max(0.1, Math.abs(finite(stair.run)));
  const width = Math.max(0.1, Math.abs(finite(stair.width)));
  return {
    minX: finite(stair.x) - run / 2,
    maxX: finite(stair.x) + run / 2,
    minZ: finite(stair.z) - width / 2,
    maxZ: finite(stair.z) + width / 2,
  };
}

function stairEndpoints(stair, upperY) {
  const bounds = stairBounds(stair);
  if (!bounds) return null;
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerZ = (bounds.minZ + bounds.maxZ) / 2;
  const direction = String(stair.risesToward ?? "west");
  const inset = 0.5;
  if (direction === "east") {
    return {
      bottom: { x: bounds.minX - inset, y: 0, z: centerZ },
      bottomInside: { x: bounds.minX + inset, y: 0, z: centerZ },
      topInside: { x: bounds.maxX - inset, y: upperY, z: centerZ },
      top: { x: bounds.maxX + inset, y: upperY, z: centerZ },
      bounds,
    };
  }
  if (direction === "north") {
    return {
      bottom: { x: centerX, y: 0, z: bounds.maxZ + inset },
      bottomInside: { x: centerX, y: 0, z: bounds.maxZ - inset },
      topInside: { x: centerX, y: upperY, z: bounds.minZ + inset },
      top: { x: centerX, y: upperY, z: bounds.minZ - inset },
      bounds,
    };
  }
  if (direction === "south") {
    return {
      bottom: { x: centerX, y: 0, z: bounds.minZ - inset },
      bottomInside: { x: centerX, y: 0, z: bounds.minZ + inset },
      topInside: { x: centerX, y: upperY, z: bounds.maxZ - inset },
      top: { x: centerX, y: upperY, z: bounds.maxZ + inset },
      bounds,
    };
  }
  return {
    bottom: { x: bounds.maxX + inset, y: 0, z: centerZ },
    bottomInside: { x: bounds.maxX - inset, y: 0, z: centerZ },
    topInside: { x: bounds.minX + inset, y: upperY, z: centerZ },
    top: { x: bounds.minX - inset, y: upperY, z: centerZ },
    bounds,
  };
}

function exteriorDoorPoints(door, building, offset = 1.45) {
  const x = finite(door.x);
  const z = finite(door.z);
  const distances = [
    { side: "west", value: Math.abs(x - finite(building.minX)) },
    { side: "east", value: Math.abs(x - finite(building.maxX)) },
    { side: "north", value: Math.abs(z - finite(building.minZ)) },
    { side: "south", value: Math.abs(z - finite(building.maxZ)) },
  ].sort((a, b) => a.value - b.value);
  const side = distances[0]?.side;
  if (side === "west") return {
    outside: { x: x - offset, y: finite(door.y), z },
    inside: { x: x + offset, y: finite(door.y), z },
  };
  if (side === "north") return {
    outside: { x, y: finite(door.y), z: z - offset },
    inside: { x, y: finite(door.y), z: z + offset },
  };
  if (side === "south") return {
    outside: { x, y: finite(door.y), z: z + offset },
    inside: { x, y: finite(door.y), z: z - offset },
  };
  return {
    outside: { x: x + offset, y: finite(door.y), z },
    inside: { x: x - offset, y: finite(door.y), z },
  };
}

function legacyBuildingTopology(map) {
  const building = map?.building;
  if (!building) return null;
  const upperY = Math.max(2, finite(building.upperY, 3.2));
  const stair = map.walls?.find((entry) => entry?.kind === "building-stair") ?? null;
  const stairPath = stairEndpoints(stair, upperY);
  const groundDoor = (map.doors ?? [])
    .filter((door) => finite(door.y) < upperY / 2)
    .sort((a, b) => {
      const ap = exteriorDoorPoints(a, building).outside;
      const bp = exteriorDoorPoints(b, building).outside;
      const ac = Math.min(
        Math.abs(finite(a.x) - finite(building.minX)), Math.abs(finite(a.x) - finite(building.maxX)),
        Math.abs(finite(a.z) - finite(building.minZ)), Math.abs(finite(a.z) - finite(building.maxZ)),
      );
      const bc = Math.min(
        Math.abs(finite(b.x) - finite(building.minX)), Math.abs(finite(b.x) - finite(building.maxX)),
        Math.abs(finite(b.z) - finite(building.minZ)), Math.abs(finite(b.z) - finite(building.maxZ)),
      );
      return ac - bc || distance3(ap, { x: 0, y: 0, z: 0 }) - distance3(bp, { x: 0, y: 0, z: 0 });
    })[0] ?? null;
  if (!groundDoor || !stairPath) return null;
  const entrance = exteriorDoorPoints(groundDoor, building);
  const splitY = upperY / 2;
  return {
    id: String(building.id ?? "legacy-building"),
    name: String(building.name ?? "Здание"),
    bounds: {
      minX: finite(building.minX), maxX: finite(building.maxX),
      minZ: finite(building.minZ), maxZ: finite(building.maxZ),
      minY: -1, maxY: upperY + 5,
    },
    regions: [
      {
        id: "ground",
        name: "нижний этаж",
        priority: 10,
        bounds: {
          minX: finite(building.minX), maxX: finite(building.maxX),
          minZ: finite(building.minZ), maxZ: finite(building.maxZ),
          minY: -1, maxY: splitY,
        },
      },
      {
        id: "stair",
        name: "лестница",
        priority: 100,
        bounds: {
          ...stairPath.bounds,
          minY: -0.3,
          maxY: upperY + 0.3,
        },
      },
      {
        id: "upper",
        name: "верхний этаж",
        priority: 10,
        bounds: {
          minX: finite(building.minX), maxX: finite(building.maxX),
          minZ: finite(building.minZ), maxZ: finite(building.maxZ),
          minY: splitY,
          maxY: upperY + 5,
        },
      },
    ],
    transitions: [
      {
        id: `${groundDoor.id}:outside`,
        from: OUTSIDE_REGION,
        to: "ground",
        fromPoint: entrance.outside,
        toPoint: entrance.inside,
        kind: "door",
        doorId: groundDoor.id,
      },
      {
        id: `${building.id ?? "building"}:stair-bottom`,
        from: "ground",
        to: "stair",
        fromPoint: stairPath.bottom,
        toPoint: stairPath.bottomInside,
        kind: "stair",
      },
      {
        id: `${building.id ?? "building"}:stair-top`,
        from: "stair",
        to: "upper",
        fromPoint: stairPath.topInside,
        toPoint: stairPath.top,
        kind: "stair",
      },
    ],
    metadata: { inferred: true },
  };
}

export async function setup(ctx) {
  const map = ctx.services.get("map");
  const buildings = new Map();

  function registerBuilding(spec) {
    const building = normalizeBuilding(spec);
    buildings.set(building.id, building);
    return building.id;
  }

  function unregisterBuilding(id) {
    return buildings.delete(String(id));
  }

  function regionForPoint(position, building) {
    if (!position || !building) return null;
    return building.regions
      .filter((region) => rectContains(position, region.bounds, 0.12))
      .sort((a, b) => b.priority - a.priority || horizontalArea(a.bounds) - horizontalArea(b.bounds))[0]
      ?? null;
  }

  function locationFor(position) {
    for (const building of buildings.values()) {
      if (building.bounds && !rectContains(position, building.bounds, 0.2)) continue;
      const region = regionForPoint(position, building);
      if (region) return { building, region };
    }
    return { building: null, region: null };
  }

  function pathWithinBuilding(building, fromRegion, toRegion, fromPoint, targetPoint) {
    return bestRegionPath(
      building,
      fromRegion?.id ?? OUTSIDE_REGION,
      toRegion?.id ?? OUTSIDE_REGION,
      fromPoint,
      targetPoint,
    );
  }

  function requiredWaypoints(from, target) {
    if (!from || !target) return [];
    const start = point(from);
    const end = point(target);
    const source = locationFor(start);
    const destination = locationFor(end);

    if (!source.building && !destination.building) return [];
    if (source.building?.id && source.building.id === destination.building?.id) {
      const same = pathWithinBuilding(
        source.building,
        source.region,
        destination.region,
        start,
        end,
      );
      return dedupeWaypoints(start, same ?? []);
    }

    const waypoints = [];
    let cursor = start;
    if (source.building && source.region) {
      const exit = pathWithinBuilding(
        source.building,
        source.region,
        null,
        cursor,
        end,
      );
      if (exit) {
        waypoints.push(...exit);
        cursor = exit.at(-1) ?? cursor;
      }
    }

    if (destination.building && destination.region) {
      const entrance = pathWithinBuilding(
        destination.building,
        null,
        destination.region,
        cursor,
        end,
      );
      if (entrance) waypoints.push(...entrance);
    }
    return dedupeWaypoints(start, waypoints);
  }

  for (const spec of map.navigationBuildings ?? []) registerBuilding(spec);
  const legacy = legacyBuildingTopology(map);
  if (legacy && !buildings.has(String(legacy.id))) registerBuilding(legacy);

  ctx.services.provide("building-navigation", {
    registerBuilding,
    unregisterBuilding,
    requiredWaypoints,
    locationFor,
    regionForPoint,
    list() {
      return [...buildings.values()].map((building) => ({
        id: building.id,
        name: building.name,
        regions: building.regions.map((region) => region.id),
        transitions: building.transitions.map((transition) => transition.id),
        inferred: Boolean(building.metadata?.inferred),
      }));
    },
  });
}
