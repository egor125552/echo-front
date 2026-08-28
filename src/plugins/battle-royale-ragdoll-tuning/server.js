export const manifest = {
  id: "battle-royale-ragdoll-tuning",
  version: "1.4.0",
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
    ...BASE_PHYSICS,
    x: 4.8, y: 0.55, z: 3.8,
    speedMode: "horizontal", scaleStartKph: 10, scaleSpanKph: 70, scaleMaxExtra: 2.5,
  }),
  "vehicle-crash": Object.freeze({
    ...BASE_PHYSICS,
    x: 0.70, y: 0.12, z: 0.54,
    speedMode: "none", scaleStartKph: 0, scaleSpanKph: 100, scaleMaxExtra: 0,
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

function tumbleScale(profile, options) {
  if (profile.speedMode === "none" || profile.scaleMaxExtra <= 0) return 1;
  const speedKph = speedForMode(profile.speedMode, options?.velocity);
  return 1 + clamp(
    (speedKph - profile.scaleStartKph) / profile.scaleSpanKph,
    0,
    profile.scaleMaxExtra,
  );
}

function tumbleFor(entityId, options, profile) {
  const sign = signFor(entityId);
  const scale = tumbleScale(profile, options);
  return {
    x: profile.x * sign * scale,
    y: profile.y * scale,
    z: profile.z * -sign * scale,
  };
}

export async function setup(ctx) {
  const ragdoll = ctx.services.get("ragdoll");
  const physics = ctx.services.get("physics");
  const world = physics.world;
  const originalActivate = ragdoll.activate.bind(ragdoll);
  const tuned = new Map();
  let profiles = freshProfiles();
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
    const key = profileKey(reason);
    const appliedProfile = snapshotProfile(profiles[key]);
    const common = tumbleFor(entityId, options, appliedProfile);

    for (let index = 0; index < captured.length; index += 1) {
      const body = captured[index];
      body.setLinearDamping(appliedProfile.linearDamping);
      body.setAngularDamping(index === 3
        ? appliedProfile.headAngularDamping
        : appliedProfile.angularDamping);

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
      reason,
      profileKey: key,
      bodies: captured.length,
      profile: appliedProfile,
      tumble: common,
      totalSpeedKph: totalSpeedKph(options?.velocity),
      horizontalSpeedKph: horizontalSpeedKph(options?.velocity),
      verticalSpeedKph: verticalSpeedKph(options?.velocity),
      scale: tumbleScale(appliedProfile, options),
      tunedAt: Number(now) || Date.now(),
    });
    tunedActivations += 1;
    return activated;
  };

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

    // Backward-compatible Engine Control helper used by the first vehicle-eject lab.
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
