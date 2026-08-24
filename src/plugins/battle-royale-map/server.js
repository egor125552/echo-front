export const WORLD_HALF_SIZE = 400;
export const BOUNDARY_HALF_THICKNESS = 1;
export const UPPER_FLOOR_Y = 3.2;
export const DEFAULT_GROUND_SURFACE = "forest";

export const BUILDING = Object.freeze({
  id: "warehouse",
  minX: 55,
  maxX: 85,
  minZ: -62,
  maxZ: -38,
  upperY: UPPER_FLOOR_Y,
});

export const STAIR = Object.freeze({ minX: 78, maxX: 82, minZ: -58, maxZ: -42 });

const SURFACE_VARIANTS = Object.freeze({
  forest: 3,
  concrete: 8,
  metal: 8,
  stone: 6,
  sand: 6,
});

export const manifest = {
  id: "map-test-arena",
  version: "3.0.0",
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
  const progress = Math.max(0, Math.min(1, ((-position.z) - 42) / 16));
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
  if (position.x >= 48 && position.x <= 92 && position.z >= -70 && position.z <= -30) return "stone";
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
  const radius = 125 + ((ring * 47) % 215);
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

    // Ground-floor warehouse shell. The southern/front wall leaves a 2.4 m door opening.
    addWall({ kind: "building-wall", x: BUILDING.minX, z: -50, hx: 0.3, hz: 12, height: 2.8 });
    addWall({ kind: "building-wall", x: BUILDING.maxX, z: -50, hx: 0.3, hz: 12, height: 2.8 });
    addWall({ kind: "building-wall", x: 70, z: BUILDING.minZ, hx: 15, hz: 0.3, height: 2.8 });
    addWall({ kind: "building-wall", x: 61.9, z: BUILDING.maxZ, hx: 6.9, hz: 0.3, height: 2.8 });
    addWall({ kind: "building-wall", x: 78.1, z: BUILDING.maxZ, hx: 6.9, hz: 0.3, height: 2.8 });

    // A thin physical second-floor slab blocks shots and line of sight between floors.
    // It is split into four pieces so the metal stairwell remains a real opening.
    const floorBottomY = UPPER_FLOOR_Y - 0.18;
    addWall({ kind: "building-floor", x: 66.5, y: floorBottomY, z: -50, hx: 11.5, hz: 12, height: 0.18 });
    addWall({ kind: "building-floor", x: 83.5, y: floorBottomY, z: -50, hx: 1.5, hz: 12, height: 0.18 });
    addWall({ kind: "building-floor", x: 80, y: floorBottomY, z: -60, hx: 2, hz: 2, height: 0.18 });
    addWall({ kind: "building-floor", x: 80, y: floorBottomY, z: -40, hx: 2, hz: 2, height: 0.18 });

    // Upper floor shell and an internal room separator with its own door.
    addWall({ kind: "building-wall", x: BUILDING.minX, y: UPPER_FLOOR_Y, z: -50, hx: 0.3, hz: 12, height: 2.8 });
    addWall({ kind: "building-wall", x: BUILDING.maxX, y: UPPER_FLOOR_Y, z: -50, hx: 0.3, hz: 12, height: 2.8 });
    addWall({ kind: "building-wall", x: 70, y: UPPER_FLOOR_Y, z: BUILDING.minZ, hx: 15, hz: 0.3, height: 2.8 });
    addWall({ kind: "building-wall", x: 70, y: UPPER_FLOOR_Y, z: BUILDING.maxZ, hx: 15, hz: 0.3, height: 2.8 });
    addWall({ kind: "building-wall", x: 70, y: UPPER_FLOOR_Y, z: -44, hx: 0.25, hz: 4, height: 2.8 });
    addWall({ kind: "building-wall", x: 70, y: UPPER_FLOOR_Y, z: -56, hx: 0.25, hz: 4, height: 2.8 });
  } finally {
    physics.endBatch?.();
  }

  const doors = [
    {
      id: "warehouse-front-door",
      name: "Входная дверь склада",
      x: 70,
      y: 0,
      z: BUILDING.maxZ,
      open: false,
      collider: physics.createWall({ x: 70, z: BUILDING.maxZ, hx: 1.2, hz: 0.25, height: 2.6 }),
    },
    {
      id: "warehouse-upper-room-door",
      name: "Дверь комнаты второго этажа",
      x: 70,
      y: UPPER_FLOOR_Y,
      z: -50,
      open: false,
      collider: physics.createWall({ x: 70, y: UPPER_FLOOR_Y, z: -50, hx: 0.25, hz: 1.2, height: 2.6 }),
    },
  ];

  const crates = [
    { id: "crate-ground-rifle", x: 61.5, y: 0, z: -52, loot: "rifle", opened: false },
    { id: "crate-ground-armor", x: 81, y: 0, z: -47, loot: "armor", opened: false },
    { id: "crate-upper-armor", x: 61.5, y: UPPER_FLOOR_Y, z: -55, loot: "armor", opened: false },
    { id: "crate-upper-rifle", x: 76, y: UPPER_FLOOR_Y, z: -53, loot: "rifle", opened: false },
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
