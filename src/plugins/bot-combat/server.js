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

function stableHash(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  }
  return hash >>> 0;
}

// Repeatable per-bot variation: no global random calls or perfect machine-gun taps.
export function botFireRhythm(botId, weaponId, cycle = 1) {
  const seed = stableHash(`${botId}:${weaponId}:${cycle}`);
  if (weaponId === "rifle") return {
    shotMs: 100,
    burstMs: 450 + (seed % 430),
    pauseMs: 160 + ((seed >>> 8) % 270),
  };
  return {
    shotMs: 105 + (seed % 95),
    burstMs: 440 + ((seed >>> 8) % 410),
    pauseMs: 145 + ((seed >>> 16) % 290),
  };
}

export const BOT_FIRE_CONE_RADIANS = 0.17;
export const BOT_AIM_RESET_RADIANS = 0.28;
export const BOT_REACTION_BASE_MS = 165;
export const BOT_RETURN_FIRE_REACTION_MS = 95;
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
  version: "2.2.0",
  requires: ["bot-controller", "bot-perception", "movement", "weapons", "entities", "rapier-physics"],
  optional: ["opening-round", "tutorial-session", "armor", "teams"],
  capabilities: [
    "services.consume", "services.provide",
    "components.read", "events.on",
  ],
};

export async function setup(ctx) {
  const bots = ctx.services.get("bots");
  const entities = ctx.services.get("entities");
  const perception = ctx.services.get("bot-perception");
  const movement = ctx.services.get("movement");
  const weapons = ctx.services.get("weapons");
  const physics = ctx.services.get("physics");
  const armorService = ctx.services.has("armor") ? ctx.services.get("armor") : null;
  const opening = ctx.services.has("opening-round") ? ctx.services.get("opening-round") : null;
  const tutorial = ctx.services.has("tutorial-session") ? ctx.services.get("tutorial-session") : null;

  const teams = ctx.services.has("teams") ? ctx.services.get("teams") : null;

  ctx.events.on("combat:damage", ({ targetId, attackerId, now = Date.now() }) => {
    if (!targetId || !attackerId || targetId === attackerId) return;
    const bot = entities.get(targetId);
    const attacker = entities.get(attackerId);
    if (!bot?.bot || !bot.alive || !attacker?.alive) return;
    if (teams && teams.teamOf(targetId) === teams.teamOf(attackerId)) return;
    const botState = ctx.components.get(targetId, "Bot");
    const attackerTransform = ctx.components.get(attackerId, "Transform");
    if (!botState || !attackerTransform) return;

    botState.lastKnownTargetId = attackerId;
    botState.lastKnownX = attackerTransform.x;
    botState.lastKnownY = attackerTransform.y ?? 0;
    botState.lastKnownZ = attackerTransform.z;
    botState.lastKnownUntil = now + 6500;
    botState.attackerId = attackerId;
    botState.attackerUntil = now + 5000;

    if (botState.reactionTargetId !== attackerId) {
      botState.reactionTargetId = attackerId;
      botState.reactionUntil = now + BOT_RETURN_FIRE_REACTION_MS;
      botState.burstUntil = 0;
      botState.nextBurstAt = 0;
      botState.nextShotAt = 0;
    } else if (botState.reactionUntil > now + BOT_RETURN_FIRE_REACTION_MS) {
      botState.reactionUntil = now + BOT_RETURN_FIRE_REACTION_MS;
    }
  });

  ctx.events.on("sound:spatial", (sound = {}) => {
    const sourceId = sound.entityId;
    const key = String(sound.key ?? "");
    if (!sourceId || (!key.startsWith("weapon.") && !key.startsWith("footstep."))) return;
    const source = entities.get(sourceId);
    if (!source?.alive) return;
    const now = Number(sound.now) || Date.now();
    const radius = Math.max(0, Number(sound.radius) || 40);
    const isWeaponSound = key.startsWith("weapon.");

    for (const bot of bots.all()) {
      if (!bot.alive || bot.id === sourceId) continue;
      if (teams && teams.teamOf(bot.id) === teams.teamOf(sourceId)) continue;
      const transform = ctx.components.get(bot.id, "Transform");
      const botState = ctx.components.get(bot.id, "Bot");
      if (!transform || !botState) continue;
      const dist = Math.hypot((Number(sound.x) || 0) - transform.x, (Number(sound.z) || 0) - transform.z);
      if (dist > radius) continue;
      if (!isWeaponSound && (botState.lastKnownUntil ?? 0) > now) continue;
      botState.lastKnownTargetId = sourceId;
      botState.lastKnownX = Number(sound.x) || 0;
      botState.lastKnownY = Number(sound.y) || 0;
      botState.lastKnownZ = Number(sound.z) || 0;
      botState.lastKnownUntil = now + 6000;
    }
  });

  ctx.services.provide("bot-combat", {
    tick(dt, now = Date.now()) {
      const training = opening?.botTuning(now) ?? null;
      for (const bot of bots.all()) {
        if (!bot.alive) continue;
        const transform = ctx.components.get(bot.id, "Transform");
        const botState = ctx.components.get(bot.id, "Bot");
        const inventory = ctx.components.get(bot.id, "Weapons");
        if (!transform || !botState) continue;

        const tutorialDirective = tutorial?.botDirective?.(bot.id) ?? "normal";
        if (tutorialDirective === "passive") {
          movement.setInput(bot.id, {});
          botState.reactionUntil = 0;
          botState.tutorialDemoShotFired = false;
          continue;
        }

        if (inventory?.items?.length > 1) {
          const rifleIndex = inventory.items.findIndex((item) => item.id === "rifle" && (item.ammo > 0 || item.reserve > 0));
          if (rifleIndex >= 0 && inventory.selected !== rifleIndex) {
            inventory.selected = rifleIndex;
          }
        }
        const selected = inventory?.items?.[inventory.selected] ?? null;
        const weaponDefinition = weapons.definitions[selected?.id] ?? null;
        const weaponRange = Number(weaponDefinition?.range) || 0;

        if (tutorialDirective === "demonstrate-hit") {
          const target = perception.nearestVisibleEnemy(
            bot.id,
            weaponRange || 28,
            { humanPriority: 0.1 },
          ) ?? perception.nearestEnemy(bot.id, weaponRange || 28, { humanPriority: 0.1 });
          if (!target) {
            movement.setInput(bot.id, {});
            botState.reactionUntil = 0;
            continue;
          }

          const dx = target.transform.x - transform.x;
          const dz = target.transform.z - transform.z;
          const desired = Math.atan2(dx, -dz);
          const error = wrapAngle(desired - transform.angle);
          const absoluteError = Math.abs(error);
          movement.setInput(bot.id, {
            forward: 0,
            strafe: 0,
            turn: Math.max(-1, Math.min(1, error * 3.2)),
            sprint: false,
            fireHeld: false,
          });

          if (absoluteError <= 0.018 && !botState.tutorialDemoShotFired) {
            if (!botState.reactionUntil) {
              botState.reactionUntil = now + 220;
            } else if (now >= botState.reactionUntil && weapons.fire(bot.id, now)) {
              botState.tutorialDemoShotFired = true;
              botState.reactionUntil = 0;
            }
          } else if (absoluteError > 0.08 && !botState.tutorialDemoShotFired) {
            botState.reactionUntil = 0;
          }
          continue;
        }

        if (selected && selected.ammo <= 4 && selected.reserve > 0) {
          weapons.reload(bot.id, now);
        }

        function clearFireTarget() {
          botState.reactionTargetId = null;
          botState.reactionUntil = 0;
          botState.burstUntil = 0;
          botState.nextBurstAt = 0;
          botState.nextShotAt = 0;
        }

        let visibleTarget = perception.nearestVisibleEnemy(
          bot.id,
          weaponRange || 28,
          { humanPriority: 0.62 },
        );

        if ((botState.attackerUntil ?? 0) > now && botState.attackerId) {
          const attackerEntity = entities.get(botState.attackerId);
          const attackerTransform = ctx.components.get(botState.attackerId, "Transform");
          if (attackerEntity?.alive && attackerTransform) {
            const dist = Math.hypot(attackerTransform.x - transform.x, attackerTransform.z - transform.z);
            if (dist <= (weaponRange || 28) && physics.lineOfSight(transform, attackerTransform, bot.id, attackerEntity.id)) {
              visibleTarget = {
                entityId: attackerEntity.id,
                entity: attackerEntity,
                transform: attackerTransform,
                distance: dist,
                score: dist * 0.4,
              };
            }
          }
        }

        let rememberedHunt = null;
        if (!visibleTarget && (botState.lastKnownUntil ?? 0) > now && botState.lastKnownTargetId) {
          const knownEntity = entities.get(botState.lastKnownTargetId);
          const knownTransform = ctx.components.get(botState.lastKnownTargetId, "Transform");
          if (knownEntity?.alive && knownTransform) {
            const dist = Math.hypot(knownTransform.x - transform.x, knownTransform.z - transform.z);
            rememberedHunt = {
              entityId: knownEntity.id,
              entity: knownEntity,
              transform: knownTransform,
              distance: dist,
            };
          }
        }

        const huntTarget = visibleTarget ?? rememberedHunt ?? perception.nearestEnemy(
          bot.id,
          85,
          { humanPriority: 0.68 },
        );

        if (!visibleTarget && armorService && !training) {
          const armorState = armorService.describe(bot.id);
          if (
            armorState
            && !armorState.plating
            && armorState.reservePlates > 0
            && armorState.current <= armorState.maximum - armorState.plateValue * 0.5
          ) {
            armorService.startFullPlating(bot.id, now);
          }
        }

        if (!huntTarget) {
          const roamingInput = applyBotObstacleAvoidance(
            physics,
            bot.id,
            transform,
            botState,
            {
              forward: 0.88,
              strafe: 0.24 * botState.strafeDirection,
              turn: botState.wanderTurn,
              sprint: true,
              fireHeld: false,
            },
            now,
          );
          movement.setInput(bot.id, roamingInput);
          clearFireTarget();
          continue;
        }

        const seed = bot.id.charCodeAt(bot.id.length - 1) || 1;
        if (now >= botState.tacticUntil) {
          botState.strafeDirection *= -1;
          botState.tacticUntil = now + 480 + (seed % 5) * 115;
        }

        let targetX = huntTarget.transform.x;
        let targetZ = huntTarget.transform.z;
        if (visibleTarget && !training) {
          const targetInput = ctx.components.get(visibleTarget.entityId, "Input");
          if (targetInput) {
            const targetSpeed = targetInput.sprint ? 5.4 : 3.25;
            const targetAngle = visibleTarget.transform.angle ?? 0;
            const vx = (
              Math.sin(targetAngle) * (targetInput.forward || 0)
              + Math.cos(targetAngle) * (targetInput.strafe || 0)
            ) * targetSpeed;
            const vz = (
              -Math.cos(targetAngle) * (targetInput.forward || 0)
              + Math.sin(targetAngle) * (targetInput.strafe || 0)
            ) * targetSpeed;
            const projectileSpeed = Number(weaponDefinition?.muzzleVelocity) || 150;
            const leadSeconds = Math.min(0.22, (visibleTarget.distance / projectileSpeed) * 0.85);
            targetX += vx * leadSeconds;
            targetZ += vz * leadSeconds;
          }
        }

        const dx = targetX - transform.x;
        const dz = targetZ - transform.z;
        const desiredWithoutWobble = Math.atan2(dx, -dz);

        if (!visibleTarget) {
          const huntError = wrapAngle(desiredWithoutWobble - transform.angle);
          const huntTurn = Math.max(-1, Math.min(1, huntError * 3.1));
          const turningHard = Math.abs(huntError) > 1.25;
          const huntingInput = applyBotObstacleAvoidance(
            physics,
            bot.id,
            transform,
            botState,
            {
              forward: turningHard ? 0.35 : 1,
              strafe: turningHard
                ? Math.sign(huntError || 1) * 0.88
                : 0.25 * botState.strafeDirection,
              turn: huntTurn,
              sprint: true,
              fireHeld: false,
            },
            now,
          );
          movement.setInput(bot.id, huntingInput);
          clearFireTarget();
          continue;
        }

        if (armorService?.isPlating(bot.id)) {
          armorService.cancelPlating(bot.id, "combat");
        }

        const target = visibleTarget;
        if (botState.reactionTargetId !== target.entityId) {
          clearFireTarget();
          botState.reactionTargetId = target.entityId;
        }
        const wobbleAmount = training?.aimWobble ?? 0.014;
        const aimWobble = Math.sin(now / (270 + seed * 3) + seed) * wobbleAmount;
        const desired = desiredWithoutWobble + aimWobble;
        const error = wrapAngle(desired - transform.angle);
        const absoluteError = Math.abs(error);
        const turn = Math.max(-1, Math.min(1, error * (training ? 2.1 : 3.25)));

        const healthComp = ctx.components.get(bot.id, "Health");
        const lowHealth = healthComp && healthComp.current < healthComp.maximum * 0.4;

        let forward = 0;
        let strafe = 0;
        let sprint = false;
        if (target.distance > 15) {
          forward = 1;
          strafe = 0.32 * botState.strafeDirection;
          sprint = true;
        } else if (target.distance > 8.5) {
          forward = lowHealth ? -0.25 : 0.62;
          strafe = 0.78 * botState.strafeDirection;
          sprint = target.distance > 11 && !lowHealth;
        } else if (target.distance < 4.8) {
          forward = -0.72;
          strafe = 0.92 * botState.strafeDirection;
        } else {
          forward = lowHealth ? -0.45 : 0.12;
          strafe = 0.92 * botState.strafeDirection;
        }

        if (training) {
          forward = Math.max(forward, target.distance > 6 ? training.approachForward : forward);
          if (target.distance > 6) {
            strafe = Math.max(Math.abs(strafe), training.approachStrafe) * botState.strafeDirection;
          }
        }

        if (absoluteError > 0.85) strafe *= 0.35;

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
            botState.reactionUntil = now + reactionBase + (seed % 7) * (training ? 35 : 18);
          }
          if (now >= botState.reactionUntil && now >= (botState.nextShotAt ?? 0)) {
            if (now >= (botState.burstUntil ?? 0) && now >= (botState.nextBurstAt ?? 0)) {
              botState.burstCycle = (botState.burstCycle ?? 0) + 1;
              const rhythm = botFireRhythm(bot.id, selected?.id, botState.burstCycle);
              botState.burstUntil = now + rhythm.burstMs;
              botState.nextBurstAt = botState.burstUntil + rhythm.pauseMs;
            }
            if (now < botState.burstUntil) {
              const rhythm = botFireRhythm(bot.id, selected?.id, botState.burstCycle);
              weapons.fire(bot.id, now, { pressed: selected?.id === "pistol" });
              botState.nextShotAt = now + rhythm.shotMs;
            }
          }
        } else if (absoluteError >= aimReset || target.distance > weaponRange) {
          botState.reactionUntil = 0;
        }
      }
    },
  });
}
