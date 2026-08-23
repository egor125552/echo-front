function wrapAngle(value) {
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
}

function normalizeDirection(direction) {
  const length = Math.hypot(direction.x, direction.z) || 1;
  return { x: direction.x / length, z: direction.z / length };
}

function localToWorld(angle, forward, strafe) {
  return normalizeDirection({
    x: Math.sin(angle) * forward + Math.cos(angle) * strafe,
    z: -Math.cos(angle) * forward + Math.sin(angle) * strafe,
  });
}

function worldToLocal(angle, direction) {
  return {
    forward: Math.sin(angle) * direction.x - Math.cos(angle) * direction.z,
    strafe: Math.cos(angle) * direction.x + Math.sin(angle) * direction.z,
  };
}

function rotateDirection(direction, radians) {
  const heading = Math.atan2(direction.x, -direction.z) + radians;
  return { x: Math.sin(heading), z: -Math.cos(heading) };
}

export const BOT_FIRE_CONE_RADIANS = 0.08;
export const BOT_AIM_RESET_RADIANS = 0.14;
export const BOT_REACTION_BASE_MS = 500;
export const BOT_OBSTACLE_PROBE_DISTANCE = 1.45;
export const BOT_STUCK_SAMPLE_MS = 300;
export const BOT_STUCK_DISTANCE = 0.055;

function probeClearance(physics, botId, transform, direction) {
  const hit = physics.raycast(
    { x: transform.x, y: 1, z: transform.z },
    { x: direction.x, y: 0, z: direction.z },
    BOT_OBSTACLE_PROBE_DISTANCE,
    botId,
  );
  return hit?.distance ?? BOT_OBSTACLE_PROBE_DISTANCE;
}

function sampleStuck(botState, transform, now, movementMagnitude) {
  if (!Number.isFinite(botState.navSampleX) || !Number.isFinite(botState.navSampleZ)) {
    botState.navSampleX = transform.x;
    botState.navSampleZ = transform.z;
    botState.navSampleAt = now;
    botState.stuckSamples = 0;
    return false;
  }
  if (now - botState.navSampleAt < BOT_STUCK_SAMPLE_MS) return false;

  const moved = Math.hypot(
    transform.x - botState.navSampleX,
    transform.z - botState.navSampleZ,
  );
  botState.navSampleX = transform.x;
  botState.navSampleZ = transform.z;
  botState.navSampleAt = now;

  if (movementMagnitude < 0.25 || moved >= BOT_STUCK_DISTANCE) {
    botState.stuckSamples = 0;
    return false;
  }

  botState.stuckSamples = (botState.stuckSamples ?? 0) + 1;
  if (botState.stuckSamples < 2) return false;
  botState.stuckSamples = 0;
  return true;
}

export function applyBotObstacleAvoidance(physics, botId, transform, botState, input, now = Date.now()) {
  const movementMagnitude = Math.hypot(input.forward, input.strafe);
  if (movementMagnitude < 0.05) {
    sampleStuck(botState, transform, now, movementMagnitude);
    return input;
  }

  const desiredDirection = localToWorld(transform.angle, input.forward, input.strafe);
  const forwardClearance = probeClearance(physics, botId, transform, desiredDirection);
  const blocked = forwardClearance < 0.95;
  const stuck = sampleStuck(botState, transform, now, movementMagnitude);

  if (blocked || stuck) {
    const rightDirection = rotateDirection(desiredDirection, 0.9);
    const leftDirection = rotateDirection(desiredDirection, -0.9);
    const rightClearance = probeClearance(physics, botId, transform, rightDirection);
    const leftClearance = probeClearance(physics, botId, transform, leftDirection);
    const previous = botState.avoidDirection || botState.strafeDirection || 1;
    botState.avoidDirection = Math.abs(rightClearance - leftClearance) < 0.08
      ? previous
      : (rightClearance > leftClearance ? 1 : -1);
    botState.avoidUntil = now + (stuck ? 900 : 650);
  }

  if ((botState.avoidUntil ?? 0) <= now) return input;

  let detour = rotateDirection(desiredDirection, (botState.avoidDirection || 1) * 1.15);
  if (probeClearance(physics, botId, transform, detour) < 0.42) {
    botState.avoidDirection *= -1;
    detour = rotateDirection(desiredDirection, botState.avoidDirection * 1.35);
  }
  const local = worldToLocal(transform.angle, detour);
  return {
    ...input,
    forward: Math.max(-0.7, Math.min(0.65, local.forward)),
    strafe: Math.max(-1, Math.min(1, local.strafe)),
    sprint: false,
  };
}

export const manifest = {
  id: "bot-combat",
  version: "2.0.0",
  requires: ["bot-controller", "bot-perception", "movement", "weapons", "entities", "rapier-physics"],
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
  const physics = ctx.services.get("physics");
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

        const visibleTarget = perception.nearestVisibleEnemy(
          bot.id,
          weaponRange || 28,
          { humanPriority: 0.78 },
        );
        const huntTarget = visibleTarget ?? perception.nearestEnemy(
          bot.id,
          60,
          { humanPriority: 0.88 },
        );

        if (!huntTarget) {
          const roamingInput = applyBotObstacleAvoidance(
            physics,
            bot.id,
            transform,
            botState,
            {
              forward: 0.78,
              strafe: 0.2 * botState.strafeDirection,
              turn: botState.wanderTurn,
              sprint: true,
              fireHeld: false,
            },
            now,
          );
          movement.setInput(bot.id, roamingInput);
          botState.reactionUntil = 0;
          continue;
        }

        const seed = bot.id.charCodeAt(bot.id.length - 1) || 1;
        if (now >= botState.tacticUntil) {
          botState.strafeDirection *= -1;
          botState.tacticUntil = now + 550 + (seed % 5) * 130;
        }

        const dx = huntTarget.transform.x - transform.x;
        const dz = huntTarget.transform.z - transform.z;
        const desiredWithoutWobble = Math.atan2(dx, -dz);

        if (!visibleTarget) {
          const huntError = wrapAngle(desiredWithoutWobble - transform.angle);
          const huntTurn = Math.max(-1, Math.min(1, huntError * 2.45));
          const huntingInput = applyBotObstacleAvoidance(
            physics,
            bot.id,
            transform,
            botState,
            {
              forward: Math.abs(huntError) > 1.65 ? 0.35 : 0.98,
              strafe: 0.18 * botState.strafeDirection,
              turn: huntTurn,
              sprint: true,
              fireHeld: false,
            },
            now,
          );
          movement.setInput(bot.id, huntingInput);
          botState.reactionUntil = 0;
          continue;
        }

        const target = visibleTarget;
        const wobbleAmount = training?.aimWobble ?? 0.035;
        const aimWobble = Math.sin(now / (270 + seed * 3) + seed) * wobbleAmount;
        const desired = desiredWithoutWobble + aimWobble;
        const error = wrapAngle(desired - transform.angle);
        const absoluteError = Math.abs(error);
        const turn = Math.max(-1, Math.min(1, error * (training ? 1.9 : 2.45)));

        let forward = 0;
        let strafe = 0;
        let sprint = false;
        if (target.distance > 14) {
          forward = 0.98;
          strafe = 0.22 * botState.strafeDirection;
          sprint = true;
        } else if (target.distance > 8) {
          forward = 0.48;
          strafe = 0.62 * botState.strafeDirection;
          sprint = target.distance > 10.5;
        } else if (target.distance < 4.5) {
          forward = -0.62;
          strafe = 0.82 * botState.strafeDirection;
        } else {
          forward = -0.08;
          strafe = 0.82 * botState.strafeDirection;
        }

        if (training) {
          forward = Math.max(forward, target.distance > 6 ? training.approachForward : forward);
          if (target.distance > 6) {
            strafe = Math.max(Math.abs(strafe), training.approachStrafe) * botState.strafeDirection;
          }
        }

        if (absoluteError > 0.95) strafe *= 0.35;

        const combatInput = applyBotObstacleAvoidance(
          physics,
          bot.id,
          transform,
          botState,
          {
            forward,
            strafe,
            turn,
            sprint,
            fireHeld: false,
          },
          now,
        );
        movement.setInput(bot.id, combatInput);

        if (selected?.reloadUntil > now) continue;

        const fireCone = training?.fireConeRadians ?? BOT_FIRE_CONE_RADIANS;
        const aimReset = training?.aimResetRadians ?? BOT_AIM_RESET_RADIANS;
        const reactionBase = training?.reactionBaseMs ?? BOT_REACTION_BASE_MS;
        if (weaponRange > 0 && absoluteError < fireCone && target.distance <= weaponRange) {
          if (botState.reactionUntil === 0) {
            botState.reactionUntil = now + reactionBase + (seed % 7) * (training ? 45 : 35);
          }
          if (now >= botState.reactionUntil) weapons.fire(bot.id, now);
        } else if (absoluteError >= aimReset || target.distance > weaponRange) {
          botState.reactionUntil = 0;
        }
      }
    },
  });
}
