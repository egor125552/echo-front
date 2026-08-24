export const HUMAN_TURN_SPEED = 1.65;
export const BOT_TURN_SPEED = 2.6;
export const FOOTSTEP_VARIANT_COUNT = 3;
export const FOOTSTEP_WALK_RADIUS = 32;
export const FOOTSTEP_SPRINT_RADIUS = 44;

export function normalizeFootstepSurface(value) {
  const surface = String(value ?? "default").trim().toLowerCase();
  return /^[a-z0-9-]+$/.test(surface) ? surface : "default";
}

export function footstepKey(surface, variant) {
  const normalizedSurface = normalizeFootstepSurface(surface);
  const safeVariant = Math.max(1, Math.min(FOOTSTEP_VARIANT_COUNT, Number(variant) || 1));
  return `footstep.${normalizedSurface}.${safeVariant}`;
}

export const manifest = {
  id: "movement",
  version: "1.8.0",
  requires: ["entities", "rapier-physics", "map-test-arena"],
  capabilities: [
    "services.consume", "services.provide",
    "components.register", "components.read", "components.write",
    "events.on", "events.emit",
  ],
};

export async function setup(ctx) {
  const entities = ctx.services.get("entities");
  const physics = ctx.services.get("physics");
  const map = ctx.services.get("map");
  const blockedEntities = new Set();

  ctx.components.register("Transform");
  ctx.components.register("Input");

  ctx.events.on("entity:spawned", ({ entityId, spec }) => {
    if (spec.movable === false) return;
    const spawn = spec.position ?? map.nextSpawn(spec.team ?? 1);
    physics.createCharacter(entityId, spawn);
    ctx.components.add(entityId, "Transform", {
      x: spawn.x,
      z: spawn.z,
      angle: spawn.angle ?? 0,
      stepDistance: 0,
      stepIndex: 0,
    });
    ctx.components.add(entityId, "Input", {
      forward: 0,
      strafe: 0,
      turn: 0,
      sprint: false,
      fireHeld: false,
    });
  });

  ctx.events.on("entity:died", ({ entityId }) => {
    physics.setCharacterEnabled(entityId, false);
    blockedEntities.delete(entityId);
    const input = ctx.components.get(entityId, "Input");
    if (input) {
      input.forward = 0;
      input.strafe = 0;
      input.turn = 0;
      input.sprint = false;
      input.fireHeld = false;
    }
  });

  ctx.events.on("entity:respawned", ({ entityId }) => {
    physics.setCharacterEnabled(entityId, true);
    blockedEntities.delete(entityId);
    const transform = ctx.components.get(entityId, "Transform");
    if (transform) transform.stepDistance = 0;
  });

  ctx.events.on("entity:removed", ({ entityId }) => {
    blockedEntities.delete(entityId);
    physics.removeCharacter(entityId);
    ctx.components.remove(entityId, "Transform");
    ctx.components.remove(entityId, "Input");
  });

  const api = {
    setInput(entityId, input = {}) {
      const state = ctx.components.get(entityId, "Input");
      if (!state) return;
      state.forward = Math.max(-1, Math.min(1, Number(input.forward) || 0));
      state.strafe = Math.max(-1, Math.min(1, Number(input.strafe) || 0));
      state.turn = Math.max(-1, Math.min(1, Number(input.turn) || 0));
      state.sprint = Boolean(input.sprint);
      state.fireHeld = Boolean(input.fireHeld);
    },
    teleport(entityId, position) {
      const transform = ctx.components.get(entityId, "Transform");
      if (!transform) return;
      physics.teleport(entityId, position);
      transform.x = position.x;
      transform.z = position.z;
      if (Number.isFinite(position.angle)) transform.angle = position.angle;
      transform.stepDistance = 0;
      blockedEntities.delete(entityId);
    },
    tick(dt, now = Date.now()) {
      const safeDt = Math.max(0, Math.min(0.1, dt));
      for (const [entityId, transform] of ctx.components.entries("Transform")) {
        const entity = entities.get(entityId);
        if (!entity?.alive) continue;
        const input = ctx.components.get(entityId, "Input");
        if (!input) continue;

        const turnSpeed = entity.bot ? BOT_TURN_SPEED : HUMAN_TURN_SPEED;
        transform.angle += input.turn * turnSpeed * safeDt;
        const speed = input.sprint ? 5.4 : 3.25;
        const rawForward = input.forward;
        const strafeFactor = entity.bot ? 0.7 : 1;
        const rawStrafe = input.strafe * strafeFactor;
        const inputLength = Math.hypot(rawForward, rawStrafe);
        const scale = inputLength > 1 ? 1 / inputLength : 1;
        const forward = rawForward * scale;
        const strafe = rawStrafe * scale;

        const distance = speed * safeDt;
        const dx = (
          Math.sin(transform.angle) * forward +
          Math.cos(transform.angle) * strafe
        ) * distance;
        const dz = (
          -Math.cos(transform.angle) * forward +
          Math.sin(transform.angle) * strafe
        ) * distance;

        if (Math.hypot(dx, dz) < 0.0001) {
          blockedEntities.delete(entityId);
          continue;
        }

        const moved = physics.move(entityId, dx, dz);
        const pos = physics.position(entityId);
        if (pos) {
          transform.x = pos.x;
          transform.z = pos.z;
        }

        if (!entity.bot && typeof map.describeBlockedMove === "function") {
          const blockage = map.describeBlockedMove(
            { x: transform.x, z: transform.z },
            { x: dx, z: dz },
            moved,
          );
          if (blockage) {
            if (!blockedEntities.has(entityId)) {
              blockedEntities.add(entityId);
              ctx.events.emit("movement:blocked", {
                recipientId: entityId,
                kind: blockage.kind,
                speech: blockage.speech,
                now,
              });
            }
          } else {
            blockedEntities.delete(entityId);
          }
        }

        transform.stepDistance += Math.hypot(moved.x, moved.z);
        const threshold = input.sprint ? 1.15 : 1.55;
        if (transform.stepDistance >= threshold) {
          transform.stepDistance %= threshold;
          transform.stepIndex = (transform.stepIndex % FOOTSTEP_VARIANT_COUNT) + 1;
          const surface = normalizeFootstepSurface(
            typeof map.surfaceAt === "function"
              ? map.surfaceAt({ x: transform.x, z: transform.z })
              : map.defaultSurface,
          );
          ctx.events.emit("sound:spatial", {
            entityId,
            key: footstepKey(surface, transform.stepIndex),
            surface,
            variant: transform.stepIndex,
            x: transform.x,
            z: transform.z,
            radius: input.sprint ? FOOTSTEP_SPRINT_RADIUS : FOOTSTEP_WALK_RADIUS,
          });
        }
      }
    },
  };

  ctx.services.provide("movement", api);
}
