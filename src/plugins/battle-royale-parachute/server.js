export const PARACHUTE_LAUNCH_ALTITUDE = 92;
export const PARACHUTE_AUTO_DEPLOY_ALTITUDE = 22;
export const PARACHUTE_MIN_DEPLOY_ALTITUDE = 5.5;
export const PARACHUTE_GRAVITY = 18;
export const PARACHUTE_DRAG = PARACHUTE_GRAVITY / 25;
export const PARACHUTE_REDEPLOY_COOLDOWN_MS = 450;
export const PARACHUTE_STEP_DISTANCE_SENTINEL = -1_000_000;

export const manifest = {
  id: "battle-royale-parachute",
  version: "1.0.0",
  requires: ["entities", "movement", "rapier-physics", "battle-royale"],
  capabilities: [
    "services.consume", "services.provide",
    "components.register", "components.read", "components.write",
    "events.on", "events.emit",
  ],
};

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}

function publicState(state, transform = null) {
  if (!state) return null;
  return {
    phase: state.phase,
    airborne: Boolean(state.airborne),
    deployed: state.phase === "deployed",
    deployCount: state.deployCount,
    launchedAt: state.launchedAt,
    deployedAt: state.deployedAt,
    cutAt: state.cutAt,
    landedAt: state.landedAt,
    altitude: transform ? Number(transform.y) || 0 : 0,
    verticalVelocity: transform ? Number(transform.verticalVelocity) || 0 : 0,
    launchAltitude: state.launchAltitude,
    lastImpactSpeed: state.lastImpactSpeed,
  };
}

export async function setup(ctx) {
  const entities = ctx.services.get("entities");
  const movement = ctx.services.get("movement");
  const physics = ctx.services.get("physics");

  ctx.components.register("Parachute");

  function isHuman(entityId) {
    const entity = entities.get(entityId);
    return Boolean(entity && entity.alive && !entity.bot && entity.kind === "human");
  }

  function ensureState(entityId) {
    let state = ctx.components.get(entityId, "Parachute");
    if (state) return state;
    state = {
      phase: "grounded",
      airborne: false,
      deployCount: 0,
      launchedAt: null,
      deployedAt: null,
      cutAt: null,
      landedAt: null,
      launchAltitude: 0,
      lastImpactSpeed: 0,
      simulatedVerticalVelocity: 0,
      cutCooldownUntil: 0,
      manualCut: false,
      savedSprint: null,
    };
    ctx.components.add(entityId, "Parachute", state);
    return state;
  }

  function stateFor(entityId) {
    const state = ctx.components.get(entityId, "Parachute");
    const transform = ctx.components.get(entityId, "Transform");
    return publicState(state, transform);
  }

  function launch(entityId, options = {}, now = Date.now()) {
    if (!isHuman(entityId)) return null;
    const transform = ctx.components.get(entityId, "Transform");
    if (!transform) return null;
    const altitude = Math.max(8, Number(options.altitude) || PARACHUTE_LAUNCH_ALTITUDE);
    const x = Number.isFinite(Number(options.x)) ? Number(options.x) : transform.x;
    const z = Number.isFinite(Number(options.z)) ? Number(options.z) : transform.z;
    const angle = Number.isFinite(Number(options.angle)) ? Number(options.angle) : transform.angle;
    movement.teleport(entityId, { x, y: altitude, z, angle });
    const state = ensureState(entityId);
    Object.assign(state, {
      phase: "freefall",
      airborne: true,
      deployCount: 0,
      launchedAt: now,
      deployedAt: null,
      cutAt: null,
      landedAt: null,
      launchAltitude: altitude,
      lastImpactSpeed: 0,
      simulatedVerticalVelocity: -1.5,
      cutCooldownUntil: 0,
      manualCut: false,
      savedSprint: null,
    });
    transform.verticalVelocity = -1.5;
    transform.grounded = false;
    transform.stepDistance = PARACHUTE_STEP_DISTANCE_SENTINEL;
    ctx.events.emit("parachute:launched", {
      entityId,
      x: transform.x,
      y: transform.y,
      z: transform.z,
      altitude,
      now,
    });
    return stateFor(entityId);
  }

  function deploy(entityId, now = Date.now(), { automatic = false } = {}) {
    const state = ensureState(entityId);
    const transform = ctx.components.get(entityId, "Transform");
    if (!isHuman(entityId) || !transform || !state.airborne || state.phase === "deployed") return false;
    if (transform.y < PARACHUTE_MIN_DEPLOY_ALTITUDE) return false;
    if (now < Number(state.cutCooldownUntil || 0)) return false;
    state.phase = "deployed";
    state.deployedAt = now;
    state.deployCount += 1;
    state.manualCut = false;
    state.simulatedVerticalVelocity = Math.min(-0.5, Number(transform.verticalVelocity) || -0.5);
    ctx.events.emit("parachute:deployed", {
      entityId,
      automatic,
      deployCount: state.deployCount,
      x: transform.x,
      y: transform.y,
      z: transform.z,
      verticalVelocity: transform.verticalVelocity,
      now,
    });
    return true;
  }

  function cut(entityId, now = Date.now()) {
    const state = ensureState(entityId);
    const transform = ctx.components.get(entityId, "Transform");
    if (!isHuman(entityId) || !transform || !state.airborne || state.phase !== "deployed") return false;
    state.phase = "freefall";
    state.cutAt = now;
    state.cutCooldownUntil = now + PARACHUTE_REDEPLOY_COOLDOWN_MS;
    state.manualCut = true;
    state.simulatedVerticalVelocity = Number(transform.verticalVelocity) || -1;
    ctx.events.emit("parachute:cut", {
      entityId,
      x: transform.x,
      y: transform.y,
      z: transform.z,
      verticalVelocity: transform.verticalVelocity,
      now,
    });
    return true;
  }

  function toggle(entityId, now = Date.now()) {
    const state = ensureState(entityId);
    if (!state.airborne) return false;
    return state.phase === "deployed" ? cut(entityId, now) : deploy(entityId, now);
  }

  function prepareMovement(dt, now = Date.now()) {
    const safeDt = clamp(dt, 0, 0.1);
    for (const entity of entities.all()) {
      if (!isHuman(entity.id)) continue;
      const state = ctx.components.get(entity.id, "Parachute");
      const transform = ctx.components.get(entity.id, "Transform");
      const input = ctx.components.get(entity.id, "Input");
      if (!state?.airborne || !transform || !input) continue;

      transform.stepDistance = PARACHUTE_STEP_DISTANCE_SENTINEL;
      if (state.phase !== "deployed") {
        state.simulatedVerticalVelocity = Number(transform.verticalVelocity) || 0;
        continue;
      }

      if (state.savedSprint === null) state.savedSprint = Boolean(input.sprint);
      input.sprint = true;

      const currentDownwardSpeed = Math.max(0, -(Number(transform.verticalVelocity) || 0));
      const accelerationDown = PARACHUTE_GRAVITY - PARACHUTE_DRAG * currentDownwardSpeed * currentDownwardSpeed;
      const nextDownwardSpeed = Math.max(0, currentDownwardSpeed + accelerationDown * safeDt);
      const desiredVerticalVelocity = -nextDownwardSpeed;
      state.simulatedVerticalVelocity = desiredVerticalVelocity;

      // movement applies its own 18 m/s² gravity immediately afterwards. Feed it
      // the pre-gravity value so the resulting displacement equals our aerodynamic
      // Rapier motion for this tick rather than stacking two gravities.
      transform.verticalVelocity = desiredVerticalVelocity + PARACHUTE_GRAVITY * safeDt;
    }
  }

  function finishMovement(dt, now = Date.now()) {
    const safeDt = clamp(dt, 0, 0.1);
    for (const entity of entities.all()) {
      if (!isHuman(entity.id)) continue;
      const state = ctx.components.get(entity.id, "Parachute");
      const transform = ctx.components.get(entity.id, "Transform");
      const input = ctx.components.get(entity.id, "Input");
      if (!state?.airborne || !transform) continue;

      if (state.phase === "deployed") {
        transform.verticalVelocity = state.simulatedVerticalVelocity;
      } else {
        state.simulatedVerticalVelocity = Number(transform.verticalVelocity) || 0;
      }

      if (input && state.savedSprint !== null) {
        input.sprint = state.savedSprint;
        state.savedSprint = null;
      }

      const impactSpeed = Math.max(0, -state.simulatedVerticalVelocity);
      state.lastImpactSpeed = impactSpeed;

      if (transform.grounded || transform.y <= 0.001) {
        state.phase = "landed";
        state.airborne = false;
        state.landedAt = now;
        state.simulatedVerticalVelocity = 0;
        transform.verticalVelocity = 0;
        transform.stepDistance = 0;
        ctx.events.emit("parachute:landed", {
          entityId: entity.id,
          x: transform.x,
          y: transform.y,
          z: transform.z,
          impactSpeed,
          hard: impactSpeed >= 8,
          now,
        });
        continue;
      }

      if (
        state.phase === "freefall"
        && state.deployCount === 0
        && !state.manualCut
        && transform.y <= PARACHUTE_AUTO_DEPLOY_ALTITUDE
        && now >= Number(state.cutCooldownUntil || 0)
      ) {
        deploy(entity.id, now + safeDt * 1000, { automatic: true });
      }
    }
  }

  ctx.events.on("entity:spawned", ({ entityId, spec }) => {
    if (spec?.bot) return;
    ensureState(entityId);
  });

  ctx.events.on("entity:removed", ({ entityId }) => {
    ctx.components.remove(entityId, "Parachute");
  });

  ctx.events.on("entity:died", ({ entityId }) => {
    const state = ctx.components.get(entityId, "Parachute");
    if (!state) return;
    state.phase = "grounded";
    state.airborne = false;
    state.savedSprint = null;
  });

  ctx.events.on("battle-royale:started", ({ startedAt }) => {
    for (const entity of entities.all()) {
      if (!entity.alive || entity.bot || entity.kind !== "human") continue;
      launch(entity.id, {}, Number(startedAt) || Date.now());
    }
  });

  ctx.services.provide("parachute", {
    launch,
    deploy,
    cut,
    toggle,
    prepareMovement,
    finishMovement,
    stateFor,
    constants: {
      launchAltitude: PARACHUTE_LAUNCH_ALTITUDE,
      autoDeployAltitude: PARACHUTE_AUTO_DEPLOY_ALTITUDE,
      minimumDeployAltitude: PARACHUTE_MIN_DEPLOY_ALTITUDE,
    },
  });
}
