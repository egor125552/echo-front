import { BATTLE_ROYALE_BUILDINGS } from "../../config/battle-royale-buildings.js";

export const manifest = {
  id: "battle-royale-building-factory",
  version: "1.0.0",
  requires: ["rapier-physics", "map-test-arena"],
  capabilities: ["services.consume", "services.provide"],
};

const WALL_THICKNESS = 0.24;
const FLOOR_THICKNESS = 0.18;
const DOOR_APPROACH_OFFSET = 1.45;
const STAIR_REGION_PADDING = 0.18;
const DEFAULT_ACOUSTICS = Object.freeze({
  zone: "indoor",
  reverbMix: 0.32,
  wallOcclusion: 0.82,
  doorOcclusion: 0.9,
  floorOcclusion: 0.88,
  stairOcclusion: 0.34,
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp01(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, number));
}

function localPoint(building, value = {}, y = null) {
  return {
    x: finite(building.x) + finite(value.x),
    y: y == null ? finite(value.y) : finite(y),
    z: finite(building.z) + finite(value.z),
  };
}

function buildingBounds(building) {
  const halfWidth = Math.abs(finite(building.width)) / 2;
  const halfDepth = Math.abs(finite(building.depth)) / 2;
  const floors = [...(building.floors ?? [])].sort((a, b) => finite(a.y) - finite(b.y));
  const minimumFloor = floors[0];
  const maximumFloor = floors.at(-1);
  return {
    minX: finite(building.x) - halfWidth,
    maxX: finite(building.x) + halfWidth,
    minZ: finite(building.z) - halfDepth,
    maxZ: finite(building.z) + halfDepth,
    minY: finite(minimumFloor?.y, 0) - 1,
    maxY: finite(maximumFloor?.y, 0) + Math.max(2, finite(maximumFloor?.height, 2.8)) + 1,
  };
}

function pointInside(position, bounds, padding = 0) {
  if (!position || !bounds) return false;
  return finite(position.x) >= finite(bounds.minX) - padding
    && finite(position.x) <= finite(bounds.maxX) + padding
    && finite(position.z) >= finite(bounds.minZ) - padding
    && finite(position.z) <= finite(bounds.maxZ) + padding
    && finite(position.y) >= finite(bounds.minY, -Infinity) - padding
    && finite(position.y) <= finite(bounds.maxY, Infinity) + padding;
}

function mergeAcoustics(...profiles) {
  const merged = { ...DEFAULT_ACOUSTICS };
  for (const profile of profiles) {
    if (!profile) continue;
    Object.assign(merged, profile);
  }
  merged.zone = String(merged.zone ?? "indoor");
  merged.reverbMix = clamp01(merged.reverbMix, DEFAULT_ACOUSTICS.reverbMix);
  merged.wallOcclusion = clamp01(merged.wallOcclusion, DEFAULT_ACOUSTICS.wallOcclusion);
  merged.doorOcclusion = clamp01(merged.doorOcclusion, DEFAULT_ACOUSTICS.doorOcclusion);
  merged.floorOcclusion = clamp01(merged.floorOcclusion, DEFAULT_ACOUSTICS.floorOcclusion);
  merged.stairOcclusion = clamp01(merged.stairOcclusion, DEFAULT_ACOUSTICS.stairOcclusion);
  return merged;
}

function floorMap(building) {
  return new Map((building.floors ?? []).map((floor) => [String(floor.id), floor]));
}

function floorVerticalBounds(building, floorId) {
  const floors = [...(building.floors ?? [])].sort((a, b) => finite(a.y) - finite(b.y));
  const index = floors.findIndex((floor) => String(floor.id) === String(floorId));
  if (index < 0) return null;
  const floor = floors[index];
  const previous = floors[index - 1] ?? null;
  const next = floors[index + 1] ?? null;
  const y = finite(floor.y);
  const minY = previous ? (finite(previous.y) + y) / 2 : y - 0.9;
  const maxY = next ? (y + finite(next.y)) / 2 : y + Math.max(2, finite(floor.height, 2.8)) + 0.9;
  return { minY, maxY };
}

function floorBounds(building, floor) {
  const bounds = buildingBounds(building);
  const vertical = floorVerticalBounds(building, floor.id) ?? { minY: finite(floor.y) - 0.9, maxY: finite(floor.y) + 4 };
  return { ...bounds, ...vertical };
}

function roomBounds(building, floor, room) {
  const vertical = floorVerticalBounds(building, floor.id) ?? { minY: finite(floor.y) - 0.9, maxY: finite(floor.y) + 4 };
  return {
    minX: finite(building.x) + finite(room.minX, -Math.abs(finite(building.width)) / 2),
    maxX: finite(building.x) + finite(room.maxX, Math.abs(finite(building.width)) / 2),
    minZ: finite(building.z) + finite(room.minZ, -Math.abs(finite(building.depth)) / 2),
    maxZ: finite(building.z) + finite(room.maxZ, Math.abs(finite(building.depth)) / 2),
    ...vertical,
  };
}

function doorLocalPosition(building, door) {
  const halfWidth = Math.abs(finite(building.width)) / 2;
  const halfDepth = Math.abs(finite(building.depth)) / 2;
  const offset = finite(door.offset);
  switch (String(door.side ?? "east")) {
    case "west": return { x: -halfWidth, z: offset };
    case "north": return { x: offset, z: -halfDepth };
    case "south": return { x: offset, z: halfDepth };
    default: return { x: halfWidth, z: offset };
  }
}

function doorWorldPosition(building, floor, door) {
  return localPoint(building, doorLocalPosition(building, door), finite(floor?.y));
}

function doorPassagePoints(building, floor, door) {
  const position = doorWorldPosition(building, floor, door);
  const offset = Math.max(0.8, finite(door.approachOffset, DOOR_APPROACH_OFFSET));
  switch (String(door.side ?? "east")) {
    case "west": return {
      outside: { x: position.x - offset, y: position.y, z: position.z },
      inside: { x: position.x + offset, y: position.y, z: position.z },
    };
    case "north": return {
      outside: { x: position.x, y: position.y, z: position.z - offset },
      inside: { x: position.x, y: position.y, z: position.z + offset },
    };
    case "south": return {
      outside: { x: position.x, y: position.y, z: position.z + offset },
      inside: { x: position.x, y: position.y, z: position.z - offset },
    };
    default: return {
      outside: { x: position.x + offset, y: position.y, z: position.z },
      inside: { x: position.x - offset, y: position.y, z: position.z },
    };
  }
}

function wallSegments(length, gaps = []) {
  const half = length / 2;
  const normalized = gaps
    .map((gap) => ({
      start: Math.max(-half, finite(gap.offset) - Math.abs(finite(gap.width, 2)) / 2),
      end: Math.min(half, finite(gap.offset) + Math.abs(finite(gap.width, 2)) / 2),
    }))
    .filter((gap) => gap.end > gap.start)
    .sort((a, b) => a.start - b.start);
  const merged = [];
  for (const gap of normalized) {
    const previous = merged.at(-1);
    if (previous && gap.start <= previous.end) previous.end = Math.max(previous.end, gap.end);
    else merged.push({ ...gap });
  }
  const segments = [];
  let cursor = -half;
  for (const gap of merged) {
    if (gap.start > cursor + 0.05) segments.push({ start: cursor, end: gap.start });
    cursor = Math.max(cursor, gap.end);
  }
  if (cursor < half - 0.05) segments.push({ start: cursor, end: half });
  return segments;
}

function stairGeometry(building, stair, floorById) {
  const fromFloor = floorById.get(String(stair.fromFloorId));
  const toFloor = floorById.get(String(stair.toFloorId));
  if (!fromFloor || !toFloor) return null;
  const fromY = finite(fromFloor.y);
  const toY = finite(toFloor.y);
  const rise = Math.abs(toY - fromY);
  const run = Math.max(0.8, Math.abs(finite(stair.run, 5)));
  const width = Math.max(0.8, Math.abs(finite(stair.width, 3)));
  const direction = String(stair.risesToward ?? "west");
  const center = localPoint(building, stair, Math.min(fromY, toY));
  const halfRun = run / 2;
  const halfWidth = width / 2;
  let bounds;
  if (direction === "north" || direction === "south") {
    bounds = {
      minX: center.x - halfWidth,
      maxX: center.x + halfWidth,
      minZ: center.z - halfRun,
      maxZ: center.z + halfRun,
    };
  } else {
    bounds = {
      minX: center.x - halfRun,
      maxX: center.x + halfRun,
      minZ: center.z - halfWidth,
      maxZ: center.z + halfWidth,
    };
  }
  const lowY = Math.min(fromY, toY);
  const highY = Math.max(fromY, toY);
  const inset = 0.5;
  let bottom;
  let bottomInside;
  let topInside;
  let top;
  if (direction === "east") {
    bottom = { x: bounds.minX - inset, y: lowY, z: center.z };
    bottomInside = { x: bounds.minX + inset, y: lowY, z: center.z };
    topInside = { x: bounds.maxX - inset, y: highY, z: center.z };
    top = { x: bounds.maxX + inset, y: highY, z: center.z };
  } else if (direction === "north") {
    bottom = { x: center.x, y: lowY, z: bounds.maxZ + inset };
    bottomInside = { x: center.x, y: lowY, z: bounds.maxZ - inset };
    topInside = { x: center.x, y: highY, z: bounds.minZ + inset };
    top = { x: center.x, y: highY, z: bounds.minZ - inset };
  } else if (direction === "south") {
    bottom = { x: center.x, y: lowY, z: bounds.minZ - inset };
    bottomInside = { x: center.x, y: lowY, z: bounds.minZ + inset };
    topInside = { x: center.x, y: highY, z: bounds.maxZ - inset };
    top = { x: center.x, y: highY, z: bounds.maxZ + inset };
  } else {
    bottom = { x: bounds.maxX + inset, y: lowY, z: center.z };
    bottomInside = { x: bounds.maxX - inset, y: lowY, z: center.z };
    topInside = { x: bounds.minX + inset, y: highY, z: center.z };
    top = { x: bounds.minX - inset, y: highY, z: center.z };
  }
  return {
    fromFloor,
    toFloor,
    center,
    rise,
    run,
    width,
    direction,
    bounds,
    lowY,
    highY,
    bottom,
    bottomInside,
    topInside,
    top,
  };
}

export async function setup(ctx) {
  const physics = ctx.services.get("physics");
  const map = ctx.services.get("map");
  const built = [];
  const originalLocationAt = map.locationAt?.bind(map);
  const originalSurfaceAt = map.surfaceAt?.bind(map);
  const originalHeightAt = map.heightAt?.bind(map);
  const originalAcousticZoneAt = map.acousticZoneAt?.bind(map);
  const originalAcousticOcclusionBetween = map.acousticOcclusionBetween?.bind(map);

  if (!Array.isArray(map.navigationBuildings)) map.navigationBuildings = [];

  function addWall(spec) {
    const collider = physics.createWall(spec);
    map.walls?.push?.({ ...spec, collider });
    return collider;
  }

  function buildOuterWalls(entry, floor, floorDoors, profile) {
    const halfWidth = Math.abs(finite(entry.spec.width)) / 2;
    const halfDepth = Math.abs(finite(entry.spec.depth)) / 2;
    const y = finite(floor.y);
    const height = Math.max(1.8, finite(floor.height, 2.8));
    for (const side of ["north", "south", "west", "east"]) {
      const sideDoors = floorDoors.filter((door) => String(door.side ?? "east") === side);
      const length = side === "north" || side === "south"
        ? Math.abs(finite(entry.spec.width))
        : Math.abs(finite(entry.spec.depth));
      for (const segment of wallSegments(length, sideDoors)) {
        const center = (segment.start + segment.end) / 2;
        const halfSegment = (segment.end - segment.start) / 2;
        const common = {
          kind: "building-wall",
          buildingId: entry.id,
          material: floor.wallMaterial ?? entry.spec.wallMaterial ?? "concrete",
          accessibleName: "стена",
          y,
          height,
          acousticOcclusion: profile.wallOcclusion,
        };
        if (side === "north" || side === "south") {
          addWall({
            ...common,
            x: finite(entry.spec.x) + center,
            z: finite(entry.spec.z) + (side === "north" ? -halfDepth : halfDepth),
            hx: halfSegment,
            hz: WALL_THICKNESS,
          });
        } else {
          addWall({
            ...common,
            x: finite(entry.spec.x) + (side === "west" ? -halfWidth : halfWidth),
            z: finite(entry.spec.z) + center,
            hx: WALL_THICKNESS,
            hz: halfSegment,
          });
        }
      }
    }
  }

  function buildFloorSlabs(entry, floor, profile) {
    const y = finite(floor.y);
    if (y <= 0.05 && !floor.physicalFloor) return;
    const slabs = floor.slabs?.length ? floor.slabs : [{
      x: 0,
      z: 0,
      width: Math.abs(finite(entry.spec.width)),
      depth: Math.abs(finite(entry.spec.depth)),
    }];
    for (const slab of slabs) {
      const width = Math.max(0.2, Math.abs(finite(slab.width, entry.spec.width)));
      const depth = Math.max(0.2, Math.abs(finite(slab.depth, entry.spec.depth)));
      const collider = physics.createFloor({
        kind: "building-floor",
        buildingId: entry.id,
        floorId: String(floor.id),
        material: slab.material ?? floor.surface ?? "concrete",
        accessibleName: "пол",
        x: finite(entry.spec.x) + finite(slab.x),
        y,
        z: finite(entry.spec.z) + finite(slab.z),
        hx: width / 2,
        hz: depth / 2,
        thickness: Math.max(0.08, finite(slab.thickness, FLOOR_THICKNESS)),
        acousticOcclusion: profile.floorOcclusion,
      });
      map.walls?.push?.({
        kind: "building-floor",
        buildingId: entry.id,
        floorId: String(floor.id),
        material: slab.material ?? floor.surface ?? "concrete",
        x: finite(entry.spec.x) + finite(slab.x),
        y,
        z: finite(entry.spec.z) + finite(slab.z),
        hx: width / 2,
        hz: depth / 2,
        thickness: Math.max(0.08, finite(slab.thickness, FLOOR_THICKNESS)),
        acousticOcclusion: profile.floorOcclusion,
        collider,
      });
    }
  }

  function buildDoor(entry, floor, door, profile) {
    const position = doorWorldPosition(entry.spec, floor, door);
    const width = Math.max(0.8, Math.abs(finite(door.width, 2.2)));
    const side = String(door.side ?? "east");
    const horizontal = side === "north" || side === "south";
    const id = String(door.id ?? `${entry.id}-door-${entry.doors.length + 1}`);
    const collider = physics.createWall({
      kind: "building-door",
      buildingId: entry.id,
      floorId: String(floor.id),
      doorId: id,
      material: door.material ?? "wood",
      accessibleName: "дверь",
      interactionHint: "Нажмите E, чтобы открыть",
      ...position,
      hx: horizontal ? width / 2 : WALL_THICKNESS,
      hz: horizontal ? WALL_THICKNESS : width / 2,
      height: Math.max(1.8, finite(door.height, 2.5)),
      acousticOcclusion: clamp01(door.acousticOcclusion, profile.doorOcclusion),
    });
    const runtimeDoor = {
      id,
      name: String(door.name ?? "Дверь"),
      ...position,
      open: Boolean(door.open),
      lastToggleAt: -Infinity,
      buildingId: entry.id,
      floorId: String(floor.id),
      side,
      width,
      acousticOcclusion: clamp01(door.acousticOcclusion, profile.doorOcclusion),
      collider,
    };
    if (runtimeDoor.open) physics.setWallEnabled(collider, false);
    map.doors.push(runtimeDoor);
    entry.doors.push(runtimeDoor);
    return runtimeDoor;
  }

  function buildStair(entry, stair, floorById, profile) {
    const geometry = stairGeometry(entry.spec, stair, floorById);
    if (!geometry) throw new Error(`Building ${entry.id}: invalid stair ${stair.id ?? "unnamed"}`);
    const id = String(stair.id ?? `${entry.id}-stair-${entry.stairs.length + 1}`);
    const collider = physics.createRamp({
      kind: "building-stair",
      buildingId: entry.id,
      stairId: id,
      material: stair.material ?? "metal",
      accessibleName: "лестница",
      x: geometry.center.x,
      y: geometry.lowY,
      z: geometry.center.z,
      run: geometry.run,
      rise: geometry.rise,
      width: geometry.width,
      thickness: Math.max(0.08, finite(stair.thickness, 0.2)),
      risesToward: geometry.direction,
      acousticOcclusion: clamp01(stair.acousticOcclusion, profile.stairOcclusion),
    });
    const runtime = { id, ...geometry, collider, spec: stair };
    map.walls?.push?.({
      kind: "building-stair",
      buildingId: entry.id,
      stairId: id,
      material: stair.material ?? "metal",
      x: geometry.center.x,
      y: geometry.lowY,
      z: geometry.center.z,
      run: geometry.run,
      rise: geometry.rise,
      width: geometry.width,
      risesToward: geometry.direction,
      acousticOcclusion: clamp01(stair.acousticOcclusion, profile.stairOcclusion),
      collider,
    });
    entry.stairs.push(runtime);
    return runtime;
  }

  function buildCrate(entry, crate, floorById) {
    const floor = floorById.get(String(crate.floorId ?? entry.spec.floors?.[0]?.id));
    if (!floor) throw new Error(`Building ${entry.id}: crate ${crate.id ?? "unnamed"} has invalid floor`);
    const position = localPoint(entry.spec, crate, finite(floor.y) + finite(crate.yOffset));
    const runtime = {
      id: String(crate.id ?? `${entry.id}-crate-${entry.crates.length + 1}`),
      ...position,
      loot: String(crate.loot ?? "armor"),
      opened: Boolean(crate.opened),
      buildingId: entry.id,
      floorId: String(floor.id),
    };
    runtime.collider = physics.createWall({
      kind: "loot-crate",
      crateId: runtime.id,
      buildingId: entry.id,
      accessibleName: "ящик",
      material: crate.material ?? "wood",
      x: runtime.x,
      y: runtime.y,
      z: runtime.z,
      hx: Math.max(0.2, finite(crate.hx, 0.65)),
      hz: Math.max(0.2, finite(crate.hz, 0.45)),
      height: Math.max(0.2, finite(crate.height, 0.55)),
    });
    map.crates.push(runtime);
    entry.crates.push(runtime);
    return runtime;
  }

  function buildNavigation(entry, floorById) {
    const custom = entry.spec.navigation ?? {};
    const regions = custom.regions?.length
      ? custom.regions.map((region) => ({ ...region }))
      : entry.spec.floors.map((floor, index) => ({
        id: String(floor.id),
        name: String(floor.name ?? `этаж ${index + 1}`),
        priority: 10,
        bounds: floorBounds(entry.spec, floor),
      }));
    const transitions = [];

    for (const door of entry.spec.doors ?? []) {
      const floor = floorById.get(String(door.floorId ?? entry.spec.floors?.[0]?.id));
      if (!floor) continue;
      const points = doorPassagePoints(entry.spec, floor, door);
      transitions.push({
        id: `${door.id}:outside`,
        from: String(door.fromRegion ?? "outside"),
        to: String(door.toRegion ?? floor.id),
        fromPoint: points.outside,
        toPoint: points.inside,
        kind: "door",
        doorId: String(door.id),
      });
    }

    for (const stair of entry.stairs) {
      const regionId = `stair:${stair.id}`;
      const margin = Math.min(0.45, Math.max(0.12, stair.rise * 0.14));
      regions.push({
        id: regionId,
        name: String(stair.spec.name ?? "лестница"),
        priority: 100,
        bounds: {
          minX: stair.bounds.minX - STAIR_REGION_PADDING,
          maxX: stair.bounds.maxX + STAIR_REGION_PADDING,
          minZ: stair.bounds.minZ - STAIR_REGION_PADDING,
          maxZ: stair.bounds.maxZ + STAIR_REGION_PADDING,
          minY: stair.lowY + margin,
          maxY: stair.highY - margin,
        },
      });
      const lowFloor = finite(stair.fromFloor.y) <= finite(stair.toFloor.y) ? stair.fromFloor : stair.toFloor;
      const highFloor = lowFloor === stair.fromFloor ? stair.toFloor : stair.fromFloor;
      transitions.push({
        id: `${stair.id}:bottom`,
        from: String(lowFloor.id),
        to: regionId,
        fromPoint: stair.bottom,
        toPoint: stair.bottomInside,
        kind: "stair",
      });
      transitions.push({
        id: `${stair.id}:top`,
        from: regionId,
        to: String(highFloor.id),
        fromPoint: stair.topInside,
        toPoint: stair.top,
        kind: "stair",
      });
    }

    for (const transition of custom.transitions ?? []) transitions.push({ ...transition });

    const firstDoor = entry.spec.doors?.[0];
    const firstDoorFloor = firstDoor
      ? floorById.get(String(firstDoor.floorId ?? entry.spec.floors?.[0]?.id))
      : null;
    const targetPosition = custom.targetPosition
      ? localPoint(entry.spec, custom.targetPosition, finite(custom.targetPosition.y))
      : firstDoor && firstDoorFloor
        ? doorPassagePoints(entry.spec, firstDoorFloor, firstDoor).outside
        : {
          x: finite(entry.spec.x) + Math.abs(finite(entry.spec.width)) / 2 + 2,
          y: finite(entry.spec.floors?.[0]?.y),
          z: finite(entry.spec.z),
        };
    const topology = {
      id: entry.id,
      name: entry.name,
      bounds: entry.bounds,
      regions,
      transitions,
      metadata: {
        factory: true,
        targetPosition,
        targetOrder: finite(custom.targetOrder, 12),
        arriveDistance: Math.max(1, finite(custom.arriveDistance, 1)),
      },
    };
    map.navigationBuildings.push(topology);
    entry.navigation = topology;
  }

  function createBuilding(spec) {
    const id = String(spec?.id ?? "").trim();
    if (!id) throw new Error("Building factory requires an id");
    if (built.some((entry) => entry.id === id)) throw new Error(`Building already exists: ${id}`);
    if (!Array.isArray(spec.floors) || !spec.floors.length) throw new Error(`Building ${id} requires floors`);
    const entry = {
      id,
      name: String(spec.name ?? id),
      spec,
      bounds: buildingBounds(spec),
      acoustics: mergeAcoustics(spec.acoustics),
      doors: [],
      stairs: [],
      crates: [],
      navigation: null,
    };
    const floorById = floorMap(spec);

    physics.beginBatch?.();
    try {
      for (const floor of spec.floors) {
        const profile = mergeAcoustics(entry.acoustics, floor.acoustics);
        const floorDoors = (spec.doors ?? []).filter((door) => (
          String(door.floorId ?? spec.floors[0].id) === String(floor.id)
        ));
        buildOuterWalls(entry, floor, floorDoors, profile);
        buildFloorSlabs(entry, floor, profile);
      }

      for (const wall of spec.walls ?? []) {
        const floor = floorById.get(String(wall.floorId ?? spec.floors[0].id));
        if (!floor) continue;
        const profile = mergeAcoustics(entry.acoustics, floor.acoustics, wall.acoustics);
        addWall({
          kind: "building-wall",
          buildingId: id,
          floorId: String(floor.id),
          material: wall.material ?? floor.wallMaterial ?? spec.wallMaterial ?? "concrete",
          accessibleName: wall.accessibleName ?? "стена",
          x: finite(spec.x) + finite(wall.x),
          y: finite(floor.y) + finite(wall.yOffset),
          z: finite(spec.z) + finite(wall.z),
          hx: Math.max(0.05, Math.abs(finite(wall.hx, 0.2))),
          hz: Math.max(0.05, Math.abs(finite(wall.hz, 0.2))),
          height: Math.max(0.3, finite(wall.height, floor.height ?? 2.8)),
          acousticOcclusion: clamp01(wall.acousticOcclusion, profile.wallOcclusion),
        });
      }

      for (const door of spec.doors ?? []) {
        const floor = floorById.get(String(door.floorId ?? spec.floors[0].id));
        if (!floor) throw new Error(`Building ${id}: door ${door.id ?? "unnamed"} has invalid floor`);
        buildDoor(entry, floor, door, mergeAcoustics(entry.acoustics, floor.acoustics, door.acoustics));
      }
      for (const stair of spec.stairs ?? []) {
        buildStair(entry, stair, floorById, mergeAcoustics(entry.acoustics, stair.acoustics));
      }
      for (const crate of spec.crates ?? []) buildCrate(entry, crate, floorById);
    } finally {
      physics.endBatch?.();
    }

    buildNavigation(entry, floorById);
    built.push(entry);
    return entry;
  }

  function buildingAt(position) {
    return built.find((entry) => pointInside(position, entry.bounds, 0.12)) ?? null;
  }

  function stairAt(entry, position) {
    if (!entry || !position) return null;
    return entry.stairs.find((stair) => (
      finite(position.x) >= stair.bounds.minX - 0.2
      && finite(position.x) <= stair.bounds.maxX + 0.2
      && finite(position.z) >= stair.bounds.minZ - 0.2
      && finite(position.z) <= stair.bounds.maxZ + 0.2
      && finite(position.y) > stair.lowY + 0.12
      && finite(position.y) < stair.highY - 0.12
    )) ?? null;
  }

  function floorAt(entry, position) {
    if (!entry || !position) return null;
    return entry.spec.floors
      .map((floor) => ({ floor, bounds: floorBounds(entry.spec, floor) }))
      .filter(({ bounds }) => pointInside(position, bounds, 0.12))
      .sort((a, b) => Math.abs(finite(position.y) - finite(a.floor.y)) - Math.abs(finite(position.y) - finite(b.floor.y)))[0]?.floor
      ?? null;
  }

  function roomAt(entry, floor, position) {
    if (!entry || !floor || !position) return null;
    return (floor.rooms ?? []).find((room) => pointInside(position, roomBounds(entry.spec, floor, room), 0.08)) ?? null;
  }

  function acousticProfileAt(position) {
    const entry = buildingAt(position);
    if (!entry) return {
      zone: originalAcousticZoneAt?.(position) ?? "outdoor",
      reverbMix: 0,
      wallOcclusion: DEFAULT_ACOUSTICS.wallOcclusion,
      doorOcclusion: DEFAULT_ACOUSTICS.doorOcclusion,
      floorOcclusion: DEFAULT_ACOUSTICS.floorOcclusion,
      stairOcclusion: DEFAULT_ACOUSTICS.stairOcclusion,
    };
    const stair = stairAt(entry, position);
    const floor = floorAt(entry, position);
    const room = roomAt(entry, floor, position);
    const stairSpec = stair?.spec ?? null;
    const merged = mergeAcoustics(
      entry.acoustics,
      floor?.acoustics,
      room?.acoustics,
      stairSpec?.acoustics,
    );
    if (!merged.zone || merged.zone === "indoor") {
      merged.zone = stair
        ? `${entry.id}-stairs`
        : room?.id
          ? `${entry.id}-${room.id}`
          : floor?.id
            ? `${entry.id}-${floor.id}`
            : entry.id;
    }
    return merged;
  }

  function locationAt(position) {
    const entry = buildingAt(position);
    if (!entry) return originalLocationAt?.(position) ?? "Карта";
    const stair = stairAt(entry, position);
    if (stair) return `${entry.name}, ${stair.spec.name ?? "лестница"}`;
    const floor = floorAt(entry, position);
    const room = roomAt(entry, floor, position);
    if (room) return `${entry.name}, ${room.name ?? room.id}`;
    if (floor) return `${entry.name}, ${floor.name ?? floor.id}`;
    return entry.name;
  }

  function surfaceAt(position) {
    const entry = buildingAt(position);
    if (!entry) return originalSurfaceAt?.(position) ?? map.defaultSurface ?? "forest";
    const stair = stairAt(entry, position);
    if (stair) return stair.spec.surface ?? stair.spec.material ?? "metal";
    const floor = floorAt(entry, position);
    return floor?.surface ?? entry.spec.surface ?? "concrete";
  }

  function heightAt(position) {
    const entry = buildingAt(position);
    if (!entry) return originalHeightAt?.(position) ?? 0;
    const stair = stairAt(entry, position);
    if (stair) {
      const direction = stair.direction;
      let progress = 0;
      if (direction === "east") progress = (finite(position.x) - stair.bounds.minX) / Math.max(0.01, stair.run);
      else if (direction === "west") progress = (stair.bounds.maxX - finite(position.x)) / Math.max(0.01, stair.run);
      else if (direction === "south") progress = (finite(position.z) - stair.bounds.minZ) / Math.max(0.01, stair.run);
      else progress = (stair.bounds.maxZ - finite(position.z)) / Math.max(0.01, stair.run);
      return stair.lowY + Math.max(0, Math.min(1, progress)) * stair.rise;
    }
    const floor = floorAt(entry, position);
    return finite(floor?.y);
  }

  function acousticOcclusionBetween(listener, source) {
    if (!listener || !source || typeof physics.raycastWorld !== "function") {
      return originalAcousticOcclusionBetween?.(listener, source) ?? 0;
    }
    const origin = { x: finite(listener.x), y: finite(listener.y) + 1, z: finite(listener.z) };
    const target = { x: finite(source.x), y: finite(source.y) + 0.65, z: finite(source.z) };
    const direction = { x: target.x - origin.x, y: target.y - origin.y, z: target.z - origin.z };
    const distance = Math.hypot(direction.x, direction.y, direction.z);
    if (distance >= 0.2) {
      const hit = physics.raycastWorld(origin, direction, Math.max(0, distance - 0.25));
      const custom = Number(hit?.worldObject?.acousticOcclusion);
      if (Number.isFinite(custom)) return clamp01(custom);
    }
    return originalAcousticOcclusionBetween?.(listener, source) ?? 0;
  }

  map.locationAt = locationAt;
  map.surfaceAt = surfaceAt;
  map.heightAt = heightAt;
  map.acousticProfileAt = acousticProfileAt;
  map.acousticZoneAt = (position) => acousticProfileAt(position).zone;
  map.acousticOcclusionBetween = acousticOcclusionBetween;

  for (const spec of BATTLE_ROYALE_BUILDINGS) createBuilding(spec);

  ctx.services.provide("building-factory", {
    createBuilding,
    buildingAt,
    floorAt(position) {
      const entry = buildingAt(position);
      return entry ? floorAt(entry, position) : null;
    },
    roomAt(position) {
      const entry = buildingAt(position);
      if (!entry) return null;
      const floor = floorAt(entry, position);
      return roomAt(entry, floor, position);
    },
    acousticProfileAt,
    list() {
      return built.map((entry) => ({
        id: entry.id,
        name: entry.name,
        doors: entry.doors.length,
        stairs: entry.stairs.length,
        crates: entry.crates.length,
        floors: entry.spec.floors.map((floor) => String(floor.id)),
        acousticZones: entry.spec.floors.flatMap((floor) => [
          mergeAcoustics(entry.acoustics, floor.acoustics).zone,
          ...(floor.rooms ?? []).map((room) => mergeAcoustics(entry.acoustics, floor.acoustics, room.acoustics).zone),
        ]),
      }));
    },
  });
}
