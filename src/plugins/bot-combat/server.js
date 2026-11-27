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
  if (weaponId === "marksman") return {
    shotMs: 255 + (seed % 65),
    burstMs: 750 + ((seed >>> 8) % 450),
    pauseMs: 180 + ((seed >>> 16) % 220),
  };
  if (weaponId === "sniper") return {
    shotMs: 1140 + (seed % 160),
    burstMs: 1400,
    pauseMs: 0,
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

const BOT_ACTUAL_TURN_SPEED = 2.6;

function tdmSteerTurn(delta, { maxRate = 1.0, deadzone = 0.015, gain = 2.0, dtSec = 0.05 } = {}) {
  const absDelta = Math.abs(delta);
  if (absDelta <= deadzone) return 0;
  const deadbeat = (absDelta * 0.9) / (BOT_ACTUAL_TURN_SPEED * dtSec);
  const mag = Math.min(maxRate, (absDelta * gain) / BOT_ACTUAL_TURN_SPEED, deadbeat);
  return Math.sign(delta) * mag;
}

export function applyBotObstacleAvoidance(physics, botId, transform, botState, input, now = Date.now()) {
  const movementMagnitude = Math.hypot(input.forward, input.strafe);
  if (movementMagnitude < 0.05) {
    sampleStuck(botState, transform, now, movementMagnitude);
    return input;
  }

  const desiredDirection = localToWorld(transform.angle, input.forward, input.strafe);
  const forwardClearance = probeClearance(physics, botId, transform, desiredDirection);
  const blocked = forwardClearance < 0.9;
  const approachingObstacle = !blocked && forwardClearance < 1.38;
  const stuck = sampleStuck(botState, transform, now, movementMagnitude);
  const currentlyAvoiding = (botState.avoidUntil ?? 0) > now;

  if ((blocked && !currentlyAvoiding) || stuck) {
    const rightDirection = rotateDirection(desiredDirection, 0.72);
    const leftDirection = rotateDirection(desiredDirection, -0.72);
    const rightClearance = probeClearance(physics, botId, transform, rightDirection);
    const leftClearance = probeClearance(physics, botId, transform, leftDirection);
    const previous = botState.avoidDirection || botState.strafeDirection || 1;
    if ((botState.avoidFlipLockUntil ?? 0) <= now) {
      botState.avoidDirection = Math.abs(rightClearance - leftClearance) < 0.14
        ? previous
        : (rightClearance > leftClearance ? 1 : -1);
      botState.avoidFlipLockUntil = now + 480;
    }
    botState.avoidUntil = now + (stuck ? 520 : 360);
  } else if (blocked && currentlyAvoiding) {
    botState.avoidUntil = Math.max(botState.avoidUntil, now + 220);
  } else if (approachingObstacle && !currentlyAvoiding) {
    // Smooth pre-contact sidestep curve around corners/pillars without ever spinning the camera
    const rightClearance = probeClearance(physics, botId, transform, rotateDirection(desiredDirection, 0.55));
    const leftClearance = probeClearance(physics, botId, transform, rotateDirection(desiredDirection, -0.55));
    if (Math.abs(rightClearance - leftClearance) >= 0.16) {
      const gentleSide = rightClearance > leftClearance ? 1 : -1;
      botState.avoidDirection = gentleSide;
      const curveDir = rotateDirection(desiredDirection, gentleSide * 0.42);
      const localCurve = worldToLocal(transform.angle, curveDir);
      return {
        ...input,
        forward: Math.max(-0.4, Math.min(0.95, localCurve.forward * 0.92)),
        strafe: Math.max(-0.65, Math.min(0.65, localCurve.strafe * 0.65)),
        turn: input.turn ?? 0,
        targetAngle: input.targetAngle ?? null,
      };
    }
  }

  if ((botState.avoidUntil ?? 0) <= now) return input;

  const side = botState.avoidDirection || 1;
  let slideDir = rotateDirection(desiredDirection, side * 0.78);
  let slideClearance = probeClearance(physics, botId, transform, slideDir);
  if (slideClearance < 0.55) {
    const wider = rotateDirection(desiredDirection, side * 1.25);
    const widerClearance = probeClearance(physics, botId, transform, wider);
    if (widerClearance > slideClearance) {
      slideDir = wider;
      slideClearance = widerClearance;
    } else if ((botState.avoidFlipLockUntil ?? 0) <= now) {
      botState.avoidDirection = -side;
      botState.avoidFlipLockUntil = now + 520;
      slideDir = rotateDirection(desiredDirection, botState.avoidDirection * 1.15);
    }
  }

  // Always preserve camera heading (input.turn & input.targetAngle) and slide smoothly around obstacles via WASD!
  const local = worldToLocal(transform.angle, slideDir);
  return {
    ...input,
    forward: Math.max(-0.55, Math.min(0.78, local.forward * 0.78)),
    strafe: Math.max(-0.85, Math.min(0.85, local.strafe * 0.85)),
    turn: input.turn ?? 0,
    targetAngle: input.targetAngle ?? null,
    sprint: false,
  };
}

export const manifest = {
  id: "bot-combat",
  version: "2.3.0",
  requires: ["bot-controller", "bot-perception", "movement", "weapons", "entities", "rapier-physics"],
  optional: ["opening-round", "tutorial-session", "armor", "teams", "ai-enemy-decisions"],
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
  const aiDecisions = ctx.services.has("ai-enemy-decisions")
    ? ctx.services.get("ai-enemy-decisions")
    : null;

  function pickAiVisibleTarget(bot, botState, maxRange, aiCmd, now) {
    const list = typeof perception.visibleEnemies === "function"
      ? perception.visibleEnemies(bot.id, maxRange, { limit: 6, humanPriority: 1 })
      : [perception.nearestVisibleEnemy(bot.id, maxRange, { humanPriority: 1 })].filter(Boolean);
    if (!list.length) return null;
    if (aiCmd.targetChoice === "attacker" && (botState.attackerUntil ?? 0) > now && botState.attackerId) {
      const attacker = list.find((item) => item.entityId === botState.attackerId);
      if (attacker) return attacker;
    }
    if (aiCmd.targetChoice === "priority_threat" || aiCmd.targetChoice === "human_player") {
      if (aiCmd.isAlly || aiCmd.role === "ally_team" || aiCmd.role === "ally_squad") {
        const botTeam = teams ? Number(teams.teamOf(bot.id)) || 0 : 0;
        const allyHuman = entities.all().find((e) => e.alive && !e.bot && (!teams || Number(teams.teamOf(e.id)) === botTeam));
        const allyHumanTransform = allyHuman ? ctx.components.get(allyHuman.id, "Transform") : null;
        if (allyHumanTransform) {
          return [...list].sort((a, b) => {
            const da = Math.hypot((a.transform?.x ?? 0) - allyHumanTransform.x, (a.transform?.z ?? 0) - allyHumanTransform.z);
            const db = Math.hypot((b.transform?.x ?? 0) - allyHumanTransform.x, (b.transform?.z ?? 0) - allyHumanTransform.z);
            return da - db;
          })[0];
        }
      } else {
        const human = list.find((item) => item.entity && !item.entity.bot);
        if (human) return human;
      }
    }
    if (aiCmd.targetChoice === "weakest") {
      return [...list].sort((a, b) => {
        const aTotal = (ctx.components.get(a.entityId, "Health")?.current ?? 200)
          + (ctx.components.get(a.entityId, "Armor")?.current ?? 0);
        const bTotal = (ctx.components.get(b.entityId, "Health")?.current ?? 200)
          + (ctx.components.get(b.entityId, "Armor")?.current ?? 0);
        return aTotal - bTotal || a.distance - b.distance;
      })[0];
    }
    return [...list].sort((a, b) => a.distance - b.distance)[0];
  }

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
    if (now >= (botState.lastDamageJukeAt ?? 0) + 900) {
      botState.strafeDirection = -(botState.strafeDirection || 1);
      botState.lastDamageJukeAt = now;
    }

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
      if ((botState.lastKnownUntil ?? 0) > now && botState.lastKnownTargetId && botState.lastKnownTargetId !== sourceId) {
        const knownDist = Math.hypot((botState.lastKnownX ?? 0) - transform.x, (botState.lastKnownZ ?? 0) - transform.z);
        if (dist > knownDist * 1.15) continue;
      }
      botState.lastKnownTargetId = sourceId;
      botState.lastKnownX = Number(sound.x) || 0;
      botState.lastKnownY = Number(sound.y) || 0;
      botState.lastKnownZ = Number(sound.z) || 0;
      botState.lastKnownUntil = now + 5000;
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

        const preMaxRange = (inventory?.items ?? []).reduce((best, item) => (
          Math.max(best, Number(weapons.definitions?.[item.id]?.range) || 0)
        ), 28);
        const quickVisible = tutorialDirective === "normal"
          ? perception.nearestVisibleEnemy(bot.id, preMaxRange, { humanPriority: 0.62 })
          : null;
        if (inventory?.items?.length > 1) {
          const dist = quickVisible?.distance ?? 26;
          const usable = inventory.items
            .map((item, idx) => ({ item, idx, ready: item.ammo > 0 && !(Number(item.reloadUntil) > now) }))
            .filter(({ item }) => item.ammo > 0 || item.reserve > 0);
          const priority = dist >= 30
            ? ["sniper", "marksman", "rifle", "pistol"]
            : dist >= 22
              ? ["marksman", "rifle", "sniper", "pistol"]
              : ["rifle", "marksman", "pistol", "sniper"];
          for (const requireReady of [true, false]) {
            let chosen = -1;
            for (const id of priority) {
              const found = usable.find((e) => e.item.id === id && (!requireReady || e.ready));
              if (found) {
                chosen = found.idx;
                break;
              }
            }
            if (chosen >= 0) {
              if (inventory.selected !== chosen) inventory.selected = chosen;
              break;
            }
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
            turn: tdmSteerTurn(error, { maxRate: 1.0, deadzone: 0.008, gain: 2.3 }),
            targetAngle: desired,
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

        if (selected && selected.reserve > 0) {
          const proactiveCap = selected.id === "sniper" ? 2 : selected.id === "marksman" ? 4 : 4;
          if (selected.ammo <= 0 || (!quickVisible && selected.ammo <= proactiveCap)) {
            weapons.reload(bot.id, now);
          }
        }

        function clearFireTarget() {
          botState.reactionTargetId = null;
          botState.reactionUntil = 0;
          botState.burstUntil = 0;
          botState.nextBurstAt = 0;
          botState.nextShotAt = 0;
        }

        const aiCmd = tutorialDirective === "normal" ? aiDecisions?.commandFor?.(bot.id, now) ?? null : null;

        let visibleTarget = aiCmd
          ? pickAiVisibleTarget(bot, botState, weaponRange || 28, aiCmd, now)
          : (quickVisible ?? perception.nearestVisibleEnemy(
            bot.id,
            weaponRange || 28,
            { humanPriority: 0.62 },
          ));

        if (!aiCmd && (botState.attackerUntil ?? 0) > now && botState.attackerId) {
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

        if (visibleTarget) {
          botState.lastKnownTargetId = visibleTarget.entityId;
          botState.lastKnownX = visibleTarget.transform.x;
          botState.lastKnownY = visibleTarget.transform.y ?? 0;
          botState.lastKnownZ = visibleTarget.transform.z;
          botState.lastKnownUntil = now + 2400;
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
          const currentPatrol = botState.tdmPatrolTarget;
          const distPatrol = currentPatrol
            ? Math.hypot(currentPatrol.x - transform.x, currentPatrol.z - transform.z)
            : Infinity;
          if (!currentPatrol || distPatrol <= 3.2 || now >= (botState.tdmPatrolUntil ?? 0)) {
            const patrolStep = (botState.tdmPatrolStep ?? 0) + 1;
            botState.tdmPatrolStep = patrolStep;
            const patrolSeed = stableHash(`${bot.id}:tdm-patrol:${patrolStep}`);
            const forwardAngle = Number(transform.angle) || 0;
            const offset = (((patrolSeed % 100) / 100) * 2 - 1) * 1.1;
            const leg = 14 + (patrolSeed % 10);
            const rawX = transform.x + Math.sin(forwardAngle + offset) * leg;
            const rawZ = transform.z - Math.cos(forwardAngle + offset) * leg;
            botState.tdmPatrolTarget = {
              x: Math.max(-24, Math.min(24, rawX)),
              z: Math.max(-24, Math.min(24, rawZ)),
            };
            botState.tdmPatrolUntil = now + 4500;
          }
          const patrolDesired = Math.atan2(
            botState.tdmPatrolTarget.x - transform.x,
            -(botState.tdmPatrolTarget.z - transform.z),
          );
          const patrolDelta = wrapAngle(patrolDesired - transform.angle);
          const patrolStrafe = Math.abs(patrolDelta) > 0.45 ? Math.sign(patrolDelta) * 0.36 : 0;
          const roamingInput = applyBotObstacleAvoidance(
            physics,
            bot.id,
            transform,
            botState,
            {
              forward: Math.abs(patrolDelta) > 1.1 ? 0.35 : (Math.abs(patrolDelta) > 0.55 ? 0.68 : 0.88),
              strafe: patrolStrafe,
              turn: tdmSteerTurn(patrolDelta, { maxRate: 0.72, deadzone: 0.03, gain: 1.45 }),
              targetAngle: patrolDesired,
              sprint: false,
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
          botState.tacticUntil = now + 1850 + (seed % 5) * 320;
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
            const isPrecision = selected?.id === "sniper" || selected?.id === "marksman";
            const leadSeconds = Math.min(
              isPrecision ? 0.32 : 0.22,
              (visibleTarget.distance / projectileSpeed) * (isPrecision ? 0.96 : 0.85),
            );
            targetX += vx * leadSeconds;
            targetZ += vz * leadSeconds;
          }
        }

        const dx = targetX - transform.x;
        const dz = targetZ - transform.z;
        const desiredWithoutWobble = Math.atan2(dx, -dz);

        if (!visibleTarget) {
          let moveHeading = desiredWithoutWobble;
          let moveDist = huntTarget.distance;
          if (aiCmd?.moveChoice === "regroup_squad" && teams) {
            const ownTeam = Number(teams.teamOf(bot.id)) || 0;
            const ally = entities.all()
              .filter((e) => e.id !== bot.id && e.alive && Number(teams.teamOf(e.id)) === ownTeam)
              .map((e) => ({ e, t: ctx.components.get(e.id, "Transform") }))
              .filter((item) => item.t)
              .sort((a, b) => (a.e.bot ? 1 : 0) - (b.e.bot ? 1 : 0)
                || Math.hypot(a.t.x - transform.x, a.t.z - transform.z) - Math.hypot(b.t.x - transform.x, b.t.z - transform.z))[0];
            if (ally) {
              moveHeading = Math.atan2(ally.t.x - transform.x, -(ally.t.z - transform.z));
              moveDist = Math.hypot(ally.t.x - transform.x, ally.t.z - transform.z);
            }
          }
          const huntError = wrapAngle(moveHeading - transform.angle);
          const huntTurn = tdmSteerTurn(huntError, { maxRate: 0.82, deadzone: 0.025, gain: 1.65 });
          const turningHard = Math.abs(huntError) > 1.1;
          let huntForward = turningHard ? 0.34 : (Math.abs(huntError) > 0.55 ? 0.68 : (moveDist > 4 ? 0.96 : 0.28));
          let huntStrafe = Math.abs(huntError) > 0.45 ? Math.sign(huntError) * 0.38 : 0;
          let huntSprint = !turningHard && Math.abs(huntError) < 0.45 && moveDist > 14;
          if (aiCmd) {
            if (aiCmd.moveChoice === "retreat_heal") {
              huntForward = -0.7;
              huntStrafe = 0.35 * botState.strafeDirection;
              huntSprint = false;
              if (armorService && !armorService.isPlating(bot.id)) {
                const armorState = armorService.describe(bot.id);
                if (armorState && armorState.reservePlates > 0 && armorState.current < armorState.maximum) {
                  armorService.startFullPlating(bot.id, now);
                }
              }
            } else if (aiCmd.moveChoice === "hold_cover") {
              huntForward = 0;
              huntStrafe = 0.2 * botState.strafeDirection;
              huntSprint = false;
            } else if (aiCmd.moveChoice === "flank_left") {
              botState.strafeDirection = -1;
              huntStrafe = -0.58;
            } else if (aiCmd.moveChoice === "flank_right") {
              botState.strafeDirection = 1;
              huntStrafe = 0.58;
            } else if (aiCmd.moveChoice === "regroup_squad") {
              huntSprint = !turningHard && moveDist > 9;
            }
            if (aiCmd.paceChoice === "sprint_push" && huntForward > 0 && !turningHard) {
              huntSprint = true;
            } else if (aiCmd.paceChoice === "steady_aim") {
              huntForward *= 0.65;
              huntSprint = false;
            }
          }
          const huntingInput = applyBotObstacleAvoidance(
            physics,
            bot.id,
            transform,
            botState,
            {
              forward: huntForward,
              strafe: huntStrafe,
              turn: huntTurn,
              targetAngle: moveHeading,
              sprint: huntSprint,
              fireHeld: false,
            },
            now,
          );
          movement.setInput(bot.id, huntingInput);
          clearFireTarget();
          continue;
        }

        if (armorService?.isPlating(bot.id) && aiCmd?.moveChoice !== "retreat_heal") {
          armorService.cancelPlating(bot.id, "combat");
        }

        const target = visibleTarget;
        if (botState.reactionTargetId !== target.entityId) {
          clearFireTarget();
          botState.reactionTargetId = target.entityId;
        }
        const wobbleAmount = training?.aimWobble ?? (aiCmd?.paceChoice === "steady_aim" ? 0.004 : 0.012);
        const aimWobble = Math.sin(now / (320 + seed * 3) + seed) * wobbleAmount;
        const desired = desiredWithoutWobble + aimWobble;
        const error = wrapAngle(desired - transform.angle);
        const absoluteError = Math.abs(error);
        const turn = tdmSteerTurn(error, {
          maxRate: training ? 0.82 : 1.0,
          deadzone: 0.01,
          gain: training ? 1.7 : (aiCmd?.paceChoice === "steady_aim" ? 2.35 : 2.15),
        });

        const healthComp = ctx.components.get(bot.id, "Health");
        const lowHealth = healthComp && healthComp.current < healthComp.maximum * 0.4;

        const isSniper = selected?.id === "sniper";
        const isMarksman = selected?.id === "marksman";
        const isPrecision = isSniper || isMarksman;

        let forward = 0;
        let strafe = 0;
        let sprint = false;
        if (aiCmd) {
          if (aiCmd.moveChoice === "advance_direct") {
            forward = target.distance > 5.5 ? 1 : 0.3;
            strafe = 0.25 * botState.strafeDirection;
            sprint = aiCmd.paceChoice === "sprint_push" && target.distance > 7;
          } else if (aiCmd.moveChoice === "flank_left") {
            botState.strafeDirection = -1;
            forward = target.distance > 11 ? 0.72 : 0.24;
            strafe = -0.92;
            sprint = aiCmd.paceChoice === "sprint_push" && target.distance > 14;
          } else if (aiCmd.moveChoice === "flank_right") {
            botState.strafeDirection = 1;
            forward = target.distance > 11 ? 0.72 : 0.24;
            strafe = 0.92;
            sprint = aiCmd.paceChoice === "sprint_push" && target.distance > 14;
          } else if (aiCmd.moveChoice === "hold_cover") {
            forward = 0;
            strafe = 0.28 * botState.strafeDirection;
            sprint = false;
          } else if (aiCmd.moveChoice === "kite_back") {
            const standoff = isSniper ? 36 : isMarksman ? 22 : 12;
            forward = target.distance < standoff ? -0.84 : 0.05;
            strafe = 0.52 * botState.strafeDirection;
            sprint = false;
          } else if (aiCmd.moveChoice === "retreat_heal") {
            forward = -0.9;
            strafe = 0.44 * botState.strafeDirection;
            sprint = false;
            if (armorService && !armorService.isPlating(bot.id)) {
              const armorState = armorService.describe(bot.id);
              if (armorState && armorState.reservePlates > 0 && armorState.current < armorState.maximum * 0.6) {
                armorService.startFullPlating(bot.id, now);
              }
            }
          } else if (aiCmd.moveChoice === "regroup_squad") {
            forward = target.distance > 12 ? 0.55 : -0.25;
            strafe = 0.62 * botState.strafeDirection;
            sprint = false;
          } else {
            forward = target.distance > 10 ? 0.85 : 0.25;
            strafe = 0.45 * botState.strafeDirection;
            sprint = aiCmd.paceChoice === "sprint_push" && target.distance > 14;
          }

          if (aiCmd.paceChoice === "steady_aim") {
            forward *= 0.34;
            strafe *= 0.3;
            sprint = false;
          } else if (aiCmd.paceChoice === "tactical_strafe") {
            if (Math.abs(strafe) < 0.55) strafe = 0.78 * botState.strafeDirection;
            sprint = false;
          } else if (aiCmd.paceChoice === "sprint_push" && forward > 0.65 && absoluteError < 0.7) {
            sprint = true;
          }
        } else if (isSniper) {
          if (target.distance > 54) {
            forward = 0.85;
            strafe = 0.25 * botState.strafeDirection;
            sprint = true;
          } else if (target.distance < 30) {
            forward = -0.82;
            strafe = 0.58 * botState.strafeDirection;
          } else {
            forward = 0;
            strafe = 0.45 * botState.strafeDirection;
          }
          if (now >= (botState.nextShotAt ?? 0) - 200 && absoluteError < 0.24) {
            forward *= 0.25;
            strafe *= 0.22;
            sprint = false;
          }
        } else if (isMarksman) {
          if (target.distance > 34) {
            forward = 0.88;
            strafe = 0.3 * botState.strafeDirection;
            sprint = true;
          } else if (target.distance < 18) {
            forward = -0.72;
            strafe = 0.65 * botState.strafeDirection;
          } else {
            forward = lowHealth ? -0.35 : 0.1;
            strafe = 0.62 * botState.strafeDirection;
          }
        } else if (target.distance > 15) {
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

        if (!training && selected?.reloadUntil > now && target.distance <= 24) {
          // Tactical reload weave: evade laterally and create space while reloading
          forward = target.distance < 14 ? -0.58 : -0.18;
          strafe = 0.82 * botState.strafeDirection;
          sprint = false;
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
            targetAngle: desired,
            sprint,
            fireHeld: false,
            aimLock: true,
          },
          now,
        );
        movement.setInput(bot.id, combatInput);

        if (selected?.reloadUntil > now) continue;
        if (aiCmd?.fireChoice === "hold_fire") {
          botState.reactionUntil = 0;
          continue;
        }

        const baseFireCone = isSniper ? 0.095 : isMarksman ? 0.14 : BOT_FIRE_CONE_RADIANS;
        const fireCone = training?.fireConeRadians ?? (aiCmd?.paceChoice === "steady_aim" ? baseFireCone * 0.85 : baseFireCone);
        const aimReset = training?.aimResetRadians ?? BOT_AIM_RESET_RADIANS;
        const reactionBase = training?.reactionBaseMs ?? (aiCmd?.paceChoice === "steady_aim" ? Math.round(BOT_REACTION_BASE_MS * 0.65) : BOT_REACTION_BASE_MS);
        if (weaponRange > 0 && absoluteError < fireCone && target.distance <= weaponRange) {
          if (botState.reactionUntil === 0) {
            botState.reactionUntil = now + reactionBase + (seed % 7) * (training ? 35 : 18);
          }
          if (now >= botState.reactionUntil && now >= (botState.nextShotAt ?? 0)) {
            if (isSniper || aiCmd?.fireChoice === "single_tap") {
              const rhythm = botFireRhythm(bot.id, selected?.id, (botState.burstCycle ?? 0) + 1);
              if (weapons.fire(bot.id, now, { pressed: true })) {
                botState.burstCycle = (botState.burstCycle ?? 0) + 1;
                botState.nextShotAt = now + (aiCmd?.fireChoice === "single_tap" && !isSniper
                  ? Math.max(280, rhythm.shotMs)
                  : rhythm.shotMs);
              }
            } else if (aiCmd?.fireChoice === "suppress_auto") {
              const rhythm = botFireRhythm(bot.id, selected?.id, (botState.burstCycle ?? 0) + 1);
              if (weapons.fire(bot.id, now, { pressed: !weaponDefinition?.automatic }) || !isPrecision) {
                botState.nextShotAt = now + rhythm.shotMs;
              }
            } else {
              if (now >= (botState.burstUntil ?? 0) && now >= (botState.nextBurstAt ?? 0)) {
                botState.burstCycle = (botState.burstCycle ?? 0) + 1;
                const rhythm = botFireRhythm(bot.id, selected?.id, botState.burstCycle);
                botState.burstUntil = now + rhythm.burstMs;
                botState.nextBurstAt = botState.burstUntil + rhythm.pauseMs;
              }
              if (now < botState.burstUntil) {
                const rhythm = botFireRhythm(bot.id, selected?.id, botState.burstCycle);
                const fired = weapons.fire(bot.id, now, { pressed: !weaponDefinition?.automatic });
                if (fired || !isPrecision) {
                  botState.nextShotAt = now + rhythm.shotMs;
                }
              }
            }
          }
        } else if (absoluteError >= aimReset || target.distance > weaponRange) {
          botState.reactionUntil = 0;
        }
      }
    },
  });
}
