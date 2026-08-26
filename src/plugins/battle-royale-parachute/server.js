export const PARACHUTE_LAUNCH_ALTITUDE = 92;
export const PARACHUTE_GRAVITY = 9.81;
export const PARACHUTE_FREEFALL_TERMINAL_SPEED = 52;
export const PARACHUTE_CANOPY_TERMINAL_SPEED = 5;
export const PARACHUTE_FLARE_TERMINAL_SPEED = 2.6;
export const PARACHUTE_INFLATION_MS = 1600;
export const PARACHUTE_MAX_OPENING_DECEL = 14;
export const PARACHUTE_LANDING_APPROACH_SECONDS = 6;
export const PARACHUTE_MIN_DEPLOY_CLEARANCE = 3.2;
export const PARACHUTE_REDEPLOY_COOLDOWN_MS = 450;
export const PARACHUTE_SAFE_IMPACT_SPEED = 7;
export const PARACHUTE_MAX_TURN_RATE = 1.05;
export const PARACHUTE_TURN_ACCELERATION = 2.4;
export const PARACHUTE_MAX_GLIDE_SPEED = 5.4;
export const PARACHUTE_NEUTRAL_GLIDE_SPEED = 4.05;
export const PARACHUTE_BRAKE_GLIDE_SPEED = 1.9;
export const PARACHUTE_GLIDE_ACCELERATION = 2.25;
export const PARACHUTE_GLIDE_DECELERATION = 3.1;
export const PARACHUTE_MAX_TURN_SINK = 1.35;
export const PARACHUTE_BRAKE_SINK = 0.7;
export const PARACHUTE_STEP_DISTANCE_SENTINEL = -1_000_000;
const MOVEMENT_GRAVITY = 18;
const GROUND_PROBE_DISTANCE = 400;
const GROUND_LOOKAHEAD_SECONDS = [0, 0.75, 1.5, 2.5, 3.5];

export const manifest = {
  id: "battle-royale-parachute",
  version: "1.3.0",
  requires: ["entities", "movement", "rapier-physics", "battle-royale", "health"],
  capabilities: [
    "services.consume", "services.provide",
    "components.register", "components.read", "components.write",
    "events.on", "events.emit",
  ],
};

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}

function smoothstep(value) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function approach(current, target, maximumDelta) {
  if (current < target) return Math.min(target, current + maximumDelta);
  return Math.max(target, current - maximumDelta);
}

function aerodynamicDownwardSpeed(currentSpeed, terminalSpeed, dt, maximumDeceleration = Infinity) {
  const current = Math.max(0, Number(currentSpeed) || 0);
  const terminal = Math.max(0.1, Number(terminalSpeed) || 0.1);
  const drag = PARACHUTE_GRAVITY / (terminal * terminal);
  const acceleration = PARACHUTE_GRAVITY - drag * current * current;
  let candidate = Math.max(0, current + acceleration * dt);
  if (candidate < current && Number.isFinite(maximumDeceleration)) {
    candidate = Math.max(candidate, current - maximumDeceleration * dt);
  }
  if (current <= terminal) return Math.min(terminal, candidate);
  return Math.max(terminal, candidate);
}

function impactDamage(speed) {
  const excess = Math.max(0, Number(speed) - PARACHUTE_SAFE_IMPACT_SPEED);
  if (excess <= 0) return 0;
  return Math.round(2.1 * excess * excess);
}

function emergencyDeployDistance(speed) {
  let downward = Math.max(0, Number(speed) || 0);
  let distance = 0;
  let elapsed = 0;
  const dt = 0.05;
  for (let i = 0; i < 120; i += 1) {
    const inflation = clamp((elapsed * 1000) / PARACHUTE_INFLATION_MS, 0, 1);
    const curve = smoothstep(inflation);
    const terminal = PARACHUTE_FREEFALL_TERMINAL_SPEED
      + (PARACHUTE_CANOPY_TERMINAL_SPEED - PARACHUTE_FREEFALL_TERMINAL_SPEED) * curve;
    const next = aerodynamicDownwardSpeed(
      downward,
      terminal,
      dt,
      PARACHUTE_MAX_OPENING_DECEL,
    );
    distance += ((downward + next) / 2) * dt;
    downward = next;
    elapsed += dt;
    if (inflation >= 1 && downward <= PARACHUTE_CANOPY_TERMINAL_SPEED + 0.5) break;
  }
  return Math.max(15, distance + 15);
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
    groundDistance: Number.isFinite(state.groundDistance) ? state.groundDistance : null,
    timeToImpact: Number.isFinite(state.timeToImpact) ? state.timeToImpact : null,
    predictedImpactDistance: Number.isFinite(state.predictedImpactDistance) ? state.predictedImpactDistance : null,
    predictedImpactKind: state.predictedImpactKind ?? null,
    landingApproach: Boolean(state.landingApproach),
    inflation: clamp(state.inflation, 0, 1),
    turnRate: Number(state.turnRate) || 0,
    glideSpeed: Number(state.glideSpeed) || 0,
    brake: clamp(state.brake, 0, 1),
    airSpeed: Number(state.airSpeed) || 0,
    lastLandingDamage: Number(state.lastLandingDamage) || 0,
  };
}

export async function setup(ctx) {
  const entities = ctx.services.get("entities");
  const movement = ctx.services.get("movement");
  const physics = ctx.services.get("physics");
  const health = ctx.services.get("health");

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
      lastLandingDamage: 0,
      simulatedVerticalVelocity: 0,
      cutCooldownUntil: 0,
      manualCut: false,
      beforeMovementY: null,
      savedControl: null,
      groundDistance: Infinity,
      timeToImpact: Infinity,
      predictedImpactDistance: Infinity,
      predictedImpactKind: null,
      landingApproach: false,
      landingApproachAnnounced: false,
      inflation: 0,
      turnRate: 0,
      glideSpeed: 0,
      brake: 0,
      airSpeed: 0,
    };
    ctx.components.add(entityId, "Parachute", state);
    return state;
  }

  function rayDistanceAt(x, y, z) {
    const originLift = 0.12;
    const hit = physics.raycastWorld(
      { x, y: y + originLift, z },
      { x: 0, y: -1, z: 0 },
      GROUND_PROBE_DISTANCE,
    );
    if (!hit) return { hit: null, distance: Infinity };
    return {
      hit,
      distance: Math.max(0, Number(hit.distance) - originLift),
    };
  }

  function probeGround(entityId, transform, state) {
    const downwardSpeed = Math.max(
      0,
      -(Number(state.simulatedVerticalVelocity) || Number(transform.verticalVelocity) || 0),
    );
    const current = rayDistanceAt(transform.x, transform.y, transform.z);
    state.groundDistance = current.distance;

    let bestTime = Number.isFinite(current.distance) && downwardSpeed > 0.25
      ? current.distance / downwardSpeed
      : Infinity;
    let bestDistance = current.distance;
    let bestKind = current.hit?.worldObject?.kind ?? null;

    const glideSpeed = state.phase === "deployed" ? Math.max(0, Number(state.glideSpeed) || 0) : 0;
    const headingX = Math.sin(Number(transform.angle) || 0);
    const headingZ = -Math.cos(Number(transform.angle) || 0);

    if (glideSpeed > 0.2 && downwardSpeed > 0.25) {
      for (const horizon of GROUND_LOOKAHEAD_SECONDS) {
        if (horizon <= 0) continue;
        const futureX = transform.x + headingX * glideSpeed * horizon;
        const futureZ = transform.z + headingZ * glideSpeed * horizon;
        const probe = rayDistanceAt(futureX, transform.y, futureZ);
        if (!Number.isFinite(probe.distance)) continue;
        const predictedDrop = downwardSpeed * horizon;
        const remainingClearance = Math.max(0, probe.distance - predictedDrop);
        const candidateTime = horizon + remainingClearance / downwardSpeed;
        if (candidateTime >= bestTime) continue;
        bestTime = candidateTime;
        bestDistance = probe.distance;
        bestKind = probe.hit?.worldObject?.kind ?? null;
      }
    }

    state.timeToImpact = bestTime;
    state.predictedImpactDistance = bestDistance;
    state.predictedImpactKind = bestKind;
    return {
      hit: current.hit,
      distance: current.distance,
      downwardSpeed,
      timeToImpact: bestTime,
      predictedImpactDistance: bestDistance,
      predictedImpactKind: bestKind,
    };
  }

  function stateFor(entityId) {
    const state = ctx.components.get(entityId, "Parachute");
    const transform = ctx.components.get(entityId, "Transform");
    if (state && transform && state.airborne) probeGround(entityId, transform, state);
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
      lastLandingDamage: 0,
      simulatedVerticalVelocity: -1.5,
      cutCooldownUntil: 0,
      manualCut: false,
      beforeMovementY: null,
      savedControl: null,
      groundDistance: Infinity,
      timeToImpact: Infinity,
      predictedImpactDistance: Infinity,
      predictedImpactKind: null,
      landingApproach: false,
      landingApproachAnnounced: false,
      inflation: 0,
      turnRate: 0,
      glideSpeed: 0,
      brake: 0,
      airSpeed: 1.5,
    });
    transform.verticalVelocity = -1.5;
    transform.grounded = false;
    transform.stepDistance = PARACHUTE_STEP_DISTANCE_SENTINEL;
    probeGround(entityId, transform, state);
    ctx.events.emit("parachute:launched", {
      entityId,
      x: transform.x,
      y: transform.y,
      z: transform.z,
      altitude,
      groundDistance: state.groundDistance,
      now,
    });
    return stateFor(entityId);
  }

  function deploy(entityId, now = Date.now(), { automatic = false } = {}) {
    const state = ensureState(entityId);
    const transform = ctx.components.get(entityId, "Transform");
    if (!isHuman(entityId) || !transform || !state.airborne || state.phase === "deployed") return false;
    probeGround(entityId, transform, state);
    if (Number.isFinite(state.groundDistance) && state.groundDistance < PARACHUTE_MIN_DEPLOY_CLEARANCE) return false;
    if (now < Number(state.cutCooldownUntil || 0)) return false;
    state.phase = "deployed";
    state.deployedAt = now;
    state.deployCount += 1;
    state.manualCut = false;
    state.landingApproach = false;
    state.landingApproachAnnounced = false;
    state.inflation = 0;
    state.brake = 0;
    state.glideSpeed = Math.min(Number(state.glideSpeed) || 0, 1.2);
    state.simulatedVerticalVelocity = Math.min(-0.5, Number(transform.verticalVelocity) || -0.5);
    ctx.events.emit("parachute:deployed", {
      entityId,
      automatic,
      deployCount: state.deployCount,
      x: transform.x,
      y: transform.y,
      z: transform.z,
      groundDistance: state.groundDistance,
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
    state.landingApproach = false;
    state.landingApproachAnnounced = false;
    state.inflation = 0;
    state.turnRate = 0;
    state.glideSpeed = 0;
    state.brake = 0;
    state.simulatedVerticalVelocity = Number(transform.verticalVelocity) || -1;
    ctx.events.emit("parachute:cut", {
      entityId,
      x: transform.x,
      y: transform.y,
      z: transform.z,
      groundDistance: state.groundDistance,
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

      state.beforeMovementY = transform.y;
      transform.stepDistance = PARACHUTE_STEP_DISTANCE_SENTINEL;
      probeGround(entity.id, transform, state);

      let terminalSpeed = PARACHUTE_FREEFALL_TERMINAL_SPEED;
      let maximumDeceleration = Infinity;

      if (state.phase === "deployed") {
        state.savedControl = {
          forward: input.forward,
          strafe: input.strafe,
          sprint: input.sprint,
        };

        const inflationElapsed = Math.max(0, now - Number(state.deployedAt || now));
        state.inflation = clamp(inflationElapsed / PARACHUTE_INFLATION_MS, 0, 1);
        const inflationCurve = smoothstep(state.inflation);
        terminalSpeed = PARACHUTE_FREEFALL_TERMINAL_SPEED
          + (PARACHUTE_CANOPY_TERMINAL_SPEED - PARACHUTE_FREEFALL_TERMINAL_SPEED) * inflationCurve;
        maximumDeceleration = PARACHUTE_MAX_OPENING_DECEL;

        const shouldBeginLanding = state.inflation >= 0.95
          && Number.isFinite(state.timeToImpact)
          && state.timeToImpact <= PARACHUTE_LANDING_APPROACH_SECONDS;
        if (!state.landingApproach && shouldBeginLanding) {
          state.landingApproach = true;
          if (!state.landingApproachAnnounced) {
            state.landingApproachAnnounced = true;
            ctx.events.emit("parachute:landing-approach", {
              entityId: entity.id,
              groundDistance: state.groundDistance,
              predictedImpactDistance: state.predictedImpactDistance,
              predictedImpactKind: state.predictedImpactKind,
              timeToImpact: state.timeToImpact,
              now,
            });
          }
        }

        const turnInput = clamp(input.strafe, -1, 1);
        const landingTurnFactor = state.landingApproach ? 0.58 : 1;
        const targetTurnRate = turnInput * PARACHUTE_MAX_TURN_RATE * landingTurnFactor;
        state.turnRate = approach(
          Number(state.turnRate) || 0,
          targetTurnRate,
          PARACHUTE_TURN_ACCELERATION * safeDt,
        );
        transform.angle += state.turnRate * safeDt;

        const bankRatio = clamp(Math.abs(state.turnRate) / PARACHUTE_MAX_TURN_RATE, 0, 1);
        const requestedForward = clamp(input.forward, -1, 1);
        state.brake = requestedForward < 0 ? -requestedForward : 0;

        const automaticFlare = state.landingApproach
          ? smoothstep(clamp((2.2 - state.timeToImpact) / 2.2, 0, 1))
          : 0;
        const manualFlare = state.landingApproach ? state.brake * 0.28 : 0;
        const flare = clamp(automaticFlare + manualFlare, 0, 1);

        if (state.inflation >= 0.98) {
          terminalSpeed = PARACHUTE_CANOPY_TERMINAL_SPEED
            + PARACHUTE_MAX_TURN_SINK * bankRatio * bankRatio
            + PARACHUTE_BRAKE_SINK * state.brake * (1 - flare);
          if (flare > 0) {
            terminalSpeed += (PARACHUTE_FLARE_TERMINAL_SPEED - terminalSpeed) * flare;
            maximumDeceleration = 6;
          }
        }

        let targetGlideSpeed = PARACHUTE_NEUTRAL_GLIDE_SPEED;
        if (requestedForward > 0.1) targetGlideSpeed = PARACHUTE_MAX_GLIDE_SPEED;
        if (requestedForward < -0.1) targetGlideSpeed = PARACHUTE_BRAKE_GLIDE_SPEED;

        const canopyAuthority = 0.15 + 0.85 * inflationCurve;
        targetGlideSpeed *= canopyAuthority;
        targetGlideSpeed *= 1 - 0.16 * bankRatio;
        targetGlideSpeed *= 1 - 0.66 * flare;

        const glideAcceleration = targetGlideSpeed >= state.glideSpeed
          ? PARACHUTE_GLIDE_ACCELERATION
          : PARACHUTE_GLIDE_DECELERATION;
        state.glideSpeed = approach(
          Number(state.glideSpeed) || 0,
          targetGlideSpeed,
          glideAcceleration * safeDt,
        );

        input.forward = clamp(state.glideSpeed / PARACHUTE_MAX_GLIDE_SPEED, 0, 1);
        input.strafe = 0;
        input.sprint = true;
      } else {
        state.inflation = 0;
        state.landingApproach = false;
        state.brake = 0;
        state.glideSpeed = 0;
      }

      const currentDownwardSpeed = Math.max(0, -(Number(transform.verticalVelocity) || 0));
      const nextDownwardSpeed = aerodynamicDownwardSpeed(
        currentDownwardSpeed,
        terminalSpeed,
        safeDt,
        maximumDeceleration,
      );
      const desiredVerticalVelocity = -nextDownwardSpeed;
      state.simulatedVerticalVelocity = desiredVerticalVelocity;
      state.airSpeed = Math.hypot(nextDownwardSpeed, Number(state.glideSpeed) || 0);
      transform.verticalVelocity = desiredVerticalVelocity + MOVEMENT_GRAVITY * safeDt;
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

      if (input && state.savedControl) {
        input.forward = state.savedControl.forward;
        input.strafe = state.savedControl.strafe;
        input.sprint = state.savedControl.sprint;
        state.savedControl = null;
      }

      if (!transform.grounded && Number.isFinite(state.beforeMovementY)) {
        const desiredDy = state.simulatedVerticalVelocity * safeDt;
        const actualDy = transform.y - state.beforeMovementY;
        const missingDy = desiredDy - actualDy;
        if (missingDy < -0.0001) {
          const supplemented = physics.move(entity.id, 0, 0, missingDy);
          transform.grounded = Boolean(supplemented.grounded);
          const position = physics.position(entity.id);
          if (position) {
            transform.x = position.x;
            transform.y = Math.abs(position.y) < 0.0001 ? 0 : position.y;
            transform.z = position.z;
          }
        }
      }
      state.beforeMovementY = null;
      probeGround(entity.id, transform, state);

      const impactSpeed = Math.max(0, -state.simulatedVerticalVelocity);
      state.lastImpactSpeed = impactSpeed;

      if (transform.grounded || state.groundDistance <= 0.001) {
        state.phase = "landed";
        state.airborne = false;
        state.landedAt = now;
        state.simulatedVerticalVelocity = 0;
        state.landingApproach = false;
        state.inflation = 0;
        state.turnRate = 0;
        state.glideSpeed = 0;
        state.brake = 0;
        state.airSpeed = 0;
        transform.verticalVelocity = 0;
        transform.stepDistance = 0;

        const damage = impactDamage(impactSpeed);
        state.lastLandingDamage = damage;
        const damageResult = damage > 0
          ? health.applyDamage(entity.id, damage, { weaponId: "fall-impact", now })
          : { applied: 0, killed: false };

        ctx.events.emit("parachute:landed", {
          entityId: entity.id,
          x: transform.x,
          y: transform.y,
          z: transform.z,
          impactSpeed,
          damage: damageResult.applied,
          killed: damageResult.killed,
          hard: impactSpeed > PARACHUTE_SAFE_IMPACT_SPEED,
          now,
        });
        continue;
      }

      transform.verticalVelocity = state.simulatedVerticalVelocity;

      if (state.phase === "freefall" && state.deployCount === 0 && !state.manualCut) {
        const requiredDistance = emergencyDeployDistance(impactSpeed);
        if (
          Number.isFinite(state.groundDistance)
          && state.groundDistance <= requiredDistance
          && state.groundDistance >= PARACHUTE_MIN_DEPLOY_CLEARANCE
          && now >= Number(state.cutCooldownUntil || 0)
        ) {
          deploy(entity.id, now + safeDt * 1000, { automatic: true });
        }
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
    state.savedControl = null;
    state.beforeMovementY = null;
    state.landingApproach = false;
    state.turnRate = 0;
    state.glideSpeed = 0;
    state.brake = 0;
    state.airSpeed = 0;
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
    impactDamage,
    emergencyDeployDistance,
    constants: {
      launchAltitude: PARACHUTE_LAUNCH_ALTITUDE,
      minimumDeployClearance: PARACHUTE_MIN_DEPLOY_CLEARANCE,
      gravity: PARACHUTE_GRAVITY,
      freefallTerminalSpeed: PARACHUTE_FREEFALL_TERMINAL_SPEED,
      canopyTerminalSpeed: PARACHUTE_CANOPY_TERMINAL_SPEED,
      flareTerminalSpeed: PARACHUTE_FLARE_TERMINAL_SPEED,
      landingApproachSeconds: PARACHUTE_LANDING_APPROACH_SECONDS,
      safeImpactSpeed: PARACHUTE_SAFE_IMPACT_SPEED,
      maxGlideSpeed: PARACHUTE_MAX_GLIDE_SPEED,
    },
  });
}
