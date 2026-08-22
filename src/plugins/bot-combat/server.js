function wrapAngle(value) {
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
}

export const BOT_FIRE_CONE_RADIANS = 0.065;
export const BOT_AIM_RESET_RADIANS = 0.11;
export const BOT_REACTION_BASE_MS = 850;

export const manifest = {
  id: "bot-combat",
  version: "1.6.0",
  requires: ["bot-controller", "bot-perception", "movement", "weapons", "entities"],
  optional: ["opening-round"],
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
  const opening = ctx.services.has("opening-round") ? ctx.services.get("opening-round") : null;

  ctx.services.provide("bot-combat", {
    tick(dt, now = Date.now()) {
      const training = opening?.botTuning(now) ?? null;
      for (const bot of bots.all()) {
        if (!bot.alive) continue;
        const transform = ctx.components.get(bot.id, "Transform");
        const botState = ctx.components.get(bot.id, "Bot");
        const inventory = ctx.components.get(bot.id, "Weapons");
        if (!transform || !botState) continue;

        const selected = inventory?.items?.[inventory.selected] ?? null;
        const weaponRange = Number(weapons.definitions[selected?.id]?.range) || 0;
        if (selected && selected.ammo <= 3 && selected.reserve > 0) {
          weapons.reload(bot.id, now);
        }

        const target = perception.nearestVisibleEnemy(bot.id, weaponRange || 22);
        if (!target) {
          movement.setInput(bot.id, {
            forward: training ? 0.28 : 0.5,
            strafe: training ? 0 : 0.12 * botState.strafeDirection,
            turn: training ? botState.wanderTurn * 0.35 : botState.wanderTurn,
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
        const wobbleAmount = training?.aimWobble ?? 0.045;
        const aimWobble = Math.sin(now / (300 + seed * 3) + seed) * wobbleAmount;
        const desired = Math.atan2(dx, -dz) + aimWobble;
        const error = wrapAngle(desired - transform.angle);
        const absoluteError = Math.abs(error);
        const turn = Math.max(-1, Math.min(1, error * (training ? 1.55 : 2.05)));

        let forward = 0;
        let strafe = 0;
        if (training) {
          if (target.distance > 5.5) {
            forward = training.approachForward;
            strafe = training.approachStrafe * botState.strafeDirection;
          } else if (target.distance < 2.8) {
            forward = -0.12;
            strafe = 0.1 * botState.strafeDirection;
          } else {
            forward = 0.12;
            strafe = 0.08 * botState.strafeDirection;
          }
        } else if (target.distance > 14) {
          forward = 0.9;
          strafe = 0.2 * botState.strafeDirection;
        } else if (target.distance < 5) {
          forward = -0.7;
          strafe = 0.8 * botState.strafeDirection;
        } else {
          forward = target.distance > 9 ? 0.28 : -0.12;
          strafe = 0.72 * botState.strafeDirection;
        }

        if (absoluteError > 0.85) strafe *= 0.35;

        movement.setInput(bot.id, {
          forward,
          strafe,
          turn,
          sprint: training ? false : target.distance > 18,
          fireHeld: false,
        });

        if (selected?.reloadUntil > now) continue;

        const fireCone = training?.fireConeRadians ?? BOT_FIRE_CONE_RADIANS;
        const aimReset = training?.aimResetRadians ?? BOT_AIM_RESET_RADIANS;
        const reactionBase = training?.reactionBaseMs ?? BOT_REACTION_BASE_MS;
        if (weaponRange > 0 && absoluteError < fireCone && target.distance <= weaponRange) {
          if (botState.reactionUntil === 0) {
            botState.reactionUntil = now + reactionBase + (seed % 7) * (training ? 90 : 80);
          }
          if (now >= botState.reactionUntil) weapons.fire(bot.id, now);
        } else if (absoluteError >= aimReset || target.distance > weaponRange) {
          botState.reactionUntil = 0;
        }
      }
    },
  });
}
