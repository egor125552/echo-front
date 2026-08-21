function wrapAngle(value) {
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
}

export const manifest = {
  id: "bot-combat",
  version: "1.2.0",
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
        const inventory = ctx.components.get(bot.id, "Weapons");
        if (!transform || !botState) continue;

        const selected = inventory?.items?.[inventory.selected] ?? null;
        if (selected && selected.ammo <= 3 && selected.reserve > 0) {
          weapons.reload(bot.id, now);
        }

        const target = perception.nearestVisibleEnemy(bot.id, 26);
        if (!target) {
          movement.setInput(bot.id, {
            forward: 0.5,
            strafe: 0.12 * botState.strafeDirection,
            turn: botState.wanderTurn,
            sprint: false,
            fireHeld: false,
          });
          botState.reactionUntil = 0;
          continue;
        }

        const seed = bot.id.charCodeAt(bot.id.length - 1) || 1;
        if (now >= botState.tacticUntil) {
          botState.strafeDirection *= -1;
          botState.tacticUntil = now + 750 + (seed % 5) * 190;
        }

        const dx = target.transform.x - transform.x;
        const dz = target.transform.z - transform.z;
        const aimWobble = Math.sin(now / (300 + seed * 3) + seed) * 0.045;
        const desired = Math.atan2(dx, -dz) + aimWobble;
        const error = wrapAngle(desired - transform.angle);
        const turn = Math.max(-1, Math.min(1, error * 2.05));

        let forward = 0;
        let strafe = 0;
        if (target.distance > 14) {
          forward = 0.9;
          strafe = 0.2 * botState.strafeDirection;
        } else if (target.distance < 5) {
          forward = -0.7;
          strafe = 0.8 * botState.strafeDirection;
        } else {
          forward = target.distance > 9 ? 0.28 : -0.12;
          strafe = 0.72 * botState.strafeDirection;
        }

        if (Math.abs(error) > 0.85) strafe *= 0.35;

        movement.setInput(bot.id, {
          forward,
          strafe,
          turn,
          sprint: target.distance > 18,
          fireHeld: false,
        });

        if (selected?.reloadUntil > now) continue;

        if (Math.abs(error) < 0.14 && target.distance < 20) {
          if (botState.reactionUntil === 0) {
            botState.reactionUntil = now + 330 + (seed % 7) * 55;
          }
          if (now >= botState.reactionUntil) weapons.fire(bot.id, now);
        } else if (Math.abs(error) > 0.32) {
          botState.reactionUntil = 0;
        }
      }
    },
  });
}
