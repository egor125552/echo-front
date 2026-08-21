export const manifest = {
  id: "rapier-physics",
  version: "1.0.0",
  requires: [],
  capabilities: ["services.provide"],
};

const CHARACTER_RADIUS = 0.32;

function createWorkerPhysics() {
  const walls = [];
  const characters = new Map();
  let wallSerial = 0;

  function createWall({ x, z, hx, hz, height = 2 }) {
    const wall = { handle: `wall-${++wallSerial}`, x, z, hx, hz, height };
    walls.push(wall);
    return wall;
  }

  function createCharacter(entityId, { x = 0, z = 0 } = {}) {
    if (characters.has(entityId)) return characters.get(entityId);
    const entry = { entityId, x, z, handle: `entity-${entityId}` };
    characters.set(entityId, entry);
    return entry;
  }

  function removeCharacter(entityId) {
    characters.delete(entityId);
  }

  function position(entityId) {
    const entry = characters.get(entityId);
    return entry ? { x: entry.x, z: entry.z } : null;
  }

  function teleport(entityId, { x, z }) {
    const entry = characters.get(entityId);
    if (!entry) return;
    entry.x = x;
    entry.z = z;
  }

  function collides(entityId, x, z) {
    for (const wall of walls) {
      if (
        x >= wall.x - wall.hx - CHARACTER_RADIUS &&
        x <= wall.x + wall.hx + CHARACTER_RADIUS &&
        z >= wall.z - wall.hz - CHARACTER_RADIUS &&
        z <= wall.z + wall.hz + CHARACTER_RADIUS
      ) return true;
    }

    for (const [otherId, other] of characters) {
      if (otherId === entityId) continue;
      if (Math.hypot(x - other.x, z - other.z) < CHARACTER_RADIUS * 2) return true;
    }
    return false;
  }

  function move(entityId, dx, dz) {
    const entry = characters.get(entityId);
    if (!entry) return { x: 0, z: 0 };

    let movedX = 0;
    let movedZ = 0;
    const nextX = entry.x + dx;
    if (!collides(entityId, nextX, entry.z)) {
      entry.x = nextX;
      movedX = dx;
    }
    const nextZ = entry.z + dz;
    if (!collides(entityId, entry.x, nextZ)) {
      entry.z = nextZ;
      movedZ = dz;
    }
    return { x: movedX, z: movedZ };
  }

  function rayAabb(origin, dir, wall, maxDistance) {
    const minX = wall.x - wall.hx;
    const maxX = wall.x + wall.hx;
    const minZ = wall.z - wall.hz;
    const maxZ = wall.z + wall.hz;
    let tMin = 0;
    let tMax = maxDistance;

    for (const [originValue, dirValue, minValue, maxValue] of [
      [origin.x, dir.x, minX, maxX],
      [origin.z, dir.z, minZ, maxZ],
    ]) {
      if (Math.abs(dirValue) < 1e-9) {
        if (originValue < minValue || originValue > maxValue) return null;
        continue;
      }
      const inv = 1 / dirValue;
      let a = (minValue - originValue) * inv;
      let b = (maxValue - originValue) * inv;
      if (a > b) [a, b] = [b, a];
      tMin = Math.max(tMin, a);
      tMax = Math.min(tMax, b);
      if (tMin > tMax) return null;
    }
    return tMin >= 0 && tMin <= maxDistance ? tMin : null;
  }

  function rayCircle(origin, dir, center, radius, maxDistance) {
    const ox = origin.x - center.x;
    const oz = origin.z - center.z;
    const b = ox * dir.x + oz * dir.z;
    const c = ox * ox + oz * oz - radius * radius;
    const discriminant = b * b - c;
    if (discriminant < 0) return null;
    const root = Math.sqrt(discriminant);
    const first = -b - root;
    const second = -b + root;
    const t = first >= 0 ? first : second >= 0 ? second : null;
    return t !== null && t <= maxDistance ? t : null;
  }

  function raycast(origin, direction, maxDistance, excludeEntityId = null) {
    const length = Math.hypot(direction.x, direction.z) || 1;
    const dir = { x: direction.x / length, z: direction.z / length };
    let best = null;

    for (const wall of walls) {
      const distance = rayAabb(origin, dir, wall, maxDistance);
      if (distance !== null && (!best || distance < best.distance)) {
        best = { entityId: null, distance, colliderHandle: wall.handle };
      }
    }

    for (const [entityId, entry] of characters) {
      if (entityId === excludeEntityId) continue;
      const distance = rayCircle(origin, dir, entry, CHARACTER_RADIUS, maxDistance);
      if (distance !== null && (!best || distance < best.distance)) {
        best = { entityId, distance, colliderHandle: entry.handle };
      }
    }
    return best;
  }

  function lineOfSight(from, to, excludeEntityId = null, targetEntityId = null) {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.001) return true;
    const hit = raycast(from, { x: dx, z: dz }, distance + 0.15, excludeEntityId);
    return !hit || hit.entityId === targetEntityId;
  }

  return {
    RAPIER: null,
    world: null,
    createWall,
    createCharacter,
    removeCharacter,
    position,
    teleport,
    move,
    raycast,
    lineOfSight,
    syncQueries() {},
  };
}

async function createRapierPhysics() {
  const module = await import("@dimforge/rapier3d-compat");
  const RAPIER = module.default;
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  const controller = world.createCharacterController(0.02);
  const characters = new Map();
  const colliderToEntity = new Map();

  function syncQueries() {
    world.step();
  }

  function createWall({ x, z, hx, hz, height = 2 }) {
    const desc = RAPIER.ColliderDesc.cuboid(hx, height / 2, hz)
      .setTranslation(x, height / 2, z);
    const collider = world.createCollider(desc);
    syncQueries();
    return collider;
  }

  function createCharacter(entityId, { x = 0, z = 0 } = {}) {
    if (characters.has(entityId)) return characters.get(entityId);
    const desc = RAPIER.ColliderDesc.capsule(0.45, CHARACTER_RADIUS)
      .setTranslation(x, 1.0, z);
    const collider = world.createCollider(desc);
    const entry = { collider };
    characters.set(entityId, entry);
    colliderToEntity.set(collider.handle, entityId);
    syncQueries();
    return entry;
  }

  function removeCharacter(entityId) {
    const entry = characters.get(entityId);
    if (!entry) return;
    colliderToEntity.delete(entry.collider.handle);
    world.removeCollider(entry.collider, true);
    characters.delete(entityId);
    syncQueries();
  }

  function position(entityId) {
    const entry = characters.get(entityId);
    if (!entry) return null;
    const p = entry.collider.translation();
    return { x: p.x, z: p.z };
  }

  function teleport(entityId, { x, z }) {
    const entry = characters.get(entityId);
    if (!entry) return;
    entry.collider.setTranslation({ x, y: 1.0, z });
    syncQueries();
  }

  function move(entityId, dx, dz) {
    const entry = characters.get(entityId);
    if (!entry) return { x: 0, z: 0 };
    controller.computeColliderMovement(
      entry.collider,
      { x: dx, y: 0, z: dz },
      undefined,
      undefined,
      (collider) => collider.handle !== entry.collider.handle,
    );
    const corrected = controller.computedMovement();
    const p = entry.collider.translation();
    entry.collider.setTranslation({ x: p.x + corrected.x, y: 1.0, z: p.z + corrected.z });
    syncQueries();
    return { x: corrected.x, z: corrected.z };
  }

  function raycast(origin, direction, maxDistance, excludeEntityId = null) {
    const length = Math.hypot(direction.x, direction.y ?? 0, direction.z) || 1;
    const dir = { x: direction.x / length, y: (direction.y ?? 0) / length, z: direction.z / length };
    const ray = new RAPIER.Ray({ x: origin.x, y: origin.y ?? 1.0, z: origin.z }, dir);
    const exclude = characters.get(excludeEntityId)?.collider ?? null;
    const hit = world.castRay(ray, maxDistance, true, undefined, undefined, exclude);
    if (!hit) return null;
    const collider = hit.collider;
    return {
      entityId: colliderToEntity.get(collider.handle) ?? null,
      distance: hit.timeOfImpact,
      colliderHandle: collider.handle,
    };
  }

  function lineOfSight(from, to, excludeEntityId = null, targetEntityId = null) {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.001) return true;
    const hit = raycast({ x: from.x, y: 1.0, z: from.z }, { x: dx, y: 0, z: dz }, distance + 0.15, excludeEntityId);
    return !hit || hit.entityId === targetEntityId;
  }

  return {
    RAPIER,
    world,
    createWall,
    createCharacter,
    removeCharacter,
    position,
    teleport,
    move,
    raycast,
    lineOfSight,
    syncQueries,
  };
}

export async function setup(ctx) {
  const physics = typeof WebSocketPair !== "undefined"
    ? createWorkerPhysics()
    : await createRapierPhysics();
  ctx.services.provide("physics", physics);
}
