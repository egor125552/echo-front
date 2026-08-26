export const WORLD_HALF_SIZE = 400;
export const BOUNDARY_HALF_THICKNESS = 1;
export const UPPER_FLOOR_Y = 3.2;
export const DEFAULT_GROUND_SURFACE = "forest";
export const BASE_SPAWN_RADIUS = 125;
export const PLAYER_SPAWN_CLEARANCE = 60;
export const MIN_STARTING_SEPARATION = 38;
export const BUILDING_CENTER_X = 60;
export const BUILDING_CENTER_Z = 0;
export const DOOR_TOGGLE_DEBOUNCE_MS = 450;
export const STAIR_ROUTE_EDGE_CLEARANCE = 0.36;
export const STAIR_ROUTE_CAPTURE_HALF_WIDTH = 0.45;

export const BUILDING = Object.freeze({
  id: "warehouse",
  minX: BUILDING_CENTER_X - 15,
  maxX: BUILDING_CENTER_X + 15,
  minZ: BUILDING_CENTER_Z - 12,
  maxZ: BUILDING_CENTER_Z + 12,
  upperY: UPPER_FLOOR_Y,
});

export const WAREHOUSE_FRONT_DOOR = Object.freeze({
  x: BUILDING.maxX,
  y: 0,
  z: BUILDING_CENTER_Z,
});

export const STAIR = Object.freeze({
  minX: BUILDING_CENTER_X + 7,
  maxX: BUILDING_CENTER_X + 13,
  minZ: BUILDING_CENTER_Z - 2,
  maxZ: BUILDING_CENTER_Z + 2,
});

const SURFACE_VARIANTS = Object.freeze({
  forest: 3,
  concrete: 8,
  metal: 8,
  stone: 6,
  sand: 6,
});

const SPAWN_RADII = Object.freeze([125, 190, 255, 320, 385]);
const FIRST_RING_SKIPS = new Set([1, 9, 11, 19]);

export const manifest = {
  id: "map-test-arena",
  version: "4.2.3",
  requires: ["rapier-physics"],
  capabilities: ["services.consume", "services.provide", "events.emit"],
};

function insideRect(position, rect, padding = 0) {
  return position.x >= rect.minX - padding && position.x <= rect.maxX + padding
    && position.z >= rect.minZ - padding && position.z <= rect.maxZ + padding;
}

function distance2(a, b) {
  return Math.hypot((a.x ?? 0) - (b.x ?? 0), (a.z ?? 0) - (b.z ?? 0));
}

function distance3(a, b) {
  return Math.hypot(
    (a.x ?? 0) - (b.x ?? 0),
    (a.y ?? 0) - (b.y ?? 0),
    (a.z ?? 0) - (b.z ?? 0),
  );
}

function isUpper(position) {
  return Number(position?.y ?? position?.currentY) > UPPER_FLOOR_Y / 2;
}

function insideBuilding(position, padding = 0) {
  return insideRect(position, BUILDING, padding);
}

export function stairHeightAt(position) {
  if (!insideRect(position, STAIR)) return null;
  const progress = Math.max(0, Math.min(
    1,
    (STAIR.maxX - position.x) / (STAIR.maxX - STAIR.minX),
  ));
  return progress * UPPER_FLOOR_Y;
}

export function isOnStair(position, tolerance = 0.65) {
  const expected = stairHeightAt(position);
  if (expected == null) return false;
  const actual = Number(position?.y ?? position?.currentY) || 0;
  return Math.abs(actual - expected) <= tolerance;
}

// Compatibility/diagnostic helper only. Runtime vertical motion is resolved by Rapier.
export function heightAt(position) {
  const stair = stairHeightAt(position);
  if (stair != null) return stair;
  if (!insideBuilding(position)) return 0;
  return isUpper(position) ? UPPER_FLOOR_Y : 0;
}

export function surfaceAt(position) {
  if (isOnStair(position)) return "metal";
  if (insideBuilding(position)) return "concrete";
  if (
    position.x >= BUILDING_CENTER_X - 22
    && position.x <= BUILDING_CENTER_X + 22
    && position.z >= BUILDING_CENTER_Z - 20
    && position.z <= BUILDING_CENTER_Z + 20
  ) return "stone";
  if (position.x <= -145 && position.x >= -235 && position.z >= 90 && position.z <= 190) return "sand";
  return DEFAULT_GROUND_SURFACE;
}

export function acousticZoneAt(position) {
  if (!insideBuilding(position)) return "outdoor";
  if (isOnStair(position)) return "warehouse-stairs";
  return isUpper(position) ? "warehouse-upper" : "warehouse-ground";
}

export function locationAt(position) {
  if (isOnStair(position)) return "Склад, лестница";
  if (insideBuilding(position)) {
    return isUpper(position) ? "Склад, второй этаж" : "Склад, первый этаж";
  }
  if (surfaceAt(position) === "stone") return "Каменная площадка у склада";
  if (surfaceAt(position) === "sand") return "Песчаная низина";
  return "Лес";
}

export function describeBlockedMove(position, attempted, moved) {
  const attemptedDistance = Math.hypot(attempted.x, attempted.z);
  if (attemptedDistance < 0.01) return null;
  const alongAttempt = (moved.x * attempted.x + moved.z * attempted.z) / attemptedDistance;
  const lostDistance = attemptedDistance - Math.max(0, alongAttempt);
  if (lostDistance < 0.035) return null;

  const threshold = WORLD_HALF_SIZE - 3;
  if (
    (position.x >= threshold && attempted.x > 0)
    || (position.x <= -threshold && attempted.x < 0)
    || (position.z >= threshold && attempted.z > 0)
    || (position.z <= -threshold && attempted.z < 0)
  ) {
    return { kind: "world-boundary", speech: "Здесь пройти нельзя. Граница мира" };
  }
  return { kind: "wall", speech: "Здесь пройти нельзя. Стена" };
}

function buildSpawnPoints() {
  const points = [];
  for (let ring = 0; ring < SPAWN_RADII.length; ring += 1) {
    const radius = SPAWN_RADII[ring];
    const offset = ring % 2 ? Math.PI / 20 : 0;
    for (let slot = 0; slot < 20; slot += 1) {
      if (ring === 0 && FIRST_RING_SKIPS.has(slot)) continue;
      const angle = offset + (slot * Math.PI * 2) / 20;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      points.push(Object.freeze({ x, y: 0, z, angle: Math.atan2(-x, z) }));
    }
  }
  return Object.freeze(points);
}

const SPAWN_POINTS = buildSpawnPoints();

function generatedSpawn(index) {
  const point = SPAWN_POINTS[index % SPAWN_POINTS.length];
  return { ...point };
}

function frontDoorWaypoint(from, entering) {
  const approachX = entering ? BUILDING.maxX + 1.3 : BUILDING.maxX - 1.3;
  const crossX = entering ? BUILDING.maxX - 1.3 : BUILDING.maxX + 1.3;
  const approach = { x: approachX, y: 0, z: BUILDING_CENTER_Z };
  const nearApproach = distance2(from, approach) <= 1.35;
  return {
    ...(nearApproach ? { x: crossX, y: 0, z: BUILDING_CENTER_Z } : approach),
    doorId: "warehouse-front-door",
    kind: "door",
  };
}

function upperDoorWaypoint(from, target) {
  const fromEast = from.x >= BUILDING_CENTER_X;
  const targetEast = target.x >= BUILDING_CENTER_X;
  if (fromEast === targetEast) return null;
  const approachX = fromEast ? BUILDING_CENTER_X + 1.3 : BUILDING_CENTER_X - 1.3;
  const crossX = fromEast ? BUILDING_CENTER_X - 1.3 : BUILDING_CENTER_X + 1.3;
  const approach = { x: approachX, y: UPPER_FLOOR_Y, z: BUILDING_CENTER_Z };
  const nearApproach = distance2(from, approach) <= 1.35;
  return {
    ...(nearApproach ? { x: crossX, y: UPPER_FLOOR_Y, z: BUILDING_CENTER_Z } : approach),
    doorId: "warehouse-upper-room-door",
    kind: "door",
  };
}

function centeredForStairCapture(from) {
  const z = Number(from?.z);
  return Number.isFinite(z)
    && Math.abs(z - BUILDING_CENTER_Z) <= STAIR_ROUTE_CAPTURE_HALF_WIDTH;
}

function ascendingStairCaptured(from) {
  return insideRect(from, STAIR, 0.05) && Number(from?.y ?? 0) > 0.08;
}

function descendingStairCaptured(from) {
  return insideRect(from, STAIR, 0.05)
    && Number(from?.y ?? UPPER_FLOOR_Y) < UPPER_FLOOR_Y - 0.08;
}

function midStairTraversal(from) {
  const y = Number(from?.y ?? 0);
  return insideRect(from, STAIR, 0.05)
    && y > 0.15
    && y < UPPER_FLOOR_Y - 0.15;
}

function stairWaypoint(from, goingUp) {
  if (goingUp) {
    const bottom = { x: STAIR.maxX - 0.5, y: 0, z: BUILDING_CENTER_Z };
    const nearRamp = insideRect(from, STAIR, 0.05) || distance2(from, bottom) <= 1.25;
    const captured = nearRamp && (ascendingStairCaptured(from) || centeredForStairCapture(from));
    if (captured) {
      return { x: STAIR.minX - 0.5, y: UPPER_FLOOR_Y, z: BUILDING_CENTER_Z, kind: "stair" };
    }
    return { ...bottom, kind: "stair" };
  }
  const top = { x: STAIR.minX - 0.5, y: UPPER_FLOOR_Y, z: BUILDING_CENTER_Z };
  const nearRamp = insideRect(from, STAIR, 0.05) || distance2(from, top) <= 1.25;
  const captured = nearRamp && (descendingStairCaptured(from) || centeredForStairCapture(from));
  if (captured) {
    return { x: STAIR.maxX + 0.5, y: 0, z: BUILDING_CENTER_Z, kind: "stair" };
  }
  return { ...top, kind: "stair" };
}

export function navigationWaypoint(from, target) {
  if (!from || !target) return null;
  const fromInside = insideBuilding(from, 0.1);
  const targetInside = insideBuilding(target, 0.1);
  const fromUpper = isUpper(from);
  const targetUpper = isUpper(target);

  if (!fromInside && targetInside) return frontDoorWaypoint(from, true);

  if (fromInside && !targetInside) {
    if (fromUpper || (insideRect(from, STAIR, 0.45) && (from.y ?? 0) > 0.4)) {
      return stairWaypoint(from, false);
    }
    return frontDoorWaypoint(from, false);
  }

  if (fromInside && targetInside) {
    if (midStairTraversal(from)) return stairWaypoint(from, targetUpper);
    if (fromUpper !== targetUpper) return stairWaypoint(from, targetUpper);
    if (fromUpper && targetUpper) return upperDoorWaypoint(from, target);
  }

  return null;
}

export async function setup(ctx) {
  const physics = ctx.services.get("physics");
  physics.beginBatch?.();

  const walls = [];
  const addWall = (spec) => {
    const enriched = { ...spec };
    if (!enriched.accessibleName && enriched.kind === "building-wall") enriched.accessibleName = "стена";
    if (!enriched.accessibleName && enriched.kind === "world-boundary") enriched.accessibleName = "граница мира";
    const collider = physics.createWall(enriched);
    walls.push({ ...enriched, collider });
    return collider;
  };

  let groundCollider = null;
  try {
    groundCollider = physics.createFloor({
      kind: "ground",
      material: DEFAULT_GROUND_SURFACE,
      x: 0,
      y: 0,
      z: 0,
      hx: WORLD_HALF_SIZE,
      hz: WORLD_HALF_SIZE,
      thickness: 0.4,
    });

    addWall({ kind: "world-boundary", side: "north", x: 0, z: -WORLD_HALF_SIZE, hx: WORLD_HALF_SIZE, hz: BOUNDARY_HALF_THICKNESS, height: 10 });
    addWall({ kind: "world-boundary", side: "south", x: 0, z: WORLD_HALF_SIZE, hx: WORLD_HALF_SIZE, hz: BOUNDARY_HALF_THICKNESS, height: 10 });
    addWall({ kind: "world-boundary", side: "west", x: -WORLD_HALF_SIZE, z: 0, hx: BOUNDARY_HALF_THICKNESS, hz: WORLD_HALF_SIZE, height: 10 });
    addWall({ kind: "world-boundary", side: "east", x: WORLD_HALF_SIZE, z: 0, hx: BOUNDARY_HALF_THICKNESS, hz: WORLD_HALF_SIZE, height: 10 });

    addWall({ kind: "building-wall", material: "concrete", x: BUILDING.minX, z: BUILDING_CENTER_Z, hx: 0.3, hz: 12, height: 2.8 });
    addWall({ kind: "building-wall", material: "concrete", x: BUILDING.maxX, z: BUILDING_CENTER_Z - 6.6, hx: 0.3, hz: 5.4, height: 2.8 });
    addWall({ kind: "building-wall", material: "concrete", x: BUILDING.maxX, z: BUILDING_CENTER_Z + 6.6, hx: 0.3, hz: 5.4, height: 2.8 });
    addWall({ kind: "building-wall", material: "concrete", x: BUILDING_CENTER_X, z: BUILDING.minZ, hx: 15, hz: 0.3, height: 2.8 });
    addWall({ kind: "building-wall", material: "concrete", x: BUILDING_CENTER_X, z: BUILDING.maxZ, hx: 15, hz: 0.3, height: 2.8 });

    const floorBottomY = UPPER_FLOOR_Y - 0.18;
    addWall({ kind: "building-floor", material: "concrete", x: BUILDING_CENTER_X - 4, y: floorBottomY, z: BUILDING_CENTER_Z, hx: 11, hz: 12, height: 0.18 });
    addWall({ kind: "building-floor", material: "concrete", x: BUILDING_CENTER_X + 14, y: floorBottomY, z: BUILDING_CENTER_Z, hx: 1, hz: 12, height: 0.18 });
    addWall({ kind: "building-floor", material: "concrete", x: BUILDING_CENTER_X + 10, y: floorBottomY, z: BUILDING_CENTER_Z - 7, hx: 3, hz: 5, height: 0.18 });
    addWall({ kind: "building-floor", material: "concrete", x: BUILDING_CENTER_X + 10, y: floorBottomY, z: BUILDING_CENTER_Z + 7, hx: 3, hz: 5, height: 0.18 });

    const stairSpec = {
      kind: "building-stair",
      material: "metal",
      x: (STAIR.minX + STAIR.maxX) / 2,
      y: 0,
      z: (STAIR.minZ + STAIR.maxZ) / 2,
      run: STAIR.maxX - STAIR.minX,
      rise: UPPER_FLOOR_Y,
      width: STAIR.maxZ - STAIR.minZ,
      thickness: 0.2,
      risesToward: "west",
    };
    const stairCollider = physics.createRamp(stairSpec);
    walls.push({ ...stairSpec, collider: stairCollider });

    addWall({ kind: "building-wall", material: "concrete", x: BUILDING.minX, y: UPPER_FLOOR_Y, z: BUILDING_CENTER_Z, hx: 0.3, hz: 12, height: 2.8 });
    addWall({ kind: "building-wall", material: "concrete", x: BUILDING.maxX, y: UPPER_FLOOR_Y, z: BUILDING_CENTER_Z, hx: 0.3, hz: 12, height: 2.8 });
    addWall({ kind: "building-wall", material: "concrete", x: BUILDING_CENTER_X, y: UPPER_FLOOR_Y, z: BUILDING.minZ, hx: 15, hz: 0.3, height: 2.8 });
    addWall({ kind: "building-wall", material: "concrete", x: BUILDING_CENTER_X, y: UPPER_FLOOR_Y, z: BUILDING.maxZ, hx: 15, hz: 0.3, height: 2.8 });
    addWall({ kind: "building-wall", material: "concrete", x: BUILDING_CENTER_X, y: UPPER_FLOOR_Y, z: BUILDING_CENTER_Z + 6.6, hx: 0.25, hz: 5.4, height: 2.8 });
    addWall({ kind: "building-wall", material: "concrete", x: BUILDING_CENTER_X, y: UPPER_FLOOR_Y, z: BUILDING_CENTER_Z - 6.6, hx: 0.25, hz: 5.4, height: 2.8 });
  } finally {
    physics.endBatch?.();
  }

  const doors = [
    {
      id: "warehouse-front-door",
      name: "Входная дверь склада",
      ...WAREHOUSE_FRONT_DOOR,
      open: false,
      lastToggleAt: -Infinity,
      collider: physics.createWall({
        kind: "building-door",
        doorId: "warehouse-front-door",
        material: "metal",
        accessibleName: "дверь",
        interactionHint: "Нажмите E, чтобы открыть",
        ...WAREHOUSE_FRONT_DOOR,
        hx: 0.25,
        hz: 1.2,
        height: 2.6,
      }),
    },
    {
      id: "warehouse-upper-room-door",
      name: "Дверь комнаты второго этажа",
      x: BUILDING_CENTER_X,
      y: UPPER_FLOOR_Y,
      z: BUILDING_CENTER_Z,
      open: false,
      lastToggleAt: -Infinity,
      collider: physics.createWall({
        kind: "building-door",
        doorId: "warehouse-upper-room-door",
        material: "metal",
        accessibleName: "дверь",
        interactionHint: "Нажмите E, чтобы открыть",
        x: BUILDING_CENTER_X,
        y: UPPER_FLOOR_Y,
        z: BUILDING_CENTER_Z,
        hx: 0.25,
        hz: 1.2,
        height: 2.6,
      }),
    },
  ];

  const crates = [
    { id: "crate-ground-rifle", x: BUILDING_CENTER_X - 8.5, y: 0, z: BUILDING_CENTER_Z - 2, loot: "rifle", opened: false },
    { id: "crate-ground-armor", x: BUILDING_CENTER_X + 11, y: 0, z: BUILDING_CENTER_Z + 3, loot: "armor", opened: false },
    { id: "crate-upper-armor", x: BUILDING_CENTER_X + 5, y: UPPER_FLOOR_Y, z: BUILDING_CENTER_Z - 9, loot: "armor", opened: false },
    { id: "crate-upper-rifle", x: BUILDING_CENTER_X + 5, y: UPPER_FLOOR_Y, z: BUILDING_CENTER_Z + 9, loot: "rifle", opened: false },
  ];

  let spawnIndex = 0;

  function acousticOcclusionBetween(listener, source) {
    if (typeof physics.raycastWorld !== "function") return 0;
    const origin = {
      x: Number(listener?.x) || 0,
      y: (Number(listener?.y) || 0) + 1,
      z: Number(listener?.z) || 0,
    };
    const target = {
      x: Number(source?.x) || 0,
      y: (Number(source?.y) || 0) + 0.65,
      z: Number(source?.z) || 0,
    };
    const direction = {
      x: target.x - origin.x,
      y: target.y - origin.y,
      z: target.z - origin.z,
    };
    const distance = Math.hypot(direction.x, direction.y, direction.z);
    if (distance < 0.2) return 0;
    const hit = physics.raycastWorld(origin, direction, Math.max(0, distance - 0.25));
    if (!hit) return 0;
    const kind = hit.worldObject?.kind;
    if (kind === "ground") return 0;
    if (kind === "building-door") return 0.92;
    if (kind === "building-floor") return 0.88;
    if (kind === "building-wall") return 0.82;
    if (kind === "building-stair") return 0.34;
    if (kind === "world-boundary") return 0.9;
    return 0.55;
  }

  function describeBlockedMoveWithObjects(position, attempted, moved) {
    const blockage = describeBlockedMove(position, attempted, moved);
    if (!blockage || blockage.kind === "world-boundary") return blockage;

    const closedDoor = doors.find((door) => (
      !door.open
      && Math.abs((position.y ?? 0) - (door.y ?? 0)) <= 1.6
      && Math.abs(position.x - door.x) <= 1.25
      && Math.abs(position.z - door.z) <= 1.8
    ));
    if (closedDoor) {
      return {
        kind: "building-door",
        objectId: closedDoor.id,
        objectName: "дверь",
        speech: "Здесь дверь. Нажмите E, чтобы открыть",
      };
    }
    return blockage;
  }

  function setDoorOpen(doorId, open, entityId = null, now = Date.now()) {
    const door = doors.find((entry) => entry.id === doorId);
    if (!door) return false;
    const desired = Boolean(open);
    if (door.open === desired) return false;
    door.open = desired;
    door.lastToggleAt = now;
    physics.setWallEnabled(door.collider, !door.open);
    ctx.events.emit("world:door", {
      entityId,
      doorId: door.id,
      name: door.name,
      open: door.open,
      x: door.x,
      y: door.y,
      z: door.z,
    });
    return true;
  }

  function interact({ entityId, x, y = 0, z, now = Date.now() }) {
    const actor = { x, y, z };
    const nearbyDoor = doors
      .map((door) => ({ door, distance: distance3(actor, door) }))
      .filter((entry) => entry.distance <= 2.4)
      .sort((a, b) => a.distance - b.distance)[0];

    if (nearbyDoor) {
      const door = nearbyDoor.door;
      if (now - door.lastToggleAt < DOOR_TOGGLE_DEBOUNCE_MS) {
        return {
          type: "door",
          entityId,
          doorId: door.id,
          name: door.name,
          open: door.open,
          ignored: true,
          x: door.x,
          y: door.y,
          z: door.z,
        };
      }
      setDoorOpen(door.id, !door.open, entityId, now);
      return {
        type: "door",
        entityId,
        doorId: door.id,
        name: door.name,
        open: door.open,
        x: door.x,
        y: door.y,
        z: door.z,
      };
    }

    const nearbyCrate = crates
      .map((crate) => ({ crate, distance: distance3(actor, crate) }))
      .filter((entry) => !entry.crate.opened && entry.distance <= 2)
      .sort((a, b) => a.distance - b.distance)[0];
    if (!nearbyCrate) return null;

    const crate = nearbyCrate.crate;
    crate.opened = true;
    const payload = {
      entityId,
      crateId: crate.id,
      loot: crate.loot,
      x: crate.x,
      y: crate.y,
      z: crate.z,
    };
    ctx.events.emit("loot:opened", payload);
    return { type: "crate", ...payload };
  }

  ctx.services.provide("map", {
    id: "battle-royale-wilderness",
    mode: "battle-royale",
    halfSize: WORLD_HALF_SIZE,
    walls,
    doors,
    crates,
    building: BUILDING,
    groundCollider,
    defaultSurface: DEFAULT_GROUND_SURFACE,
    describeBlockedMove: describeBlockedMoveWithObjects,
    surfaceAt,
    heightAt,
    acousticZoneAt,
    acousticOcclusionBetween,
    locationAt,
    navigationWaypoint,
    setDoorOpen,
    interact,
    footstepVariantCount(surface) {
      return SURFACE_VARIANTS[surface] ?? 3;
    },
    nextSpawn() {
      const spawn = generatedSpawn(spawnIndex);
      spawnIndex += 1;
      return spawn;
    },
  });
}