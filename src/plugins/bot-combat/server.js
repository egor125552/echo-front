function wrapAngle(value) {
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
}

export const manifest = {
  id: "bot-combat",
  version: "1.0.0",
  requires: ["bot-controller", "bot-perception", "movement", "weapons", "entities"],
  capabilities: [
    "services.consume", "services.provide",
    "components.read",
  ],
};

export async function setup(ctx) {
  const bots = ctx.services.get("bots");
  const perception = ctx.services.get("bot-perception");
  const movement = ctx.services.get("movement");
  const weapons = ctx.services.get("weapons");

  ctx.services.provide("bot-combat", {
    tick(dt, now = Date.now()) {
      for (const bot of bots.all()) {
        if (!bot.alive) continue;
        const transform = ctx.components.get(bot.id, "Transform");
        const botState = ctx.components.get(bot.id, "Bot");
        if (!transform || !botState) continue;
        const target = perception.nearestVisibleEnemy(bot.id);

        if (!target) {
          movement.setInput(bot.id, {
            forward: 0.45,
            turn: botState.wanderTurn,
            sprint: false,
            fireHeld: false,
          });
          botState.reactionUntil = 0;
          continue;
        }

        const dx = target.transform.x - transform.x;
        const dz = target.transform.z - transform.z;
        const seed = bot.id.charCodeAt(bot.id.length - 1) || 1;
        const aimWobble = Math.sin(now / 260 + seed) * 0.05;
        const desired = Math.atan2(dx, -dz) + aimWobble;
        const error = wrapAngle(desired - transform.angle);
        const turn = Math.max(-1, Math.min(1, error * 1.9));
        const forward = Math.abs(error) < 0.75 && target.distance > 6 ? 0.78 : 0;

        movement.setInput(bot.id, {
          forward,
          turn,
          sprint: target.distance > 13,
          fireHeld: false,
        });

        if (Math.abs(error) < 0.13 && target.distance < 17) {
          if (botState.reactionUntil === 0) {
            botState.reactionUntil = now + 420 + (seed % 260);
          }
          if (now >= botState.reactionUntil) weapons.fire(bot.id, now);
        } else {
          botState.reactionUntil = 0;
        }
      }
    },
  });
}
