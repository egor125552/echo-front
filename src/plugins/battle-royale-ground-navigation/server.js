import { stairBypassPoints } from "./stair-bypass.js";

export const GROUND_BYPASS_SIDE_CLEARANCE = 1.35;
export const GROUND_BYPASS_END_CLEARANCE = 0.9;
export const GROUND_BYPASS_REACHED = 0.55;
export const BUILDING_BYPASS_SIDE_CLEARANCE = 1.55;
export const BUILDING_BYPASS_END_CLEARANCE = 1.35;

export const manifest = {
  id: "battle-royale-ground-navigation",
  version: "1.2.0",
  requires: ["map-test-arena", "battle-royale-building-navigation"],
  capabilities: ["services.consume", "services.provide"],
};

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function insideRect(point, rect, padding = 0) {
  if (!point || !rect) return false;
  return number(point.x) >= rect.minX - padding
    && number(point.x) <= rect.maxX + padding
    && number(point.z) >= rect.minZ - padding
    && number(point.z) <= rect.maxZ + padding;
}

function segmentIntersectsRect(a, b, rect) {
  let t0 = 0;
  let t1 = 1;
  const dx = number(b.x) - number(a.x);
  const dz = number(b.z) - number(a.z);
  const checks = [
    [-dx, number(a.x) - rect.minX],
    [dx, rect.maxX - number(a.x)],
    [-dz, number(a.z) - rect.minZ],
    [dz, rect.maxZ - number(a.z)],
  ];

  for (const [p, q] of checks) {
    if (Math.abs(p) < 1e-9) {
      if (q < 0) return false;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
  }
  return t0 <= t1;
}

function stairBounds(map) {
  const stair = map?.walls?.find((entry) => entry?.kind === "building-stair");
  if (!stair) return null;
  const run = Math.max(0.01, Math.abs(number(stair.run)));
  const width = Math.max(0.01, Math.abs(number(stair.width)));
  const x = number(stair.x);
  const z = number(stair.z);
  return {
    minX: x - run / 2,
    maxX: x + run / 2,
    minZ: z - width / 2,
    maxZ: z + width / 2,
    centerX: x,
    centerZ: z,
  };
}

function isGroundFloor(point, building) {
  const upperY = Math.max(1, number(building?.upperY, 3.2));
  return number(point?.y) < upperY / 2;
}

function chooseBypassZ(from, target, stair) {
  const positive = stair.maxZ + GROUND_BYPASS_SIDE_CLEARANCE;
  const negative = stair.minZ - GROUND_BYPASS_SIDE_CLEARANCE;
  const positiveCost = Math.abs(number(from.z) - positive) + Math.abs(number(target.z) - positive);
  const negativeCost = Math.abs(number(from.z) - negative) + Math.abs(number(target.z) - negative);
  if (Math.abs(positiveCost - negativeCost) < 0.01) {
    return number(target.z) < stair.centerZ ? negative : positive;
  }
  return positiveCost < negativeCost ? positive : negative;
}

function chooseBuildingBypassZ(from, target, building) {
  const positive = building.maxZ + BUILDING_BYPASS_SIDE_CLEARANCE;
  const negative = building.minZ - BUILDING_BYPASS_SIDE_CLEARANCE;
  const positiveCost = Math.abs(number(from.z) - positive) + Math.abs(number(target.z) - positive);
  const negativeCost = Math.abs(number(from.z) - negative) + Math.abs(number(target.z) - negative);
  return positiveCost <= negativeCost ? positive : negative;
}

export function groundFloorBypassWaypoint(from, target, { building, stair } = {}) {
  if (!from || !target || !building || !stair) return null;
  if (!insideRect(from, building, 0.15) || !insideRect(target, building, 0.15)) return null;
  if (!isGroundFloor(from, building) || !isGroundFloor(target, building)) return null;

  const obstacle = {
    minX: stair.minX - 0.25,
    maxX: stair.maxX + 0.25,
    minZ: stair.minZ - 0.45,
    maxZ: stair.maxZ + 0.45,
  };
  if (!segmentIntersectsRect(from, target, obstacle)) return null;

  const eastToWest = number(from.x) >= stair.maxX - 0.75 && number(target.x) < stair.minX - 0.2;
  const westToEast = number(from.x) <= stair.minX + 0.75 && number(target.x) > stair.maxX + 0.2;
  if (!eastToWest && !westToEast) return null;

  const bypassZ = chooseBypassZ(from, target, stair);
  const sideClear = Math.abs(number(from.z) - stair.centerZ)
    >= (stair.maxZ - stair.centerZ) + GROUND_BYPASS_SIDE_CLEARANCE - GROUND_BYPASS_REACHED;

  if (eastToWest) {
    const eastX = stair.maxX + GROUND_BYPASS_END_CLEARANCE;
    const westX = stair.minX - GROUND_BYPASS_END_CLEARANCE;
    if (!sideClear) return { x: eastX, y: 0, z: bypassZ, kind: "ground-bypass", stage: "clear-side" };
    if (number(from.x) > westX + GROUND_BYPASS_REACHED) {
      return { x: westX, y: 0, z: bypassZ, kind: "ground-bypass", stage: "cross" };
    }
    return null;
  }

  const westX = stair.minX - GROUND_BYPASS_END_CLEARANCE;
  const eastX = stair.maxX + GROUND_BYPASS_END_CLEARANCE;
  if (!sideClear) return { x: westX, y: 0, z: bypassZ, kind: "ground-bypass", stage: "clear-side" };
  if (number(from.x) < eastX - GROUND_BYPASS_REACHED) {
    return { x: eastX, y: 0, z: bypassZ, kind: "ground-bypass", stage: "cross" };
  }
  return null;
}

function pointDistance2(a, b) {
  return Math.hypot(number(a?.x) - number(b?.x), number(a?.z) - number(b?.z));
}

function allNavigationBuildings(map) {
  const result = [];
  const seen = new Set();
  if (map?.building?.minX != null) {
    const id = String(map.building.id ?? "warehouse");
    seen.add(id);
    result.push({ id, ...map.building });
  }
  for (const entry of map?.navigationBuildings ?? []) {
    if (!entry?.bounds) continue;
    const id = String(entry.id ?? "");
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    result.push({ id, ...entry.bounds });
  }
  return result;
}

export function buildingDoorBypassWaypoint(from, doorWaypoint, building) {
  if (!from || !doorWaypoint || !building || insideRect(from, building, 0.1)) return null;
  const obstacle = {
    minX: building.minX - 0.45,
    maxX: building.maxX + 0.45,
    minZ: building.minZ - 0.45,
    maxZ: building.maxZ + 0.45,
  };
  if (!segmentIntersectsRect(from, doorWaypoint, obstacle)) return null;

  const pad = BUILDING_BYPASS_SIDE_CLEARANCE;
  const corners = [
    { x: building.minX - pad, y: 0, z: building.minZ - pad },
    { x: building.maxX + pad, y: 0, z: building.minZ - pad },
    { x: building.maxX + pad, y: 0, z: building.maxZ + pad },
    { x: building.minX - pad, y: 0, z: building.maxZ + pad },
  ];
  const wallBox = {
    minX: building.minX - 0.35,
    maxX: building.maxX + 0.35,
    minZ: building.minZ - 0.35,
    maxZ: building.maxZ + 0.35,
  };

  const startVisible = [];
  const endVisible = [];
  for (let i = 0; i < 4; i += 1) {
    if (!segmentIntersectsRect(from, corners[i], wallBox)) startVisible.push(i);
    if (!segmentIntersectsRect(corners[i], doorWaypoint, wallBox)) endVisible.push(i);
  }

  let bestWaypoint = null;
  let bestCost = Infinity;
  for (const startIdx of startVisible) {
    for (const endIdx of endVisible) {
      for (const dir of [1, -1]) {
        const chain = [];
        let cursor = startIdx;
        let perimeterCost = 0;
        chain.push(corners[cursor]);
        while (cursor !== endIdx) {
          const next = (cursor + dir + 4) % 4;
          perimeterCost += pointDistance2(corners[cursor], corners[next]);
          cursor = next;
          chain.push(corners[cursor]);
        }
        const total = pointDistance2(from, corners[startIdx])
          + perimeterCost
          + pointDistance2(corners[endIdx], doorWaypoint);
        if (total >= bestCost) continue;
        bestCost = total;
        const targetCorner = chain.length > 1 && pointDistance2(from, chain[0]) <= GROUND_BYPASS_REACHED
          ? chain[1]
          : chain[0];
        bestWaypoint = {
          ...targetCorner,
          kind: "building-bypass",
          stage: chain.length > 1 ? "clear-side" : "corner",
        };
      }
    }
  }
  if (bestWaypoint) return bestWaypoint;

  const bypassZ = chooseBuildingBypassZ(from, doorWaypoint, building);
  const westX = building.minX - BUILDING_BYPASS_END_CLEARANCE;
  const eastX = building.maxX + BUILDING_BYPASS_END_CLEARANCE;
  const x = Math.abs(number(from.x) - westX) <= Math.abs(number(from.x) - eastX) ? westX : eastX;
  return { x, y: 0, z: bypassZ, kind: "building-bypass", stage: "corner" };
}

export async function setup(ctx) {
  const map = ctx.services.get("map");
  const buildingNavigation = ctx.services.get("building-navigation");
  const originalNavigationWaypoint = map.navigationWaypoint.bind(map);
  const stair = stairBounds(map);

  function requiredWaypoints(from, target) {
    if (!from || !target) return [];
    const buildings = allNavigationBuildings(map);
    const stairWallsForSegment = (a, b) => (map.walls ?? []).filter((wall) => {
      if (wall?.kind !== "building-stair" || wall.destroyed) return false;
      const stairBuilding = buildings.find((entry) => (
        wall.buildingId ? entry.id === String(wall.buildingId) : insideRect(wall, entry, 0.1)
      ));
      return stairBuilding && insideRect(a, stairBuilding, 0.25) && insideRect(b, stairBuilding, 0.25);
    });
    const required = buildingNavigation.requiredWaypoints(from, target) ?? [];
    const route = [];
    let cursor = from;
    for (const goal of [...required, target]) {
      // Only route around an interior staircase when both endpoints lie inside
      // that staircase's building; outdoor approaches must not detour to an
      // indoor stair corner through an exterior wall.
      if (goal.kind !== "stair" || goal.transitionSide === "approach") {
        route.push(...stairBypassPoints(cursor, goal, stairWallsForSegment(cursor, goal)));
      }
      if (goal !== target) route.push(goal);
      cursor = goal;
    }
    return route;
  }

  function buildingBoundsForWaypoint(waypoint, buildings) {
    if (waypoint?.buildingId) {
      const byId = buildings.find((entry) => entry.id === String(waypoint.buildingId));
      if (byId) return byId;
    }
    return buildings.find((entry) => insideRect(waypoint, entry, BUILDING_BYPASS_SIDE_CLEARANCE + 1))
      ?? map.building
      ?? null;
  }

  function exteriorObstacleBypass(from, target, buildings) {
    if (!from || !target || !buildings.length) return null;
    if (buildings.some((b) => insideRect(from, b, 0.1))) return null;
    let bestBypass = null;
    let bestDistance = Infinity;
    for (const building of buildings) {
      if (insideRect(target, building, 0.1)) continue;
      const bypass = buildingDoorBypassWaypoint(from, target, building);
      if (!bypass) continue;
      const cx = (building.minX + building.maxX) / 2;
      const cz = (building.minZ + building.maxZ) / 2;
      const dist = Math.hypot(number(from.x) - cx, number(from.z) - cz);
      if (dist < bestDistance) {
        bestDistance = dist;
        bestBypass = bypass;
      }
    }
    return bestBypass;
  }

  function navigationWaypoint(from, target) {
    const buildings = allNavigationBuildings(map);
    const buildingRoute = requiredWaypoints(from, target);
    if (buildingRoute.length) {
      const first = buildingRoute[0];
      if (
        first?.kind === "door"
        && first.transitionSide === "approach"
        && !buildings.some((b) => insideRect(from, b, 0.1))
      ) {
        const doorBuilding = buildingBoundsForWaypoint(first, buildings);
        const bypass = buildingDoorBypassWaypoint(from, first, doorBuilding);
        if (bypass) return bypass;
      }
      return first;
    }

    const semantic = originalNavigationWaypoint(from, target);

    if (
      semantic?.kind === "stair"
      && number(semantic.y) < 0.2
      && isGroundFloor(from, map.building)
      && stair
    ) {
      const safeStairEntry = {
        x: stair.maxX + GROUND_BYPASS_END_CLEARANCE,
        y: 0,
        z: stair.centerZ,
      };
      const stairBypass = groundFloorBypassWaypoint(from, safeStairEntry, {
        building: map.building,
        stair,
      });
      if (stairBypass) return stairBypass;
    }

    if (semantic?.kind === "door") {
      const buildingBypass = buildingDoorBypassWaypoint(from, semantic, map.building);
      if (buildingBypass) return buildingBypass;
    }

    if (semantic) return semantic;
    const stairGroundBypass = groundFloorBypassWaypoint(from, target, {
      building: map.building,
      stair,
    });
    if (stairGroundBypass) return stairGroundBypass;
    return exteriorObstacleBypass(from, target, buildings);
  }

  map.navigationWaypoint = navigationWaypoint;
  ctx.services.provide("ground-navigation", {
    stair,
    waypoint: navigationWaypoint,
    requiredWaypoints,
    buildingLocation: buildingNavigation.locationFor,
    registerBuilding: buildingNavigation.registerBuilding,
    unregisterBuilding: buildingNavigation.unregisterBuilding,
    buildings: buildingNavigation.list,
    bypassWaypoint(from, target) {
      return groundFloorBypassWaypoint(from, target, { building: map.building, stair });
    },
    buildingBypassWaypoint(from, target, building = map.building) {
      return buildingDoorBypassWaypoint(from, target, building);
    },
  });
}
