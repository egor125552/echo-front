export const manifest = {
  id: "battle-royale-vehicle-physics",
  version: "1.0.0",
  requires: ["map-test-arena"],
  capabilities: ["services.consume", "services.provide", "events.on"],
};

const DEFAULT_TIMESTEP = 1 / 60;
const MIN_TIMESTEP = 1 / 120;
const MAX_TIMESTEP = 1 / 30;

async function loadRapier() {
  if (typeof WebSocketPair !== "undefined") {
    const { getWorkerRapier } = await import("../rapier-physics/worker-rapier.js");
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

function createStaticCuboid(world, RAPIER, spec) {
  const {
    x = 0, y = 0, z = 0,
    hx = 0.5, hz = 0.5,
    height = null,
    thickness = null,
    enabled = true,
  } = spec;
  const actualHeight = Number.isFinite(Number(height))
    ? Math.max(0.01, Number(height))
    : Math.max(0.01, Number(thickness) || 0.2);
  const centerY = Number.isFinite(Number(height))
    ? y + actualHeight / 2
    : y - actualHeight / 2;
  const collider = world.createCollider(
    RAPIER.ColliderDesc.cuboid(
      Math.max(0.01, Math.abs(Number(hx) || 0.5)),
      actualHeight / 2,
      Math.max(0.01, Math.abs(Number(hz) || 0.5)),
    ).setTranslation(x, centerY, z),
  );
  collider.setEnabled(Boolean(enabled));
  return collider;
}

function createStaticRamp(world, RAPIER, spec) {
  const {
    x = 0, y = 0, z = 0,
    run, rise, width,
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
  return world.createCollider(
    RAPIER.ColliderDesc.cuboid(slopeLength / 2, thickness / 2, rampWidth / 2)
      .setTranslation(colliderCenterX, colliderCenterY, z)
      .setRotation({ x: 0, y: 0, z: Math.sin(halfAngle), w: Math.cos(halfAngle) }),
  );
}

export async function setup(ctx) {
  const map = ctx.services.get("map");
  const RAPIER = await loadRapier();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = DEFAULT_TIMESTEP;
  if ("maxCcdSubsteps" in world) world.maxCcdSubsteps = 2;

  const staticColliders = new Map();
  const dynamicBodies = new Map();
  let dynamicsSteps = 0;

  // Rebuild the exact Battle Royale static geometry in a dedicated dynamic world.
  const ground = map.groundCollider ? {
    kind: "ground",
    x: 0,
    y: 0,
    z: 0,
    hx: map.halfSize,
    hz: map.halfSize,
    thickness: 0.4,
  } : null;
  if (ground) staticColliders.set("ground", createStaticCuboid(world, RAPIER, ground));

  for (let index = 0; index < map.walls.length; index += 1) {
    const spec = map.walls[index];
    const key = spec.doorId || `${spec.kind || "wall"}-${index}`;
    const collider = spec.kind === "building-stair"
      ? createStaticRamp(world, RAPIER, spec)
      : createStaticCuboid(world, RAPIER, spec);
    staticColliders.set(key, collider);
  }

  for (const door of map.doors) {
    const collider = createStaticCuboid(world, RAPIER, {
      kind: "building-door",
      x: door.x,
      y: door.y,
      z: door.z,
      hx: 0.25,
      hz: 1.2,
      height: 2.6,
      enabled: !door.open,
    });
    staticColliders.set(door.id, collider);
  }

  // Crates are physical obstacles for the chassis too.
  for (const crate of map.crates) {
    staticColliders.set(crate.id, createStaticCuboid(world, RAPIER, {
      x: crate.x,
      y: crate.y,
      z: crate.z,
      hx: 0.55,
      hz: 0.55,
      height: 0.8,
    }));
  }

  function createDynamicCuboid(bodyId, spec = {}) {
    if (!bodyId) throw new Error("Dynamic rigid body requires an id");
    if (dynamicBodies.has(bodyId)) return dynamicBodies.get(bodyId);
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
    const entry = { id: bodyId, body, colliders: [collider] };
    dynamicBodies.set(bodyId, entry);
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
    entry.colliders.push(collider);
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

  function step(dt = DEFAULT_TIMESTEP) {
    world.timestep = clamp(dt, MIN_TIMESTEP, MAX_TIMESTEP);
    world.step();
    dynamicsSteps += 1;
    return dynamicsSteps;
  }

  ctx.events.on("world:door", (payload = {}) => {
    const collider = staticColliders.get(payload.doorId);
    if (collider) collider.setEnabled(!Boolean(payload.open));
  });

  ctx.events.on("loot:opened", (payload = {}) => {
    const collider = staticColliders.get(payload.crateId);
    if (collider) collider.setEnabled(false);
  });

  ctx.services.provide("vehicle-physics", {
    RAPIER,
    world,
    createDynamicCuboid,
    addDynamicCuboidCollider,
    dynamicBody,
    dynamicBodyState,
    step,
    stats() {
      return {
        isolated: true,
        dynamicsSteps,
        dynamicBodies: dynamicBodies.size,
        staticColliders: staticColliders.size,
      };
    },
  });
}
