export const HUMAN_TURN_SPEED = 1.65;
export const BOT_TURN_SPEED = 2.6;

export const manifest = {
  id: "movement",
  version: "1.5.0",
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
    const transform = ctx.components.get(entityId, "Transform");
    if (transform) transform.stepDistance = 0;
  });

  ctx.events.on("entity:removed", ({ entityId }) => {
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
    },
    tick(dt) {
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
        // Human left/right arrows are primary movement now, not short side-steps.
        // Bots keep a slightly reduced strafe to preserve their current movement style.
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

        if (Math.hypot(dx, dz) < 0.0001) continue;

        const moved = physics.move(entityId, dx, dz);
        const pos = physics.position(entityId);
        if (pos) {
          transform.x = pos.x;
          transform.z = pos.z;
        }

        transform.stepDistance += Math.hypot(moved.x, moved.z);
        const threshold = input.sprint ? 1.15 : 1.55;
        if (transform.stepDistance >= threshold) {
          transform.stepDistance %= threshold;
          transform.stepIndex = (transform.stepIndex % 4) + 1;
          ctx.events.emit("sound:spatial", {
            entityId,
            key: `step.${transform.stepIndex}`,
            x: transform.x,
            z: transform.z,
            radius: input.sprint ? 22 : 14,
          });
        }
      }
    },
  };

  ctx.services.provide("movement", api);
}
