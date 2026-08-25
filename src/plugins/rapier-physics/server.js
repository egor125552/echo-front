export const manifest = {
  id: "rapier-physics",
  version: "2.0.0",
  requires: [],
  capabilities: ["services.provide"],
};

const CHARACTER_HALF_HEIGHT = 0.45;
const CHARACTER_RADIUS = 0.32;
const CHARACTER_CONTROLLER_OFFSET = 0.02;
const CHARACTER_BASE_OFFSET = CHARACTER_HALF_HEIGHT + CHARACTER_RADIUS + CHARACTER_CONTROLLER_OFFSET;

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
  const controller = world.createCharacterController(CHARACTER_CONTROLLER_OFFSET);
  controller.enableAutostep(0.24, 0.35, false);
  controller.enableSnapToGround(0.35);
  controller.setMaxSlopeClimbAngle(Math.PI / 4);
  controller.setMinSlopeSlideAngle(Math.PI / 3);

  const characters = new Map();
  const colliderToEntity = new Map();
  const colliderMetadata = new Map();
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

  function rememberCollider(collider, spec) {
    const {
      x, y = 0, z, hx, hz, height, thickness,
      ...metadata
    } = spec;
    colliderMetadata.set(collider.handle, {
      ...metadata,
      x,
      y,
      z,
      hx,
      hz,
      height,
      thickness,
    });
    return collider;
  }

  function createWall(spec) {
    const { x, y = 0, z, hx, hz, height = 2 } = spec;
    const collider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(hx, height / 2, hz)
        .setTranslation(x, y + height / 2, z),
    );
    rememberCollider(collider, { ...spec, height });
    syncQueries();
    return collider;
  }

  function createFloor(spec) {
    const { x = 0, y = 0, z = 0, hx, hz, thickness = 0.2 } = spec;
    const collider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(hx, thickness / 2, hz)
        .setTranslation(x, y - thickness / 2, z),
    );
    rememberCollider(collider, { ...spec, thickness });
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
    colliderMetadata.delete(collider.handle);
    world.removeCollider(collider, true);
    syncQueries();
    return true;
  }

  function createCharacter(entityId, { x = 0, y = 0, z = 0 } = {}) {
    if (characters.has(entityId)) return characters.get(entityId);
    const collider = world.createCollider(
      RAPIER.ColliderDesc.capsule(CHARACTER_HALF_HEIGHT, CHARACTER_RADIUS)
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
    if (!entry) return { x: 0, y: 0, z: 0, grounded: false };
    controller.computeColliderMovement(
      entry.collider,
      { x: dx, y: dy, z: dz },
      undefined,
      undefined,
      collider => collider.handle !== entry.collider.handle,
    );
    const corrected = controller.computedMovement();
    const grounded = controller.computedGrounded();
    const p = entry.collider.translation();
    entry.collider.setTranslation({
      x: p.x + corrected.x,
      y: p.y + corrected.y,
      z: p.z + corrected.z,
    });
    syncQueries();
    return { x: corrected.x, y: corrected.y, z: corrected.z, grounded };
  }

  function makeRay(origin, direction) {
    const length = Math.hypot(direction.x, direction.y ?? 0, direction.z) || 1;
    return new RAPIER.Ray(
      { x: origin.x, y: origin.y ?? 1, z: origin.z },
      { x: direction.x / length, y: (direction.y ?? 0) / length, z: direction.z / length },
    );
  }

  function describeRayHit(hit) {
    if (!hit) return null;
    return {
      entityId: colliderToEntity.get(hit.collider.handle) ?? null,
      distance: hit.timeOfImpact,
      colliderHandle: hit.collider.handle,
      worldObject: colliderMetadata.get(hit.collider.handle) ?? null,
    };
  }

  function raycast(origin, direction, maxDistance, excludeEntityId = null) {
    const ray = makeRay(origin, direction);
    const exclude = characters.get(excludeEntityId)?.collider;
    const hit = world.castRay(ray, maxDistance, true, undefined, undefined, exclude);
    return describeRayHit(hit);
  }

  function raycastWorld(origin, direction, maxDistance) {
    const ray = makeRay(origin, direction);
    const hit = world.castRay(
      ray,
      maxDistance,
      true,
      undefined,
      undefined,
      undefined,
      undefined,
      collider => !colliderToEntity.has(collider.handle),
    );
    return describeRayHit(hit);
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
    controller,
    createWall,
    createFloor,
    setWallEnabled,
    removeWall,
    createCharacter,
    removeCharacter,
    setCharacterEnabled,
    position,
    teleport,
    move,
    raycast,
    raycastWorld,
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
