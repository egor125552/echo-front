export const manifest = {
  id: "battle-royale-ragdoll-tuning",
  version: "1.8.0",
  requires: ["battle-royale-ragdoll", "rapier-physics"],
  capabilities: ["services.consume", "services.provide", "events.on"],
};

const EXPECTED_PARTS = 16;
const REASONS = Object.freeze([
  "vehicle-eject",
  "vehicle-crash",
  "vehicle-hit",
  "high-fall",
  "building-impact",
  "parkour-pose",
  "death",
  "default",
]);
const SPEED_MODES = new Set(["none", "horizontal", "vertical", "total"]);

const BASE_PHYSICS = Object.freeze({
  linearDamping: 0.02,
  angularDamping: 0.02,
  headAngularDamping: 0.03,
  friction: 0.38,
});

const DEFAULT_PROFILES = Object.freeze({
  "vehicle-eject": Object.freeze({
    // Ejection spin is intentionally tied to the inherited horizontal vehicle
    // speed. A slow jump-out still tumbles, but faster cars create proportionally
    // stronger pitch/roll and keep that rotation longer in the air.
    linearDamping: 0.014,
    angularDamping: 0.008,
    headAngularDamping: 0.012,
    friction: 0.28,
    x: 5.0, y: 0.60, z: 4.1,
    speedMode: "horizontal", scaleStartKph: 8, scaleSpanKph: 46, scaleMaxExtra: 3.0,
  }),
  "vehicle-crash": Object.freeze({
    linearDamping: 0.016,
    angularDamping: 0.011,
    headAngularDamping: 0.016,
    friction: 0.32,
    x: 3.6, y: 0.40, z: 3.0,
    speedMode: "horizontal", scaleStartKph: 20, scaleSpanKph: 90, scaleMaxExtra: 2.5,
  }),
  "vehicle-hit": Object.freeze({
    ...BASE_PHYSICS,
    x: 2.2, y: 0.28, z: 1.65,
    speedMode: "total", scaleStartKph: 15, scaleSpanKph: 95, scaleMaxExtra: 1.8,
  }),
  "high-fall": Object.freeze({
    ...BASE_PHYSICS,
    x: 1.65, y: 0.22, z: 1.28,
    speedMode: "total", scaleStartKph: 25, scaleSpanKph: 100, scaleMaxExtra: 1.6,
  }),
  "building-impact": Object.freeze({
    ...BASE_PHYSICS,
    x: 0.70, y: 0.12, z: 0.54,
    speedMode: "none", scaleStartKph: 0, scaleSpanKph: 100, scaleMaxExtra: 0,
  }),
  "parkour-pose": Object.freeze({
    ...BASE_PHYSICS,
    x: 0.70, y: 0.12, z: 0.54,
    speedMode: "none", scaleStartKph: 0, scaleSpanKph: 100, scaleMaxExtra: 0,
  }),
  death: Object.freeze({
    ...BASE_PHYSICS,
    x: 0.55, y: 0.10, z: 0.42,
    speedMode: "none", scaleStartKph: 0, scaleSpanKph: 100, scaleMaxExtra: 0,
  }),
  default: Object.freeze({
    ...BASE_PHYSICS,
    x: 0.70, y: 0.12, z: 0.54,
    speedMode: "none", scaleStartKph: 0, scaleSpanKph: 100, scaleMaxExtra: 0,
  }),
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

function verticalSpeedKph(vector) {
  return Math.abs(Number(vector?.y) || 0) * 3.6;
}

function totalSpeedKph(vector) {
  return magnitude(vector) * 3.6;
}

function signFor(value) {
  const text = String(value ?? "ragdoll");
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash * 31) + text.charCodeAt(index)) | 0;
  }
  return (hash & 1) === 0 ? 1 : -1;
}

function profileKey(reason) {
  const value = String(reason ?? "default");
  return Object.hasOwn(DEFAULT_PROFILES, value) ? value : "default";
}

function normalizeProfile(patch = {}, base = DEFAULT_PROFILES.default) {
  const requestedMode = String(patch.speedMode ?? base.speedMode ?? "none");
  return {
    linearDamping: clamp(patch.linearDamping ?? base.linearDamping, 0, 0.15),
    angularDamping: clamp(patch.angularDamping ?? base.angularDamping, 0, 0.25),
    headAngularDamping: clamp(patch.headAngularDamping ?? base.headAngularDamping, 0, 0.30),
    friction: clamp(patch.friction ?? base.friction, 0.12, 1.0),
    x: clamp(patch.x ?? base.x, 0, 12),
    y: clamp(patch.y ?? base.y, 0, 3),
    z: clamp(patch.z ?? base.z, 0, 12),
    speedMode: SPEED_MODES.has(requestedMode) ? requestedMode : base.speedMode,
    scaleStartKph: clamp(patch.scaleStartKph ?? base.scaleStartKph, 0, 180),
    scaleSpanKph: clamp(patch.scaleSpanKph ?? base.scaleSpanKph, 20, 320),
    scaleMaxExtra: clamp(patch.scaleMaxExtra ?? base.scaleMaxExtra, 0, 3),
  };
}

function freshProfiles() {
  return Object.fromEntries(
    REASONS.map((reason) => [reason, normalizeProfile({}, DEFAULT_PROFILES[reason])]),
  );
}

function snapshotProfile(profile) {
  return { ...profile };
}

function snapshotProfiles(profiles) {
  return Object.fromEntries(REASONS.map((reason) => [reason, snapshotProfile(profiles[reason])]));
}

function speedForMode(mode, velocity) {
  if (mode === "horizontal") return horizontalSpeedKph(velocity);
  if (mode === "vertical") return verticalSpeedKph(velocity);
  if (mode === "total") return totalSpeedKph(velocity);
  return 0;
}

function tumbleScale(profile, velocity) {
  if (profile.speedMode === "none" || profile.scaleMaxExtra <= 0) return 1;
  const speedKph = speedForMode(profile.speedMode, velocity);
  return 1 + clamp(
    (speedKph - profile.scaleStartKph) / profile.scaleSpanKph,
    0,
    profile.scaleMaxExtra,
  );
}

function tumbleFor(entityId, velocity, profile) {
  const sign = signFor(entityId);
  const scale = tumbleScale(profile, velocity);
  return {
    x: profile.x * sign * scale,
    y: profile.y * scale,
    z: profile.z * -sign * scale,
  };
}

function massCenter(bodies) {
  let totalMass = 0;
  let x = 0;
  let y = 0;
  let z = 0;
  for (const body of bodies) {
    const mass = Math.max(0, Number(body?.mass?.()) || 0);
    const position = body?.translation?.();
    if (!(mass > 0) || !position) continue;
    totalMass += mass;
    x += position.x * mass;
    y += position.y * mass;
    z += position.z * mass;
  }
  if (!(totalMass > 0)) return { x: 0, y: 0, z: 0 };
  return { x: x / totalMass, y: y / totalMass, z: z / totalMass };
}

function tangentialVelocity(omega, offset) {
  return {
    x: omega.y * offset.z - omega.z * offset.y,
    y: omega.z * offset.x - omega.x * offset.z,
    z: omega.x * offset.y - omega.y * offset.x,
  };
}

export async function setup(ctx) {
  const physics = ctx.services.get("physics");
  const world = physics.world;
  const tuned = new Map();
  let profiles = freshProfiles();
  let tunedActivations = 0;
  let capturedBodyMismatches = 0;
  const recentBodies = [];

  const originalCreateRigidBody = world.createRigidBody.bind(world);
  world.createRigidBody = (descriptor) => {
    const body = originalCreateRigidBody(descriptor);
    recentBodies.push(body);
    if (recentBodies.length > EXPECTED_PARTS * 4) {
      recentBodies.splice(0, recentBodies.length - EXPECTED_PARTS * 4);
    }
    return body;
  };

  function applyTuning(entityId, reason) {
    const captured = recentBodies.slice(-EXPECTED_PARTS);
    recentBodies.length = 0;
    if (captured.length !== EXPECTED_PARTS) {
      capturedBodyMismatches += 1;
      return false;
    }

    const key = profileKey(reason);
    const appliedProfile = snapshotProfile(profiles[key]);
    const initialVelocity = captured[0]?.linvel?.() ?? { x: 0, y: 0, z: 0 };
    const common = tumbleFor(entityId, initialVelocity, appliedProfile);
    const center = massCenter(captured);
    let peakTangentialSpeed = 0;

    // Give every part the velocity field of one rotating rigid body: v = Vcom + ω×r.
    // Without this tangential component the joints must cancel most of the requested
    // angular motion, which made free-fall ragdolls look unnaturally dead.
    for (let index = 0; index < captured.length; index += 1) {
      const body = captured[index];
      body.setLinearDamping(appliedProfile.linearDamping);
      body.setAngularDamping(index === 3
        ? appliedProfile.headAngularDamping
        : appliedProfile.angularDamping);

      const position = body.translation();
      const offset = {
        x: position.x - center.x,
        y: position.y - center.y,
        z: position.z - center.z,
      };
      const tangential = tangentialVelocity(common, offset);
      peakTangentialSpeed = Math.max(peakTangentialSpeed, magnitude(tangential));
      const linear = body.linvel();
      body.setLinvel({
        x: (Number(linear.x) || 0) + tangential.x,
        y: (Number(linear.y) || 0) + tangential.y,
        z: (Number(linear.z) || 0) + tangential.z,
      }, true);

      const angular = body.angvel();
      body.setAngvel({
        x: (Number(angular.x) || 0) + common.x,
        y: (Number(angular.y) || 0) + common.y,
        z: (Number(angular.z) || 0) + common.z,
      }, true);

      const collider = body.collider?.(0);
      collider?.setFriction?.(appliedProfile.friction);
    }

    tuned.set(entityId, {
      entityId,
      reason: String(reason ?? "default"),
      profileKey: key,
      bodies: captured.length,
      profile: appliedProfile,
      tumble: common,
      tumbleRadiansPerSecond: magnitude(common),
      tumbleRevolutionsPerSecond: magnitude(common) / (Math.PI * 2),
      peakTangentialSpeed,
      totalSpeedKph: totalSpeedKph(initialVelocity),
      horizontalSpeedKph: horizontalSpeedKph(initialVelocity),
      verticalSpeedKph: verticalSpeedKph(initialVelocity),
      scale: tumbleScale(appliedProfile, initialVelocity),
      coherentSpin: true,
      tunedAt: Date.now(),
    });
    tunedActivations += 1;
    return true;
  }

  ctx.events.on("ragdoll:started", ({ entityId, reason }) => {
    applyTuning(entityId, reason);
  });
  ctx.events.on("ragdoll:ended", ({ entityId }) => tuned.delete(entityId));
  ctx.events.on("entity:removed", ({ entityId }) => tuned.delete(entityId));

  ctx.services.provide("ragdoll-tuning", {
    reasons() {
      return [...REASONS];
    },
    configureReason(reason, patch = {}) {
      const key = profileKey(reason);
      profiles[key] = normalizeProfile(patch, profiles[key]);
      return { reason: key, profile: snapshotProfile(profiles[key]) };
    },
    resetReason(reason) {
      const key = profileKey(reason);
      profiles[key] = normalizeProfile({}, DEFAULT_PROFILES[key]);
      return { reason: key, profile: snapshotProfile(profiles[key]) };
    },
    currentReason(reason) {
      const key = profileKey(reason);
      return { reason: key, profile: snapshotProfile(profiles[key]) };
    },
    profiles() {
      return snapshotProfiles(profiles);
    },
    reset() {
      profiles = freshProfiles();
      return snapshotProfiles(profiles);
    },
    configure(patch = {}) {
      const eject = profiles["vehicle-eject"];
      const globalPatch = {
        linearDamping: patch.linearDamping,
        angularDamping: patch.angularDamping,
        headAngularDamping: patch.headAngularDamping,
        friction: patch.friction,
      };
      for (const reason of REASONS) {
        profiles[reason] = normalizeProfile(globalPatch, profiles[reason]);
      }
      profiles["vehicle-eject"] = normalizeProfile({
        x: patch.vehicleEjectX,
        y: patch.vehicleEjectY,
        z: patch.vehicleEjectZ,
        scaleStartKph: patch.vehicleEjectScaleStartKph,
        scaleSpanKph: patch.vehicleEjectScaleSpanKph,
        scaleMaxExtra: patch.vehicleEjectScaleMaxExtra,
      }, eject);
      return snapshotProfiles(profiles);
    },
    current() {
      return snapshotProfiles(profiles);
    },
    stateFor(entityId) {
      const state = tuned.get(entityId);
      return state ? {
        ...state,
        profile: { ...state.profile },
        tumble: { ...state.tumble },
      } : null;
    },
    summary() {
      return {
        activeTuned: tuned.size,
        tunedActivations,
        capturedBodyMismatches,
        profiles: snapshotProfiles(profiles),
      };
    },
  });
}
