export const manifest = {
  id: "bot-combat",
  version: "2.0.0",
  requires: ["bot-controller", "bot-perception", "movement", "weapons", "entities", "spatial-grid", "battle-royale"],
  capabilities: ["services.consume", "services.provide", "components.read"],
};

function wrapAngle(value) {
  let angle = value;
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function steeringTo(transform, target) {
  const dx = target.x - transform.x;
  const dz = target.z - transform.z;
  const desired = Math.atan2(dx, -dz);
  const delta = wrapAngle(desired - transform.angle);
  return {
    turn: Math.max(-1, Math.min(1, delta * 1.8)),
    aligned: Math.abs(delta) < 0.22,
    distance: Math.hypot(dx, dz),
  };
}

export async function setup(ctx) {
  const bots = ctx.services.get("bots");
  const perception = ctx.services.get("bot-perception");
  const movement = ctx.services.get("movement");
  const grid = ctx.services.get("spatial-grid");
  const battleRoyale = ctx.services.get("battle-royale");

  function think(bot, now) {
    const transform = ctx.components.get(bot.id, "Transform");
    const state = ctx.components.get(bot.id, "Bot");
    if (!transform || !state) return;

    const visible = perception.nearestVisibleEnemy(bot.id, 28, { now });
    if (visible) {
      const steering = steeringTo(transform, visible.transform);
      movement.setInput(bot.id, {
        forward: visible.distance > 9 ? 1 : visible.distance < 4.5 ? -0.45 : 0.2,
        strafe: visible.distance < 13 ? state.strafeDirection * 0.7 : 0,
        turn: steering.turn,
        sprint: visible.distance > 18,
        fireHeld: steering.aligned && visible.distance <= 28,
      });
      state.nextThinkAt = now + 95;
      return;
    }

    const zoneTarget = battleRoyale.zoneSteeringTarget(bot.id, now);
    const enemy = perception.nearestEnemy(bot.id, 105, { humanPriority: 0.82, now });
    const target = enemy?.transform ?? zoneTarget;
    if (target) {
      const steering = steeringTo(transform, target);
      movement.setInput(bot.id, {
        forward: 1,
        strafe: 0,
        turn: steering.turn,
        sprint: enemy ? enemy.distance > 30 : true,
        fireHeld: false,
      });
      state.nextThinkAt = now + (enemy ? 170 : 230);
      return;
    }

    const seed = Number.parseInt(String(bot.id).replace(/\D/g, ""), 10) || 1;
    const phase = (Math.floor(now / 2200) + seed) % 7;
    const turn = phase < 2 ? state.wanderTurn : phase === 6 ? -state.wanderTurn : 0;
    movement.setInput(bot.id, {
      forward: 0.82,
      strafe: 0,
      turn,
      sprint: phase === 3,
      fireHeld: false,
    });
    state.nextThinkAt = now + 340;
  }

  const api = {
    tick(_dt, now = Date.now()) {
      if (!battleRoyale.isActive()) return;
      grid.rebuild(now);
      for (const bot of bots.all()) {
        if (!bot.alive) continue;
        const state = ctx.components.get(bot.id, "Bot");
        if (!state || now < (state.nextThinkAt ?? 0)) continue;
        think(bot, now);
      }
    },
  };

  ctx.services.provide("bot-combat", api);
}
