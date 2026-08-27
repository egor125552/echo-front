export const manifest = {
  id: "battle-royale-parachute-rapier-flight",
  version: "1.0.1",
  requires: ["entities", "battle-royale-parachute", "rapier-physics", "health"],
  capabilities: [
    "services.consume",
    "components.read", "components.write",
    "events.on", "events.emit",
  ],
};

const BASE_MAX_GLIDE = 5.4;
const BASE_NEUTRAL_GLIDE = 4.05;
const BASE_BRAKE_GLIDE = 1.9;

const RAPIER_MAX_GLIDE = 8.2;
const RAPIER_NEUTRAL_GLIDE = 6.35;
const RAPIER_BRAKE_GLIDE = 2.35;
const MAX_DT = 0.1;
const COLLISION_RETAIN_MINIMUM = 0.12;

function clamp(value, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}

function nominalGlidePair(requestedForward) {
  if (requestedForward > 0.1) {
    return { base: BASE_MAX_GLIDE, rapier: RAPIER_MAX_GLIDE };
  }
  if (requestedForward < -0.1) {
    return { base: BASE_BRAKE_GLIDE, rapier: RAPIER_BRAKE_GLIDE };
  }
  return { base: BASE_NEUTRAL_GLIDE, rapier: RAPIER_NEUTRAL_GLIDE };
}

export function rapierImpactDamage(speed) {
  const value = Math.max(0, Number(speed) || 0);
  if (value <= 8) return 0;

  if (value <= 14) {
    return Math.round((value - 8) * 3);
  }
  if (value <= 20) {
    return Math.round(18 + (value - 14) * 5);
  }
  if (value <= 26) {
    return Math.round(48 + (value - 20) * 8);
  }
  if (value <= 32) {
    return Math.round(96 + (value - 26) * 14);
  }
  return Math.round(180 + (value - 32) * 22);
}

export async function setup(ctx) {
  const entities = ctx.services.get("entities");
  const parachute = ctx.services.get("parachute");
  const physics = ctx.services.get("physics");
  const health = ctx.services.get("health");

  const originalPrepareMovement = parachute.prepareMovement.bind(parachute);
  const originalFinishMovement = parachute.finishMovement.bind(parachute);
  const originalStateFor = parachute.stateFor.bind(parachute);
  const originalApplyDamage = health.applyDamage.bind(health);

  parachute.prepareMovement = (dt, now = Date.now()) => {
    const result = originalPrepareMovement(dt, now);

    for (const entity of entities.all()) {
      if (!entity.alive || entity.bot || entity.kind !== "human") continue;
      const state = ctx.components.get(entity.id, "Parachute");
      if (!state?.airborne || state.phase !== "deployed") {
        if (state) state.rapierGlideSpeed = 0;
        continue;
      }

      const requestedForward = clamp(state.savedControl?.forward, -1, 1);
      const nominal = nominalGlidePair(requestedForward);
      const baseGlide = Math.max(0, Number(state.glideSpeed) || 0);
      const scale = nominal.rapier / nominal.base;
      state.rapierBaseGlideSpeed = baseGlide;
      state.rapierGlideSpeed = baseGlide * scale;

      const downward = Math.max(0, -(Number(state.simulatedVerticalVelocity) || 0));
      const wind = Math.max(0, Number(state.windSpeed) || 0);
      state.airSpeed = Math.hypot(downward, state.rapierGlideSpeed, wind);
    }

    return result;
  };

  parachute.finishMovement = (dt, now = Date.now()) => {
    const result = originalFinishMovement(dt, now);
    const safeDt = clamp(dt, 0, MAX_DT);

    for (const entity of entities.all()) {
      if (!entity.alive || entity.bot || entity.kind !== "human") continue;
      const state = ctx.components.get(entity.id, "Parachute");
      const transform = ctx.components.get(entity.id, "Transform");
      if (!state?.airborne || state.phase !== "deployed" || !transform || safeDt <= 0) {
        if (state && state.phase !== "deployed") state.rapierGlideSpeed = 0;
        continue;
      }

      const desiredGlide = Math.max(0, Number(state.rapierGlideSpeed) || 0);
      const baseGlide = Math.max(0, Number(state.glideSpeed) || 0);
      const extraSpeed = Math.max(0, desiredGlide - baseGlide);
      if (extraSpeed <= 0.001) continue;

      const heading = Number(transform.angle) || 0;
      const attemptedDistance = extraSpeed * safeDt;
      const dx = Math.sin(heading) * attemptedDistance;
      const dz = -Math.cos(heading) * attemptedDistance;
      const moved = physics.move(entity.id, dx, dz, 0);
      const position = physics.position(entity.id);
      if (position) {
        transform.x = position.x;
        transform.y = Math.abs(position.y) < 0.0001 ? 0 : position.y;
        transform.z = position.z;
      }
      if (moved?.grounded) transform.grounded = true;

      const actualDistance = Math.hypot(Number(moved?.x) || 0, Number(moved?.z) || 0);
      if (attemptedDistance > 0.01 && actualDistance < attemptedDistance * 0.75) {
        const retained = clamp(
          actualDistance / attemptedDistance,
          COLLISION_RETAIN_MINIMUM,
          1,
        );
        state.rapierGlideSpeed = Math.max(baseGlide, desiredGlide * retained);
        ctx.events.emit("parachute:rapier-glide-blocked", {
          entityId: entity.id,
          attemptedSpeed: desiredGlide,
          retainedSpeed: state.rapierGlideSpeed,
          collisions: Array.isArray(moved?.collisions) ? moved.collisions.length : 0,
          now,
        });
      }

      const downward = Math.max(0, -(Number(state.simulatedVerticalVelocity) || 0));
      const wind = Math.max(0, Number(state.windSpeed) || 0);
      state.airSpeed = Math.hypot(downward, state.rapierGlideSpeed, wind);
    }

    return result;
  };

  parachute.stateFor = (entityId) => {
    const value = originalStateFor(entityId);
    if (!value) return value;
    const state = ctx.components.get(entityId, "Parachute");
    const airborne = Boolean(value.airborne);
    const deployed = airborne && state?.phase === "deployed";
    const glideSpeed = deployed
      ? Math.max(0, Number(state.rapierGlideSpeed) || Number(value.glideSpeed) || 0)
      : 0;
    const downward = airborne ? Math.max(0, -(Number(value.verticalVelocity) || 0)) : 0;
    const wind = airborne
      ? Math.max(0, Number(value.windSpeed) || Number(state?.windSpeed) || 0)
      : 0;
    return {
      ...value,
      glideSpeed,
      airSpeed: airborne ? Math.hypot(downward, glideSpeed, wind) : 0,
      rapierFlight: true,
      rapierMaxGlideSpeed: RAPIER_MAX_GLIDE,
    };
  };

  health.applyDamage = (targetId, amount, source = {}) => {
    if (source?.weaponId !== "fall-impact") {
      return originalApplyDamage(targetId, amount, source);
    }

    const state = ctx.components.get(targetId, "Parachute");
    const impactSpeed = Math.max(0, Number(state?.lastImpactSpeed) || 0);
    const revisedDamage = rapierImpactDamage(impactSpeed);
    if (state) state.lastLandingDamage = revisedDamage;
    return originalApplyDamage(targetId, revisedDamage, source);
  };

  parachute.impactDamage = rapierImpactDamage;
  if (parachute.constants) parachute.constants.maxGlideSpeed = RAPIER_MAX_GLIDE;

  ctx.events.on("parachute:landed", ({ entityId, impactSpeed }) => {
    const state = ctx.components.get(entityId, "Parachute");
    if (!state) return;
    state.rapierGlideSpeed = 0;
    state.rapierBaseGlideSpeed = 0;
    state.lastLandingDamage = rapierImpactDamage(impactSpeed);
  });

  ctx.events.on("parachute:cut", ({ entityId }) => {
    const state = ctx.components.get(entityId, "Parachute");
    if (!state) return;
    state.rapierGlideSpeed = 0;
    state.rapierBaseGlideSpeed = 0;
  });
}
