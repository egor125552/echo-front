import { CHARACTER_GRAVITY } from "../movement/server.js";

export const JUMP_HEIGHT = 0.8;
export const JUMP_SPEED = Math.sqrt(2 * CHARACTER_GRAVITY * JUMP_HEIGHT);
export const JUMP_SUPPORT_TOLERANCE = 0.08;
export const JUMP_SUPPORT_PROBE_DISTANCE = 0.24;
export const JUMP_MIN_LANDING_TIME_MS = 120;

export const manifest = {
  id: "battle-royale-jump",
  version: "1.0.1",
  requires: ["movement", "rapier-physics", "entities"],
  capabilities: [
    "services.consume", "services.provide",
    "components.read", "components.write",
    "events.on", "events.emit",
  ],
};

export async function setup(ctx) {
  const movement = ctx.services.get("movement");
  const physics = ctx.services.get("physics");
  const entities = ctx.services.get("entities");
  const pending = new Set();
  const active = new Map();

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
      apexY: state?.apexY ?? null,
      rise: state ? Math.max(0, state.apexY - state.startY) : null,
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

    for (const entityId of pending) {
      pending.delete(entityId);
      const entity = entities.get(entityId);
      const transform = ctx.components.get(entityId, "Transform");
      if (!entity?.alive || !transform) continue;
      if (active.has(entityId)) continue;
      if ((Number(transform.verticalVelocity) || 0) > 0.2) continue;
      if (!supported(transform)) continue;

      // The playable character is kinematic. Rapier's character-controller docs
      // specify that gravity/jumping are supplied as desired vertical movement;
      // forces/impulses do not move a kinematic character. Prime the velocity one
      // gravity-step high because movement.tick applies gravity before moving.
      transform.verticalVelocity = JUMP_SPEED + CHARACTER_GRAVITY * safeDt;
      transform.grounded = false;
      active.set(entityId, {
        startedAt: Number(now) || Date.now(),
        startY: Number(transform.y) || 0,
        apexY: Number(transform.y) || 0,
      });
      ctx.events.emit("movement:jumped", {
        entityId,
        jumpHeight: JUMP_HEIGHT,
        jumpSpeed: JUMP_SPEED,
        x: transform.x,
        y: transform.y,
        z: transform.z,
        now: Number(now) || Date.now(),
      });
    }

    const result = originalTick(dt, now);

    for (const [entityId, state] of active) {
      const transform = ctx.components.get(entityId, "Transform");
      const entity = entities.get(entityId);
      if (!entity?.alive || !transform) {
        active.delete(entityId);
        continue;
      }

      state.apexY = Math.max(state.apexY, Number(transform.y) || 0);
      const elapsedMs = (Number(now) || Date.now()) - state.startedAt;
      if (elapsedMs < JUMP_MIN_LANDING_TIME_MS || !transform.grounded) continue;

      ctx.events.emit("movement:landed", {
        entityId,
        airtimeMs: Math.max(0, elapsedMs),
        rise: Math.max(0, state.apexY - state.startY),
        x: transform.x,
        y: transform.y,
        z: transform.z,
        now: Number(now) || Date.now(),
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
  });
  ctx.events.on("entity:respawned", ({ entityId }) => {
    pending.delete(entityId);
    active.delete(entityId);
  });

  ctx.services.provide("jump", {
    request,
    summary,
    stateFor(entityId) {
      const state = active.get(entityId);
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
      return state;
    },
    constants: Object.freeze({
      height: JUMP_HEIGHT,
      speed: JUMP_SPEED,
      gravity: CHARACTER_GRAVITY,
      supportTolerance: JUMP_SUPPORT_TOLERANCE,
    }),
  });
}
