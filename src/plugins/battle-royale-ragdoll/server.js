export const RAGDOLL_MIN_FALL_SPEED = 9.5;
export const RAGDOLL_VEHICLE_EJECT_SPEED = 3.5;
export const RAGDOLL_MAX_ACTIVE_SECONDS = 12;
export const RAGDOLL_DEAD_LIFETIME_SECONDS = 20;
export const RAGDOLL_REFERENCE_MASS = 69.4;
export const RAGDOLL_TARGET_MASS = 20;

export const manifest = {
  id: "battle-royale-ragdoll",
  version: "1.2.0",
  requires: [
    "rapier-physics",
    "movement",
    "entities",
    "health",
    "battle-royale",
    "battle-royale-vehicle",
    "battle-royale-parachute",
  ],
  capabilities: [
    "services.consume", "services.provide",
    "components.read", "components.write",
    "events.on", "events.emit",
  ],
};

const RAGDOLL_MASS_SCALE = RAGDOLL_TARGET_MASS / RAGDOLL_REFERENCE_MASS;

const PARTS = Object.freeze([
  { name: "pelvis", shape: "cuboid", side: 0, y: 0.91, forward: 0, hx: 0.19, hy: 0.11, hz: 0.13, mass: 9.0, impact: 0.90 },
  { name: "abdomen", shape: "cuboid", side: 0, y: 1.14, forward: 0, hx: 0.17, hy: 0.12, hz: 0.12, mass: 7.0, impact: 1.00 },
  { name: "chest", shape: "cuboid", side: 0, y: 1.42, forward: 0, hx: 0.25, hy: 0.16, hz: 0.14, mass: 16.0, impact: 1.05 },
  { name: "head", shape: "ball", side: 0, y: 1.72, forward: 0, radius: 0.14, mass: 5.0, impact: 1.40 },

  { name: "left-upper-arm", shape: "capsule", side: -0.29, y: 1.29, forward: 0, halfHeight: 0.12, radius: 0.08, mass: 2.3, impact: 0.45 },
  { name: "left-lower-arm", shape: "capsule", side: -0.29, y: 0.90, forward: 0, halfHeight: 0.12, radius: 0.07, mass: 1.6, impact: 0.45 },
  { name: "left-hand", shape: "ball", side: -0.29, y: 0.63, forward: 0, radius: 0.08, mass: 0.6, impact: 0.25 },

  { name: "right-upper-arm", shape: "capsule", side: 0.29, y: 1.29, forward: 0, halfHeight: 0.12, radius: 0.08, mass: 2.3, impact: 0.45 },
  { name: "right-lower-arm", shape: "capsule", side: 0.29, y: 0.90, forward: 0, halfHeight: 0.12, radius: 0.07, mass: 1.6, impact: 0.45 },
  { name: "right-hand", shape: "ball", side: 0.29, y: 0.63, forward: 0, radius: 0.08, mass: 0.6, impact: 0.25 },

  { name: "left-upper-leg", shape: "capsule", side: -0.11, y: 0.62, forward: 0, halfHeight: 0.09, radius: 0.09, mass: 6.5, impact: 0.70 },
  { name: "left-lower-leg", shape: "capsule", side: -0.11, y: 0.27, forward: 0, halfHeight: 0.08, radius: 0.09, mass: 4.2, impact: 0.55 },
  { name: "left-foot", shape: "cuboid", side: -0.11, y: 0.05, forward: 0.08, hx: 0.08, hy: 0.05, hz: 0.16, mass: 1.0, impact: 0.35 },

  { name: "right-upper-leg", shape: "capsule", side: 0.11, y: 0.62, forward: 0, halfHeight: 0.09, radius: 0.09, mass: 6.5, impact: 0.70 },
  { name: "right-lower-leg", shape: "capsule", side: 0.11, y: 0.27, forward: 0, halfHeight: 0.08, radius: 0.09, mass: 4.2, impact: 0.55 },
  { name: "right-foot", shape: "cuboid", side: 0.11, y: 0.05, forward: 0.08, hx: 0.08, hy: 0.05, hz: 0.16, mass: 1.0, impact: 0.35 },
]);

const SOUND_COOLDOWN_SECONDS = 0.11;
const DAMAGE_COOLDOWN_SECONDS = 0.22;
const RECOVER_STABLE_SECONDS = 0.55;
const RECOVER_MIN_ACTIVE_SECONDS = 0.90;
const RECOVER_CORE_MAX_LINEAR_SPEED = 0.85;
const RECOVER_CORE_MAX_ANGULAR_SPEED = 1.5;
const RECOVER_TIMEOUT_MAX_LINEAR_SPEED = 2.0;
const RECOVER_TIMEOUT_MAX_ANGULAR_SPEED = 3.0;
const RECOVER_SUPPORT_PROBE_DISTANCE = 3.5;
const RECOVERY_CORE_PARTS = new Set([
  "pelvis", "abdomen", "chest", "head", "left-upper-leg", "right-upper-leg",
]);
const IMPACT_SOUND_THRESHOLD = 1.35;
const IMPACT_DAMAGE_THRESHOLD = 4.0;
const CONTROL_CHEST_TORQUE = 5.2;
const CONTROL_PELVIS_TORQUE = 3.0;
const MAX_ACTIVE_RAGDOLLS = 8;
const VEHICLE_PEDESTRIAN_HIT_SPEED = 3.0;
const PARACHUTE_HANDOFF_MIN_ALTITUDE = 8;

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}

function magnitude(vector) {
  return Math.hypot(
    Number(vector?.x) || 0,
    Number(vector?.y) || 0,
    Number(vector?.z) || 0,
  );
}

function vecSub(a, b) {
  return {
    x: (Number(a?.x) || 0) - (Number(b?.x) || 0),
    y: (Number(a?.y) || 0) - (Number(b?.y) || 0),
    z: (Number(a?.z) || 0) - (Number(b?.z) || 0),
  };
}

function yawRotation(angle) {
  const half = (Number(angle) || 0) / 2;
  return { x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) };
}

function basis(angle) {
  const a = Number(angle) || 0;
  return {
    forward: { x: Math.sin(a), y: 0, z: -Math.cos(a) },
    right: { x: Math.cos(a), y: 0, z: Math.sin(a) },
  };
}

function worldPosition(base, angle, part) {
  const axes = basis(angle);
  return {
    x: (Number(base?.x) || 0) + axes.right.x * part.side + axes.forward.x * part.forward,
    y: (Number(base?.y) || 0) + part.y,
    z: (Number(base?.z) || 0) + axes.right.z * part.side + axes.forward.z * part.forward,
  };
}

function bodyPublic(part) {
  const position = part.body.translation();
  const rotation = part.body.rotation();
  const linvel = part.body.linvel();
  const angvel = part.body.angvel();
  return {
    name: part.name,
    x: position.x,
    y: position.y,
    z: position.z,
    rotation: { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w },
    linvel: { x: linvel.x, y: linvel.y, z: linvel.z },
    angvel: { x: angvel.x, y: angvel.y, z: angvel.z },
  };
}

export async function setup(ctx) {
  const physics = ctx.services.get("physics");
  const movement = ctx.services.get("movement");
  const entities = ctx.services.get("entities");
  const health = ctx.services.get("health");
  const battleRoyale = ctx.services.get("battle-royale");
  const vehicles = ctx.services.get("vehicles");
  const parachute = ctx.services.get("parachute");
  const { RAPIER, world } = physics;

  const active = new Map();
  const ragdollColliderOwners = new Map();
  const characterColliderOwners = new Map();

  // Keep entity ownership for real character colliders created after this plugin
  // comes online. This lets the vehicle contact graph identify the character it hit
  // without introducing a second collision model.
  const originalCreateCharacter = physics.createCharacter.bind(physics);
  physics.createCharacter = (entityId, position) => {
    const entry = originalCreateCharacter(entityId, position);
    if (entry?.collider) characterColliderOwners.set(entry.collider.handle, entityId);
    return entry;
  };
  const originalRemoveCharacter = physics.removeCharacter.bind(physics);
  physics.removeCharacter = (entityId) => {
    for (const [handle, owner] of characterColliderOwners) {
      if (owner === entityId) characterColliderOwners.delete(handle);
    }
    return originalRemoveCharacter(entityId);
  };

  // Weapons already use physics.raycast dynamically. Preserve the real Rapier
  // raycast and only attach the owning entity when the hit collider is a
  // ragdoll body part.
  const originalRaycast = physics.raycast.bind(physics);
  physics.raycast = (...args) => {
    const hit = originalRaycast(...args);
    if (!hit || hit.entityId) return hit;
    const entityId = ragdollColliderOwners.get(hit.colliderHandle);
    return entityId ? { ...hit, entityId } : hit;
  };

  let frameNow = Date.now();
  let totalStarted = 0;
  let totalRecovered = 0;
  let totalImpacts = 0;
  let totalDamage = 0;

  function makeColliderDesc(spec) {
    let desc;
    if (spec.shape === "ball") {
      desc = RAPIER.ColliderDesc.ball(spec.radius);
    } else if (spec.shape === "capsule") {
      desc = RAPIER.ColliderDesc.capsule(spec.halfHeight, spec.radius);
    } else {
      desc = RAPIER.ColliderDesc.cuboid(spec.hx, spec.hy, spec.hz);
    }
    return desc
      .setMass(spec.mass * RAGDOLL_MASS_SCALE)
      .setFriction(0.74)
      .setRestitution(0.025);
  }

  function createPart(entityId, base, angle, spec, initialVelocity, tumble) {
    const position = worldPosition(base, angle, spec);
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(position.x, position.y, position.z)
        .setRotation(yawRotation(angle))
        .setLinearDamping(0.08)
        .setAngularDamping(spec.name === "head" ? 0.30 : 0.20)
        .setCanSleep(true)
        .setCcdEnabled(true),
    );
    body.setAdditionalSolverIterations(4);
    body.setLinvel(initialVelocity, true);
    body.setAngvel({
      x: (Math.random() - 0.5) * tumble,
      y: (Math.random() - 0.5) * tumble * 0.55,
      z: (Math.random() - 0.5) * tumble,
    }, true);

    const collider = world.createCollider(makeColliderDesc(spec), body);
    ragdollColliderOwners.set(collider.handle, entityId);

    return {
      name: spec.name,
      body,
      collider,
      impactMultiplier: spec.impact,
      previousVelocity: { ...initialVelocity },
    };
  }

  function connect(entry, type, parentName, childName, anchor1, anchor2, options = {}) {
    const parent = entry.byName.get(parentName);
    const child = entry.byName.get(childName);
    if (!parent || !child) throw new Error(`Ragdoll joint parts missing: ${parentName}/${childName}`);

    let descriptor;
    if (type === "spherical") {
      descriptor = RAPIER.JointData.spherical(anchor1, anchor2);
    } else {
      descriptor = RAPIER.JointData.revolute(
        anchor1,
        anchor2,
        options.axis ?? { x: 1, y: 0, z: 0 },
      );
    }
    const joint = world.createImpulseJoint(descriptor, parent.body, child.body, true);
    joint.setContactsEnabled(false);
    if (type === "revolute" && Array.isArray(options.limits)) {
      joint.setLimits(options.limits[0], options.limits[1]);
    }
    entry.joints.push(joint);
  }

  function buildJoints(entry) {
    connect(entry, "revolute", "pelvis", "abdomen",
      { x: 0, y: 0.11, z: 0 }, { x: 0, y: -0.12, z: 0 },
      { limits: [-0.35, 0.45] });
    connect(entry, "revolute", "abdomen", "chest",
      { x: 0, y: 0.12, z: 0 }, { x: 0, y: -0.16, z: 0 },
      { limits: [-0.38, 0.48] });
    connect(entry, "revolute", "chest", "head",
      { x: 0, y: 0.16, z: 0 }, { x: 0, y: -0.14, z: 0 },
      { limits: [-0.55, 0.55] });

    for (const side of ["left", "right"]) {
      const sign = side === "left" ? -1 : 1;
      connect(entry, "spherical", "chest", `${side}-upper-arm`,
        { x: sign * 0.29, y: 0.07, z: 0 }, { x: 0, y: 0.20, z: 0 });
      connect(entry, "revolute", `${side}-upper-arm`, `${side}-lower-arm`,
        { x: 0, y: -0.20, z: 0 }, { x: 0, y: 0.19, z: 0 },
        { axis: { x: 1, y: 0, z: 0 }, limits: [-0.15, 2.35] });
      connect(entry, "spherical", `${side}-lower-arm`, `${side}-hand`,
        { x: 0, y: -0.19, z: 0 }, { x: 0, y: 0.08, z: 0 });

      connect(entry, "spherical", "pelvis", `${side}-upper-leg`,
        { x: sign * 0.11, y: -0.11, z: 0 }, { x: 0, y: 0.18, z: 0 });
      connect(entry, "revolute", `${side}-upper-leg`, `${side}-lower-leg`,
        { x: 0, y: -0.18, z: 0 }, { x: 0, y: 0.17, z: 0 },
        { axis: { x: 1, y: 0, z: 0 }, limits: [-0.12, 2.45] });
      connect(entry, "revolute", `${side}-lower-leg`, `${side}-foot`,
        { x: 0, y: -0.17, z: 0 }, { x: 0, y: 0.05, z: 0.08 },
        { axis: { x: 1, y: 0, z: 0 }, limits: [-0.55, 0.55] });
    }
  }

  function capturedMovementVelocity(entityId, transform) {
    const input = ctx.components.get(entityId, "Input") ?? {};
    const angle = Number(transform?.angle) || 0;
    const axes = basis(angle);
    const rawForward = clamp(input.forward, -1, 1);
    const rawStrafe = clamp(input.strafe, -1, 1);
    const length = Math.hypot(rawForward, rawStrafe);
    const scale = length > 1 ? 1 / length : 1;
    const speed = input.sprint ? 5.4 : 3.25;
    return {
      x: (axes.forward.x * rawForward + axes.right.x * rawStrafe) * scale * speed,
      y: Number(transform?.verticalVelocity) || 0,
      z: (axes.forward.z * rawForward + axes.right.z * rawStrafe) * scale * speed,
    };
  }

  function applyInitialImpulse(entry, impulse) {
    if (!impulse) return;
    const vector = {
      x: Number(impulse.x) || 0,
      y: Number(impulse.y) || 0,
      z: Number(impulse.z) || 0,
    };
    const pelvis = entry.byName.get("pelvis");
    const chest = entry.byName.get("chest");
    pelvis?.body.applyImpulse({ x: vector.x * 0.65, y: vector.y * 0.65, z: vector.z * 0.65 }, true);
    chest?.body.applyImpulse({ x: vector.x * 0.35, y: vector.y * 0.35, z: vector.z * 0.35 }, true);
  }

  function activate(entityId, options = {}, now = frameNow) {
    if (!entityId) return false;
    const existing = active.get(entityId);
    if (existing) {
      if (options.dead) existing.dead = true;
      return true;
    }
    if (active.size >= MAX_ACTIVE_RAGDOLLS) return false;

    const entity = entities.get(entityId);
    const transform = ctx.components.get(entityId, "Transform");
    if (!entity || !transform) return false;
    if (!options.dead && !entity.alive) return false;

    const base = options.position ?? {
      x: Number(transform.x) || 0,
      y: Number(transform.y) || 0,
      z: Number(transform.z) || 0,
    };
    const angle = Number.isFinite(options.angle) ? Number(options.angle) : (Number(transform.angle) || 0);
    const initialVelocity = options.velocity
      ? {
        x: Number(options.velocity.x) || 0,
        y: Number(options.velocity.y) || 0,
        z: Number(options.velocity.z) || 0,
      }
      : capturedMovementVelocity(entityId, transform);
    const reason = String(options.reason ?? "impact");
    const tumble = reason === "vehicle-eject" ? 1.8 : reason === "high-fall" ? 0.9 : 0.55;

    movement.setInput(entityId, {});
    physics.setCharacterEnabled(entityId, false);
    transform.verticalVelocity = 0;
    transform.grounded = false;

    const entry = {
      entityId,
      reason,
      dead: Boolean(options.dead || !entity.alive),
      angle,
      startedAt: Number(now) || Date.now(),
      elapsed: 0,
      stableSeconds: 0,
      soundCooldown: 0,
      damageCooldown: 0,
      lastImpact: 0,
      lastImpactPart: null,
      pendingImpact: null,
      input: { forward: 0, strafe: 0, turn: 0, sprint: false },
      parts: [],
      byName: new Map(),
      joints: [],
      colliderHandles: new Set(),
      hadExternalContact: false,
      recoveryRequested: false,
      cleanupRequested: false,
    };

    for (const spec of PARTS) {
      const part = createPart(entityId, base, angle, spec, initialVelocity, tumble);
      entry.parts.push(part);
      entry.byName.set(part.name, part);
      entry.colliderHandles.add(part.collider.handle);
    }
    buildJoints(entry);
    applyInitialImpulse(entry, options.impulse);
    active.set(entityId, entry);
    totalStarted += 1;

    ctx.events.emit("ragdoll:started", {
      entityId,
      reason,
      dead: entry.dead,
      parts: entry.parts.length,
      joints: entry.joints.length,
      x: base.x,
      y: base.y,
      z: base.z,
      now,
    });
    return true;
  }

  function setInput(entityId, input = {}) {
    const entry = active.get(entityId);
    if (!entry || entry.dead) return false;
    entry.input = {
      forward: clamp(input.forward, -1, 1),
      strafe: clamp(input.strafe, -1, 1),
      turn: clamp(input.turn, -1, 1),
      sprint: Boolean(input.sprint),
    };
    return true;
  }

  function applyAirControl(entry, dt) {
    if (entry.dead) return;
    const input = entry.input;
    const amount = Math.hypot(input.forward, input.strafe, input.turn);
    if (amount < 0.02) return;

    const axes = basis(entry.angle);
    const boost = input.sprint ? 1.35 : 1;
    const torque = {
      x: (
        axes.right.x * input.forward
        + axes.forward.x * -input.strafe
      ) * CONTROL_CHEST_TORQUE * dt * boost,
      y: input.turn * CONTROL_CHEST_TORQUE * 0.48 * dt * boost,
      z: (
        axes.right.z * input.forward
        + axes.forward.z * -input.strafe
      ) * CONTROL_CHEST_TORQUE * dt * boost,
    };
    const pelvisTorque = {
      x: torque.x * (CONTROL_PELVIS_TORQUE / CONTROL_CHEST_TORQUE),
      y: torque.y * (CONTROL_PELVIS_TORQUE / CONTROL_CHEST_TORQUE),
      z: torque.z * (CONTROL_PELVIS_TORQUE / CONTROL_CHEST_TORQUE),
    };
    entry.byName.get("chest")?.body.applyTorqueImpulse(torque, true);
    entry.byName.get("pelvis")?.body.applyTorqueImpulse(pelvisTorque, true);
  }

  function hasActualExternalContact(entry, part) {
    let touching = false;
    world.contactPairsWith(part.collider, (other) => {
      if (touching || entry.colliderHandles.has(other.handle)) return;
      if (pairHasActualContact(part.collider, other)) touching = true;
    });
    return touching;
  }

  function pairHasActualContact(collider1, collider2) {
    let touching = false;
    world.contactPair(collider1, collider2, (manifold) => {
      if (manifold.numContacts() > 0 || manifold.numSolverContacts() > 0) touching = true;
    });
    return touching;
  }

  function detectVehiclePedestrianHits(now) {
    const vehicle = vehicles.stateFor();
    const speed = Math.max(0, Number(vehicle?.speed) || 0);
    if (speed < VEHICLE_PEDESTRIAN_HIT_SPEED) return;

    const body = physics.dynamicBody(vehicles.vehicleId);
    const chassisCollider = body?.collider?.(0);
    if (!chassisCollider) return;

    const hitIds = new Set();
    world.contactPairsWith(chassisCollider, (other) => {
      const entityId = characterColliderOwners.get(other.handle)
        ?? physics.entityIdForCollider?.(other);
      if (!entityId || entityId === vehicle.driverId || active.has(entityId)) return;
      const entity = entities.get(entityId);
      if (!entity?.alive || entity.bot) return;
      if (!pairHasActualContact(chassisCollider, other)) return;
      hitIds.add(entityId);
    });

    if (!hitIds.size) return;
    const linvel = vehicle.linvel ?? { x: 0, y: 0, z: 0 };
    const horizontal = Math.hypot(Number(linvel.x) || 0, Number(linvel.z) || 0) || 1;
    const knock = Math.min(3.4, 1.0 + speed * 0.10);
    for (const entityId of hitIds) {
      activate(entityId, {
        reason: "vehicle-hit",
        velocity: {
          x: (Number(linvel.x) || 0) * 0.72,
          y: Math.max(0.6, (Number(linvel.y) || 0) * 0.35 + 0.9),
          z: (Number(linvel.z) || 0) * 0.72,
        },
        impulse: {
          x: ((Number(linvel.x) || 0) / horizontal) * knock,
          y: 1.15 + Math.min(1.2, speed * 0.045),
          z: ((Number(linvel.z) || 0) / horizontal) * knock,
        },
      }, now);
    }
  }

  function syncTransform(entry, hasContact) {
    const transform = ctx.components.get(entry.entityId, "Transform");
    const pelvis = entry.byName.get("pelvis")?.body;
    if (!transform || !pelvis) return;
    const p = pelvis.translation();
    transform.x = p.x;
    transform.y = Math.max(0, p.y - 0.91);
    transform.z = p.z;
    transform.angle = entry.angle;
    transform.verticalVelocity = 0;
    transform.grounded = Boolean(hasContact);
  }

  function substepBefore(dt) {
    const safeDt = clamp(dt, 0, 0.05);
    for (const entry of active.values()) {
      for (const part of entry.parts) {
        const velocity = part.body.linvel();
        part.previousVelocity = { x: velocity.x, y: velocity.y, z: velocity.z };
      }
      applyAirControl(entry, safeDt);
    }
  }

  function hasRecoverySupport(entry) {
    const pelvis = entry.byName.get("pelvis")?.body;
    if (!pelvis || typeof physics.raycastSupportWorld !== "function") return false;
    const p = pelvis.translation();
    const origin = { x: p.x, y: p.y + 0.35, z: p.z };
    return Boolean(physics.raycastSupportWorld(
      origin,
      { x: 0, y: -1, z: 0 },
      RECOVER_SUPPORT_PROBE_DISTANCE,
    ));
  }

  function substepAfter(dt) {
    const safeDt = clamp(dt, 0, 0.05);
    for (const entry of active.values()) {
      entry.elapsed += safeDt;
      entry.soundCooldown = Math.max(0, entry.soundCooldown - safeDt);
      entry.damageCooldown = Math.max(0, entry.damageCooldown - safeDt);

      let anyContact = false;
      let maxCoreLinearSpeed = 0;
      let maxCoreAngularSpeed = 0;
      let strongest = entry.pendingImpact;

      for (const part of entry.parts) {
        const velocity = part.body.linvel();
        const angular = part.body.angvel();
        if (RECOVERY_CORE_PARTS.has(part.name)) {
          maxCoreLinearSpeed = Math.max(maxCoreLinearSpeed, magnitude(velocity));
          maxCoreAngularSpeed = Math.max(maxCoreAngularSpeed, magnitude(angular));
        }

        const touching = hasActualExternalContact(entry, part);
        if (!touching) continue;
        anyContact = true;

        const deltaVelocity = magnitude(vecSub(velocity, part.previousVelocity));
        const severity = deltaVelocity * part.impactMultiplier;
        if (severity >= IMPACT_SOUND_THRESHOLD && (!strongest || severity > strongest.severity)) {
          const p = part.body.translation();
          strongest = {
            severity,
            rawDeltaVelocity: deltaVelocity,
            part: part.name,
            multiplier: part.impactMultiplier,
            x: p.x,
            y: p.y,
            z: p.z,
          };
        }
      }

      entry.pendingImpact = strongest;
      entry.hadExternalContact = anyContact;
      syncTransform(entry, anyContact);

      const supported = anyContact && hasRecoverySupport(entry);
      if (supported
        && maxCoreLinearSpeed < RECOVER_CORE_MAX_LINEAR_SPEED
        && maxCoreAngularSpeed < RECOVER_CORE_MAX_ANGULAR_SPEED) {
        entry.stableSeconds += safeDt;
      } else {
        entry.stableSeconds = 0;
      }

      if (!entry.dead
        && entry.elapsed >= RECOVER_MIN_ACTIVE_SECONDS
        && entry.stableSeconds >= RECOVER_STABLE_SECONDS) {
        entry.recoveryRequested = true;
      }
      if (!entry.dead
        && entry.elapsed >= RAGDOLL_MAX_ACTIVE_SECONDS
        && supported
        && maxCoreLinearSpeed < RECOVER_TIMEOUT_MAX_LINEAR_SPEED
        && maxCoreAngularSpeed < RECOVER_TIMEOUT_MAX_ANGULAR_SPEED) {
        entry.recoveryRequested = true;
      }
      if (entry.dead && entry.elapsed >= RAGDOLL_DEAD_LIFETIME_SECONDS) {
        entry.cleanupRequested = true;
      }
    }
    detectVehiclePedestrianHits(frameNow);
  }

  function impactDamage(impact) {
    const excess = Math.max(0, Number(impact?.severity) - 3.6);
    return Math.min(90, Math.round(excess * excess * 1.25));
  }

  function flushImpact(entry, now) {
    const impact = entry.pendingImpact;
    entry.pendingImpact = null;
    if (!impact || impact.severity < IMPACT_SOUND_THRESHOLD) return;

    entry.lastImpact = impact.severity;
    entry.lastImpactPart = impact.part;
    totalImpacts += 1;
    ctx.events.emit("ragdoll:impact", {
      entityId: entry.entityId,
      reason: entry.reason,
      part: impact.part,
      severity: impact.severity,
      deltaVelocity: impact.rawDeltaVelocity,
      x: impact.x,
      y: impact.y,
      z: impact.z,
      now,
    });

    if (entry.soundCooldown <= 0) {
      const key = impact.severity >= 3.2
        ? (Math.random() < 0.5 ? "ragdoll.impact.1" : "ragdoll.impact.2")
        : "ragdoll.impact.soft";
      ctx.events.emit("sound:spatial", {
        entityId: entry.entityId,
        key,
        ragdollPart: impact.part,
        intensity: clamp(impact.severity / 7, 0.35, 1.25),
        x: impact.x,
        y: impact.y,
        z: impact.z,
        radius: impact.severity >= 3.2 ? 36 : 25,
      });
      entry.soundCooldown = SOUND_COOLDOWN_SECONDS;
    }

    const entity = entities.get(entry.entityId);
    if (!entry.dead && entity?.alive && entry.damageCooldown <= 0 && impact.severity >= IMPACT_DAMAGE_THRESHOLD) {
      const damage = impactDamage(impact);
      if (damage > 0) {
        const result = health.applyDamage(entry.entityId, damage, {
          attackerId: null,
          weaponId: "ragdoll-impact",
          now,
        });
        totalDamage += result.applied ?? 0;
        entry.damageCooldown = DAMAGE_COOLDOWN_SECONDS;
        if (result.killed) entry.dead = true;
      }
    }
  }

  function removeBodies(entry) {
    for (const joint of entry.joints) {
      if (joint?.isValid?.()) world.removeImpulseJoint(joint, true);
    }
    entry.joints.length = 0;

    for (const part of entry.parts) {
      ragdollColliderOwners.delete(part.collider.handle);
      physics.unregisterEntityCollider?.(part.collider);
      if (part.body?.isValid?.()) world.removeRigidBody(part.body);
    }
    entry.parts.length = 0;
    entry.byName.clear();
    entry.colliderHandles.clear();
    world.propagateModifiedBodyPositionsToColliders?.();
  }

  function deployParachute(entityId, now = frameNow) {
    const entry = active.get(entityId);
    const entity = entities.get(entityId);
    const pelvis = entry?.byName.get("pelvis")?.body;
    if (!entry || entry.dead || !entity?.alive || entity.bot || entity.kind !== "human" || !pelvis) return false;

    const p = pelvis.translation();
    const velocity = pelvis.linvel();
    const targetY = Number(p.y) - 0.91;
    if (!Number.isFinite(targetY) || targetY < PARACHUTE_HANDOFF_MIN_ALTITUDE) return false;

    const probeLift = 0.12;
    const probeDistance = Math.max(20, Number(parachute.constants?.groundProbeDistance) || 700);
    const support = physics.raycastSupportWorld(
      { x: p.x, y: targetY + probeLift, z: p.z },
      { x: 0, y: -1, z: 0 },
      probeDistance,
    );
    const clearance = support
      ? Math.max(0, Number(support.distance) - probeLift)
      : Infinity;
    const minimumClearance = Math.max(0, Number(parachute.constants?.minimumDeployClearance) || 3.2);
    if (clearance < minimumClearance) return false;

    const target = { x: p.x, y: targetY, z: p.z, angle: entry.angle };
    const verticalVelocity = Number(velocity.y) || 0;
    const duration = entry.elapsed;
    const ragdollReason = entry.reason;

    removeBodies(entry);
    active.delete(entityId);
    movement.setInput(entityId, {});
    physics.setCharacterEnabled(entityId, true);

    const launched = parachute.launch(entityId, {
      x: target.x,
      z: target.z,
      angle: target.angle,
      altitude: target.y,
    }, now);
    const transform = ctx.components.get(entityId, "Transform");
    if (!launched || !transform) {
      movement.teleport(entityId, target);
      if (transform) {
        transform.verticalVelocity = verticalVelocity;
        transform.grounded = false;
      }
      ctx.events.emit("ragdoll:ended", {
        entityId,
        reason: ragdollReason,
        recovered: false,
        handoff: "freefall",
        duration,
        x: target.x,
        y: target.y,
        z: target.z,
        now,
      });
      return false;
    }

    // Preserve the real downward speed captured from the Rapier pelvis. If the
    // catapult is still travelling upward, the existing parachute deploy logic
    // safely clamps that transition into canopy inflation instead of preserving
    // an absurd upward solver-explosion velocity.
    transform.verticalVelocity = verticalVelocity;
    transform.grounded = false;
    const deployed = parachute.deploy(entityId, now);

    ctx.events.emit("ragdoll:ended", {
      entityId,
      reason: ragdollReason,
      recovered: false,
      handoff: deployed ? "parachute" : "freefall",
      duration,
      x: target.x,
      y: target.y,
      z: target.z,
      verticalVelocity,
      now,
    });
    return Boolean(deployed);
  }

  function recoveryTarget(entry) {
    const pelvis = entry.byName.get("pelvis")?.body;
    if (!pelvis) return null;
    const p = pelvis.translation();
    const origin = { x: p.x, y: p.y + 2.5, z: p.z };
    const support = physics.raycastSupportWorld(origin, { x: 0, y: -1, z: 0 }, 9);
    if (!support) return null;
    const groundY = origin.y - support.distance;
    return { x: p.x, y: groundY + 0.02, z: p.z, angle: entry.angle };
  }

  function recover(entry, now) {
    const target = recoveryTarget(entry);
    if (!target) {
      entry.recoveryRequested = false;
      return false;
    }
    removeBodies(entry);
    active.delete(entry.entityId);
    const entity = entities.get(entry.entityId);
    if (entity?.alive) {
      physics.setCharacterEnabled(entry.entityId, true);
      movement.teleport(entry.entityId, target);
    }
    totalRecovered += 1;
    ctx.events.emit("ragdoll:ended", {
      entityId: entry.entityId,
      reason: entry.reason,
      recovered: Boolean(entity?.alive),
      duration: entry.elapsed,
      x: target.x,
      y: target.y,
      z: target.z,
      now,
    });
    return true;
  }

  function cleanup(entry, now, reason = "expired") {
    const pelvis = entry.byName.get("pelvis")?.body;
    const p = pelvis?.translation();
    const transform = ctx.components.get(entry.entityId, "Transform");
    if (transform && p) {
      transform.x = p.x;
      transform.y = Math.max(0, p.y - 0.91);
      transform.z = p.z;
      transform.verticalVelocity = 0;
      transform.grounded = false;
    }
    removeBodies(entry);
    active.delete(entry.entityId);
    ctx.events.emit("ragdoll:ended", {
      entityId: entry.entityId,
      reason,
      recovered: false,
      duration: entry.elapsed,
      x: p?.x ?? null,
      y: p?.y ?? null,
      z: p?.z ?? null,
      now,
    });
  }

  function scanForHighFalls(now) {
    if (!battleRoyale.isActive()) return;
    for (const entity of entities.all()) {
      if (!entity?.alive || entity.bot || entity.kind !== "human") continue;
      if (active.has(entity.id) || vehicles.isDriving(entity.id)) continue;
      if (parachute.stateFor(entity.id)?.airborne) continue;
      const transform = ctx.components.get(entity.id, "Transform");
      if (!transform || Number(transform.verticalVelocity) > -RAGDOLL_MIN_FALL_SPEED) continue;
      activate(entity.id, {
        reason: "high-fall",
        velocity: capturedMovementVelocity(entity.id, transform),
      }, now);
    }
  }

  function beginFrame(dt, now = Date.now()) {
    frameNow = Number(now) || Date.now();
    scanForHighFalls(frameNow);
    for (const entry of active.values()) {
      entry.pendingImpact = null;
    }
  }

  function endFrame(now = frameNow) {
    frameNow = Number(now) || frameNow;
    for (const entry of [...active.values()]) {
      flushImpact(entry, frameNow);
      if (entry.recoveryRequested && !entry.dead) recover(entry, frameNow);
      else if (entry.cleanupRequested) cleanup(entry, frameNow);
    }
  }

  function stateFor(entityId) {
    const entry = active.get(entityId);
    if (!entry) return null;
    return {
      entityId,
      active: true,
      reason: entry.reason,
      dead: entry.dead,
      elapsed: entry.elapsed,
      stableSeconds: entry.stableSeconds,
      grounded: entry.hadExternalContact,
      lastImpact: entry.lastImpact,
      lastImpactPart: entry.lastImpactPart,
      input: { ...entry.input },
      parts: entry.parts.map(bodyPublic),
    };
  }

  function snapshot() {
    return [...active.keys()].map(stateFor).filter(Boolean);
  }

  const originalPhysicsStep = physics.step.bind(physics);
  physics.step = (dt) => {
    substepBefore(dt);
    const result = originalPhysicsStep(dt);
    substepAfter(dt);
    return result;
  };

  ctx.events.on("entity:died", ({ entityId }) => {
    const entity = entities.get(entityId);
    if (entity?.bot) return;
    const current = active.get(entityId);
    if (current) {
      current.dead = true;
      current.input = { forward: 0, strafe: 0, turn: 0, sprint: false };
      return;
    }
    activate(entityId, { reason: "death", dead: true }, frameNow);
  });

  ctx.events.on("entity:respawned", ({ entityId }) => {
    const current = active.get(entityId);
    if (current) cleanup(current, frameNow, "respawn");
  });

  ctx.events.on("entity:removed", ({ entityId }) => {
    const current = active.get(entityId);
    if (current) cleanup(current, frameNow, "entity-removed");
  });

  ctx.services.provide("ragdoll", {
    activate,
    setInput,
    deployParachute,
    beginFrame,
    endFrame,
    isActive(entityId) { return active.has(entityId); },
    stateFor,
    snapshot,
    summary() {
      return {
        active: active.size,
        totalStarted,
        totalRecovered,
        totalImpacts,
        totalDamage,
        bodies: [...active.values()].reduce((sum, entry) => sum + entry.parts.length, 0),
        joints: [...active.values()].reduce((sum, entry) => sum + entry.joints.length, 0),
        states: snapshot(),
      };
    },
    constants: {
      minFallSpeed: RAGDOLL_MIN_FALL_SPEED,
      vehicleEjectSpeed: RAGDOLL_VEHICLE_EJECT_SPEED,
      bodyParts: PARTS.length,
      referenceMass: RAGDOLL_REFERENCE_MASS,
      targetMass: RAGDOLL_TARGET_MASS,
      massScale: RAGDOLL_MASS_SCALE,
    },
  });
}
