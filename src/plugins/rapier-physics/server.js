export const manifest = {
  id: "rapier-physics",
  version: "1.2.3",
  requires: [],
  capabilities: ["services.provide"],
};

const CHARACTER_RADIUS = 0.32;

async function loadRapier() {
  if (typeof WebSocketPair !== "undefined") {
    return import("@dimforge/rapier3d");
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

  function syncQueries() {
    world.step();
  }

  function createWall({ x, z, hx, hz, height = 2 }) {
    const collider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(hx, height / 2, hz)
        .setTranslation(x, height / 2, z),
    );
    syncQueries();
    return collider;
  }

  function createCharacter(entityId, { x = 0, z = 0 } = {}) {
    if (characters.has(entityId)) return characters.get(entityId);
    const collider = world.createCollider(
      RAPIER.ColliderDesc.capsule(0.45, CHARACTER_RADIUS)
        .setTranslation(x, 1, z),
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

  function position(entityId) {
    const entry = characters.get(entityId);
    if (!entry) return null;
    const p = entry.collider.translation();
    return { x: p.x, z: p.z };
  }

  function teleport(entityId, { x, z }) {
    const entry = characters.get(entityId);
    if (!entry) return;
    entry.collider.setTranslation({ x, y: 1, z });
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
      collider => collider.handle !== entry.collider.handle,
    );
    const corrected = controller.computedMovement();
    const p = entry.collider.translation();
    entry.collider.setTranslation({
      x: p.x + corrected.x,
      y: 1,
      z: p.z + corrected.z,
    });
    syncQueries();
    return { x: corrected.x, z: corrected.z };
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
    const dz = to.z - from.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.001) return true;
    const hit = raycast(
      { x: from.x, y: 1, z: from.z },
      { x: dx, y: 0, z: dz },
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
  const physics = await createRapierPhysics();
  ctx.services.provide("physics", physics);
}
