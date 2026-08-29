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

export function buildingDoorBypassWaypoint(from, doorWaypoint, building) {
  if (!from || !doorWaypoint || !building || insideRect(from, building, 0.1)) return null;
  const obstacle = {
    minX: building.minX - 0.45,
    maxX: building.maxX + 0.45,
    minZ: building.minZ - 0.45,
    maxZ: building.maxZ + 0.45,
  };
  if (!segmentIntersectsRect(from, doorWaypoint, obstacle)) return null;

  const bypassZ = chooseBuildingBypassZ(from, doorWaypoint, building);
  const westX = building.minX - BUILDING_BYPASS_END_CLEARANCE;
  const eastX = building.maxX + BUILDING_BYPASS_END_CLEARANCE;
  const sideClear = Math.abs(number(from.z) - bypassZ) <= GROUND_BYPASS_REACHED;

  if (number(from.x) < building.minX + 0.15) {
    if (!sideClear) {
      return { x: westX, y: 0, z: bypassZ, kind: "building-bypass", stage: "clear-side" };
    }
    if (number(from.x) < eastX - GROUND_BYPASS_REACHED) {
      return { x: eastX, y: 0, z: bypassZ, kind: "building-bypass", stage: "cross" };
    }
    return null;
  }

  if (number(from.x) < eastX - GROUND_BYPASS_REACHED || !sideClear) {
    return { x: eastX, y: 0, z: bypassZ, kind: "building-bypass", stage: "corner" };
  }
  return null;
}

export async function setup(ctx) {
  const map = ctx.services.get("map");
  const buildingNavigation = ctx.services.get("building-navigation");
  const originalNavigationWaypoint = map.navigationWaypoint.bind(map);
  const stair = stairBounds(map);

  function requiredWaypoints(from, target) {
    return buildingNavigation.requiredWaypoints(from, target) ?? [];
  }

  function navigationWaypoint(from, target) {
    const buildingRoute = requiredWaypoints(from, target);
    if (buildingRoute.length) return buildingRoute[0];

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
    return groundFloorBypassWaypoint(from, target, {
      building: map.building,
      stair,
    });
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
    buildingBypassWaypoint(from, target) {
      return buildingDoorBypassWaypoint(from, target, map.building);
    },
  });
}
