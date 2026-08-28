import { CHARACTER_GRAVITY } from "../movement/server.js";

export const JUMP_HEIGHT = 0.8;
export const JUMP_SPEED = Math.sqrt(2 * CHARACTER_GRAVITY * JUMP_HEIGHT);
export const JUMP_SUPPORT_TOLERANCE = 0.08;
export const JUMP_SUPPORT_PROBE_DISTANCE = 0.24;
export const JUMP_MIN_LANDING_TIME_MS = 120;
export const JUMP_AIR_MOMENTUM_MIN_INPUT = 0.05;

const AIRBORNE_STEP_DISTANCE_SENTINEL = -1_000_000;

export const manifest = {
  id: "battle-royale-jump",
  version: "1.1.0",
  requires: ["movement", "rapier-physics", "entities"],
  capabilities: [
    "services.consume", "services.provide",
    "components.read", "components.write",
    "events.on", "events.emit",
  ],
};

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}

function takeoffVelocity(transform, input = {}) {
  const sprint = Boolean(input.sprint);
  const controlSpeed = sprint ? 5.4 : 3.25;
  const rawForward = clamp(input.forward, -1, 1);
  const rawStrafe = clamp(input.strafe, -1, 1);
  const length = Math.hypot(rawForward, rawStrafe);
  const scale = length > 1 ? 1 / length : 1;
  const forward = rawForward * scale;
  const strafe = rawStrafe * scale;
  const angle = Number(transform?.angle) || 0;
  return {
    x: (Math.sin(angle) * forward + Math.cos(angle) * strafe) * controlSpeed,
    z: (-Math.cos(angle) * forward + Math.sin(angle) * strafe) * controlSpeed,
    controlSpeed,
    sprint,
  };
}

function localInputForWorldVelocity(transform, velocity, controlSpeed) {
  const angle = Number(transform?.angle) || 0;
  const safeSpeed = Math.max(0.01, Number(controlSpeed) || 0.01);
  return {
    forward: clamp((Math.sin(angle) * velocity.x - Math.cos(angle) * velocity.z) / safeSpeed, -1, 1),
    strafe: clamp((Math.cos(angle) * velocity.x + Math.sin(angle) * velocity.z) / safeSpeed, -1, 1),
  };
}

export async function setup(ctx) {
  const movement = ctx.services.get("movement");
  const physics = ctx.services.get("physics");
  const entities = ctx.services.get("entities");
  const pending = new Set();
  const active = new Map();
  const completed = new Map();

  const originalSetInput = movement.setInput.bind(movement);
  const originalTick = movement.tick.bind(movement);

  function supported(transform) {
    if (!transform) return false;
    if (transform.grounded) return true;
    if (typeof physics.raycastSupportWorld !== "function") return false;

    const lift = 0.12;
    const hit = physics.raycastSupportWorld(
      { x: transform.x, y: transform.y + lift, z: transform.z },
      { x: 0, y: -1, z: 0 },
      JUMP_SUPPORT_PROBE_DISTANCE,
    );
    if (!hit) return false;
    const clearance = Math.max(0, Number(hit.distance) - lift);
    return clearance <= JUMP_SUPPORT_TOLERANCE;
  }

  function request(entityId) {
    if (!entityId) return false;
    pending.add(entityId);
    return true;
  }

  function summary(entityId) {
    const transform = ctx.components.get(entityId, "Transform");
    if (!transform) return null;
    const state = active.get(entityId) ?? null;
    const last = completed.get(entityId) ?? null;
    return {
      entityId,
      x: Number(transform.x) || 0,
      y: Number(transform.y) || 0,
      z: Number(transform.z) || 0,
      grounded: Boolean(transform.grounded),
      verticalVelocity: Number(transform.verticalVelocity) || 0,
      active: Boolean(state),
      startedAt: state?.startedAt ?? null,
      startY: state?.startY ?? null,
      apexY: state?.apexY ?? last?.apexY ?? null,
      rise: state
        ? Math.max(0, state.apexY - state.startY)
        : (last?.rise ?? null),
      lastAirtimeMs: last?.airtimeMs ?? null,
      lastHorizontalDistance: last?.horizontalDistance ?? null,
    };
  }

  movement.setInput = (entityId, input = {}) => {
    // Space already arrives from the client as parachutePressed. Ragdoll input is
    // intercepted before it reaches movement, and airborne requests fail the real
    // support check below, so the same key can safely mean jump while on foot.
    if (input.jumpPressed || input.parachutePressed) request(entityId);
    return originalSetInput(entityId, input);
  };

  movement.tick = (dt, now = Date.now()) => {
    const safeDt = Math.max(0, Math.min(0.1, Number(dt) || 0));
    const tickNow = Number(now) || Date.now();

    for (const entityId of pending) {
      pending.delete(entityId);
      const entity = entities.get(entityId);
      const transform = ctx.components.get(entityId, "Transform");
      const input = ctx.components.get(entityId, "Input");
      if (!entity?.alive || !transform || !input) continue;
      if (active.has(entityId)) continue;
      if ((Number(transform.verticalVelocity) || 0) > 0.2) continue;
      if (!supported(transform)) continue;

      const horizontal = takeoffVelocity(transform, input);
      completed.delete(entityId);

      // The standing player is a Rapier kinematic character. Kinematic characters
      // are intentionally immune to forces/impulses, so the physical jump is fed
      // to Rapier as a ballistic launch velocity. Rapier's character controller
      // resolves the capsule against the actual ground, stairs, walls and ceilings.
      // movement.tick advances vertical velocity before applying translation. A
      // half-gravity-step prime makes the sampled arc follow h = v^2 / (2g), so
      // JUMP_HEIGHT remains the real measured height instead of just a tuning label.
      transform.verticalVelocity = JUMP_SPEED + CHARACTER_GRAVITY * safeDt * 0.5;
      transform.grounded = false;
      active.set(entityId, {
        startedAt: tickNow,
        startX: Number(transform.x) || 0,
        startY: Number(transform.y) || 0,
        startZ: Number(transform.z) || 0,
        apexY: Number(transform.y) || 0,
        velocityX: horizontal.x,
        velocityZ: horizontal.z,
        controlSpeed: horizontal.controlSpeed,
        takeoffSprint: horizontal.sprint,
        savedStepDistance: Number(transform.stepDistance) || 0,
        temporaryInput: null,
      });
      ctx.events.emit("movement:jumped", {
        entityId,
        jumpHeight: JUMP_HEIGHT,
        jumpSpeed: JUMP_SPEED,
        horizontalSpeed: Math.hypot(horizontal.x, horizontal.z),
        x: transform.x,
        y: transform.y,
        z: transform.z,
        now: tickNow,
      });
    }

    // While this jump is active, footsteps must not advance or play in mid-air.
    // If the player lets go of the direction keys, preserve the world-space speed
    // carried off the ground. Fresh directional input still wins for useful air control.
    for (const [entityId, state] of active) {
      const transform = ctx.components.get(entityId, "Transform");
      const input = ctx.components.get(entityId, "Input");
      if (!transform || !input) continue;

      state.savedStepDistance = Number(transform.stepDistance) || 0;
      transform.stepDistance = AIRBORNE_STEP_DISTANCE_SENTINEL;

      const inputMagnitude = Math.hypot(Number(input.forward) || 0, Number(input.strafe) || 0);
      if (inputMagnitude >= JUMP_AIR_MOMENTUM_MIN_INPUT) continue;
      if (Math.hypot(state.velocityX, state.velocityZ) < 0.01) continue;

      const local = localInputForWorldVelocity(
        transform,
        { x: state.velocityX, z: state.velocityZ },
        state.controlSpeed,
      );
      state.temporaryInput = {
        forward: input.forward,
        strafe: input.strafe,
        sprint: input.sprint,
      };
      input.forward = local.forward;
      input.strafe = local.strafe;
      input.sprint = state.takeoffSprint;
    }

    const result = originalTick(dt, now);

    for (const [entityId, state] of active) {
      const transform = ctx.components.get(entityId, "Transform");
      const input = ctx.components.get(entityId, "Input");
      const entity = entities.get(entityId);

      if (input && state.temporaryInput) {
        input.forward = state.temporaryInput.forward;
        input.strafe = state.temporaryInput.strafe;
        input.sprint = state.temporaryInput.sprint;
        state.temporaryInput = null;
      }

      if (!entity?.alive || !transform) {
        active.delete(entityId);
        continue;
      }

      state.apexY = Math.max(state.apexY, Number(transform.y) || 0);
      const elapsedMs = tickNow - state.startedAt;
      if (elapsedMs < JUMP_MIN_LANDING_TIME_MS || !transform.grounded) {
        transform.stepDistance = state.savedStepDistance;
        continue;
      }

      transform.stepDistance = 0;
      const rise = Math.max(0, state.apexY - state.startY);
      const horizontalDistance = Math.hypot(
        (Number(transform.x) || 0) - state.startX,
        (Number(transform.z) || 0) - state.startZ,
      );
      completed.set(entityId, {
        airtimeMs: Math.max(0, elapsedMs),
        apexY: state.apexY,
        rise,
        horizontalDistance,
      });
      ctx.events.emit("movement:landed", {
        entityId,
        airtimeMs: Math.max(0, elapsedMs),
        rise,
        horizontalDistance,
        x: transform.x,
        y: transform.y,
        z: transform.z,
        now: tickNow,
      });
      active.delete(entityId);
    }

    return result;
  };

  ctx.events.on("entity:died", ({ entityId }) => {
    pending.delete(entityId);
    active.delete(entityId);
  });
  ctx.events.on("entity:removed", ({ entityId }) => {
    pending.delete(entityId);
    active.delete(entityId);
    completed.delete(entityId);
  });
  ctx.events.on("entity:respawned", ({ entityId }) => {
    pending.delete(entityId);
    active.delete(entityId);
    completed.delete(entityId);
  });

  ctx.services.provide("jump", {
    request,
    summary,
    stateFor(entityId) {
      const state = active.get(entityId);
      return state ? { ...state, temporaryInput: undefined } : null;
    },
    lastCompleted(entityId) {
      const state = completed.get(entityId);
      return state ? { ...state } : null;
    },
    assertState(entityId, expected = {}) {
      const state = summary(entityId);
      if (!state) throw new Error(`Jump entity not found: ${entityId}`);
      if (expected.active !== undefined && state.active !== Boolean(expected.active)) {
        throw new Error(`Expected jump active=${Boolean(expected.active)}, got ${state.active}`);
      }
      if (expected.grounded !== undefined && state.grounded !== Boolean(expected.grounded)) {
        throw new Error(`Expected grounded=${Boolean(expected.grounded)}, got ${state.grounded}`);
      }
      if (Number.isFinite(expected.minY) && state.y < Number(expected.minY)) {
        throw new Error(`Expected y >= ${expected.minY}, got ${state.y}`);
      }
      if (Number.isFinite(expected.maxY) && state.y > Number(expected.maxY)) {
        throw new Error(`Expected y <= ${expected.maxY}, got ${state.y}`);
      }
      if (Number.isFinite(expected.minVerticalVelocity)
        && state.verticalVelocity < Number(expected.minVerticalVelocity)) {
        throw new Error(
          `Expected verticalVelocity >= ${expected.minVerticalVelocity}, got ${state.verticalVelocity}`,
        );
      }
      if (Number.isFinite(expected.maxVerticalVelocity)
        && state.verticalVelocity > Number(expected.maxVerticalVelocity)) {
        throw new Error(
          `Expected verticalVelocity <= ${expected.maxVerticalVelocity}, got ${state.verticalVelocity}`,
        );
      }
      if (Number.isFinite(expected.minRise) && Number(state.rise ?? 0) < Number(expected.minRise)) {
        throw new Error(`Expected rise >= ${expected.minRise}, got ${state.rise}`);
      }
      if (Number.isFinite(expected.maxRise) && Number(state.rise ?? 0) > Number(expected.maxRise)) {
        throw new Error(`Expected rise <= ${expected.maxRise}, got ${state.rise}`);
      }
      if (Number.isFinite(expected.minHorizontalDistance)
        && Number(state.lastHorizontalDistance ?? 0) < Number(expected.minHorizontalDistance)) {
        throw new Error(
          `Expected horizontalDistance >= ${expected.minHorizontalDistance}, got ${state.lastHorizontalDistance}`,
        );
      }
      return state;
    },
    constants: Object.freeze({
      height: JUMP_HEIGHT,
      speed: JUMP_SPEED,
      gravity: CHARACTER_GRAVITY,
      supportTolerance: JUMP_SUPPORT_TOLERANCE,
      preserveTakeoffMomentum: true,
    }),
  });
}
