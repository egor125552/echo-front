export const WORLD_HALF_SIZE = 400;
export const BOUNDARY_HALF_THICKNESS = 1;
export const UPPER_FLOOR_Y = 3.2;
export const DEFAULT_GROUND_SURFACE = "forest";
export const BASE_SPAWN_RADIUS = 125;
export const PLAYER_SPAWN_CLEARANCE = 60;
export const BUILDING_CENTER_X = 60;
export const BUILDING_CENTER_Z = 0;

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

// Keep the staircase centered in its original east-side warehouse position.
// The physical run is a little longer around the same x=70,z=0 centre so the
// character controller sees a normal walkable slope instead of a near-wall.
// East is the bottom facing the entrance; west is the top on the second floor.
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

export const manifest = {
  id: "map-test-arena",
  version: "4.1.1",
  requires: ["rapier-physics"],
  capabilities: ["services.consume", "services.provide", "events.emit"],
};

function insideRect(position, rect, padding = 0) {
  return position.x >= rect.minX - padding && position.x <= rect.maxX + padding
    && position.z >= rect.minZ - padding && position.z <= rect.maxZ + padding;
}

function distance3(a, b) {
  return Math.hypot(
    (a.x ?? 0) - (b.x ?? 0),
    (a.y ?? 0) - (b.y ?? 0),
    (a.z ?? 0) - (b.z ?? 0),
  );
}

export function stairHeightAt(position) {
  if (!insideRect(position, STAIR)) return null;
  const progress = Math.max(0, Math.min(
    1,
    (STAIR.maxX - position.x) / (STAIR.maxX - STAIR.minX),
  ));
  return progress * UPPER_FLOOR_Y;
}

// Compatibility/diagnostic helper only. Runtime vertical motion is resolved by
// Rapier colliders in the movement plugin and never reads this function.
export function heightAt(position) {
  const stair = stairHeightAt(position);
  if (stair != null) return stair;
  if (!insideRect(position, BUILDING)) return 0;
  return Number(position.currentY ?? position.y) > UPPER_FLOOR_Y / 2 ? UPPER_FLOOR_Y : 0;
}

export function surfaceAt(position) {
  if (insideRect(position, STAIR)) return "metal";
  if (insideRect(position, BUILDING)) return "concrete";
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
  if (!insideRect(position, BUILDING)) return "outdoor";
  if (insideRect(position, STAIR)) return "warehouse-stairs";
  return Number(position.y ?? position.currentY) > UPPER_FLOOR_Y / 2
    ? "warehouse-upper"
    : "warehouse-ground";
}

export function locationAt(position) {
  if (insideRect(position, STAIR)) return "Склад, лестница";
  if (insideRect(position, BUILDING)) {
    return Number(position.y ?? position.currentY) > UPPER_FLOOR_Y / 2
      ? "Склад, второй этаж"
      : "Склад, первый этаж";
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

function generatedSpawn(index) {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const ring = index % 96;
  let angle = ring * golden;
  const radius = BASE_SPAWN_RADIUS + ((ring * 47) % 215);
  let x = Math.cos(angle) * radius;
  let z = Math.sin(angle) * radius;

  if (ring !== 0 && Math.hypot(x - BASE_SPAWN_RADIUS, z) < PLAYER_SPAWN_CLEARANCE) {
    angle += ring % 2 === 0 ? -0.7 : 0.7;
    x = Math.cos(angle) * radius;
    z = Math.sin(angle) * radius;
  }

  return {
    x,
    y: 0,
    z,
    angle: Math.atan2(-x, z),
  };
}

export async function setup(ctx) {
  const physics = ctx.services.get("physics");
  physics.beginBatch?.();

  const walls = [];
  const addWall = (spec) => {
    const collider = physics.createWall(spec);
    walls.push({ ...spec, collider });
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
    // Split the upper slab around the actual stair opening x=67..73,z=-2..2.
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
      collider: physics.createWall({
        kind: "building-door",
        doorId: "warehouse-front-door",
        material: "metal",
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
      collider: physics.createWall({
        kind: "building-door",
        doorId: "warehouse-upper-room-door",
        material: "metal",
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
      return { kind: "door", speech: "Здесь дверь. Нажмите E, чтобы открыть" };
    }
    return blockage;
  }

  function interact({ entityId, x, y = 0, z }) {
    const actor = { x, y, z };
    const nearbyDoor = doors
      .map((door) => ({ door, distance: distance3(actor, door) }))
      .filter((entry) => entry.distance <= 2.4)
      .sort((a, b) => a.distance - b.distance)[0];

    if (nearbyDoor) {
      const door = nearbyDoor.door;
      door.open = !door.open;
      physics.setWallEnabled(door.collider, !door.open);
      const payload = {
        entityId,
        doorId: door.id,
        name: door.name,
        open: door.open,
        x: door.x,
        y: door.y,
        z: door.z,
      };
      ctx.events.emit("world:door", payload);
      return { type: "door", ...payload };
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