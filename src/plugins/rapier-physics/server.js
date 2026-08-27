export const manifest = {
  id: "rapier-physics",
  version: "3.1.0",
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
const DEFAULT_TIMESTEP = 1 / 60;
const MIN_TIMESTEP = 1 / 120;
const MAX_TIMESTEP = 1 / 30;

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

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}

async function createRapierPhysics() {
  const RAPIER = await loadRapier();
  // Keep the legacy character world behavior until the first dynamic body exists.
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  world.timestep = DEFAULT_TIMESTEP;
  if ("maxCcdSubsteps" in world) world.maxCcdSubsteps = 2;

  const controller = world.createCharacterController(CHARACTER_CONTROLLER_OFFSET);
  controller.enableAutostep(0.24, 0.35, false);
  controller.enableSnapToGround(0.35);
  controller.setMaxSlopeClimbAngle(Math.PI / 4);
  controller.setMinSlopeSlideAngle(Math.PI / 3);

  const characters = new Map();
  const dynamicBodies = new Map();
  const colliderToEntity = new Map();
  const colliderMetadata = new Map();
  let batchDepth = 0;
  let queryDirty = false;
  let dynamicsSteps = 0;
  let legacyQuerySteps = 0;

  function enableDynamicsGravity() {
    world.gravity = { x: 0, y: -9.81, z: 0 };
  }

  function flushQueries() {
    if (dynamicBodies.size === 0) {
      // Exact legacy path used by TDM and by BR during static world construction.
      world.step();
      legacyQuerySteps += 1;
    } else {
      // Rapier 0.19.x scene queries use the broad phase directly. Do not advance
      // dynamic time just because a CharacterController collider moved.
      world.propagateModifiedBodyPositionsToColliders?.();
    }
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
      x, y = 0, z, hx, hy, hz, height, thickness,
      ...metadata
    } = spec;
    colliderMetadata.set(collider.handle, {
      ...metadata,
      x, y, z, hx, hy, hz, height, thickness,
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
      x = 0, y = 0, z = 0, run, rise, width,
      thickness = 0.2, risesToward = "west",
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

  function isCharacterCollider(collider) {
    return Boolean(collider && colliderToEntity.has(collider.handle));
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

  function createDynamicCuboid(bodyId, spec = {}) {
    if (!bodyId) throw new Error("Dynamic rigid body requires an id");
    if (dynamicBodies.has(bodyId)) return dynamicBodies.get(bodyId);
    enableDynamicsGravity();
    const {
      x = 0, y = 1, z = 0,
      hx = 0.5, hy = 0.5, hz = 0.5,
      rotation = { x: 0, y: 0, z: 0, w: 1 },
      mass = 1,
      friction = 0.7,
      restitution = 0.05,
      linearDamping = 0.04,
      angularDamping = 0.15,
      canSleep = true,
      ccd = false,
      metadata = {},
    } = spec;
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(x, y, z)
        .setRotation(rotation)
        .setLinearDamping(Math.max(0, Number(linearDamping) || 0))
        .setAngularDamping(Math.max(0, Number(angularDamping) || 0))
        .setCanSleep(Boolean(canSleep))
        .setCcdEnabled(Boolean(ccd)),
    );
    const collider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(
        Math.max(0.01, Math.abs(Number(hx) || 0.5)),
        Math.max(0.01, Math.abs(Number(hy) || 0.5)),
        Math.max(0.01, Math.abs(Number(hz) || 0.5)),
      )
        .setMass(Math.max(0.001, Number(mass) || 1))
        .setFriction(Math.max(0, Number(friction) || 0))
        .setRestitution(clamp(restitution, 0, 1)),
      body,
    );
    rememberCollider(collider, {
      kind: metadata.kind ?? "dynamic-body",
      bodyId,
      x, y, z, hx, hy, hz,
      ...metadata,
    });
    const entry = { id: bodyId, body, colliders: [collider] };
    dynamicBodies.set(bodyId, entry);
    world.propagateModifiedBodyPositionsToColliders?.();
    return entry;
  }

  function addDynamicCuboidCollider(bodyId, spec = {}) {
    const entry = dynamicBodies.get(bodyId);
    if (!entry) return null;
    const {
      x = 0, y = 0, z = 0,
      hx = 0.25, hy = 0.25, hz = 0.25,
      mass = 0,
      friction = 0.7,
      restitution = 0.05,
      sensor = false,
      metadata = {},
    } = spec;
    const collider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(
        Math.max(0.01, Math.abs(Number(hx) || 0.25)),
        Math.max(0.01, Math.abs(Number(hy) || 0.25)),
        Math.max(0.01, Math.abs(Number(hz) || 0.25)),
     )
        .setTranslation(Number(x) || 0, Number(y) || 0, Number(z) || 0)
        .setMass(Math.max(0, Number(mass) || 0))
        .setFriction(Math.max(0, Number(friction) || 0))
        .setRestitution(clamp(restitution, 0, 1))
        .setSensor(Boolean(sensor)),
      entry.body,
    );
    rememberCollider(collider, {
      kind: metadata.kind ?? "dynamic-body-part",
      bodyId,
      x, y, z, hx, hy, hz,
      ...metadata,
    });
    entry.colliders.push(collider);
    world.propagateModifiedBodyPositionsToColliders?.();
    return collider;
  }

  function dynamicBody(bodyId) {
    return dynamicBodies.get(bodyId)?.body ?? null;
  }

  function dynamicBodyState(bodyId) {
    const body = dynamicBody(bodyId);
    if (!body) return null;
    const translation = body.translation();
    const rotation = body.rotation();
    const linvel = body.linvel();
    const angvel = body.angvel();
    return {
      id: bodyId,
      x: translation.x,
      y: translation.y,
      z: translation.z,
      rotation: { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w },
      linvel: { x: linvel.x, y: linvel.y, z: linvel.z },
      angvel: { x: angvel.x, y: angvel.y, z: angvel.z },
      mass: body.mass(),
      sleeping: body.isSleeping(),
    };
  }

  function removeDynamicBody(bodyId) {
    const entry = dynamicBodies.get(bodyId);
    if (!entry) return false;
    for (const collider of entry.colliders) colliderMetadata.delete(collider.handle);
    world.removeRigidBody(entry.body);
    dynamicBodies.delete(bodyId);
    return true;
  }

  function step(dt = DEFAULT_TIMESTEP) {
    if (!dynamicBodies.size) return dynamicsSteps;
    enableDynamicsGravity();
    world.timestep = clamp(dt, MIN_TIMESTEP, MAX_TIMESTEP);
    world.step();
    dynamicsSteps += 1;
    return dynamicsSteps;
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
    return { position: { ...position, y: desiredCenterY }, grounded: true };
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
    let next = { x: p.x + corrected.x, y: p.y + corrected.y, z: p.z + corrected.z };
    const stabilized = stabilizeCharacterOnSupport(next, dy);
    next = stabilized.position;
    grounded = grounded || stabilized.grounded;
    const applied = { x: next.x - p.x, y: next.y - p.y, z: next.z - p.z };
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
    isCharacterCollider,
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
    createDynamicCuboid,
    addDynamicCuboidCollider,
    dynamicBody,
    dynamicBodyState,
    removeDynamicBody,
    step,
    stats() {
      return {
        version: manifest.version,
        characters: characters.size,
        dynamicBodies: dynamicBodies.size,
        dynamicsSteps,
        legacyQuerySteps,
        sharedWorld: true,
      };
    },
  };
}

export async function setup(ctx) {
  const physics = await createRapierPhysics();
  ctx.services.provide("physics", physics);
}
