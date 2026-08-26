export const manifest = {
  id: "battle-royale-parachute-dynamics",
  version: "1.0.0",
  requires: ["entities", "battle-royale-parachute", "rapier-physics"],
  capabilities: ["services.consume", "components.read", "components.write", "events.emit"],
};

const MAX_DT = 0.1;
const MAX_WIND_SPEED = 3.2;
const FREEFALL_WIND_AUTHORITY = 0.34;
const CANOPY_WIND_AUTHORITY = 1.0;
const FULL_BRAKE_THRESHOLD = 0.86;
const STALL_DELAY_SECONDS = 1.65;
const STALL_BUILD_SECONDS = 1.15;
const STALL_RECOVERY_SECONDS = 1.8;
const STALL_SINK_SPEED = 8.1;
const STALL_MIN_GLIDE = 0.75;
const TURN_TRANSIENT_SINK = 0.95;
const TURN_TRANSIENT_DECAY = 2.8;
const MOVEMENT_GRAVITY = 18;

function clamp(value, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}

function approach(current, target, maximumDelta) {
  if (current < target) return Math.min(target, current + maximumDelta);
  return Math.max(target, current - maximumDelta);
}

function smoothstep(value) {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
}

function windAt(transform, now) {
  const altitude = Math.max(0, Number(transform?.y) || 0);
  const altitudeRatio = clamp(altitude / 500);
  const time = (Number(now) || Date.now()) / 1000;
  const x = Number(transform?.x) || 0;
  const z = Number(transform?.z) || 0;

  const baseSpeed = 0.55 + altitudeRatio * 1.85;
  const gust = 0.34 * Math.sin(time * 0.19 + x * 0.013)
    + 0.22 * Math.sin(time * 0.43 + z * 0.021);
  const speed = clamp(baseSpeed + gust, 0.15, MAX_WIND_SPEED);
  const direction = 0.72
    + Math.sin(time * 0.055 + altitude * 0.0025) * 0.48
    + Math.sin((x - z) * 0.006) * 0.18;

  return {
    x: Math.cos(direction) * speed,
    z: Math.sin(direction) * speed,
    speed,
    direction,
  };
}

export async function setup(ctx) {
  const entities = ctx.services.get("entities");
  const parachute = ctx.services.get("parachute");
  const physics = ctx.services.get("physics");

  const originalPrepareMovement = parachute.prepareMovement.bind(parachute);
  const originalFinishMovement = parachute.finishMovement.bind(parachute);
  const originalStateFor = parachute.stateFor.bind(parachute);

  parachute.prepareMovement = (dt, now = Date.now()) => {
    const result = originalPrepareMovement(dt, now);
    const safeDt = clamp(dt, 0, MAX_DT);

    for (const entity of entities.all()) {
      if (!entity.alive || entity.bot || entity.kind !== "human") continue;
      const state = ctx.components.get(entity.id, "Parachute");
      const transform = ctx.components.get(entity.id, "Transform");
      if (!state?.airborne || !transform) continue;

      const wind = windAt(transform, now);
      state.windX = wind.x;
      state.windZ = wind.z;
      state.windSpeed = wind.speed;
      state.windDirection = wind.direction;

      if (state.phase !== "deployed") {
        state.brakeHoldSeconds = 0;
        state.stall = approach(Number(state.stall) || 0, 0, safeDt / STALL_RECOVERY_SECONDS);
        state.turnTransient = approach(Number(state.turnTransient) || 0, 0, safeDt * TURN_TRANSIENT_DECAY);
        state.previousTurnRate = 0;
        continue;
      }

      const inflation = clamp(state.inflation);
      const brake = clamp(state.brake);
      const previousTurn = Number(state.previousTurnRate) || 0;
      const turn = Number(state.turnRate) || 0;
      const turnAcceleration = safeDt > 0 ? Math.abs(turn - previousTurn) / safeDt : 0;
      state.previousTurnRate = turn;

      const transientTarget = clamp(turnAcceleration / 2.4);
      state.turnTransient = Math.max(
        approach(Number(state.turnTransient) || 0, 0, safeDt * TURN_TRANSIENT_DECAY),
        transientTarget,
      );

      const highEnoughForStall = Number(state.groundDistance) > 14 && !state.landingApproach;
      if (inflation >= 0.96 && highEnoughForStall && brake >= FULL_BRAKE_THRESHOLD) {
        state.brakeHoldSeconds = (Number(state.brakeHoldSeconds) || 0) + safeDt;
      } else {
        state.brakeHoldSeconds = Math.max(0, (Number(state.brakeHoldSeconds) || 0) - safeDt * 1.6);
      }

      const stallTarget = state.brakeHoldSeconds > STALL_DELAY_SECONDS
        ? clamp((state.brakeHoldSeconds - STALL_DELAY_SECONDS) / STALL_BUILD_SECONDS)
        : 0;
      const previousStall = clamp(state.stall);
      state.stall = stallTarget > previousStall
        ? approach(previousStall, stallTarget, safeDt / STALL_BUILD_SECONDS)
        : approach(previousStall, stallTarget, safeDt / STALL_RECOVERY_SECONDS);

      if (previousStall < 0.55 && state.stall >= 0.55) {
        ctx.events.emit("parachute:stall", {
          entityId: entity.id,
          altitude: transform.y,
          groundDistance: state.groundDistance,
          stall: state.stall,
          now,
        });
      }
      if (previousStall >= 0.55 && state.stall < 0.3) {
        ctx.events.emit("parachute:stall-recovered", {
          entityId: entity.id,
          stall: state.stall,
          now,
        });
      }

      const stallCurve = smoothstep(state.stall);
      if (stallCurve > 0) {
        const currentDownward = Math.max(0, -(Number(state.simulatedVerticalVelocity) || 0));
        const targetDownward = 5 + (STALL_SINK_SPEED - 5) * stallCurve;
        const nextDownward = approach(currentDownward, targetDownward, safeDt * 3.8);
        state.simulatedVerticalVelocity = -nextDownward;
        state.glideSpeed = Math.max(
          STALL_MIN_GLIDE,
          (Number(state.glideSpeed) || 0) * (1 - stallCurve * safeDt * 1.8),
        );
      }

      const transientSink = TURN_TRANSIENT_SINK * clamp(state.turnTransient) * inflation;
      if (transientSink > 0.01) {
        const currentDownward = Math.max(0, -(Number(state.simulatedVerticalVelocity) || 0));
        state.simulatedVerticalVelocity = -(currentDownward + transientSink * safeDt * 3.2);
      }

      const down = Math.max(0, -(Number(state.simulatedVerticalVelocity) || 0));
      state.airSpeed = Math.hypot(down, Number(state.glideSpeed) || 0, wind.speed);
      transform.verticalVelocity = state.simulatedVerticalVelocity + MOVEMENT_GRAVITY * safeDt;
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
      if (!state?.airborne || !transform || safeDt <= 0) continue;

      const authority = state.phase === "deployed"
        ? CANOPY_WIND_AUTHORITY * (0.25 + 0.75 * clamp(state.inflation))
        : FREEFALL_WIND_AUTHORITY;
      const stallAuthority = state.phase === "deployed" ? 1 - clamp(state.stall) * 0.18 : 1;
      const dx = (Number(state.windX) || 0) * authority * stallAuthority * safeDt;
      const dz = (Number(state.windZ) || 0) * authority * stallAuthority * safeDt;

      if (Math.abs(dx) < 0.0001 && Math.abs(dz) < 0.0001) continue;
      const moved = physics.move(entity.id, dx, dz, 0);
      const position = physics.position(entity.id);
      if (position) {
        transform.x = position.x;
        transform.y = Math.abs(position.y) < 0.0001 ? 0 : position.y;
        transform.z = position.z;
      }
      if (moved?.grounded) transform.grounded = true;
    }

    return result;
  };

  parachute.stateFor = (entityId) => {
    const value = originalStateFor(entityId);
    if (!value) return value;
    const state = ctx.components.get(entityId, "Parachute");
    return {
      ...value,
      windX: Number(state?.windX) || 0,
      windZ: Number(state?.windZ) || 0,
      windSpeed: Number(state?.windSpeed) || 0,
      windDirection: Number(state?.windDirection) || 0,
      stall: clamp(state?.stall),
      brakeHoldSeconds: Math.max(0, Number(state?.brakeHoldSeconds) || 0),
      turnTransient: clamp(state?.turnTransient),
    };
  };
}
