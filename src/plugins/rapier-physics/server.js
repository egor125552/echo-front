export const manifest = {
  id: "rapier-physics",
  version: "2.4.0",
  requires: [],
  capabilities: ["services.provide"],
};

const CHARACTER_HALF_HEIGHT = 0.45;
const CHARACTER_RADIUS = 0.32;
const CHARACTER_CONTROLLER_OFFSET = 0.02;
const CHARACTER_BASE_OFFSET = CHARACTER_HALF_HEIGHT + CHARACTER_RADIUS + CHARACTER_CONTROLLER_OFFSET;
const CHARACTER_SUPPORT_SNAP_DISTANCE = 0.35;
const CHARACTER_SUPPORT_PENETRATION_LIMIT = 0.5;
const CHARACTER_SUPPORT_KINDS = new Set(["ground", "building-floor", "building-stair"]);

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

  function createRamp(spec) {
    const {
      x = 0,
      y = 0,
      z = 0,
      run,
      rise,
      width,
      thickness = 0.2,
      risesToward = "west",
    } = spec;
    const horizontalRun = Math.max(0.01, Math.abs(Number(run) || 0));
    const verticalRise = Math.max(0, Number(rise) || 0);
    const rampWidth = Math.max(0.02, Math.abs(Number(width) || 0));
    const slopeLength = Math.hypot(horizontalRun, verticalRise);
    const angleMagnitude = Math.atan2(verticalRise, horizontalRun);
    const angle = risesToward === "east" ? angleMagnitude : -angleMagnitude;
    const normalX = -Math.sin(angle);
    const normalY = Math.cos(angle);
    const surfaceCenterY = y + verticalRise / 2;
    const colliderCenterX = x - normalX * thickness / 2;
    const colliderCenterY = surfaceCenterY - normalY * thickness / 2;
    const halfAngle = angle / 2;
    const collider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(slopeLength / 2, thickness / 2, rampWidth / 2)
        .setTranslation(colliderCenterX, colliderCenterY, z)
        .setRotation({ x: 0, y: 0, z: Math.sin(halfAngle), w: Math.cos(halfAngle) }),
    );
    rememberCollider(collider, {
      ...spec,
      run: horizontalRun,
      rise: verticalRise,
      width: rampWidth,
      thickness,
      slopeAngle: angle,
    });
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

  function describeCharacterCollision(collision) {
    const collider = collision?.collider;
    if (!collider) return null;
    return {
      entityId: colliderToEntity.get(collider.handle) ?? null,
      colliderHandle: collider.handle,
      worldObject: colliderMetadata.get(collider.handle) ?? null,
      normal: collision.normal1
        ? { x: collision.normal1.x, y: collision.normal1.y, z: collision.normal1.z }
        : null,
    };
  }

  function supportSurfaceBelow(position) {
    const ray = new RAPIER.Ray(
      { x: position.x, y: position.y, z: position.z },
      { x: 0, y: -1, z: 0 },
    );
    const hit = world.castRay(
      ray,
      CHARACTER_BASE_OFFSET + CHARACTER_SUPPORT_SNAP_DISTANCE + CHARACTER_SUPPORT_PENETRATION_LIMIT,
      true,
      undefined,
      undefined,
      undefined,
      undefined,
      collider => {
        if (colliderToEntity.has(collider.handle)) return false;
        const kind = colliderMetadata.get(collider.handle)?.kind;
        return CHARACTER_SUPPORT_KINDS.has(kind);
      },
    );
    if (!hit) return null;
    return {
      y: position.y - hit.timeOfImpact,
      colliderHandle: hit.collider.handle,
      worldObject: colliderMetadata.get(hit.collider.handle) ?? null,
    };
  }

  function stabilizeCharacterOnSupport(position, dy) {
    if (dy > 0) return { position, grounded: false };
    const support = supportSurfaceBelow(position);
    if (!support) return { position, grounded: false };
    const desiredCenterY = support.y + CHARACTER_BASE_OFFSET;
    const gap = position.y - desiredCenterY;
    if (gap > CHARACTER_SUPPORT_SNAP_DISTANCE || gap < -CHARACTER_SUPPORT_PENETRATION_LIMIT) {
      return { position, grounded: false };
    }
    return {
      position: { ...position, y: desiredCenterY },
      grounded: true,
    };
  }

  function move(entityId, dx, dz, dy = 0) {
    const entry = characters.get(entityId);
    if (!entry) return { x: 0, y: 0, z: 0, grounded: false, collisions: [] };
    controller.computeColliderMovement(
      entry.collider,
      { x: dx, y: dy, z: dz },
      undefined,
      undefined,
      collider => collider.handle !== entry.collider.handle,
    );
    const corrected = controller.computedMovement();
    let grounded = controller.computedGrounded();
    const collisions = [];
    const collisionCount = controller.numComputedCollisions();
    for (let i = 0; i < collisionCount; i += 1) {
      const described = describeCharacterCollision(controller.computedCollision(i));
      if (described) collisions.push(described);
    }
    const p = entry.collider.translation();
    let next = {
      x: p.x + corrected.x,
      y: p.y + corrected.y,
      z: p.z + corrected.z,
    };
    const stabilized = stabilizeCharacterOnSupport(next, dy);
    next = stabilized.position;
    grounded = grounded || stabilized.grounded;
    const applied = {
      x: next.x - p.x,
      y: next.y - p.y,
      z: next.z - p.z,
    };
    entry.collider.setTranslation(next);
    syncQueries();
    return { ...applied, grounded, collisions };
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

  function raycastSupportWorld(origin, direction, maxDistance) {
    const ray = makeRay(origin, direction);
    const hit = world.castRay(
      ray,
      maxDistance,
      true,
      undefined,
      undefined,
      undefined,
      undefined,
      collider => {
        if (colliderToEntity.has(collider.handle)) return false;
        const kind = colliderMetadata.get(collider.handle)?.kind;
        return CHARACTER_SUPPORT_KINDS.has(kind);
      },
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
    createRamp,
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
    raycastSupportWorld,
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
