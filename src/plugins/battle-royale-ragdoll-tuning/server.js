export const manifest = {
  id: "battle-royale-ragdoll-tuning",
  version: "1.2.0",
  requires: ["battle-royale-ragdoll", "rapier-physics"],
  capabilities: ["services.consume", "services.provide", "events.on"],
};

const EXPECTED_PARTS = 16;
const LINEAR_DAMPING = 0.02;
const ANGULAR_DAMPING = 0.02;
const HEAD_ANGULAR_DAMPING = 0.03;
const RAGDOLL_FRICTION = 0.38;

const COMMON_TUMBLE = Object.freeze({
  "vehicle-eject": Object.freeze({ x: 4.8, y: 0.55, z: 3.8 }),
  "vehicle-hit": Object.freeze({ x: 2.2, y: 0.28, z: 1.65 }),
  "high-fall": Object.freeze({ x: 1.65, y: 0.22, z: 1.28 }),
  death: Object.freeze({ x: 0.55, y: 0.10, z: 0.42 }),
  default: Object.freeze({ x: 0.70, y: 0.12, z: 0.54 }),
});

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

function signFor(value) {
  const text = String(value ?? "ragdoll");
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash * 31) + text.charCodeAt(index)) | 0;
  }
  return (hash & 1) === 0 ? 1 : -1;
}

function tumbleScale(reason, options) {
  const speedKph = magnitude(options?.velocity) * 3.6;
  if (reason === "vehicle-eject") {
    return 1 + clamp((speedKph - 10) / 70, 0, 2.5);
  }
  if (reason === "vehicle-hit") {
    return 1 + clamp((speedKph - 15) / 95, 0, 1.8);
  }
  if (reason === "high-fall") {
    return 1 + clamp((speedKph - 25) / 100, 0, 1.6);
  }
  return 1;
}

function tumbleFor(reason, entityId, options) {
  const base = COMMON_TUMBLE[reason] ?? COMMON_TUMBLE.default;
  const sign = signFor(entityId);
  const scale = tumbleScale(reason, options);
  return {
    x: base.x * sign * scale,
    y: base.y * scale,
    z: base.z * -sign * scale,
  };
}

export async function setup(ctx) {
  const ragdoll = ctx.services.get("ragdoll");
  const physics = ctx.services.get("physics");
  const world = physics.world;
  const originalActivate = ragdoll.activate.bind(ragdoll);
  const tuned = new Map();
  let tunedActivations = 0;
  let capturedBodyMismatches = 0;

  ragdoll.activate = (entityId, options = {}, now = Date.now()) => {
    const captured = [];
    const originalCreateRigidBody = world.createRigidBody.bind(world);
    world.createRigidBody = (descriptor) => {
      const body = originalCreateRigidBody(descriptor);
      captured.push(body);
      return body;
    };

    let activated = false;
    try {
      activated = originalActivate(entityId, options, now);
    } finally {
      world.createRigidBody = originalCreateRigidBody;
    }

    if (!activated || captured.length === 0) return activated;
    if (captured.length !== EXPECTED_PARTS) {
      capturedBodyMismatches += 1;
      return activated;
    }

    const reason = String(options?.reason ?? "impact");
    const common = tumbleFor(reason, entityId, options);
    for (let index = 0; index < captured.length; index += 1) {
      const body = captured[index];
      body.setLinearDamping(LINEAR_DAMPING);
      body.setAngularDamping(index === 3 ? HEAD_ANGULAR_DAMPING : ANGULAR_DAMPING);

      const angular = body.angvel();
      body.setAngvel({
        x: (Number(angular.x) || 0) + common.x,
        y: (Number(angular.y) || 0) + common.y,
        z: (Number(angular.z) || 0) + common.z,
      }, true);

      const collider = body.collider?.(0);
      collider?.setFriction?.(RAGDOLL_FRICTION);
    }

    tuned.set(entityId, {
      entityId,
      reason,
      bodies: captured.length,
      linearDamping: LINEAR_DAMPING,
      angularDamping: ANGULAR_DAMPING,
      headAngularDamping: HEAD_ANGULAR_DAMPING,
      friction: RAGDOLL_FRICTION,
      tumble: common,
      speedKph: magnitude(options?.velocity) * 3.6,
      tunedAt: Number(now) || Date.now(),
    });
    tunedActivations += 1;
    return activated;
  };

  ctx.events.on("ragdoll:ended", ({ entityId }) => tuned.delete(entityId));
  ctx.events.on("entity:removed", ({ entityId }) => tuned.delete(entityId));

  ctx.services.provide("ragdoll-tuning", {
    stateFor(entityId) {
      const state = tuned.get(entityId);
      return state ? { ...state, tumble: { ...state.tumble } } : null;
    },
    summary() {
      return {
        activeTuned: tuned.size,
        tunedActivations,
        capturedBodyMismatches,
        linearDamping: LINEAR_DAMPING,
        angularDamping: ANGULAR_DAMPING,
        headAngularDamping: HEAD_ANGULAR_DAMPING,
        friction: RAGDOLL_FRICTION,
      };
    },
  });
}
