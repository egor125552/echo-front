import RAPIER from "@dimforge/rapier3d";

export const manifest = {
  id: "rapier-physics",
  version: "1.0.0",
  requires: [],
  capabilities: ["services.provide"],
};

export async function setup(ctx) {
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
    const desc = RAPIER.ColliderDesc.capsule(0.45, 0.32)
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
    entry.collider.setTranslation({
      x: p.x + corrected.x,
      y: 1.0,
      z: p.z + corrected.z,
    });
    syncQueries();
    return { x: corrected.x, z: corrected.z };
  }

  function raycast(origin, direction, maxDistance, excludeEntityId = null) {
    const length = Math.hypot(direction.x, direction.y ?? 0, direction.z) || 1;
    const dir = {
      x: direction.x / length,
      y: (direction.y ?? 0) / length,
      z: direction.z / length,
    };
    const ray = new RAPIER.Ray(
      { x: origin.x, y: origin.y ?? 1.0, z: origin.z },
      dir,
    );
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
    const hit = raycast(
      { x: from.x, y: 1.0, z: from.z },
      { x: dx, y: 0, z: dz },
      distance + 0.15,
      excludeEntityId,
    );
    return !hit || hit.entityId === targetEntityId;
  }

  ctx.services.provide("physics", {
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
  });
}
