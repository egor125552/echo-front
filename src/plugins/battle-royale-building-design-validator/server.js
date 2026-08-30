import { BATTLE_ROYALE_BUILDINGS } from "../../config/battle-royale-buildings.js";

export const manifest = {
  id: "battle-royale-building-design-validator",
  version: "1.0.0",
  requires: ["battle-royale-building-factory"],
  capabilities: ["services.consume", "services.provide"],
};

const EDGE_CLEARANCE = 0.55;
const STAIR_APPROACH_CLEARANCE = 1.15;
const STAIR_OBJECT_CLEARANCE = 0.75;
const MAX_STAIR_ANGLE_DEGREES = 42;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function rectForStair(stair) {
  const run = Math.max(0.01, Math.abs(finite(stair.run, 5)));
  const width = Math.max(0.01, Math.abs(finite(stair.width, 3)));
  const x = finite(stair.x);
  const z = finite(stair.z);
  const direction = String(stair.risesToward ?? "west");
  if (direction === "north" || direction === "south") {
    return {
      minX: x - width / 2,
      maxX: x + width / 2,
      minZ: z - run / 2,
      maxZ: z + run / 2,
    };
  }
  return {
    minX: x - run / 2,
    maxX: x + run / 2,
    minZ: z - width / 2,
    maxZ: z + width / 2,
  };
}

function pointInRect(point, rect, padding = 0) {
  return finite(point?.x) >= rect.minX - padding
    && finite(point?.x) <= rect.maxX + padding
    && finite(point?.z) >= rect.minZ - padding
    && finite(point?.z) <= rect.maxZ + padding;
}

function stairEndpoints(stair) {
  const rect = rectForStair(stair);
  const x = finite(stair.x);
  const z = finite(stair.z);
  const direction = String(stair.risesToward ?? "west");
  if (direction === "east") return {
    bottom: { x: rect.minX - STAIR_APPROACH_CLEARANCE, z },
    top: { x: rect.maxX + STAIR_APPROACH_CLEARANCE, z },
    topInside: { x: rect.maxX - 0.45, z },
  };
  if (direction === "north") return {
    bottom: { x, z: rect.maxZ + STAIR_APPROACH_CLEARANCE },
    top: { x, z: rect.minZ - STAIR_APPROACH_CLEARANCE },
    topInside: { x, z: rect.minZ + 0.45 },
  };
  if (direction === "south") return {
    bottom: { x, z: rect.minZ - STAIR_APPROACH_CLEARANCE },
    top: { x, z: rect.maxZ + STAIR_APPROACH_CLEARANCE },
    topInside: { x, z: rect.maxZ - 0.45 },
  };
  return {
    bottom: { x: rect.maxX + STAIR_APPROACH_CLEARANCE, z },
    top: { x: rect.minX - STAIR_APPROACH_CLEARANCE, z },
    topInside: { x: rect.minX + 0.45, z },
  };
}

function floorSlabs(building, floor) {
  if (Array.isArray(floor?.slabs) && floor.slabs.length) return floor.slabs;
  return [{ x: 0, z: 0, width: building.width, depth: building.depth }];
}

function slabContains(slab, point, padding = 0) {
  const halfWidth = Math.abs(finite(slab.width)) / 2;
  const halfDepth = Math.abs(finite(slab.depth)) / 2;
  return finite(point.x) >= finite(slab.x) - halfWidth - padding
    && finite(point.x) <= finite(slab.x) + halfWidth + padding
    && finite(point.z) >= finite(slab.z) - halfDepth - padding
    && finite(point.z) <= finite(slab.z) + halfDepth + padding;
}

function overlapsRect(a, b, padding = 0) {
  return a.minX - padding <= b.maxX
    && a.maxX + padding >= b.minX
    && a.minZ - padding <= b.maxZ
    && a.maxZ + padding >= b.minZ;
}

function wallRect(wall) {
  return {
    minX: finite(wall.x) - Math.abs(finite(wall.hx, 0.2)),
    maxX: finite(wall.x) + Math.abs(finite(wall.hx, 0.2)),
    minZ: finite(wall.z) - Math.abs(finite(wall.hz, 0.2)),
    maxZ: finite(wall.z) + Math.abs(finite(wall.hz, 0.2)),
  };
}

function validateBuilding(spec) {
  const errors = [];
  const warnings = [];
  const id = String(spec?.id ?? "unnamed");
  const width = Math.abs(finite(spec?.width));
  const depth = Math.abs(finite(spec?.depth));
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  const floors = Array.isArray(spec?.floors) ? spec.floors : [];
  const floorById = new Map(floors.map((floor) => [String(floor.id), floor]));

  if (width < 4 || depth < 4) errors.push("building footprint is too small");
  if (!floors.length) errors.push("building has no floors");
  if (floorById.size !== floors.length) errors.push("floor ids must be unique");

  for (const door of spec?.doors ?? []) {
    const floorId = String(door.floorId ?? floors[0]?.id ?? "");
    if (!floorById.has(floorId)) {
      errors.push(`door ${door.id ?? "unnamed"} references missing floor ${floorId}`);
      continue;
    }
    const side = String(door.side ?? "east");
    if (!["north", "south", "east", "west"].includes(side)) {
      errors.push(`door ${door.id ?? "unnamed"} has invalid side ${side}`);
      continue;
    }
    const wallLength = side === "north" || side === "south" ? width : depth;
    const doorWidth = Math.max(0.8, Math.abs(finite(door.width, 2.2)));
    const maximumOffset = wallLength / 2 - doorWidth / 2 - EDGE_CLEARANCE;
    if (maximumOffset < 0 || Math.abs(finite(door.offset)) > maximumOffset) {
      errors.push(`door ${door.id ?? "unnamed"} is too close to a building corner`);
    }
  }

  const primaryDoor = spec?.doors?.[0] ?? null;
  if (primaryDoor) {
    const primarySide = String(primaryDoor.side ?? "east");
    const primaryOffset = Math.abs(finite(primaryDoor.offset));
    const primaryWidth = Math.max(0.8, Math.abs(finite(primaryDoor.width, 2.2)));
    if (primarySide !== "east") {
      warnings.push(`primary door ${primaryDoor.id ?? "unnamed"} does not face east like the warehouse front entrance`);
    }
    if (primaryOffset > 0.35) {
      warnings.push(`primary door ${primaryDoor.id ?? "unnamed"} is not centered on the front wall`);
    }
    if (primaryWidth < 3.2) {
      warnings.push(`primary door ${primaryDoor.id ?? "unnamed"} is narrower than the preferred 3.2 meter accessible entrance`);
    }
  }

  for (const stair of spec?.stairs ?? []) {
    const stairId = stair.id ?? "unnamed";
    const from = floorById.get(String(stair.fromFloorId));
    const to = floorById.get(String(stair.toFloorId));
    if (!from || !to) {
      errors.push(`stair ${stairId} must connect two existing floors`);
      continue;
    }
    if (String(from.id) === String(to.id)) {
      errors.push(`stair ${stairId} cannot connect a floor to itself`);
      continue;
    }

    const rise = Math.abs(finite(to.y) - finite(from.y));
    const run = Math.max(0.01, Math.abs(finite(stair.run, 5)));
    const widthOfStair = Math.max(0.01, Math.abs(finite(stair.width, 3)));
    const angle = Math.atan2(rise, run) * 180 / Math.PI;
    if (rise < 1.8) errors.push(`stair ${stairId} has no meaningful floor rise`);
    if (angle > MAX_STAIR_ANGLE_DEGREES) {
      errors.push(`stair ${stairId} is too steep (${angle.toFixed(1)} degrees)`);
    }
    if (widthOfStair < 1.5) errors.push(`stair ${stairId} is too narrow for comfortable traversal`);

    const rect = rectForStair(stair);
    if (
      rect.minX < -halfWidth + EDGE_CLEARANCE
      || rect.maxX > halfWidth - EDGE_CLEARANCE
      || rect.minZ < -halfDepth + EDGE_CLEARANCE
      || rect.maxZ > halfDepth - EDGE_CLEARANCE
    ) {
      errors.push(`stair ${stairId} intersects or crowds an outer wall`);
    }

    const endpoints = stairEndpoints(stair);
    for (const [label, point] of [["bottom", endpoints.bottom], ["top", endpoints.top]]) {
      if (
        Math.abs(point.x) > halfWidth - EDGE_CLEARANCE
        || Math.abs(point.z) > halfDepth - EDGE_CLEARANCE
      ) {
        errors.push(`stair ${stairId} has no clear ${label} landing inside the building`);
      }
    }

    const highFloor = finite(from.y) > finite(to.y) ? from : to;
    const openingSamples = [
      endpoints.topInside,
      { x: endpoints.topInside.x + (String(stair.risesToward).match(/north|south/) ? widthOfStair * 0.34 : 0), z: endpoints.topInside.z + (String(stair.risesToward).match(/east|west/) ? widthOfStair * 0.34 : 0) },
      { x: endpoints.topInside.x - (String(stair.risesToward).match(/north|south/) ? widthOfStair * 0.34 : 0), z: endpoints.topInside.z - (String(stair.risesToward).match(/east|west/) ? widthOfStair * 0.34 : 0) },
    ];
    const slabs = floorSlabs(spec, highFloor);
    if (openingSamples.some((point) => slabs.some((slab) => slabContains(slab, point, -0.08)))) {
      errors.push(`stair ${stairId} runs into the upper floor; stairwell opening is missing or too small`);
    }

    for (const wall of spec?.walls ?? []) {
      if (String(wall.floorId ?? floors[0]?.id) !== String(from.id)) continue;
      if (overlapsRect(rect, wallRect(wall), STAIR_OBJECT_CLEARANCE)) {
        errors.push(`stair ${stairId} is blocked by wall geometry on its lower floor`);
      }
    }

    for (const crate of spec?.crates ?? []) {
      const crateFloor = String(crate.floorId ?? floors[0]?.id);
      if (crateFloor !== String(from.id) && crateFloor !== String(to.id)) continue;
      if (pointInRect(crate, rect, STAIR_OBJECT_CLEARANCE)) {
        errors.push(`stair ${stairId} is blocked by crate ${crate.id ?? "unnamed"}`);
      }
      if (Math.hypot(finite(crate.x) - endpoints.bottom.x, finite(crate.z) - endpoints.bottom.z) < 1.7) {
        errors.push(`crate ${crate.id ?? "unnamed"} blocks the lower landing of stair ${stairId}`);
      }
      if (Math.hypot(finite(crate.x) - endpoints.top.x, finite(crate.z) - endpoints.top.z) < 1.7) {
        errors.push(`crate ${crate.id ?? "unnamed"} blocks the upper landing of stair ${stairId}`);
      }
    }
  }

  if ((spec?.stairs ?? []).length && floors.length < 2) {
    errors.push("stairs require at least two floors");
  }

  return { id, ok: errors.length === 0, errors, warnings };
}

export async function setup(ctx) {
  const factory = ctx.services.get("building-factory");
  const reports = BATTLE_ROYALE_BUILDINGS.map(validateBuilding);
  const failed = reports.filter((report) => !report.ok);
  const warned = reports.filter((report) => report.warnings.length);
  if (warned.length) {
    console.warn(
      `Building design warnings: ${warned.map((report) => `${report.id}: ${report.warnings.join("; ")}`).join(" | ")}`,
    );
  }
  if (failed.length) {
    const message = failed
      .map((report) => `${report.id}: ${report.errors.join("; ")}`)
      .join(" | ");
    throw new Error(`Building design validation failed: ${message}`);
  }

  const originalCreateBuilding = factory.createBuilding.bind(factory);
  factory.createBuilding = (spec) => {
    const report = validateBuilding(spec);
    if (!report.ok) {
      throw new Error(`Building design validation failed for ${report.id}: ${report.errors.join("; ")}`);
    }
    return originalCreateBuilding(spec);
  };

  ctx.services.provide("building-design-validator", {
    validate: validateBuilding,
    validateAll() {
      return reports.map((report) => ({
        ...report,
        errors: [...report.errors],
        warnings: [...report.warnings],
      }));
    },
  });
}
