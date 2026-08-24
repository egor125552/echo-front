export const manifest = {
  id: "rapier-physics",
  version: "1.5.0",
  requires: [],
  capabilities: ["services.provide"],
};

const CHARACTER_RADIUS = 0.32;
const CHARACTER_BASE_OFFSET = 1;

async function loadRapier() {
  if (typeof WebSocketPair !== "undefined") {
    const { getWorkerRapier } = await import("./worker-rapier.js");
    return getWorkerRapier();
  }

  const module = await import("@dimforge/rapier3d-compat");
  const RAPIER = module.default;
  await RAPIER.init();
  return RAPIER;
}

async function createRapierPhysics() {
  const RAPIER = await loadRapier();
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  const controller = world.createCharacterController(0.02);
  const characters = new Map();
  const colliderToEntity = new Map();
  let batchDepth = 0;
  let queryDirty = false;

  function flushQueries() {
    world.step();
    queryDirty = false;
  }

  function syncQueries() {
    if (batchDepth > 0) {
      queryDirty = true;
      return;
    }
    flushQueries();
  }

  function beginBatch() {
    batchDepth += 1;
  }

  function endBatch() {
    if (batchDepth <= 0) return;
    batchDepth -= 1;
    if (batchDepth === 0 && queryDirty) flushQueries();
  }

  function createWall({ x, y = 0, z, hx, hz, height = 2 }) {
    const collider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(hx, height / 2, hz)
        .setTranslation(x, y + height / 2, z),
    );
    syncQueries();
    return collider;
  }

  function setWallEnabled(collider, enabled) {
    if (!collider) return false;
    collider.setEnabled(Boolean(enabled));
    syncQueries();
    return true;
  }

  function removeWall(collider) {
    if (!collider) return false;
    world.removeCollider(collider, true);
    syncQueries();
    return true;
  }

  function createCharacter(entityId, { x = 0, y = 0, z = 0 } = {}) {
    if (characters.has(entityId)) return characters.get(entityId);
    const collider = world.createCollider(
      RAPIER.ColliderDesc.capsule(0.45, CHARACTER_RADIUS)
        .setTranslation(x, y + CHARACTER_BASE_OFFSET, z),
    );
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

  function setCharacterEnabled(entityId, enabled) {
    const entry = characters.get(entityId);
    if (!entry) return false;
    entry.collider.setEnabled(Boolean(enabled));
    syncQueries();
    return true;
  }

  function position(entityId) {
    const entry = characters.get(entityId);
    if (!entry) return null;
    const p = entry.collider.translation();
    return { x: p.x, y: p.y - CHARACTER_BASE_OFFSET, z: p.z };
  }

  function teleport(entityId, { x, y = 0, z }) {
    const entry = characters.get(entityId);
    if (!entry) return;
    entry.collider.setTranslation({ x, y: y + CHARACTER_BASE_OFFSET, z });
    syncQueries();
  }

  function move(entityId, dx, dz, dy = 0) {
    const entry = characters.get(entityId);
    if (!entry) return { x: 0, y: 0, z: 0 };
    controller.computeColliderMovement(
      entry.collider,
      { x: dx, y: dy, z: dz },
      undefined,
      undefined,
      collider => collider.handle !== entry.collider.handle,
    );
    const corrected = controller.computedMovement();
    const p = entry.collider.translation();
    entry.collider.setTranslation({
      x: p.x + corrected.x,
      y: p.y + corrected.y,
      z: p.z + corrected.z,
    });
    syncQueries();
    return { x: corrected.x, y: corrected.y, z: corrected.z };
  }

  function raycast(origin, direction, maxDistance, excludeEntityId = null) {
    const length = Math.hypot(direction.x, direction.y ?? 0, direction.z) || 1;
    const ray = new RAPIER.Ray(
      { x: origin.x, y: origin.y ?? 1, z: origin.z },
      { x: direction.x / length, y: (direction.y ?? 0) / length, z: direction.z / length },
    );
    const exclude = characters.get(excludeEntityId)?.collider;
    const hit = world.castRay(ray, maxDistance, true, undefined, undefined, exclude);
    if (!hit) return null;
    return {
      entityId: colliderToEntity.get(hit.collider.handle) ?? null,
      distance: hit.timeOfImpact,
      colliderHandle: hit.collider.handle,
    };
  }

  function lineOfSight(from, to, excludeEntityId = null, targetEntityId = null) {
    const dx = to.x - from.x;
    const dy = (to.y ?? 0) - (from.y ?? 0);
    const dz = to.z - from.z;
    const distance = Math.hypot(dx, dy, dz);
    if (distance < 0.001) return true;
    const hit = raycast(
      { x: from.x, y: (from.y ?? 0) + 1, z: from.z },
      { x: dx, y: dy, z: dz },
      distance + 0.15,
      excludeEntityId,
    );
    if (!hit) return true;
    return targetEntityId !== null && hit.entityId === targetEntityId;
  }

  return {
    RAPIER,
    world,
    createWall,
    setWallEnabled,
    removeWall,
    createCharacter,
    removeCharacter,
    setCharacterEnabled,
    position,
    teleport,
    move,
    raycast,
    lineOfSight,
    syncQueries,
    beginBatch,
    endBatch,
  };
}

export async function setup(ctx) {
  const physics = await createRapierPhysics();
  ctx.services.provide("physics", physics);
}
