export const manifest = {
  id: "battle-royale-ragdoll-tuning",
  version: "1.3.0",
  requires: ["battle-royale-ragdoll", "rapier-physics"],
  capabilities: ["services.consume", "services.provide", "events.on"],
};

const EXPECTED_PARTS = 16;

const DEFAULT_TUNING = Object.freeze({
  linearDamping: 0.02,
  angularDamping: 0.02,
  headAngularDamping: 0.03,
  friction: 0.38,
  vehicleEjectX: 4.8,
  vehicleEjectY: 0.55,
  vehicleEjectZ: 3.8,
  vehicleEjectScaleStartKph: 10,
  vehicleEjectScaleSpanKph: 70,
  vehicleEjectScaleMaxExtra: 2.5,
});

const COMMON_TUMBLE = Object.freeze({
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

function horizontalSpeedKph(vector) {
  return Math.hypot(Number(vector?.x) || 0, Number(vector?.z) || 0) * 3.6;
}

function signFor(value) {
  const text = String(value ?? "ragdoll");
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash * 31) + text.charCodeAt(index)) | 0;
  }
  return (hash & 1) === 0 ? 1 : -1;
}

function normalizeTuning(patch = {}, base = DEFAULT_TUNING) {
  return {
    linearDamping: clamp(patch.linearDamping ?? base.linearDamping, 0, 0.12),
    angularDamping: clamp(patch.angularDamping ?? base.angularDamping, 0, 0.2),
    headAngularDamping: clamp(patch.headAngularDamping ?? base.headAngularDamping, 0, 0.25),
    friction: clamp(patch.friction ?? base.friction, 0.15, 1.0),
    vehicleEjectX: clamp(patch.vehicleEjectX ?? base.vehicleEjectX, 0.5, 10),
    vehicleEjectY: clamp(patch.vehicleEjectY ?? base.vehicleEjectY, 0, 2),
    vehicleEjectZ: clamp(patch.vehicleEjectZ ?? base.vehicleEjectZ, 0.5, 10),
    vehicleEjectScaleStartKph: clamp(
      patch.vehicleEjectScaleStartKph ?? base.vehicleEjectScaleStartKph,
      0,
      120,
    ),
    vehicleEjectScaleSpanKph: clamp(
      patch.vehicleEjectScaleSpanKph ?? base.vehicleEjectScaleSpanKph,
      20,
      240,
    ),
    vehicleEjectScaleMaxExtra: clamp(
      patch.vehicleEjectScaleMaxExtra ?? base.vehicleEjectScaleMaxExtra,
      0,
      3,
    ),
  };
}

function tuningSnapshot(tuning) {
  return { ...tuning };
}

function tumbleScale(reason, options, tuning) {
  if (reason === "vehicle-eject") {
    const speedKph = horizontalSpeedKph(options?.velocity);
    return 1 + clamp(
      (speedKph - tuning.vehicleEjectScaleStartKph) / tuning.vehicleEjectScaleSpanKph,
      0,
      tuning.vehicleEjectScaleMaxExtra,
    );
  }

  const speedKph = magnitude(options?.velocity) * 3.6;
  if (reason === "vehicle-hit") {
    return 1 + clamp((speedKph - 15) / 95, 0, 1.8);
  }
  if (reason === "high-fall") {
    return 1 + clamp((speedKph - 25) / 100, 0, 1.6);
  }
  return 1;
}

function tumbleBase(reason, tuning) {
  if (reason === "vehicle-eject") {
    return {
      x: tuning.vehicleEjectX,
      y: tuning.vehicleEjectY,
      z: tuning.vehicleEjectZ,
    };
  }
  return COMMON_TUMBLE[reason] ?? COMMON_TUMBLE.default;
}

function tumbleFor(reason, entityId, options, tuning) {
  const base = tumbleBase(reason, tuning);
  const sign = signFor(entityId);
  const scale = tumbleScale(reason, options, tuning);
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
  let currentTuning = normalizeTuning();
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

    const appliedTuning = tuningSnapshot(currentTuning);
    const reason = String(options?.reason ?? "impact");
    const common = tumbleFor(reason, entityId, options, appliedTuning);
    for (let index = 0; index < captured.length; index += 1) {
      const body = captured[index];
      body.setLinearDamping(appliedTuning.linearDamping);
      body.setAngularDamping(index === 3
        ? appliedTuning.headAngularDamping
        : appliedTuning.angularDamping);

      const angular = body.angvel();
      body.setAngvel({
        x: (Number(angular.x) || 0) + common.x,
        y: (Number(angular.y) || 0) + common.y,
        z: (Number(angular.z) || 0) + common.z,
      }, true);

      const collider = body.collider?.(0);
      collider?.setFriction?.(appliedTuning.friction);
    }

    tuned.set(entityId, {
      entityId,
      reason,
      bodies: captured.length,
      ...appliedTuning,
      tumble: common,
      speedKph: magnitude(options?.velocity) * 3.6,
      horizontalSpeedKph: horizontalSpeedKph(options?.velocity),
      tunedAt: Number(now) || Date.now(),
    });
    tunedActivations += 1;
    return activated;
  };

  ctx.events.on("ragdoll:ended", ({ entityId }) => tuned.delete(entityId));
  ctx.events.on("entity:removed", ({ entityId }) => tuned.delete(entityId));

  ctx.services.provide("ragdoll-tuning", {
    configure(patch = {}) {
      currentTuning = normalizeTuning(patch, currentTuning);
      return tuningSnapshot(currentTuning);
    },
    reset() {
      currentTuning = normalizeTuning();
      return tuningSnapshot(currentTuning);
    },
    current() {
      return tuningSnapshot(currentTuning);
    },
    stateFor(entityId) {
      const state = tuned.get(entityId);
      return state ? { ...state, tumble: { ...state.tumble } } : null;
    },
    summary() {
      return {
        activeTuned: tuned.size,
        tunedActivations,
        capturedBodyMismatches,
        ...tuningSnapshot(currentTuning),
      };
    },
  });
}
