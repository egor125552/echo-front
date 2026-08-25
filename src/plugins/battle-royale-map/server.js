export const WORLD_HALF_SIZE = 400;
export const BOUNDARY_HALF_THICKNESS = 1;
export const UPPER_FLOOR_Y = 3.2;
export const DEFAULT_GROUND_SURFACE = "forest";
export const BASE_SPAWN_RADIUS = 125;
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

export const STAIR = Object.freeze({
  minX: BUILDING_CENTER_X + 8,
  maxX: BUILDING_CENTER_X + 12,
  minZ: BUILDING_CENTER_Z - 8,
  maxZ: BUILDING_CENTER_Z + 8,
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
  version: "3.1.0",
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
  const progress = Math.max(0, Math.min(1, (STAIR.maxZ - position.z) / (STAIR.maxZ - STAIR.minZ)));
  return progress * UPPER_FLOOR_Y;
}

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
  const angle = ring * golden;
  const radius = BASE_SPAWN_RADIUS + ((ring * 47) % 215);
  const x = Math.cos(angle) * radius;
  const z = Math.sin(angle) * radius;
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

  try {
    addWall({ kind: "world-boundary", side: "north", x: 0, z: -WORLD_HALF_SIZE, hx: WORLD_HALF_SIZE, hz: BOUNDARY_HALF_THICKNESS, height: 10 });
    addWall({ kind: "world-boundary", side: "south", x: 0, z: WORLD_HALF_SIZE, hx: WORLD_HALF_SIZE, hz: BOUNDARY_HALF_THICKNESS, height: 10 });
    addWall({ kind: "world-boundary", side: "west", x: -WORLD_HALF_SIZE, z: 0, hx: BOUNDARY_HALF_THICKNESS, hz: WORLD_HALF_SIZE, height: 10 });
    addWall({ kind: "world-boundary", side: "east", x: WORLD_HALF_SIZE, z: 0, hx: BOUNDARY_HALF_THICKNESS, hz: WORLD_HALF_SIZE, height: 10 });

    // Ground-floor warehouse shell. The east wall faces the first human spawn and
    // leaves a 2.4 m entrance exactly on the straight-ahead path.
    addWall({ kind: "building-wall", x: BUILDING.minX, z: BUILDING_CENTER_Z, hx: 0.3, hz: 12, height: 2.8 });
    addWall({ kind: "building-wall", x: BUILDING.maxX, z: BUILDING_CENTER_Z - 6.6, hx: 0.3, hz: 5.4, height: 2.8 });
    addWall({ kind: "building-wall", x: BUILDING.maxX, z: BUILDING_CENTER_Z + 6.6, hx: 0.3, hz: 5.4, height: 2.8 });
    addWall({ kind: "building-wall", x: BUILDING_CENTER_X, z: BUILDING.minZ, hx: 15, hz: 0.3, height: 2.8 });
    addWall({ kind: "building-wall", x: BUILDING_CENTER_X, z: BUILDING.maxZ, hx: 15, hz: 0.3, height: 2.8 });

    // A thin physical second-floor slab blocks shots and line of sight between floors.
    // It is split into four pieces so the metal stairwell remains a real opening.
    const floorBottomY = UPPER_FLOOR_Y - 0.18;
    addWall({ kind: "building-floor", x: BUILDING_CENTER_X - 3.5, y: floorBottomY, z: BUILDING_CENTER_Z, hx: 11.5, hz: 12, height: 0.18 });
    addWall({ kind: "building-floor", x: BUILDING_CENTER_X + 13.5, y: floorBottomY, z: BUILDING_CENTER_Z, hx: 1.5, hz: 12, height: 0.18 });
    addWall({ kind: "building-floor", x: BUILDING_CENTER_X + 10, y: floorBottomY, z: BUILDING_CENTER_Z - 10, hx: 2, hz: 2, height: 0.18 });
    addWall({ kind: "building-floor", x: BUILDING_CENTER_X + 10, y: floorBottomY, z: BUILDING_CENTER_Z + 10, hx: 2, hz: 2, height: 0.18 });

    // Upper floor shell and an internal room separator with its own door.
    addWall({ kind: "building-wall", x: BUILDING.minX, y: UPPER_FLOOR_Y, z: BUILDING_CENTER_Z, hx: 0.3, hz: 12, height: 2.8 });
    addWall({ kind: "building-wall", x: BUILDING.maxX, y: UPPER_FLOOR_Y, z: BUILDING_CENTER_Z, hx: 0.3, hz: 12, height: 2.8 });
    addWall({ kind: "building-wall", x: BUILDING_CENTER_X, y: UPPER_FLOOR_Y, z: BUILDING.minZ, hx: 15, hz: 0.3, height: 2.8 });
    addWall({ kind: "building-wall", x: BUILDING_CENTER_X, y: UPPER_FLOOR_Y, z: BUILDING.maxZ, hx: 15, hz: 0.3, height: 2.8 });
    addWall({ kind: "building-wall", x: BUILDING_CENTER_X, y: UPPER_FLOOR_Y, z: BUILDING_CENTER_Z + 6.6, hx: 0.25, hz: 5.4, height: 2.8 });
    addWall({ kind: "building-wall", x: BUILDING_CENTER_X, y: UPPER_FLOOR_Y, z: BUILDING_CENTER_Z - 6.6, hx: 0.25, hz: 5.4, height: 2.8 });
  } finally {
    physics.endBatch?.();
  }

  const doors = [
    {
      id: "warehouse-front-door",
      name: "Входная дверь склада",
      ...WAREHOUSE_FRONT_DOOR,
      open: false,
      collider: physics.createWall({ ...WAREHOUSE_FRONT_DOOR, hx: 0.25, hz: 1.2, height: 2.6 }),
    },
    {
      id: "warehouse-upper-room-door",
      name: "Дверь комнаты второго этажа",
      x: BUILDING_CENTER_X,
      y: UPPER_FLOOR_Y,
      z: BUILDING_CENTER_Z,
      open: false,
      collider: physics.createWall({ x: BUILDING_CENTER_X, y: UPPER_FLOOR_Y, z: BUILDING_CENTER_Z, hx: 0.25, hz: 1.2, height: 2.6 }),
    },
  ];

  const crates = [
    { id: "crate-ground-rifle", x: BUILDING_CENTER_X - 8.5, y: 0, z: BUILDING_CENTER_Z - 2, loot: "rifle", opened: false },
    { id: "crate-ground-armor", x: BUILDING_CENTER_X + 11, y: 0, z: BUILDING_CENTER_Z + 3, loot: "armor", opened: false },
    { id: "crate-upper-armor", x: BUILDING_CENTER_X - 8.5, y: UPPER_FLOOR_Y, z: BUILDING_CENTER_Z - 5, loot: "armor", opened: false },
    { id: "crate-upper-rifle", x: BUILDING_CENTER_X + 6, y: UPPER_FLOOR_Y, z: BUILDING_CENTER_Z - 3, loot: "rifle", opened: false },
  ];

  let spawnIndex = 0;

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
    defaultSurface: DEFAULT_GROUND_SURFACE,
    describeBlockedMove,
    surfaceAt,
    heightAt,
    acousticZoneAt,
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
