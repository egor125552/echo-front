import { getSharedTacticalCombatNet } from "../../ai/tactical-combat-net.js";
import { getSharedTacticalNodeGrid } from "../../ai/tactical-node-grid.js";
import { selectBotStimulantKind } from "../../game/crouch-squad-inventory.js";

export const BOT_VISIBLE_MEMORY_MS = 10_000;
export const BOT_DAMAGE_MEMORY_MS = 12_000;
export const BOT_SEARCH_REACHED_DISTANCE = 2.2;
export const BOT_INVESTIGATION_REACHED_DISTANCE = 3.2;
export const BOT_REACTION_MIN_MS = 115;
export const BOT_REACTION_SPREAD_MS = 90;
export const BOT_RETURN_FIRE_REACTION_MS = 55;
export const BOT_BURST_MIN_MS = 760;
export const BOT_BURST_SPREAD_MS = 420;
export const BOT_BURST_PAUSE_MIN_MS = 240;
export const BOT_BURST_PAUSE_SPREAD_MS = 220;
export const BOT_STAIR_ENTRY_OFFSET = 1.15;
export const BOT_STAIR_ENTRY_TOLERANCE = 0.32;
export const BOT_GROUND_RAMP_ESCAPE_Y = 0.45;

export const manifest = {
  id: "bot-combat",
  version: "4.4.0",
  requires: [
    "bot-controller", "bot-perception", "bot-navigation", "battle-royale-bot-interest",
    "bot-brain", "movement", "weapons", "entities", "spatial-grid", "battle-royale",
    "map-test-arena",
  ],
  optional: ["battle-royale-tutorial", "armor", "stimulants", "ai-enemy-decisions"],
  capabilities: ["services.consume", "services.provide", "components.read", "events.on", "events.emit"],
};

function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function wrapAngle(value) {
  let angle = value;
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function distance2(a, b) {
  return Math.hypot((a.x ?? 0) - (b.x ?? 0), (a.z ?? 0) - (b.z ?? 0));
}

function distance3(a, b) {
  return Math.hypot(
    (a.x ?? 0) - (b.x ?? 0),
    (a.y ?? 0) - (b.y ?? 0),
    (a.z ?? 0) - (b.z ?? 0),
  );
}

function stableSeed(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

const BOT_TURN_SPEED_RAD_PER_SEC = 2.6;

function steeringTo(transform, target, thinkDelayMs = 120, options = {}) {
  const dx = target.x - transform.x;
  const dz = target.z - transform.z;
  const dist = Math.hypot(dx, dz);
  if (!options.allowPointTurn && dist < 0.35) {
    return {
      turn: 0,
      delta: 0,
      aligned: true,
      distance: dist,
    };
  }
  const desired = Math.atan2(dx, -dz);
  const delta = wrapAngle(desired - transform.angle);
  const absDelta = Math.abs(delta);
  const deadzone = Number(options.deadzone) >= 0 ? Number(options.deadzone) : 0.025;
  const alignThreshold = Number(options.alignThreshold) || 0.34;
  if (absDelta <= deadzone) {
    return {
      turn: 0,
      targetAngle: desired,
      delta,
      aligned: true,
      distance: dist,
    };
  }
  const stepCount = Math.max(1, Math.ceil((Number(thinkDelayMs) || 120) / 50));
  const effectiveSec = stepCount * 0.05;
  const closeRangeDamp = dist < 2.2 && absDelta < 0.45 ? 0.78 : 1.0;
  const maxRate = Math.max(0.1, Math.min(1, (Number(options.maxRate) || 1.0) * closeRangeDamp));
  const gain = Number(options.gain) || 1.75;
  const maxTurnStep = BOT_TURN_SPEED_RAD_PER_SEC * effectiveSec;
  const deadbeatCap = maxTurnStep > 0 ? (absDelta * 0.88) / maxTurnStep : 1;
  const proportional = Math.min(maxRate, (absDelta * gain) / BOT_TURN_SPEED_RAD_PER_SEC);
  const turn = Math.sign(delta) * Math.min(proportional, deadbeatCap);
  return {
    turn,
    targetAngle: desired,
    delta,
    aligned: absDelta < alignThreshold,
    distance: dist,
  };
}

function rememberTarget(state, entityId, transform, now, ttl) {
  if (!state || !transform) return;
  state.lastKnownTargetId = entityId ?? null;
  state.lastKnownX = Number(transform.x) || 0;
  state.lastKnownY = Number(transform.y) || 0;
  state.lastKnownZ = Number(transform.z) || 0;
  state.lastKnownUntil = now + ttl;
}

function clearMemory(state) {
  state.lastKnownTargetId = null;
  state.lastKnownX = null;
  state.lastKnownY = null;
  state.lastKnownZ = null;
  state.lastKnownUntil = 0;
}

function rememberedTarget(state, entities, now) {
  if (!state?.lastKnownTargetId || now > (state.lastKnownUntil ?? 0)) {
    if (state) clearMemory(state);
    return null;
  }
  const entity = entities.get(state.lastKnownTargetId);
  if (!entity?.alive) {
    clearMemory(state);
    return null;
  }
  if (![state.lastKnownX, state.lastKnownY, state.lastKnownZ].every(Number.isFinite)) {
    clearMemory(state);
    return null;
  }
  return {
    entityId: state.lastKnownTargetId,
    transform: {
      x: state.lastKnownX,
      y: state.lastKnownY,
      z: state.lastKnownZ,
    },
  };
}

function reactionDelay(botId, targetId) {
  return BOT_REACTION_MIN_MS
    + (stableSeed(`${botId}:${targetId}:reaction`) % (BOT_REACTION_SPREAD_MS + 1));
}

function reactionReady(botId, state, targetId, now) {
  if (state.reactionTargetId !== targetId) {
    state.reactionTargetId = targetId;
    state.reactionUntil = now + reactionDelay(botId, targetId);
    state.burstUntil = 0;
    state.nextBurstAt = 0;
    state.burstCycle = 0;
    state.nextShotAt = 0;
    return false;
  }
  return now >= (state.reactionUntil ?? 0);
}

function burstAllowsFire(botId, state, now) {
  if (now < (state.burstUntil ?? 0)) return true;
  if (now < (state.nextBurstAt ?? 0)) return false;
  state.burstCycle = (state.burstCycle ?? 0) + 1;
  const seed = stableSeed(`${botId}:${state.burstCycle}:burst`);
  const burstMs = BOT_BURST_MIN_MS + (seed % (BOT_BURST_SPREAD_MS + 1));
  const pauseMs = BOT_BURST_PAUSE_MIN_MS
    + ((seed >>> 8) % (BOT_BURST_PAUSE_SPREAD_MS + 1));
  state.burstUntil = now + burstMs;
  state.nextBurstAt = state.burstUntil + pauseMs;
  return true;
}

export function stagedStairRoute(transform, route) {
  if (route?.kind !== "stair") return route;
  if (route.transitionSide === "cross") return route;
  const transformY = Number(transform?.y) || 0;
  const routeY = Number(route?.y) || 0;
  const approachingBottomFromEast = (
    transformY < 0.45
    && routeY < 0.2
    && transform.x >= route.x - 0.15
  );
  if (!approachingBottomFromEast) return route;
  const offset = route.transitionSide === "approach" ? 0.75 : BOT_STAIR_ENTRY_OFFSET;
  const approach = { ...route, x: route.x + offset, stairStage: "align" };
  const centered = Math.abs(transform.z - route.z) <= 0.28;
  const inEntryCorridor = transform.x <= approach.x + BOT_STAIR_ENTRY_TOLERANCE;
  if (!centered || !inEntryCorridor) return approach;
  return route;
}

function sameResolvedFloor(transform, target, upperY) {
  if (!target) return false;
  const fromUpper = Number(transform?.y) > upperY / 2;
  const targetUpper = Number(target?.y) > upperY / 2;
  const landed = Number(transform?.y) <= 0.15 || Number(transform?.y) >= upperY - 0.15;
  return landed && fromUpper === targetUpper;
}

export function stairRouteMatchesTargetFloor(route, target, upperY = 3.2) {
  if (route?.kind !== "stair") return true;
  if (!target) return false;
  const targetUpper = Number(target?.y) > upperY / 2;
  const routeUpper = Number(route?.y) > upperY / 2;
  return targetUpper === routeUpper;
}

export function normalizeRouteForTarget(transform, target, route, upperY = 3.2) {
  if (route?.kind !== "stair" || !target) return route;
  const targetUpper = Number(target?.y) > upperY / 2;
  const currentY = Number(transform?.y) || 0;
  if (!targetUpper && currentY < BOT_GROUND_RAMP_ESCAPE_Y) return null;
  return route;
}

export function nextMidStairRoute(transform, target, previousRoute, freshRoute, upperY = 3.2) {
  if (previousRoute?.kind !== "stair") return null;
  if (!stairRouteMatchesTargetFloor(previousRoute, target, upperY)) return null;
  const currentY = Number(transform?.y) || 0;
  if (currentY <= 0.02 || currentY >= upperY - 0.12) return null;
  if (freshRoute?.kind === "stair" && stairRouteMatchesTargetFloor(freshRoute, target, upperY)) {
    return normalizeRouteForTarget(transform, target, freshRoute, upperY);
  }
  if (previousRoute.transitionSide === "cross") {
    return normalizeRouteForTarget(transform, target, previousRoute, upperY);
  }
  return null;
}

export async function setup(ctx) {
  const bots = ctx.services.get("bots");
  const perception = ctx.services.get("bot-perception");
  const navigation = ctx.services.get("bot-navigation");
  const interest = ctx.services.get("bot-interest");
  const brain = ctx.services.get("bot-brain");
  const movement = ctx.services.get("movement");
  const weapons = ctx.services.get("weapons");
  const entities = ctx.services.get("entities");
  const grid = ctx.services.get("spatial-grid");
  const battleRoyale = ctx.services.get("battle-royale");
  const map = ctx.services.get("map");
  const tutorial = ctx.services.has("battle-royale-tutorial")
    ? ctx.services.get("battle-royale-tutorial")
    : null;
  const armorService = ctx.services.has("armor")
    ? ctx.services.get("armor")
    : null;
  const getTeams = () => (ctx.services.has("teams") ? ctx.services.get("teams") : null);
  const getInjury = () => (ctx.services.has("injury") ? ctx.services.get("injury") : null);
  const getStimulants = () => (ctx.services.has("stimulants") ? ctx.services.get("stimulants") : null);
  const getVehicles = () => (ctx.services.has("vehicles") ? ctx.services.get("vehicles") : null);
  const getShop = () => (ctx.services.has("shop") ? ctx.services.get("shop") : null);
  const getAiDecisions = () => (ctx.services.has("ai-enemy-decisions") ? ctx.services.get("ai-enemy-decisions") : null);
  const combatNet = getSharedTacticalCombatNet();
  const nodeGrid = getSharedTacticalNodeGrid(map);
  const targetMotionSamples = new Map();

  function observeHumanCombatEngagement(humanId, targetId, {
    reward = 0.85,
    weaponId = "rifle",
    hitScored = true,
    now = Date.now(),
  } = {}) {
    const humanEnt = humanId ? entities.get(humanId) : null;
    if (!humanEnt || humanEnt.bot || !humanEnt.alive) return null;
    const hTransform = ctx.components.get(humanId, "Transform");
    const tTransform = targetId ? ctx.components.get(targetId, "Transform") : null;
    if (!hTransform) return null;

    const hpComp = ctx.components.get(humanId, "Health");
    const armorComp = ctx.components.get(humanId, "Armor");
    const inv = ctx.components.get(humanId, "Weapons");
    const input = ctx.components.get(humanId, "Input") ?? {};
    const selectedWep = inv?.items?.[inv.selected] ?? null;
    const activeWepId = weaponId || selectedWep?.id || "rifle";
    const wepDef = weapons.definitions?.[activeWepId] ?? null;
    const stimsService = getStimulants();
    const totalStims = stimsService ? (stimsService.totalCount?.(humanId) ?? stimsService.count(humanId)) : 0;
    const reservePlates = Number(armorComp?.reserve ?? 0);
    const enemyDist = tTransform ? distance3(hTransform, tTransform) : 24;
    const targetArmorComp = targetId ? ctx.components.get(targetId, "Armor") : null;

    let aimError = 0.05;
    if (tTransform) {
      const desiredAngle = Math.atan2(
        (Number(tTransform.x) || 0) - (Number(hTransform.x) || 0),
        -((Number(tTransform.z) || 0) - (Number(hTransform.z) || 0)),
      );
      let delta = desiredAngle - (Number(hTransform.angle) || 0);
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      aimError = Math.abs(delta);
    }

    const mates = squadTeammatesFor(humanId, { includeHuman: false, includeDowned: false });
    const nearestAllyDist = mates.length > 0 && mates[0]?.transform
      ? distance3(hTransform, mates[0].transform)
      : 60;

    return combatNet.learnFromHumanCombat({
      selfHealthRatio: (Number(hpComp?.current) || 100) / Math.max(1, Number(hpComp?.maximum) || 100),
      selfArmorRatio: (Number(armorComp?.current) || 0) / Math.max(1, Number(armorComp?.maximum) || 150),
      enemyDistance: enemyDist,
      visibleEnemyCount: 1,
      standingAllies: mates.length,
      nearestAllyDistance: nearestAllyDist,
      weaponRange: Number(wepDef?.range) || 55,
      ammoRatio: (Number(selectedWep?.ammo) || 15) / Math.max(1, Number(wepDef?.magazine) || 30),
      targetArmorRatio: (Number(targetArmorComp?.current) || 0) / 150,
      hasCoverOrBuilding: Boolean(buildingIdAt(hTransform)),
      hasStimsOrPlates: Math.min(1, (totalStims + reservePlates) / 4),
      elevationDiff: tTransform ? (Number(hTransform.y) || 0) - (Number(tTransform.y) || 0) : 0,
      aimError,
      lineOfSightClear: true,
      targetIsHuman: true,
    }, {
      forward: Number(input.forward) || 0,
      strafe: Number(input.strafe) || 0,
      sprint: Boolean(input.sprint),
      weaponId: activeWepId,
      hitScored,
      reward,
    }, now);
  }

  ctx.events.on("weapon:fired", ({ entityId, weaponId, now } = {}) => {
    const tNow = Number.isFinite(now) ? Number(now) : Date.now();
    const shooter = entityId ? entities.get(entityId) : null;
    if (shooter && !shooter.bot && shooter.alive) {
      const nearEnemy = perception.nearestEnemy?.(entityId, 115) ?? null;
      observeHumanCombatEngagement(entityId, nearEnemy?.entityId ?? null, {
        reward: 0.45,
        weaponId,
        hitScored: false,
        now: tNow,
      });
    }
  });

  let lastDamageEventKey = "";
  function handleDamageLearning({ attackerId, targetId, entityId, amount, requested, healthApplied, weaponId, now } = {}) {
    const resolvedTargetId = targetId ?? entityId ?? null;
    const tNow = Number.isFinite(now) ? Number(now) : Date.now();
    const eventKey = `${attackerId ?? ""}:${resolvedTargetId ?? ""}:${tNow}`;
    if (eventKey === lastDamageEventKey) return;
    lastDamageEventKey = eventKey;

    const rawDmg = Number(amount ?? requested ?? healthApplied) || 20;
    const dmgScale = Math.min(1.2, Math.max(0.15, rawDmg / 65));
    const attacker = attackerId ? entities.get(attackerId) : null;
    const target = resolvedTargetId ? entities.get(resolvedTargetId) : null;
    const involvesHuman = Boolean((attacker && !attacker.bot) || (target && !target.bot));

    const aTransform = attackerId ? ctx.components.get(attackerId, "Transform") : null;
    const tTransform = resolvedTargetId ? ctx.components.get(resolvedTargetId, "Transform") : null;
    if (aTransform && tTransform) {
      nodeGrid.recordFireDanger(aTransform, tTransform, dmgScale, tNow);
    }

    if (attacker && !attacker.bot) {
      observeHumanCombatEngagement(attackerId, resolvedTargetId, {
        reward: 0.95 * dmgScale,
        weaponId,
        hitScored: true,
        now: tNow,
      });
    }
    if (attacker?.bot) {
      combatNet.recordCombatOutcome(attackerId, 0.45 * dmgScale, tNow, { involvesHuman });
    }
    if (target?.bot) {
      combatNet.recordCombatOutcome(resolvedTargetId, -0.35 * dmgScale, tNow, { involvesHuman });
    }
  }

  ctx.events.on("combat:damage", handleDamageLearning);
  ctx.events.on("health:damaged", handleDamageLearning);

  ctx.events.on("injury:downed", ({ entityId, attackerId, weaponId, now } = {}) => {
    const tNow = Number.isFinite(now) ? Number(now) : Date.now();
    const attacker = attackerId ? entities.get(attackerId) : null;
    const target = entityId ? entities.get(entityId) : null;
    const involvesHuman = Boolean((attacker && !attacker.bot) || (target && !target.bot));

    if (attacker && !attacker.bot) {
      observeHumanCombatEngagement(attackerId, entityId, {
        reward: 1.65,
        weaponId,
        hitScored: true,
        now: tNow,
      });
    }
    if (attacker?.bot) {
      combatNet.recordCombatOutcome(attackerId, 1.35, tNow, { involvesHuman });
    }
    if (target?.bot) {
      combatNet.recordCombatOutcome(entityId, -1.15, tNow, { involvesHuman });
    }
  });

  ctx.events.on("entity:died", ({ entityId, killerId, now } = {}) => {
    const tNow = Number.isFinite(now) ? Number(now) : Date.now();
    const killer = killerId ? entities.get(killerId) : null;
    const victim = entityId ? entities.get(entityId) : null;
    const involvesHuman = Boolean((killer && !killer.bot) || (victim && !victim.bot));

    if (killer && !killer.bot) {
      observeHumanCombatEngagement(killerId, entityId, {
        reward: 2.0,
        hitScored: true,
        now: tNow,
      });
    }
    if (killer?.bot) {
      combatNet.recordCombatOutcome(killerId, 1.85, tNow, { involvesHuman });
    }
    if (victim?.bot) {
      combatNet.recordCombatOutcome(entityId, -1.6, tNow, { involvesHuman });
    }
  });

  ctx.events.on("injury:team-revive-completed", ({ reviverId, now } = {}) => {
    const tNow = Number.isFinite(now) ? Number(now) : Date.now();
    if (reviverId && entities.get(reviverId)?.bot) {
      combatNet.recordCombatOutcome(reviverId, 1.0, tNow);
    }
  });

  ctx.events.on("injury:stim-cancelled", ({ entityId, reason, now } = {}) => {
    if (!entityId) return;
    const state = ctx.components.get(entityId, "Bot");
    if (!state) return;
    const tNow = Number.isFinite(now) ? Number(now) : Date.now();
    if (reason === "damaged") state.lastStimCancelledAt = tNow;
  });

  ctx.events.on("injury:stim-completed", ({ entityId, stimKind, revived, health, now } = {}) => {
    if (!entityId || stimKind !== "turbo" || revived) return;
    const bot = entities.get(entityId);
    if (!bot?.alive || !bot.bot || !bot.humanSquad) return;
    const tNow = Number.isFinite(now) ? Number(now) : Date.now();
    ctx.events.emit("squad:callout", {
      kind: "squad-turbo-stim",
      text: `${bot.name ?? "Напарник"} вколол турбо-стимулятор: здоровье ${Math.round(Number(health) || 600)}.`,
      speakerId: bot.id,
      recipientId: bot.humanSquad,
      teamId: bot.team,
      now: tNow,
    });
  });

  function estimateTargetVelocity(entityId, targetTransform, now) {
    const vehicles = getVehicles();
    if (vehicles) {
      const v = vehicles.vehicleForDriver?.(entityId) ?? vehicles.vehicleForPassenger?.(entityId) ?? null;
      if (v) {
        const speed = Number(v.speed) || 0;
        const heading = Number(v.heading ?? v.angle ?? 0);
        return { vx: Math.sin(heading) * speed, vz: -Math.cos(heading) * speed };
      }
    }
    const prev = targetMotionSamples.get(entityId);
    const x = Number(targetTransform?.x) || 0;
    const z = Number(targetTransform?.z) || 0;
    let sampleVx = 0;
    let sampleVz = 0;
    if (prev && now > prev.at && now - prev.at <= 750) {
      const dt = (now - prev.at) / 1000;
      sampleVx = (x - prev.x) / dt;
      sampleVz = (z - prev.z) / dt;
    }
    targetMotionSamples.set(entityId, { x, z, at: now });
    const input = ctx.components.get(entityId, "Input");
    if (input) {
      const rawF = Number(input.forward) || 0;
      const rawS = Number(input.strafe) || 0;
      const mag = Math.hypot(rawF, rawS);
      if (mag > 0.05) {
        const scale = mag > 1 ? 1 / mag : 1;
        const speed = Number.isFinite(targetTransform?.movementSpeed)
          ? Math.max(0, targetTransform.movementSpeed)
          : (input.sprint ? 5.4 : 3.25);
        const angle = Number(targetTransform?.angle) || 0;
        return {
          vx: (Math.sin(angle) * rawF * scale + Math.cos(angle) * rawS * scale) * speed,
          vz: (-Math.cos(angle) * rawF * scale + Math.sin(angle) * rawS * scale) * speed,
        };
      }
    }
    const sampleSpeed = Math.hypot(sampleVx, sampleVz);
    if (sampleSpeed > 0.25 && sampleSpeed < 45) {
      return { vx: sampleVx, vz: sampleVz };
    }
    return { vx: 0, vz: 0 };
  }

  function predictedAimTarget(botTransform, visibleEnemy, weaponDef, now) {
    if (!visibleEnemy?.transform) return visibleEnemy?.transform ?? null;
    const targetTransform = visibleEnemy.transform;
    const muzzleVelocity = Number(weaponDef?.muzzleVelocity) || 0;
    const dist = Math.max(0, Number(visibleEnemy.distance) || distance3(botTransform, targetTransform));
    if (muzzleVelocity <= 0 || dist < 4) return targetTransform;
    const vel = estimateTargetVelocity(visibleEnemy.entityId, targetTransform, now);
    const speed = Math.hypot(vel.vx, vel.vz);
    if (speed < 0.3) return targetTransform;
    const leadSec = Math.min(0.32, (dist / muzzleVelocity) * 0.96);
    return {
      x: (Number(targetTransform.x) || 0) + vel.vx * leadSec,
      y: Number(targetTransform.y) || 0,
      z: (Number(targetTransform.z) || 0) + vel.vz * leadSec,
    };
  }

  function aimOptionsForWeapon(weaponId) {
    if (weaponId === "sniper") {
      return { maxRate: 1.0, deadzone: 0.008, gain: 2.1, alignThreshold: 0.095, allowPointTurn: true };
    }
    if (weaponId === "marksman") {
      return { maxRate: 1.0, deadzone: 0.01, gain: 2.0, alignThreshold: 0.145, allowPointTurn: true };
    }
    return { maxRate: 1.0, deadzone: 0.015, gain: 1.9, alignThreshold: 0.32, allowPointTurn: true };
  }

  function weaponStandoffRange(weaponId, fallbackRange = 8) {
    if (weaponId === "sniper") return Math.max(30, fallbackRange);
    if (weaponId === "marksman") return Math.max(20, fallbackRange);
    return fallbackRange;
  }

  function squadPartnerId(botId) {
    if (typeof perception.squadPartnerId === "function") {
      return perception.squadPartnerId(botId);
    }
    const match = /^br-bot-(\d+)$/.exec(String(botId ?? ""));
    if (!match) return null;
    const index = Number(match[1]);
    if (!Number.isFinite(index) || index < 1) return null;
    return `br-bot-${index % 2 === 1 ? index + 1 : index - 1}`;
  }

  function squadRoleFor(botId) {
    if (typeof perception.squadRoleFor === "function") {
      return perception.squadRoleFor(botId);
    }
    const match = /^br-bot-(\d+)$/.exec(String(botId ?? ""));
    if (!match) return "solo";
    return Number(match[1]) % 2 === 1 ? "breacher" : "flanker";
  }

  function squadTeammatesFor(botId, { includeHuman = true, includeDowned = false } = {}) {
    const selfEntity = entities.get(botId);
    if (!selfEntity?.alive) return [];
    const teams = getTeams();
    const injury = getInjury();
    const ownTeam = Number(teams?.teamOf(botId)) || 0;
    const results = [];
    for (const candidate of entities.all()) {
      if (!candidate?.alive || candidate.id === botId) continue;
      if (!includeHuman && !candidate.bot) continue;
      if (!includeDowned && injury?.isDowned(candidate.id)) continue;
      const sameTeam = ownTeam > 0 && (Number(teams?.teamOf(candidate.id)) || 0) === ownTeam;
      const sameSquad = Boolean(selfEntity.squadId && selfEntity.squadId === candidate.squadId);
      if (!sameTeam && !sameSquad) continue;
      if (typeof perception.areSquadmates === "function" && !perception.areSquadmates(botId, candidate.id)) {
        continue;
      }
      const cTransform = ctx.components.get(candidate.id, "Transform");
      const cParachute = ctx.components.get(candidate.id, "Parachute");
      if (!cTransform || cParachute?.airborne) continue;
      results.push({
        id: candidate.id,
        entity: candidate,
        transform: cTransform,
        state: ctx.components.get(candidate.id, "Bot") ?? null,
        role: candidate.bot ? squadRoleFor(candidate.id) : "leader",
      });
    }
    return results;
  }

  function activeSquadPartner(botId) {
    const selfEntity = entities.get(botId);
    const teams = getTeams();
    const injury = getInjury();
    const ownTeam = Number(teams?.teamOf(botId)) || 0;
    let partnerId = squadPartnerId(botId);
    if (partnerId) {
      const pEnt = entities.get(partnerId);
      const pTeam = Number(teams?.teamOf(partnerId)) || 0;
      if (!pEnt?.alive || !pEnt.bot || injury?.isDowned(partnerId) || (ownTeam > 0 && pTeam !== ownTeam)) {
        partnerId = null;
      }
    }
    if (!partnerId) {
      const selfTransform = ctx.components.get(botId, "Transform");
      const botMates = squadTeammatesFor(botId, { includeHuman: false, includeDowned: false });
      if (selfTransform && botMates.length > 1) {
        botMates.sort((a, b) => distance3(selfTransform, a.transform) - distance3(selfTransform, b.transform));
      }
      partnerId = botMates[0]?.id ?? null;
    }
    if (!partnerId && selfEntity?.squadId) {
      for (const candidate of entities.all()) {
        if (candidate?.id !== botId && candidate?.alive && candidate?.bot && candidate?.squadId === selfEntity.squadId) {
          partnerId = candidate.id;
          break;
        }
      }
    }
    if (!partnerId) return null;
    const partner = entities.get(partnerId);
    if (!partner?.alive || !partner.bot || injury?.isDowned(partnerId)) return null;
    if (typeof perception.areSquadmates === "function" && !perception.areSquadmates(botId, partnerId)) {
      return null;
    }
    let livingOutsideSquad = 0;
    for (const entry of entities.all()) {
      if (!entry?.alive) continue;
      if (entry.id !== botId && entry.id !== partnerId) {
        livingOutsideSquad += 1;
      }
    }
    if (livingOutsideSquad < 1) {
      return null;
    }
    const partnerTransform = ctx.components.get(partnerId, "Transform");
    const partnerState = ctx.components.get(partnerId, "Bot");
    const partnerParachute = ctx.components.get(partnerId, "Parachute");
    if (!partnerTransform || !partnerState || partnerParachute?.airborne) return null;
    return {
      id: partnerId,
      entity: partner,
      transform: partnerTransform,
      state: partnerState,
      role: squadRoleFor(partnerId),
    };
  }

  function shareTargetWithSquadmate(botId, enemyId, enemyTransform, now, ttl = BOT_VISIBLE_MEMORY_MS) {
    if (!enemyId || !enemyTransform) return false;
    const selfTransform = ctx.components.get(botId, "Transform");
    if (!selfTransform) return false;
    const mates = squadTeammatesFor(botId, { includeHuman: false, includeDowned: false });
    const fallbackPartner = activeSquadPartner(botId);
    if (fallbackPartner && !mates.some((m) => m.id === fallbackPartner.id)) {
      mates.push(fallbackPartner);
    }
    let shared = false;
    for (const partner of mates) {
      if (!partner?.state || partner.id === enemyId) continue;
      if (distance3(selfTransform, partner.transform) > 95) continue;
      const existingTargetId = partner.state.lastKnownTargetId;
      const existingValid = existingTargetId && Number(partner.state.lastKnownUntil) > now;
      if (!existingValid || existingTargetId === enemyId) {
        rememberTarget(partner.state, enemyId, enemyTransform, now, ttl);
        partner.state.squadCalloutFrom = botId;
        partner.state.squadCalloutAt = now;
        shared = true;
      }
    }
    return shared;
  }

  function shareOutnumberedCalloutWithSquad(botId, primaryEnemy, enemyCount, now) {
    if (!primaryEnemy?.transform || enemyCount < 2) return false;
    const selfTransform = ctx.components.get(botId, "Transform");
    const selfState = ctx.components.get(botId, "Bot");
    if (!selfTransform || !selfState) return false;
    const mates = squadTeammatesFor(botId, { includeHuman: false, includeDowned: false });
    const fallbackPartner = activeSquadPartner(botId);
    if (fallbackPartner && !mates.some((m) => m.id === fallbackPartner.id)) {
      mates.push(fallbackPartner);
    }
    const callout = {
      fromId: botId,
      targetEntityId: primaryEnemy.entityId,
      enemyCount,
      x: Number(primaryEnemy.transform.x) || 0,
      y: Number(primaryEnemy.transform.y) || 0,
      z: Number(primaryEnemy.transform.z) || 0,
      at: now,
      expiresAt: now + 9000,
    };
    selfState.outnumberedCallout = callout;
    let alerted = 0;
    for (const mate of mates) {
      if (!mate?.state || distance3(selfTransform, mate.transform) > 145) continue;
      rememberTarget(mate.state, primaryEnemy.entityId, primaryEnemy.transform, now, BOT_VISIBLE_MEMORY_MS);
      mate.state.outnumberedCallout = { ...callout };
      mate.state.squadCalloutFrom = botId;
      mate.state.squadCalloutAt = now;
      alerted += 1;
    }
    if (now >= (selfState.nextOutnumberedEmitAt ?? 0)) {
      selfState.nextOutnumberedEmitAt = now + 4000;
      ctx.events.emit("bot:squad-callout", {
        botId,
        kind: "outnumbered",
        enemyCount,
        targetEntityId: primaryEnemy.entityId,
        alertedCount: alerted,
        x: callout.x,
        y: callout.y,
        z: callout.z,
        now,
      });
    }
    return alerted > 0;
  }

  function buildingIdAt(position) {
    if (!position) return null;
    if (ctx.services.has("building-navigation")) {
      const loc = ctx.services.get("building-navigation").locationFor(position);
      if (loc?.building?.id) return String(loc.building.id);
    }
    const b = map?.building;
    if (
      b
      && Number(position.x) >= b.minX
      && Number(position.x) <= b.maxX
      && Number(position.z) >= b.minZ
      && Number(position.z) <= b.maxZ
    ) {
      return String(b.id ?? "warehouse");
    }
    for (const nb of map?.navigationBuildings ?? []) {
      const bounds = nb?.bounds ?? nb;
      if (
        bounds
        && Number(position.x) >= bounds.minX
        && Number(position.x) <= bounds.maxX
        && Number(position.z) >= bounds.minZ
        && Number(position.z) <= bounds.maxZ
      ) {
        return String(nb.id ?? bounds.id ?? "building");
      }
    }
    return null;
  }

  function buildingBoundsForId(buildingId) {
    if (!buildingId) return null;
    const primaryId = String(map?.building?.id ?? "warehouse");
    if (buildingId === primaryId && map?.building) {
      return { id: primaryId, ...map.building };
    }
    for (const nb of map?.navigationBuildings ?? []) {
      const id = String(nb?.id ?? nb?.bounds?.id ?? "");
      if (id === String(buildingId)) {
        const bounds = nb?.bounds ?? nb;
        return bounds ? { id, ...bounds } : null;
      }
    }
    return null;
  }

  function allKnownBuildings() {
    const list = [];
    const seen = new Set();
    if (map?.building) {
      const id = String(map.building.id ?? "warehouse");
      seen.add(id);
      list.push({ id, ...map.building });
    }
    for (const nb of map?.navigationBuildings ?? []) {
      const id = String(nb?.id ?? nb?.bounds?.id ?? "");
      const bounds = nb?.bounds ?? nb;
      if (!id || seen.has(id) || !bounds) continue;
      seen.add(id);
      list.push({ id, ...bounds });
    }
    return list;
  }

  function cratesInBuilding(buildingBounds, { onlyUnopened = true } = {}) {
    if (!buildingBounds || !Array.isArray(map?.crates)) return [];
    const margin = 4.5;
    return map.crates.filter((crate) => {
      if (!crate || (onlyUnopened && crate.opened)) return false;
      const x = Number(crate.x) || 0;
      const z = Number(crate.z) || 0;
      return (
        x >= buildingBounds.minX - margin
        && x <= buildingBounds.maxX + margin
        && z >= buildingBounds.minZ - margin
        && z <= buildingBounds.maxZ + margin
      );
    });
  }

  function tryOpenNearbyCrate(bot, transform, state, now) {
    if (!Array.isArray(map?.crates) || !map.crates.length) return false;
    const botEntity = entities.get(bot.id);
    if (botEntity?.humanSquad) {
      const human = entities.get(botEntity.humanSquad);
      const humanTransform = human?.alive ? ctx.components.get(human.id, "Transform") : null;
      if (humanTransform && !getInjury()?.isDowned(human.id) && distance3(transform, humanTransform) <= 3.6) {
        // Let the human player open the crate right in front of them if they are next to it.
        const humanNearCrate = map.crates.some(
          (c) => c && !c.opened && distance2(humanTransform, c) <= 2.5 && distance2(transform, c) <= 2.5,
        );
        if (humanNearCrate) return false;
      }
    }
    let bestCrate = null;
    let bestDist = Infinity;
    for (const crate of map.crates) {
      if (!crate || crate.opened) continue;
      const dy = Math.abs((Number(transform.y) || 0) - (Number(crate.y) || 0));
      if (dy > 1.65) continue;
      const d = distance2(transform, crate);
      if (d <= 2.45 && d < bestDist) {
        bestDist = d;
        bestCrate = crate;
      }
    }
    if (!bestCrate) return false;

    bestCrate.opened = true;
    const loot = bestCrate.loot ?? (String(bestCrate.id).includes("armor") ? "armor" : "rifle");
    ctx.events.emit("loot:opened", {
      crateId: bestCrate.id,
      entityId: bot.id,
      loot,
      x: Number(bestCrate.x) || 0,
      y: Number(bestCrate.y) || 0,
      z: Number(bestCrate.z) || 0,
      now,
    });
    ctx.events.emit("sound:spatial", {
      entityId: bot.id,
      key: "crate.open",
      x: Number(bestCrate.x) || 0,
      y: Number(bestCrate.y) || 0,
      z: Number(bestCrate.z) || 0,
      radius: 18,
    });
    if (loot === "juggernaut") {
      if (botEntity) botEntity.juggernaut = true;
      const hp = ctx.components.get(bot.id, "Health");
      if (hp) {
        hp.maximum = Math.max(Number(hp.maximum) || 200, 700);
        hp.current = 700;
        ctx.events.emit("health:changed", {
          entityId: bot.id,
          health: hp.current,
          maximum: hp.maximum,
        });
      }
      armorService?.grantJuggernautArmor?.(bot.id);
      getStimulants()?.grantJuggernautStims?.(bot.id);
      if (!weapons.grant(bot.id, "sniper")) weapons.restock?.(bot.id, "sniper", 20);
      if (!weapons.grant(bot.id, "marksman")) weapons.restock?.(bot.id, "marksman", 48);
      if (!weapons.grant(bot.id, "rifle")) weapons.restock?.(bot.id, "rifle", 90);
      ctx.events.emit("juggernaut:equipped", {
        entityId: bot.id,
        crateId: bestCrate.id,
        health: 700,
        armor: 600,
        x: Number(bestCrate.x) || 0,
        y: Number(bestCrate.y) || 0,
        z: Number(bestCrate.z) || 0,
      });
      ctx.events.emit("loot:picked", {
        crateId: bestCrate.id,
        entityId: bot.id,
        loot: "juggernaut",
        applied: true,
        quantity: 12,
      });
    } else if (loot === "airdrop") {
      armorService?.grantSatchel?.(bot.id);
      armorService?.grantPlates?.(bot.id, 8);
      if (!weapons.grant(bot.id, "sniper")) weapons.restock?.(bot.id, "sniper", 10);
      if (!weapons.grant(bot.id, "marksman")) weapons.restock?.(bot.id, "marksman", 24);
      if (!weapons.grant(bot.id, "rifle")) weapons.restock?.(bot.id, "rifle", 60);
      ctx.events.emit("loot:picked", {
        crateId: bestCrate.id,
        entityId: bot.id,
        loot: "airdrop",
        applied: true,
        quantity: 8,
      });
    } else if (loot === "armor") {
      const added = armorService?.grantPlates?.(bot.id, 3) ?? 0;
      ctx.events.emit("loot:picked", {
        crateId: bestCrate.id,
        entityId: bot.id,
        item: "armor-plates",
        quantity: added || 3,
      });
    } else {
      const targetWeaponId = loot === "marksman" || loot === "sniper" ? loot : "rifle";
      const restockQty = targetWeaponId === "sniper" ? 10 : targetWeaponId === "marksman" ? 24 : 60;
      const inv = ctx.components.get(bot.id, "Weapons");
      const alreadyHasWeapon = Boolean(inv?.items?.some((item) => item.id === targetWeaponId));
      if (!alreadyHasWeapon) {
        weapons.grant(bot.id, targetWeaponId);
        weapons.selectById?.(bot.id, targetWeaponId);
        ctx.events.emit("loot:picked", {
          crateId: bestCrate.id,
          entityId: bot.id,
          loot: targetWeaponId,
          weaponId: targetWeaponId,
        });
      } else {
        const added = weapons.restock?.(bot.id, targetWeaponId, restockQty) ?? 0;
        ctx.events.emit("loot:picked", {
          crateId: bestCrate.id,
          entityId: bot.id,
          loot: targetWeaponId,
          weaponId: targetWeaponId,
          restocked: added,
        });
      }
    }
    if (state) {
      state.lastLootedCrateId = bestCrate.id;
      state.lastLootedAt = now;
    }
    return true;
  }

  function squadBuildingLootInterest(botId, transform, state, now) {
    if (!Array.isArray(map?.crates) || !map.crates.length) return null;
    const partner = activeSquadPartner(botId);
    const role = squadRoleFor(botId);
    const zoneRadiusEarly = Math.max(18, Number(battleRoyale.zoneRadiusAt?.(now)) || 400);
    const zoneSafeEarly = Math.max(14, zoneRadiusEarly - Math.min(70, zoneRadiusEarly * 0.22));
    const specialCrates = (map.crates ?? []).filter((c) => (
      c
      && !c.opened
      && (c.loot === "electro-lukashenko" || c.juggernaut || c.loot === "juggernaut" || c.airdrop || c.loot === "airdrop")
      && Math.hypot(Number(c.x) || 0, Number(c.z) || 0) <= zoneSafeEarly
      && distance2(transform, c) <= (c.loot === "electro-lukashenko" ? 240 : (c.juggernaut || c.loot === "juggernaut" ? 195 : 165))
    ));
    if (specialCrates.length > 0) {
      specialCrates.sort((a, b) => {
        const aElectro = a.loot === "electro-lukashenko";
        const bElectro = b.loot === "electro-lukashenko";
        if (aElectro !== bElectro) return aElectro ? -1 : 1;
        const aJug = Boolean(a.juggernaut || a.loot === "juggernaut");
        const bJug = Boolean(b.juggernaut || b.loot === "juggernaut");
        if (aJug !== bJug) return aJug ? -1 : 1;
        return distance2(transform, a) - distance2(transform, b);
      });
      const chosenSpecial = specialCrates[0];
      return {
        kind: "squad-loot-interest",
        buildingId: null,
        crateId: chosenSpecial.id,
        priorityVisit: true,
        x: Number(chosenSpecial.x) || 0,
        y: 0,
        z: Number(chosenSpecial.z) || 0,
        expiresAt: now + 3500,
      };
    }

    // Active shop steering for rich enemy bots: sprint to shop to buy back dead squadmates, Electro-Lukashenko, or Mini-Nuke!
    const shopService = getShop();
    const botEntity = entities.get(botId);
    if (
      shopService
      && botEntity?.bot
      && !botEntity.humanSquad
      && (now - (Number(botEntity.lastShopVisitAt) || 0) >= 14_000)
    ) {
      const cash = Number(shopService.balanceOf?.(botId)) || 0;
      const desc = cash >= 1000 ? (shopService.describeFor?.(botId) ?? {}) : null;
      const buybackCost = Number(desc?.prices?.buyback) || 1500;
      const electroCost = Number(desc?.prices?.electroDrop) || 3000;
      const nukeCost = Number(desc?.prices?.miniNuke) || 2500;
      const hasDeadSquadmates = Boolean(desc?.deadTeammates?.length > 0);
      const wantsShopVisit = (hasDeadSquadmates && cash >= buybackCost)
        || (!botEntity.electroLukashenko && cash >= electroCost)
        || cash >= nukeCost;
      if (wantsShopVisit) {
        const safeShops = (shopService.stations?.() ?? []).filter((st) => {
          if (!st || Math.hypot(Number(st.x) || 0, Number(st.z) || 0) > zoneSafeEarly) return false;
          const dist = distance2(transform, st);
          return dist > 6.5 && dist <= (hasDeadSquadmates ? 230 : 175);
        });
        if (safeShops.length > 0) {
          safeShops.sort((a, b) => distance2(transform, a) - distance2(transform, b));
          const chosenShop = safeShops[0];
          return {
            kind: "squad-loot-interest",
            buildingId: null,
            shopId: chosenShop.id,
            priorityVisit: true,
            x: Number(chosenShop.x) || 0,
            y: 0,
            z: Number(chosenShop.z) || 0,
            expiresAt: now + 3500,
          };
        }
      }
    }

    let targetBuilding = null;

    const preferredId = state?.squadLootBuildingId ?? partner?.state?.squadLootBuildingId ?? null;
    if (preferredId) {
      const bounds = buildingBoundsForId(preferredId);
      if (bounds && cratesInBuilding(bounds, { onlyUnopened: true }).length > 0) {
        targetBuilding = bounds;
      }
    }

    if (!targetBuilding) {
      let bestScore = Infinity;
      for (const b of allKnownBuildings()) {
        const unopened = cratesInBuilding(b, { onlyUnopened: true });
        if (!unopened.length) continue;
        const center = {
          x: ((Number(b.minX) || 0) + (Number(b.maxX) || 0)) * 0.5,
          z: ((Number(b.minZ) || 0) + (Number(b.maxZ) || 0)) * 0.5,
        };
        const d = distance2(transform, center);
        if (d > 155) continue;
        const score = d - unopened.length * 6;
        if (score < bestScore) {
          bestScore = score;
          targetBuilding = b;
        }
      }
    }

    const zoneRadius = Math.max(18, Number(battleRoyale.zoneRadiusAt?.(now)) || 400);
    const zoneSafeLimit = Math.max(14, zoneRadius - Math.min(70, zoneRadius * 0.22));

    if (!targetBuilding) {
      if (state) state.squadLootBuildingId = null;
      const outdoorUnopened = (map.crates ?? []).filter((c) => (
        c
        && !c.opened
        && Math.hypot(Number(c.x) || 0, Number(c.z) || 0) <= zoneSafeLimit
        && distance2(transform, c) <= 115
      ));
      if (outdoorUnopened.length > 0) {
        outdoorUnopened.sort((a, b) => distance3(transform, a) - distance3(transform, b));
        const chosenOutdoor = role === "flanker" && outdoorUnopened.length > 1
          ? outdoorUnopened[1]
          : outdoorUnopened[0];
        return {
          kind: "squad-loot-interest",
          buildingId: null,
          crateId: chosenOutdoor.id,
          priorityVisit: distance2(transform, chosenOutdoor) <= 55,
          x: Number(chosenOutdoor.x) || 0,
          y: Number(chosenOutdoor.y) || 0,
          z: Number(chosenOutdoor.z) || 0,
          expiresAt: now + 2200,
        };
      }
      return null;
    }

    const unopened = cratesInBuilding(targetBuilding, { onlyUnopened: true });
    if (!unopened.length) {
      if (state) state.squadLootBuildingId = null;
      return null;
    }
    if (state) state.squadLootBuildingId = targetBuilding.id;
    if (partner?.state && distance3(transform, partner.transform) <= 95) {
      partner.state.squadLootBuildingId = targetBuilding.id;
    }

    unopened.sort((a, b) => distance3(transform, a) - distance3(transform, b));
    const chosenCrate = role === "flanker" && unopened.length > 1 ? unopened[1] : unopened[0];
    return {
      kind: "squad-loot-interest",
      buildingId: targetBuilding.id,
      crateId: chosenCrate.id,
      priorityVisit: distance2(transform, chosenCrate) <= 65,
      x: Number(chosenCrate.x) || 0,
      y: Number(chosenCrate.y) || 0,
      z: Number(chosenCrate.z) || 0,
      expiresAt: now + 2200,
    };
  }

  function tacticalFreeRoamInterest(botId, transform, state, now) {
    if (!transform || !state) return null;
    const botEntity = entities.get(botId);
    const partner = activeSquadPartner(botId);
    const role = squadRoleFor(botId);
    const halfSize = Math.max(40, Number(map?.halfSize) || 400);
    const margin = 14;
    const zoneRadius = Math.max(18, Number(battleRoyale.zoneRadiusAt?.(now)) || halfSize);
    const safeLimit = Math.max(
      10,
      Math.min(halfSize - margin, zoneRadius - Math.min(70, zoneRadius * 0.24)),
    );

    const clampToSafeZone = (pt) => {
      let x = Math.max(-halfSize + margin, Math.min(halfSize - margin, Number(pt.x) || 0));
      let z = Math.max(-halfSize + margin, Math.min(halfSize - margin, Number(pt.z) || 0));
      const r = Math.hypot(x, z);
      if (r > safeLimit && r > 0.01) {
        const s = (safeLimit * 0.88) / r;
        x *= s;
        z *= s;
      }
      return { x, y: Number(pt.y) || 0, z };
    };

    const currentWp = state.freeRoamWaypoint;
    const distToWp = currentWp ? distance2(transform, currentWp) : Infinity;
    const wpOutsideZone = currentWp && Math.hypot(Number(currentWp.x) || 0, Number(currentWp.z) || 0) > safeLimit + 2;

    if (!state.freeRoamLastPos || now - (state.freeRoamProgressAt ?? 0) >= 2400) {
      const moved = state.freeRoamLastPos ? distance2(transform, state.freeRoamLastPos) : Infinity;
      state.freeRoamLastPos = { x: Number(transform.x) || 0, z: Number(transform.z) || 0 };
      state.freeRoamProgressAt = now;
      if (moved < 0.85 && currentWp) {
        state.freeRoamStalled = true;
      }
    }

    const needNextWaypoint = !currentWp
      || distToWp <= 3.5
      || wpOutsideZone
      || Boolean(state.freeRoamStalled)
      || now >= (state.freeRoamUntil ?? 0);

    if (needNextWaypoint) {
      state.freeRoamStalled = false;
      const baseStep = Math.max(
        Number(state.patrolStep) || 0,
        partner?.state && distance3(transform, partner.transform) <= 40
          ? (Number(partner.state.patrolStep) || 0)
          : 0,
      ) + 1;
      state.patrolStep = baseStep;
      if (partner?.state && distance3(transform, partner.transform) <= 40) {
        partner.state.patrolStep = baseStep;
      }

      const squadSeed = stableSeed(`${botEntity?.team || botId}:squad-roam`);
      const routeProfile = squadSeed % 4;
      const directionSign = squadSeed % 2 === 0 ? 1 : -1;
      const currentHeading = Number(transform.angle) || 0;
      const isForwardBiased = (pt) => {
        const dx = (Number(pt.x) || 0) - (Number(transform.x) || 0);
        const dz = (Number(pt.z) || 0) - (Number(transform.z) || 0);
        if (Math.hypot(dx, dz) < 1) return true;
        return Math.abs(wrapAngle(Math.atan2(dx, -dz) - currentHeading)) <= 1.45;
      };
      let chosen = null;
      let activity = "zone-patrol";

      // Distribute enemy squads across 4 distinct route profiles across the whole map:
      // Profile 0: building-recon (visits warehouse, two-storey-house, loot-house, forest-hut)
      // Profile 1: landmark-perimeter (patrols 35-70m outside buildings and shops)
      // Profile 2: wide-map-expedition (patrols wide outer/mid sectors across the whole map, 55-88% of safeLimit)
      // Profile 3: tactical-sweep (sweeps mid-sectors; if within 80m of a grounded player, checks a 30-58m perimeter around that sector)
      if (!tutorial?.botsPassive?.() && routeProfile === 3) {
        const humanTarget = entities.all().find((e) => (
          e.alive && !e.bot && e.kind === "human" && !ctx.components.get(e.id, "Parachute")?.airborne
        ));
        const humanTransform = humanTarget ? ctx.components.get(humanTarget.id, "Transform") : null;
        if (humanTransform) {
          const distToHuman = distance3(transform, humanTransform);
          const humanDistFromCenter = Math.hypot(Number(humanTransform.x) || 0, Number(humanTransform.z) || 0);
          if (distToHuman <= 80 && humanDistFromCenter <= safeLimit + 18) {
            let fallbackSector = null;
            for (let sAttempt = 0; sAttempt < 4; sAttempt += 1) {
              const sectorAngle = (((squadSeed % 360) + directionSign * (baseStep + sAttempt) * 52) * Math.PI) / 180;
              const ringRadius = Math.min(safeLimit * 0.85, 28 + ((baseStep + sAttempt) % 3) * 14);
              const raw = clampToSafeZone({
                x: (Number(humanTransform.x) || 0) + Math.cos(sectorAngle) * ringRadius,
                y: 0,
                z: (Number(humanTransform.z) || 0) + Math.sin(sectorAngle) * ringRadius,
              });
              if (buildingIdAt(raw)) continue;
              if (!fallbackSector) fallbackSector = raw;
              if (isForwardBiased(raw)) {
                chosen = raw;
                activity = "sector-sweep";
                break;
              }
            }
            if (!chosen && fallbackSector) {
              chosen = fallbackSector;
              activity = "sector-sweep";
            }
          }
        }
      }

      // Profile 0 (or periodic building check): visit buildings across the map
      if (!chosen && (routeProfile === 0 || baseStep % 6 === 0)) {
        const buildingsInZone = allKnownBuildings().filter((b) => {
          const cx = ((Number(b.minX) || 0) + (Number(b.maxX) || 0)) * 0.5;
          const cz = ((Number(b.minZ) || 0) + (Number(b.maxZ) || 0)) * 0.5;
          return Math.hypot(cx, cz) <= safeLimit * 0.92;
        });
        if (buildingsInZone.length > 0) {
          const targetB = buildingsInZone[(squadSeed + baseStep) % buildingsInZone.length];
          const cx = ((Number(targetB.minX) || 0) + (Number(targetB.maxX) || 0)) * 0.5;
          const cz = ((Number(targetB.minZ) || 0) + (Number(targetB.maxZ) || 0)) * 0.5;
          chosen = {
            x: cx + (role === "flanker" ? 2.4 : -2.4),
            y: 0,
            z: cz,
          };
          activity = "building-recon";
        }
      }

      // Profile 1: patrol near landmarks/buildings (35-72m outside buildings across the map)
      if (!chosen && routeProfile === 1) {
        const buildingsInZone = allKnownBuildings().filter((b) => {
          const cx = ((Number(b.minX) || 0) + (Number(b.maxX) || 0)) * 0.5;
          const cz = ((Number(b.minZ) || 0) + (Number(b.maxZ) || 0)) * 0.5;
          return Math.hypot(cx, cz) <= safeLimit * 0.92;
        });
        if (buildingsInZone.length > 0) {
          const targetB = buildingsInZone[(squadSeed + baseStep * 2) % buildingsInZone.length];
          const cx = ((Number(targetB.minX) || 0) + (Number(targetB.maxX) || 0)) * 0.5;
          const cz = ((Number(targetB.minZ) || 0) + (Number(targetB.maxZ) || 0)) * 0.5;
          const perimAngle = (((squadSeed % 360) + directionSign * baseStep * 68) * Math.PI) / 180;
          const perimDist = 38 + ((squadSeed + baseStep * 11) % 32);
          const candidate = clampToSafeZone({
            x: cx + Math.cos(perimAngle) * perimDist,
            y: 0,
            z: cz + Math.sin(perimAngle) * perimDist,
          });
          if (!buildingIdAt(candidate)) {
            chosen = candidate;
            activity = "landmark-perimeter";
          }
        }
      }

      // Profile 2 & general multi-sector patrol across the whole map (inner, mid, and wide outer rings)
      if (!chosen) {
        let bestPatrolFallback = null;
        for (let attempt = 0; attempt < 10; attempt += 1) {
          const sectorAngle = (
            (((squadSeed % 360) + directionSign * (baseStep * 52 + attempt * 38)) * Math.PI) / 180
          );
          const bandFrac = routeProfile === 2
            ? (0.56 + (((squadSeed + baseStep + attempt) % 4) * 0.1))
            : (0.28 + (((squadSeed + baseStep + attempt) % 5) * 0.14));
          const patrolR = Math.max(8, Math.min(safeLimit * 0.88, safeLimit * bandFrac));
          const lateral = role === "flanker" ? 3.2 : -1.6;
          const candidate = clampToSafeZone({
            x: Math.cos(sectorAngle) * patrolR - Math.sin(sectorAngle) * lateral,
            y: 0,
            z: Math.sin(sectorAngle) * patrolR + Math.cos(sectorAngle) * lateral,
          });
          if (!buildingIdAt(transform) && buildingIdAt(candidate)) continue;
          if (distance2(transform, candidate) < Math.min(12, safeLimit * 0.35)) continue;
          if (!bestPatrolFallback) bestPatrolFallback = candidate;
          if (isForwardBiased(candidate)) {
            chosen = candidate;
            activity = routeProfile === 2 ? "wide-map-patrol" : "zone-patrol";
            break;
          }
        }
        if (!chosen && bestPatrolFallback) {
          chosen = bestPatrolFallback;
          activity = routeProfile === 2 ? "wide-map-patrol" : "zone-patrol";
        }
      }

      if (!chosen) {
        const fallbackAngle = (((squadSeed + baseStep * 95) % 360) * Math.PI) / 180;
        const fallbackR = Math.max(6, safeLimit * 0.55);
        chosen = clampToSafeZone({
          x: Math.cos(fallbackAngle) * fallbackR,
          y: 0,
          z: Math.sin(fallbackAngle) * fallbackR,
        });
      }

      state.freeRoamWaypoint = chosen;
      state.freeRoamActivity = activity;
      state.freeRoamUntil = now + 8500;
      state.squadRoleActive = activity;
    }

    const wp = state.freeRoamWaypoint;
    if (!wp) return null;
    return {
      kind: "free-roam-interest",
      patrolActivity: state.freeRoamActivity ?? "zone-patrol",
      continuousPatrol: true,
      patrolSprint: distance2(transform, wp) > 20,
      x: Number(wp.x) || 0,
      y: Number(wp.y) || 0,
      z: Number(wp.z) || 0,
      expiresAt: state.freeRoamUntil ?? (now + 4000),
    };
  }

  function buildingAmbushBehavior(bot, transform, state, standingEnemies, baseInterest, distantContact, memory, now) {
    if (standingEnemies.length > 0) return false;
    const currentBuildingId = buildingIdAt(transform);
    if (!currentBuildingId) {
      if (state.squadRoleActive === "ambush") state.squadRoleActive = null;
      state.ambushReady = false;
      return false;
    }
    const buildingBounds = buildingBoundsForId(currentBuildingId);
    if (!buildingBounds) return false;

    const teams = getTeams();
    const injury = getInjury();
    const ownTeam = Number(teams?.teamOf(bot.id)) || 0;
    let approachingPos = null;
    for (const candidate of entities.all()) {
      if (!candidate?.alive || candidate.id === bot.id) continue;
      if (ownTeam > 0 && (Number(teams?.teamOf(candidate.id)) || 0) === ownTeam) continue;
      if (injury?.isDowned(candidate.id)) continue;
      const cTransform = ctx.components.get(candidate.id, "Transform");
      if (!cTransform) continue;
      if (buildingIdAt(cTransform) === currentBuildingId) continue;
      const d = distance3(transform, cTransform);
      if (d <= 34) {
        approachingPos = cTransform;
        break;
      }
    }
    if (!approachingPos) {
      const signal = memory?.transform
        ?? distantContact
        ?? (baseInterest?.kind === "sound-interest" ? baseInterest : null);
      if (signal && buildingIdAt(signal) !== currentBuildingId && distance3(transform, signal) <= 36) {
        approachingPos = signal;
      }
    }
    if (!approachingPos) {
      if (state.squadRoleActive === "ambush" && now >= (state.ambushUntil ?? 0)) {
        state.squadRoleActive = null;
        state.ambushReady = false;
      }
      return false;
    }

    const buildingDoors = (map.doors ?? []).filter((door) => {
      if (!door) return false;
      return (
        door.x >= buildingBounds.minX - 2.5
        && door.x <= buildingBounds.maxX + 2.5
        && door.z >= buildingBounds.minZ - 2.5
        && door.z <= buildingBounds.maxZ + 2.5
        && Math.abs((Number(door.y) || 0) - (Number(transform.y) || 0)) <= 1.6
      );
    });
    const entrance = buildingDoors.sort((a, b) => distance2(approachingPos, a) - distance2(approachingPos, b))[0]
      ?? {
        id: `${currentBuildingId}:entrance`,
        x: ((Number(buildingBounds.minX) || 0) + (Number(buildingBounds.maxX) || 0)) * 0.5,
        y: Number(transform.y) || 0,
        z: Number(buildingBounds.maxZ) || 0,
      };
    const center = {
      x: ((Number(buildingBounds.minX) || 0) + (Number(buildingBounds.maxX) || 0)) * 0.5,
      z: ((Number(buildingBounds.minZ) || 0) + (Number(buildingBounds.maxZ) || 0)) * 0.5,
    };
    const inX = (center.x - entrance.x);
    const inZ = (center.z - entrance.z);
    const inLen = Math.max(0.01, Math.hypot(inX, inZ));
    const ux = inX / inLen;
    const uz = inZ / inLen;
    const sideSign = squadRoleFor(bot.id) === "flanker" ? -1 : 1;
    const rightX = -uz * sideSign;
    const rightZ = ux * sideSign;
    const ambushPoint = {
      x: Number(entrance.x) + ux * 2.1 + rightX * 1.85,
      y: Number(transform.y) || 0,
      z: Number(entrance.z) + uz * 2.1 + rightZ * 1.85,
    };

    state.squadRoleActive = "ambush";
    state.ambushDoorId = entrance.id ?? null;
    state.ambushUntil = now + 4500;
    const distToCorner = distance2(transform, ambushPoint);
    if (distToCorner > 1.15) {
      state.ambushReady = false;
      return moveTowardPosition(bot, transform, state, ambushPoint, now, {
        sprint: false,
        thinkDelay: 100,
        stopDistance: 0.9,
      });
    }
    state.ambushReady = true;
    const steering = steeringTo(transform, entrance, 95);
    movement.setInput(bot.id, {
      forward: 0,
      strafe: 0,
      turn: steering.turn,
      targetAngle: steering.targetAngle,
      sprint: false,
      fireHeld: false,
    });
    state.nextThinkAt = now + 95;
    return true;
  }

  function buildingLocationAt(position) {
    if (!position) return { buildingId: null, regionId: null };
    if (ctx.services.has("building-navigation")) {
      const loc = ctx.services.get("building-navigation").locationFor(position);
      if (loc?.building?.id) {
        return {
          buildingId: String(loc.building.id),
          regionId: loc.region?.id ? String(loc.region.id) : null,
        };
      }
    }
    return { buildingId: buildingIdAt(position), regionId: null };
  }

  function squadRallyInterest(botId, transform, now) {
    const botEntity = entities.get(botId);
    const selfState = ctx.components.get(botId, "Bot");
    const allMates = squadTeammatesFor(botId, { includeHuman: true, includeDowned: false });
    const activeCallout = (selfState?.outnumberedCallout?.expiresAt > now ? selfState.outnumberedCallout : null)
      ?? allMates.map((m) => m.state?.outnumberedCallout).find((c) => c && c.expiresAt > now)
      ?? null;
    if (activeCallout && activeCallout.fromId !== botId) {
      const d = distance3(transform, activeCallout);
      if (d > 5.5 && d <= 145) {
        return {
          kind: "squad-rally-interest",
          partnerId: activeCallout.fromId,
          partnerGoal: "outnumbered-converge",
          priorityVisit: true,
          x: Number(activeCallout.x) || 0,
          y: Number(activeCallout.y) || 0,
          z: Number(activeCallout.z) || 0,
          expiresAt: now + 1800,
        };
      }
    }
    const humanMate = allMates.find((m) => !m.entity.bot);
    if (humanMate) {
      const distToHuman = distance3(transform, humanMate.transform);
      const selfLoc = buildingLocationAt(transform);
      const humanLoc = buildingLocationAt(humanMate.transform);
      const selfBuilding = selfLoc.buildingId;
      const humanBuilding = humanLoc.buildingId;
      const midStairClimb = (Number(transform.y) || 0) > 0.15 && (Number(transform.y) || 0) < 3.05;
      const differentFloor = Math.abs((Number(transform.y) || 0) - (Number(humanMate.transform.y) || 0)) > 1.1
        || midStairClimb;
      const onStair = Boolean(selfLoc.regionId && (selfLoc.regionId === "stair" || selfLoc.regionId.startsWith("stair:")));
      const separatedByStructure = selfBuilding !== humanBuilding
        || differentFloor
        || (onStair && selfLoc.regionId !== humanLoc.regionId);
      const hx = Number(humanMate.transform.x) || 0;
      const hz = Number(humanMate.transform.z) || 0;
      if (selfState) {
        if (!selfState.escortLeaderAnchor) {
          selfState.escortLeaderAnchor = {
            x: hx,
            z: hz,
            angle: Number(humanMate.transform.angle) || 0,
          };
        } else {
          const movedDx = hx - selfState.escortLeaderAnchor.x;
          const movedDz = hz - selfState.escortLeaderAnchor.z;
          if (Math.hypot(movedDx, movedDz) >= 0.9) {
            selfState.escortLeaderAnchor = {
              x: hx,
              z: hz,
              angle: Math.atan2(movedDx, -movedDz),
            };
          }
        }
      }
      const engageEscort = separatedByStructure
        || distToHuman >= 4.2
        || (Boolean(selfState?.escortMoving) && distToHuman > 2.75);
      if (selfState) selfState.escortMoving = engageEscort;
      if (engageEscort) {
        const slot = Number(botEntity?.squadSlot) || 0;
        const underFire = Boolean(selfState?.lastDamagedAt && now - selfState.lastDamagedAt <= 3500);
        const escortNode = nodeGrid.selectSquadmateEscortNode(
          botId,
          transform,
          humanMate.id,
          humanMate.transform,
          { squadSlot: slot + 1, underFire, now },
        );
        if (selfState && escortNode) {
          selfState.escortNodeId = escortNode.id;
          selfState.escortWingmanRole = escortNode.wingmanRole;
        }
        const baseAngle = selfState?.escortLeaderAnchor?.angle ?? (Number(humanMate.transform.angle) || 0);
        const formAngle = baseAngle + (slot === 0 ? -0.95 : slot === 1 ? 0.95 : Math.PI);
        const radius = separatedByStructure ? 2.0 : 2.65;
        const candidate = {
          x: hx + Math.sin(formAngle) * radius,
          y: Number(humanMate.transform.y) || 0,
          z: hz - Math.cos(formAngle) * radius,
        };
        const candidateBuilding = buildingIdAt(candidate);
        const safePoint = candidateBuilding === humanBuilding
          ? candidate
          : {
            x: hx,
            y: Number(humanMate.transform.y) || 0,
            z: hz,
          };
        return {
          kind: "squad-rally-interest",
          partnerId: humanMate.id,
          partnerGoal: "escort-human",
          separatedByStructure,
          patrolSprint: !separatedByStructure && distToHuman >= 4.4,
          distToHuman,
          escortNodeId: escortNode?.id ?? null,
          x: safePoint.x,
          y: safePoint.y,
          z: safePoint.z,
          expiresAt: now + 1800,
        };
      }
      return null;
    }
    const partner = activeSquadPartner(botId);
    if (partner) {
      const dist = distance3(transform, partner.transform);
      const partnerDecision = brain.commitmentFor?.(partner.id, now) ?? null;
      const partnerInCombat = ["engage", "defend", "hunt"].includes(partnerDecision?.goal);
      const role = squadRoleFor(botId);
      if (partnerInCombat && dist >= 5 && dist <= 120) {
        if (selfState) selfState.squadRallyPartnerActive = false;
        const lateralOffset = role === "flanker" ? 3.2 : -3.2;
        const targetPos = partnerDecision?.target?.transform
          ?? (partnerDecision?.target?.x !== undefined ? partnerDecision.target : partner.transform);
        const dirX = (Number(targetPos.x) || 0) - (Number(partner.transform.x) || 0);
        const dirZ = (Number(targetPos.z) || 0) - (Number(partner.transform.z) || 0);
        const dirLen = Math.hypot(dirX, dirZ);
        const rightX = dirLen > 0.25 ? -dirZ / dirLen : 1;
        const rightZ = dirLen > 0.25 ? dirX / dirLen : 0;
        const candidate = {
          x: (Number(targetPos.x) || 0) + rightX * lateralOffset,
          y: Number(targetPos.y) || 0,
          z: (Number(targetPos.z) || 0) + rightZ * lateralOffset,
        };
        const safePoint = typeof map.insideAnyBuilding === "function"
          && map.insideAnyBuilding(candidate) !== map.insideAnyBuilding(targetPos)
          ? { x: Number(targetPos.x) || 0, y: Number(targetPos.y) || 0, z: Number(targetPos.z) || 0 }
          : candidate;
        return {
          kind: "squad-rally-interest",
          partnerId: partner.id,
          partnerGoal: partnerDecision?.goal ?? "engage",
          x: safePoint.x,
          y: safePoint.y,
          z: safePoint.z,
          expiresAt: now + 1800,
        };
      }
      if (role === "flanker") {
        // Hysteresis prevents 180-degree oscillation at a single distance threshold:
        // engage rally when separated >= 16m, release only once within 7m (or >125m).
        const wasActive = Boolean(selfState?.squadRallyPartnerActive);
        if (dist <= 7.0 || dist > 125) {
          if (selfState) selfState.squadRallyPartnerActive = false;
        } else if (wasActive || dist >= 16) {
          if (selfState) selfState.squadRallyPartnerActive = true;
          const safeLen = Math.max(0.01, dist);
          const ux = (Number(transform.x) - Number(partner.transform.x)) / safeLen;
          const uz = (Number(transform.z) - Number(partner.transform.z)) / safeLen;
          const candidate = {
            x: (Number(partner.transform.x) || 0) + ux * 4.2 - uz * 2.4,
            y: Number(partner.transform.y) || 0,
            z: (Number(partner.transform.z) || 0) + uz * 4.2 + ux * 2.4,
          };
          const partnerBuilding = buildingIdAt(partner.transform);
          const safePoint = buildingIdAt(candidate) === partnerBuilding
            ? candidate
            : {
              x: Number(partner.transform.x) || 0,
              y: Number(partner.transform.y) || 0,
              z: Number(partner.transform.z) || 0,
            };
          return {
            kind: "squad-rally-interest",
            partnerId: partner.id,
            partnerGoal: partnerDecision?.goal ?? "roam",
            x: safePoint.x,
            y: safePoint.y,
            z: safePoint.z,
            expiresAt: now + 1800,
          };
        }
      } else if (selfState) {
        selfState.squadRallyPartnerActive = false;
      }
    } else if (selfState) {
      selfState.squadRallyPartnerActive = false;
    }
    return null;
  }

  function worldToLocalMove(angle, dx, dz) {
    const length = Math.hypot(dx, dz);
    if (length < 0.001) return { forward: 0, strafe: 0 };
    const ux = dx / length;
    const uz = dz / length;
    return {
      forward: Math.sin(angle) * ux - Math.cos(angle) * uz,
      strafe: Math.cos(angle) * ux + Math.sin(angle) * uz,
    };
  }

  function fireInBurst(botId, state, allowed, now, { fireChoice = null } = {}) {
    if (!allowed || fireChoice === "hold_fire") return false;
    const inventory = ctx.components.get(botId, "Weapons");
    const selected = inventory?.items?.[inventory.selected];
    const weaponDef = weapons.definitions?.[selected?.id] ?? null;
    if (fireChoice === "single_tap") {
      if (now >= (state.nextShotAt ?? 0)) {
        const variation = stableSeed(botId + ":" + state.burstCycle + ":" + (selected?.id ?? "single"));
        if (weapons.fire(botId, now, { pressed: true })) {
          state.nextShotAt = now + (selected?.id === "sniper"
            ? 1140 + (variation % 160)
            : selected?.id === "marksman"
              ? 300 + (variation % 65)
              : 280 + (variation % 70));
        }
      }
      return false;
    }
    if (weaponDef?.automatic) return true;
    if (now >= (state.nextShotAt ?? 0)) {
      const variation = stableSeed(botId + ":" + state.burstCycle + ":" + (selected?.id ?? "semi"));
      const fired = weapons.fire(botId, now, { pressed: true });
      if (fired) {
        if (selected?.id === "sniper") {
          state.nextShotAt = now + 1140 + (variation % 160);
        } else if (selected?.id === "marksman") {
          state.nextShotAt = now + 260 + (variation % 65);
        } else {
          state.nextShotAt = now + 85 + (variation % 55);
        }
      }
    }
    // Non-automatic weapons fire discrete semi-auto / bolt-action shots.
    return false;
  }

  ctx.events.on("combat:damage", ({ targetId, attackerId, now = Date.now() }) => {
    if (!targetId || !attackerId) return;
    const target = entities.get(targetId);
    const attacker = entities.get(attackerId);
    if (!target?.alive || !attacker?.alive) return;
    const teams = getTeams();
    const targetTeam = Number(teams?.teamOf(targetId)) || 0;
    const attackerTeam = Number(teams?.teamOf(attackerId)) || 0;
    if (targetTeam > 0 && targetTeam === attackerTeam) return;
    const attackerTransform = ctx.components.get(attackerId, "Transform");
    if (!target.bot && targetTeam > 0 && attackerTransform) {
      for (const mate of squadTeammatesFor(targetId, { includeHuman: false, includeDowned: false })) {
        if (!mate.state) continue;
        rememberTarget(mate.state, attackerId, attackerTransform, now, BOT_DAMAGE_MEMORY_MS);
        mate.state.squadCalloutFrom = targetId;
        mate.state.squadCalloutAt = now;
      }
      return;
    }
    if (!target.bot) return;
    const partner = activeSquadPartner(targetId);
    if (partner && partner.id === attackerId) return;
    const state = ctx.components.get(targetId, "Bot");
    rememberTarget(state, attackerId, attackerTransform, now, BOT_DAMAGE_MEMORY_MS);
    shareTargetWithSquadmate(targetId, attackerId, attackerTransform, now, BOT_DAMAGE_MEMORY_MS);
    if (!state) return;
    state.lastDamagedById = attackerId;
    state.lastDamagedAt = now;
    if (attackerTransform) {
      state.combatFocus = {
        entityId: attackerId,
        x: Number(attackerTransform.x) || 0,
        y: Number(attackerTransform.y) || 0,
        z: Number(attackerTransform.z) || 0,
        until: now + 900,
      };
    }
    if (now >= (state.lastDamageJukeAt ?? 0) + 900) {
      state.strafeDirection = -(state.strafeDirection || 1);
      state.lastDamageJukeAt = now;
    }
    if (state.reactionTargetId !== attackerId) {
      state.reactionTargetId = attackerId;
      state.reactionUntil = now + BOT_RETURN_FIRE_REACTION_MS;
      state.burstUntil = 0;
      state.nextBurstAt = 0;
      state.burstCycle = 0;
    } else if (now < (state.reactionUntil ?? 0)) {
      state.reactionUntil = Math.min(state.reactionUntil, now + BOT_RETURN_FIRE_REACTION_MS);
    }
  });

  function openRouteDoor(botId, transform, waypoint, now) {
    if (!waypoint?.doorId || typeof map.setDoorOpen !== "function") return;
    const door = map.doors?.find((entry) => entry.id === waypoint.doorId);
    if (!door || door.open || distance3(transform, door) > 2.6) return;
    map.setDoorOpen(door.id, true, botId, now);
  }

  function setNavigatedInput(bot, transform, state, input, now) {
    movement.setInput(bot.id, navigation.avoid(bot.id, transform, state, input, now));
  }

  function setRouteInput(bot, transform, state, route, input, now) {
    const insideDoorThroat = route?.kind === "door" && distance2(transform, route) <= 2.2;
    if (route?.kind === "stair" || insideDoorThroat) {
      movement.setInput(bot.id, {
        ...input,
        strafe: clamp(input.strafe ?? 0, -0.6, 0.6),
        sprint: route.kind === "door" ? Boolean(input.sprint) : false,
      });
      return;
    }
    setNavigatedInput(bot, transform, state, input, now);
  }

  function worldDeltaToLocalMove(angle, dx, dz) {
    const len = Math.hypot(dx, dz);
    if (len < 0.001) return { forward: 0, strafe: 0 };
    const ux = dx / len;
    const uz = dz / len;
    return {
      forward: Math.sin(angle) * ux - Math.cos(angle) * uz,
      strafe: Math.cos(angle) * ux + Math.sin(angle) * uz,
    };
  }

  /**
   * Unified human-like locomotion controller:
   * - Turns smoothly ON THE MOVE like a real player (WASD + mouse), never freezing legs just to rotate camera in place.
   * - On stairs and through doors, walks steadily forward while gently centering laterally via strafe — zero "step back-and-forth" stalling!
   */
  function routeToward(bot, transform, state, route, now, thinkDelay = 85) {
    if (!route) return false;
    openRouteDoor(bot.id, transform, route, now);
    const upperY = Math.max(1, Number(map.building?.upperY) || 3.2);
    const onStair = route.kind === "stair";
    const midStair = onStair
      && Number(transform.y) > 0.15
      && Number(transform.y) < upperY - 0.15;

    let targetPoint = route;
    if (midStair && route.transitionSide !== "approach") {
      // Once physically on the stair ramp, travel cleanly along the ramp axis without zig-zagging
      const dx = Math.abs((Number(route.x) || 0) - (Number(transform.x) || 0));
      const dz = Math.abs((Number(route.z) || 0) - (Number(transform.z) || 0));
      if (dx > dz * 1.5 && dx > 0.45 && dz <= 0.6) {
        targetPoint = { ...route, z: Number(transform.z) || 0 };
      } else if (dz > dx * 1.5 && dz > 0.45 && dx <= 0.6) {
        targetPoint = { ...route, x: Number(transform.x) || 0 };
      }
    }

    const responsiveDelay = onStair || route.kind === "door" ? Math.min(thinkDelay, 65) : Math.min(thinkDelay, 110);
    const steering = steeringTo(
      transform,
      targetPoint,
      responsiveDelay,
      onStair || route.kind === "door"
        ? { maxRate: 0.88, deadzone: 0.02, gain: 1.65, allowPointTurn: true }
        : { maxRate: 0.72, deadzone: 0.03, gain: 1.45 },
    );

    const dx = (Number(targetPoint.x) || 0) - (Number(transform.x) || 0);
    const dz = (Number(targetPoint.z) || 0) - (Number(transform.z) || 0);
    const local = worldDeltaToLocalMove(Number(transform.angle) || 0, dx, dz);
    const headingError = Math.abs(steering.delta);

    let forward;
    let strafe;
    if (onStair) {
      // Never freeze on stairs! Walk continuously toward the stair target using forward + gentle lateral alignment.
      const speedScale = midStair ? 0.86 : 0.76;
      forward = clamp(local.forward * speedScale, -0.35, 0.9);
      strafe = clamp(local.strafe * 0.65, -0.55, 0.55);
      if (Math.hypot(forward, strafe) < 0.35 && steering.distance > 0.25) {
        forward = 0.55;
      }
    } else if (route.kind === "door") {
      // Walk smoothly through doorways while turning on the move
      forward = headingError > 1.25 ? clamp(local.forward * 0.65, -0.2, 0.55) : (headingError > 0.55 ? 0.68 : 0.95);
      strafe = headingError > 0.22 ? clamp(local.strafe * 0.55, -0.45, 0.45) : 0;
    } else {
      forward = headingError > 1.35 ? 0.32 : (headingError > 0.65 ? 0.65 : 1);
      strafe = headingError > 0.45 ? clamp(local.strafe * 0.4, -0.35, 0.35) : 0;
    }

    setRouteInput(bot, transform, state, targetPoint, {
      forward,
      strafe,
      turn: steering.turn,
      targetAngle: steering.targetAngle,
      sprint: !onStair && forward >= 0.82 && headingError < 0.35 && steering.distance > 14,
      fireHeld: false,
    }, now);
    state.nextThinkAt = now + responsiveDelay;
    return true;
  }

  function moveTowardPosition(bot, transform, state, target, now, {
    sprint = false,
    thinkDelay = 115,
    stopDistance = 1.5,
    sprintDistance = 5,
    faceTargetOnArrival = false,
    calm = true,
  } = {}) {
    if (!target) return false;
    const upperY = Math.max(1, Number(map.building?.upperY) || 3.2);
    let route = typeof map.navigationWaypoint === "function"
      ? map.navigationWaypoint(transform, target)
      : null;
    route = normalizeRouteForTarget(transform, target, route, upperY);
    if (routeToward(bot, transform, state, route, now, thinkDelay)) return true;

    const responsiveDelay = Math.min(thinkDelay, 125);
    const steering = steeringTo(
      transform,
      target,
      responsiveDelay,
      calm
        ? { maxRate: 0.72, deadzone: 0.03, gain: 1.45, allowPointTurn: faceTargetOnArrival }
        : { maxRate: 0.92, deadzone: 0.02, gain: 1.7, allowPointTurn: faceTargetOnArrival },
    );
    const arrived = steering.distance <= stopDistance;
    const headingError = Math.abs(steering.delta);
    const dx = (Number(target.x) || 0) - (Number(transform.x) || 0);
    const dz = (Number(target.z) || 0) - (Number(transform.z) || 0);
    const local = worldDeltaToLocalMove(Number(transform.angle) || 0, dx, dz);

    // Human-like locomotion: keep moving and smoothly curve into turns instead of freezing like a turret
    let forward = 0;
    let strafe = 0;
    if (!arrived) {
      if (headingError <= 0.45) {
        forward = 1;
        strafe = 0;
      } else if (headingError <= 1.25) {
        forward = 0.74;
        strafe = clamp(local.strafe * 0.45, -0.4, 0.4);
      } else {
        // Curve smoothly forward into sharp turns rather than shuffling backward
        forward = clamp(local.forward * 0.55, 0.08, 0.5);
        strafe = clamp(local.strafe * 0.58, -0.52, 0.52);
      }
    }

    setNavigatedInput(bot, transform, state, {
      forward,
      strafe,
      turn: arrived && !faceTargetOnArrival ? 0 : steering.turn,
      targetAngle: arrived && !faceTargetOnArrival ? null : steering.targetAngle,
      sprint: !arrived && sprint && forward >= 0.82 && headingError < 0.4 && steering.distance > sprintDistance,
      fireHeld: false,
    }, now);
    state.nextThinkAt = now + responsiveDelay;
    return true;
  }

  function executeEngage(bot, transform, state, decision, visibleEnemies, now) {
    const visible = visibleEnemies.find((enemy) => enemy.entityId === decision.targetEntityId)
      ?? visibleEnemies[0];
    if (!visible) return false;
    rememberTarget(state, visible.entityId, visible.transform, now, BOT_VISIBLE_MEMORY_MS);
    shareTargetWithSquadmate(bot.id, visible.entityId, visible.transform, now, BOT_VISIBLE_MEMORY_MS);

    const targetArmor = armorService?.describe?.(visible.entityId)?.current
      ?? (ctx.components.get(visible.entityId, "Armor")?.current ?? 0);
    const activeWeapon = selectBestWeaponForRange(bot.id, visible.distance, { targetArmor, now });
    const activeWeaponId = activeWeapon?.id ?? null;
    const isSniper = activeWeaponId === "sniper";
    const isMarksman = activeWeaponId === "marksman";
    const isPrecisionWeapon = isSniper || isMarksman;

    const partner = activeSquadPartner(bot.id);
    const hasOutnumberedCallout = Boolean(
      state.outnumberedCallout
      && state.outnumberedCallout.expiresAt > now
      && partner
      && distance3(transform, partner.transform) > 10,
    );
    const partnerTargetingSame = Boolean(
      partner
      && distance3(transform, partner.transform) <= 48
      && (partner.state.lastKnownTargetId === visible.entityId
        || brain.commitmentFor?.(partner.id, now)?.targetEntityId === visible.entityId),
    );
    const role = squadRoleFor(bot.id);
    const aiCmdPre = decision.aiCmd ?? null;
    let effectiveTactic = decision.tactic;
    let desiredRange = Math.max(4, Number(decision.desiredRange) || 8);
    if (!aiCmdPre && !hasOutnumberedCallout) {
      if (isSniper) desiredRange = Math.max(desiredRange, 38);
      else if (isMarksman) desiredRange = Math.max(desiredRange, 24);
    }

    const selfHpComp = ctx.components.get(bot.id, "Health");
    const selfArmorComp = ctx.components.get(bot.id, "Armor");
    const activeWepDef = weapons.definitions?.[activeWeaponId] ?? null;
    const stimsService = getStimulants();
    const totalStims = stimsService ? (stimsService.totalCount?.(bot.id) ?? stimsService.count(bot.id)) : 0;
    const reservePlates = Number(selfArmorComp?.reserve ?? 0);
    const targetEnt = entities.get(visible.entityId);
    const targetVel = estimateTargetVelocity(visible.entityId, visible.transform, now);
    const targetSpeed = Math.hypot(targetVel.vx, targetVel.vz);
    const preSteering = steeringTo(transform, visible.transform, 90);
    const netDecision = combatNet.decideForBot(bot.id, {
      selfHealthRatio: (Number(selfHpComp?.current) || 100) / Math.max(1, Number(selfHpComp?.maximum) || 100),
      selfArmorRatio: (Number(selfArmorComp?.current) || 0) / Math.max(1, Number(selfArmorComp?.maximum) || 150),
      enemyDistance: visible.distance,
      visibleEnemyCount: visibleEnemies.length,
      standingAllies: partner ? 1 : 0,
      nearestAllyDistance: partner ? distance3(transform, partner.transform) : 60,
      weaponRange: Number(activeWepDef?.range) || 55,
      ammoRatio: (Number(activeWeapon?.ammo) || 0) / Math.max(1, Number(activeWepDef?.magazine) || 30),
      targetArmorRatio: targetArmor / 150,
      hasCoverOrBuilding: Boolean(buildingIdAt(transform)),
      hasStimsOrPlates: Math.min(1, (totalStims + reservePlates) / 4),
      elevationDiff: (Number(transform.y) || 0) - (Number(visible.transform?.y) || 0),
      altitude: Math.max(0, Number(transform.y) || 0),
      verticalSpeed: Math.abs(Number(transform.verticalVelocity) || 0),
      landingDistance: 0,
      aimError: Math.abs(preSteering.delta),
      targetSpeed,
      lineOfSightClear: true,
      targetIsHuman: Boolean(targetEnt && !targetEnt.bot),
    }, now);
    state.lastNeuralAction = netDecision.action;
    state.lastNeuralConfidence = netDecision.confidence;
    state.lastNeuralFireMode = netDecision.fireMode;
    state.lastNeuralFireConfidence = netDecision.fireConfidence;

    if (hasOutnumberedCallout && !aiCmdPre) {
      effectiveTactic = "press";
      desiredRange = 8;
    } else if (partnerTargetingSame && !aiCmdPre) {
      const selfDist = distance3(transform, visible.transform);
      const partnerDist = distance3(partner.transform, visible.transform);
      const isLeadBreacher = !isPrecisionWeapon
        && (selfDist + 1.5 < partnerDist || (Math.abs(selfDist - partnerDist) <= 1.5 && role === "breacher"));
      state.strafeDirection = isLeadBreacher ? 1 : -1;
      const preserveRescueRole = state.squadCoordinatedAt === now
        && (state.squadRoleActive === "cover" || state.squadRoleActive === "medic-defending");
      state.squadCoordinatedAt = now;
      if (!preserveRescueRole) {
        state.squadRoleActive = isPrecisionWeapon
          ? "overwatch"
          : (isLeadBreacher ? "breacher" : "flanker");
      }
      if (isPrecisionWeapon) {
        effectiveTactic = selfDist < desiredRange - 3 ? "space" : "flank";
      } else if (isLeadBreacher) {
        effectiveTactic = "press";
        desiredRange = Math.max(4.5, desiredRange - 1.8);
      } else {
        effectiveTactic = "flank";
        desiredRange = desiredRange + 2.2;
      }
    } else if (!aiCmdPre) {
      if (netDecision.action === "press_aggressive" || netDecision.action === "squad_focus_push") {
        effectiveTactic = "press";
        desiredRange = isPrecisionWeapon ? Math.max(18, desiredRange - 4) : Math.max(5.5, desiredRange - 2.5);
      } else if (netDecision.action === "flank_wide") {
        effectiveTactic = "flank";
      } else if (netDecision.action === "hold_precision") {
        effectiveTactic = "hold";
      } else if (netDecision.action === "kite_space" || netDecision.action === "tactical_reset") {
        effectiveTactic = "space";
        desiredRange = Math.max(desiredRange, isPrecisionWeapon ? 30 : 16);
      }
    }

    if (bot.humanSquad) {
      const human = entities.get(bot.humanSquad);
      const humanTransform = human?.alive ? ctx.components.get(human.id, "Transform") : null;
      const maxLeashFromHuman = isPrecisionWeapon ? 34 : 22;
      const maxTargetFromHuman = isPrecisionWeapon ? 55 : 36;
      if (
        humanTransform
        && distance3(transform, humanTransform) > maxLeashFromHuman
        && distance3(humanTransform, visible.transform) > maxTargetFromHuman
      ) {
        return moveTowardPosition(bot, transform, state, humanTransform, now, {
          sprint: true,
          thinkDelay: 110,
          stopDistance: 6.0,
        });
      }
    }

    const inv = ctx.components.get(bot.id, "Weapons");
    const selectedWeapon = inv?.items?.[inv.selected] ?? null;
    const selectedDef = weapons.definitions?.[selectedWeapon?.id] ?? null;
    const fireRange = Math.max(48, Number(selectedDef?.range) || 48);
    const aiCmd = decision.aiCmd ?? null;
    const neuralSteadyAim = netDecision.fireMode === "precision_tap";
    const thinkDelay = isPrecisionWeapon || aiCmd?.paceChoice === "steady_aim" || neuralSteadyAim ? 80 : 95;
    const aimPoint = predictedAimTarget(transform, visible, selectedDef, now);
    const baseAimOpts = aimOptionsForWeapon(selectedWeapon?.id);
    const aimOpts = (aiCmd?.paceChoice === "steady_aim" || neuralSteadyAim)
      ? { ...baseAimOpts, deadzone: Math.min(baseAimOpts.deadzone, 0.008), gain: Math.max(baseAimOpts.gain, 2.25) }
      : baseAimOpts;
    const steering = steeringTo(transform, aimPoint, thinkDelay, aimOpts);
    const neuralFireChoice = aiCmd?.fireChoice
      ?? (netDecision.fireMode === "full_auto_suppression"
        ? "suppress_auto"
        : netDecision.fireMode === "precision_tap"
          ? "single_tap"
          : netDecision.fireMode === "hold_fire_acquire" && Math.abs(steering.delta) > 0.22
            ? "hold_fire"
            : "controlled_burst");
    const aimed = steering.aligned && visible.distance <= fireRange;
    const reacted = reactionReady(bot.id, state, visible.entityId, now);
    const burstAllowed = isSniper || neuralFireChoice === "suppress_auto"
      ? true
      : burstAllowsFire(bot.id, state, now);
    const fireHeld = fireInBurst(bot.id, state, reacted && aimed && burstAllowed, now, {
      fireChoice: neuralFireChoice,
    });

    // If the target is on another floor or across a building doorway, route legs
    // along the stair/door waypoint while keeping aim and weapon fire on the enemy.
    const upperY = Math.max(1, Number(map.building?.upperY) || 3.2);
    let combatRoute = typeof map.navigationWaypoint === "function"
      ? map.navigationWaypoint(transform, visible.transform)
      : null;
    combatRoute = normalizeRouteForTarget(transform, visible.transform, combatRoute, upperY);
    if (combatRoute?.kind === "stair" && sameResolvedFloor(transform, visible.transform, upperY)) {
      combatRoute = null;
    }
    if (combatRoute?.kind === "stair" || combatRoute?.kind === "door") {
      openRouteDoor(bot.id, transform, combatRoute, now);
      const localLegs = worldToLocalMove(
        Number(transform.angle) || 0,
        (Number(combatRoute.x) || 0) - (Number(transform.x) || 0),
        (Number(combatRoute.z) || 0) - (Number(transform.z) || 0),
      );
      movement.setInput(bot.id, {
        forward: clamp(localLegs.forward * 0.85, -0.45, 0.88),
        strafe: clamp(localLegs.strafe * (combatRoute.kind === "stair" ? 0.55 : 0.72), -0.65, 0.65),
        turn: steering.turn,
        targetAngle: steering.targetAngle,
        sprint: false,
        fireHeld,
      });
      state.nextThinkAt = now + Math.min(thinkDelay, 75);
      return true;
    }

    // Select & reserve a GTA-style Ped Node cube via our Living Tactical Field linked to TacticalCombatNet
    const tacticalNode = nodeGrid.selectCombatNodeForTactic(
      bot.id,
      transform,
      visible.entityId,
      visible.transform,
      netDecision.action,
      { desiredRange, now },
    );
    state.activeCombatNode = tacticalNode;
    state.activeCombatNodeId = tacticalNode?.id ?? null;

    let forward = 0.12;
    let strafe = 0;
    const targetDist = Number(visible.distance) || steering.distance;
    if (isPrecisionWeapon && targetDist < desiredRange - 3 && !aiCmd && !hasOutnumberedCallout) {
      effectiveTactic = "space";
    }
    if (effectiveTactic === "hold") {
      forward = 0;
      strafe = state.strafeDirection * 0.26;
    } else if (effectiveTactic === "flank") {
      forward = targetDist > desiredRange + 6 ? 0.92 : (targetDist > desiredRange + 2 ? 0.72 : 0.18);
      strafe = targetDist > desiredRange + 6 ? state.strafeDirection * 0.34 : state.strafeDirection * 0.68;
    } else if (effectiveTactic === "space") {
      forward = targetDist < desiredRange ? -0.78 : 0.06;
      strafe = state.strafeDirection * (isPrecisionWeapon ? 0.48 : 0.42);
    } else {
      forward = targetDist > desiredRange + 2
        ? 1
        : targetDist < desiredRange - 2
          ? -0.42
          : 0.1;
      if (Math.abs(targetDist - desiredRange) < 5) strafe = state.strafeDirection * 0.44;
    }

    // Blend movement toward the bot's reserved Ped Node cube so bots spread onto distinct cover/flank cubes
    if (tacticalNode && !aiCmd && !hasOutnumberedCallout) {
      const nodeDx = (Number(tacticalNode.x) || 0) - (Number(transform.x) || 0);
      const nodeDz = (Number(tacticalNode.z) || 0) - (Number(transform.z) || 0);
      const nodeDist = Math.hypot(nodeDx, nodeDz);
      if (nodeDist > 1.8 && nodeDist <= 38) {
        const localCubeLegs = worldToLocalMove(Number(transform.angle) || 0, nodeDx, nodeDz);
        forward = forward * 0.68 + localCubeLegs.forward * 0.32;
        strafe = strafe * 0.62 + localCubeLegs.strafe * 0.38;
      }
    }

    // Precision aim settle: steady footing right before squeezing a Sniper/Marksman shot.
    const boltAlmostReady = now >= (state.nextShotAt ?? 0) - 200;
    let sprint = targetDist > desiredRange + 8 && (effectiveTactic === "press" || effectiveTactic === "flank");
    if (aiCmd?.paceChoice === "steady_aim") {
      forward *= 0.34;
      strafe *= 0.3;
      sprint = false;
    } else if (aiCmd?.paceChoice === "tactical_strafe") {
      if (Math.abs(strafe) < 0.5) strafe = state.strafeDirection * 0.64;
      sprint = false;
    } else if (aiCmd?.paceChoice === "sprint_push" && forward > 0.6 && Math.abs(steering.delta) < 0.78) {
      sprint = effectiveTactic !== "hold" && effectiveTactic !== "space";
    }
    const isReloadingNow = Boolean(selectedWeapon && Number(selectedWeapon.reloadUntil) > now);
    if (isReloadingNow && targetDist <= 30) {
      // Tactical reload weave: evade laterally and create space while reloading instead of charging with an empty mag
      forward = targetDist < 18 ? -0.58 : -0.18;
      strafe = state.strafeDirection * 0.78;
      sprint = false;
    } else if (isSniper && targetDist <= fireRange && boltAlmostReady && Math.abs(steering.delta) < 0.25) {
      forward *= 0.25;
      strafe *= 0.22;
      sprint = false;
    } else if (isMarksman && aimed && targetDist >= 16) {
      strafe *= 0.55;
      sprint = false;
    }

    setNavigatedInput(bot, transform, state, {
      forward,
      strafe,
      turn: steering.turn,
      targetAngle: steering.targetAngle,
      sprint,
      fireHeld,
      aimLock: true,
    }, now);
    state.nextThinkAt = now + thinkDelay;
    return true;
  }

  function executeEvade(bot, transform, state, decision, visibleEnemies, now) {
    const attacker = decision.returnFire
      ? visibleEnemies.find((enemy) => enemy.entityId === decision.targetEntityId)
      : null;
    if (attacker) {
      rememberTarget(state, attacker.entityId, attacker.transform, now, BOT_VISIBLE_MEMORY_MS);
      shareTargetWithSquadmate(bot.id, attacker.entityId, attacker.transform, now, BOT_VISIBLE_MEMORY_MS);
      const evadeInv = ctx.components.get(bot.id, "Weapons");
      const evadeSelected = evadeInv?.items?.[evadeInv.selected] ?? null;
      const evadeDef = weapons.definitions?.[evadeSelected?.id] ?? null;
      const evadeAimPoint = predictedAimTarget(transform, attacker, evadeDef, now);
      const steering = steeringTo(transform, evadeAimPoint, 95, aimOptionsForWeapon(evadeSelected?.id));
      const reacted = reactionReady(bot.id, state, attacker.entityId, now);
      const evadeRange = Math.max(28, Number(evadeDef?.range) || 28);
      const evadeBurst = evadeSelected?.id === "sniper" || decision.aiCmd?.fireChoice === "suppress_auto"
        ? true
        : burstAllowsFire(bot.id, state, now);
      const fireHeld = fireInBurst(bot.id, state,
        reacted && steering.aligned && attacker.distance <= evadeRange
          && evadeBurst, now, { fireChoice: decision.aiCmd?.fireChoice ?? null });
      setNavigatedInput(bot, transform, state, {
        forward: -0.72,
        strafe: state.strafeDirection * 0.48,
        turn: steering.turn,
        targetAngle: steering.targetAngle,
        sprint: false,
        fireHeld,
        aimLock: true,
      }, now);
      state.nextThinkAt = now + 95;
      return true;
    }

    const target = decision.moveTarget;
    if (!target) return false;
    return moveTowardPosition(bot, transform, state, target, now, {
      sprint: true,
      thinkDelay: 105,
      stopDistance: 1.5,
      calm: false,
    });
  }

  function executeHunt(bot, transform, state, decision, now) {
    const target = decision.target;
    if (!target) return false;
    if (distance3(transform, target) <= BOT_SEARCH_REACHED_DISTANCE) {
      clearMemory(state);
      return false;
    }
    const partner = activeSquadPartner(bot.id);
    let huntTarget = target;
    if (
      partner
      && squadRoleFor(bot.id) === "flanker"
      && distance3(transform, partner.transform) <= 35
      && distance3(partner.transform, target) <= 24
    ) {
      // Flanker offsets laterally by 2.4m when hunting the same point so the two
      // squadmates do not walk single-file on top of each other.
      const dx = (Number(target.x) || 0) - (Number(partner.transform.x) || 0);
      const dz = (Number(target.z) || 0) - (Number(partner.transform.z) || 0);
      const len = Math.max(0.01, Math.hypot(dx, dz));
      const candidate = {
        x: (Number(target.x) || 0) + (-dz / len) * 2.2,
        y: Number(target.y) || 0,
        z: (Number(target.z) || 0) + (dx / len) * 2.2,
      };
      if (typeof map.insideAnyBuilding === "function"
        && map.insideAnyBuilding(target) === map.insideAnyBuilding(candidate)) {
        huntTarget = candidate;
      }
    }
    return moveTowardPosition(bot, transform, state, huntTarget, now, {
      sprint: distance3(transform, huntTarget) > 18,
      thinkDelay: 135,
      stopDistance: BOT_SEARCH_REACHED_DISTANCE,
    });
  }

  function executeEscortOverwatch(bot, transform, state, humanTransform, now) {
    // Hold a calm, steady overwatch sector beside the player — NO artificial turret head-wagging!
    const slot = Number(bot?.squadSlot) || 0;
    const hx = Number(humanTransform?.x) || 0;
    const hz = Number(humanTransform?.z) || 0;
    if (!state.escortLeaderAnchor) {
      state.escortLeaderAnchor = { x: hx, z: hz, angle: Number(humanTransform?.angle) || 0 };
    } else if (Math.hypot(hx - state.escortLeaderAnchor.x, hz - state.escortLeaderAnchor.z) >= 2.2) {
      state.escortLeaderAnchor = { x: hx, z: hz, angle: Number(humanTransform?.angle) || 0 };
    }
    const baseAngle = state.escortLeaderAnchor.angle;
    const sectorOffset = slot === 0 ? -0.52 : slot === 1 ? 0.52 : 2.65;
    const targetHeading = wrapAngle(baseAngle + sectorOffset);
    const delta = wrapAngle(targetHeading - (Number(transform.angle) || 0));
    const deadbeat = (Math.abs(delta) * 0.82) / (BOT_TURN_SPEED_RAD_PER_SEC * 0.18);
    const turn = Math.abs(delta) <= 0.16
      ? 0
      : Math.sign(delta) * Math.min(0.35, (Math.abs(delta) * 0.9) / BOT_TURN_SPEED_RAD_PER_SEC, deadbeat);
    state.squadRoleActive = "escort-overwatch";
    movement.setInput(bot.id, {
      forward: 0,
      strafe: 0,
      turn,
      targetAngle: Math.abs(delta) <= 0.16 ? null : targetHeading,
      sprint: false,
      fireHeld: false,
    });
    state.nextThinkAt = now + 180;
    return true;
  }

  function executeRoam(bot, transform, state, now) {
    // Purposeful cube-to-cube patrol across our TacticalNodeGrid instead of aimless random camera turns
    const reachedTarget = state.roamCubeTarget
      && distance2(transform, state.roamCubeTarget) <= 4.5;
    if (!state.roamCubeTarget || reachedTarget || now >= (state.roamCubeUntil ?? 0)) {
      const heading = Number(transform.angle) || 0;
      const forwardX = Math.sin(heading);
      const forwardZ = -Math.cos(heading);
      const probePoint = {
        x: (Number(transform.x) || 0) + forwardX * 48,
        z: (Number(transform.z) || 0) + forwardZ * 48,
      };
      const nextCube = nodeGrid.nearestPedNode(probePoint, {
        maxDist: 95,
        excludeReservedByOther: bot.id,
        now,
      }) ?? nodeGrid.nearestPedNode({ x: 0, z: 0 }, { maxDist: 220, excludeReservedByOther: bot.id, now });
      if (nextCube) {
        nodeGrid.reserveNode(bot.id, nextCube.id, now, 8500);
        state.roamCubeTarget = { x: nextCube.x, y: nextCube.y ?? 0, z: nextCube.z };
        state.roamCubeUntil = now + 10_000;
      }
    }

    if (state.roamCubeTarget) {
      return moveTowardPosition(bot, transform, state, state.roamCubeTarget, now, {
        sprint: distance2(transform, state.roamCubeTarget) > 22,
        thinkDelay: 120,
        stopDistance: 3.5,
      });
    }

    setNavigatedInput(bot, transform, state, {
      forward: 0.85,
      strafe: 0,
      turn: 0,
      sprint: false,
      fireHeld: false,
    }, now);
    state.nextThinkAt = now + 180;
    return true;
  }

  function traversalFor(transform, visibleEnemies, memory, interestTarget, zoneTarget, previousDecision) {
    const upperY = Math.max(1, Number(map.building?.upperY) || 3.2);
    const previousTraversalTarget = previousDecision?.target ?? previousDecision?.resumeTarget ?? null;
    if (previousDecision?.goal === "traverse" && previousDecision.route?.kind === "stair") {
      const freshRoute = previousTraversalTarget && typeof map.navigationWaypoint === "function"
        ? map.navigationWaypoint(transform, previousTraversalTarget)
        : null;
      const retainedRoute = nextMidStairRoute(
        transform,
        previousTraversalTarget,
        previousDecision.route,
        freshRoute,
        upperY,
      );
      if (retainedRoute) {
        return {
          active: true,
          route: retainedRoute,
          target: previousTraversalTarget,
          committed: true,
        };
      }
    }

    const isEscortRally = interestTarget?.kind === "squad-rally-interest"
      && interestTarget?.partnerGoal === "escort-human";
    const carriedBehaviorTarget = !isEscortRally && ["investigate", "search"].includes(previousDecision?.goal)
      ? previousDecision.target
      : (!isEscortRally && previousDecision?.goal === "traverse" && previousDecision?.resumeTarget
        ? previousDecision.resumeTarget
        : null);
    const freshSoundTarget = !isEscortRally
      && interestTarget?.kind === "sound-interest"
      && Number(interestTarget.heardAt) > Number(previousDecision?.heardAt ?? previousDecision?.resumeHeardAt ?? -Infinity)
      ? interestTarget
      : null;
    const target = visibleEnemies[0]?.transform
      ?? memory?.transform
      ?? (isEscortRally ? interestTarget : null)
      ?? freshSoundTarget
      ?? carriedBehaviorTarget
      ?? interestTarget
      ?? zoneTarget
      ?? null;
    if (!target || typeof map.navigationWaypoint !== "function") return null;
    let route = map.navigationWaypoint(transform, target);
    route = normalizeRouteForTarget(transform, target, route, upperY);
    if (route?.kind === "stair" && sameResolvedFloor(transform, target, upperY)) {
      route = null;
    }
    if (!route || (route.kind !== "stair" && route.kind !== "door")) return null;
    if (route.kind === "door" && visibleEnemies.length && Number(visibleEnemies[0]?.distance) <= 28) {
      return null;
    }
    return { active: true, route, target, committed: false };
  }

  function enemyHasStandingTeammateNearby(enemyId, maxDist = 200) {
    const teams = getTeams();
    const injury = getInjury();
    const enemyTeam = Number(teams?.teamOf(enemyId)) || 0;
    if (enemyTeam <= 0) return false;
    const enemyTransform = ctx.components.get(enemyId, "Transform");
    if (!enemyTransform) return false;
    for (const other of entities.all()) {
      if (!other?.alive || other.id === enemyId) continue;
      if ((Number(teams?.teamOf(other.id)) || 0) !== enemyTeam) continue;
      if (injury?.isDowned(other.id)) continue;
      const otherTransform = ctx.components.get(other.id, "Transform");
      if (otherTransform && distance3(enemyTransform, otherTransform) <= maxDist) return true;
    }
    return false;
  }

  function hasRifleEquippedOrOwned(entityId) {
    const inv = ctx.components.get(entityId, "Weapons");
    return Boolean(inv?.items?.some((item) => item.id === "rifle" || item.id === "marksman" || item.id === "sniper"));
  }

  function selectBestWeaponForRange(botId, distanceMeters = null, { targetArmor = 0, now = Date.now() } = {}) {
    const inv = ctx.components.get(botId, "Weapons");
    if (!inv?.items?.length || inv.items.length < 2) return inv?.items?.[inv?.selected ?? 0] ?? null;
    const usable = inv.items
      .map((item, idx) => ({
        item,
        idx,
        def: weapons.definitions?.[item.id] ?? null,
        readyNow: item.ammo > 0 && !(Number(item.reloadUntil) > now),
      }))
      .filter(({ item }) => (item.ammo > 0 || item.reserve > 0));
    if (!usable.length) return inv.items[inv.selected] ?? null;

    // Out of direct engagement: keep primary long-range/automatic weapon drawn so brain/stance stays ready.
    if (!Number.isFinite(distanceMeters)) {
      const idlePriority = ["sniper", "marksman", "rifle", "pistol"];
      for (const id of idlePriority) {
        const match = usable.find((entry) => entry.item.id === id);
        if (match) {
          if (inv.selected !== match.idx) weapons.select(botId, match.idx - inv.selected);
          return inv.items[inv.selected];
        }
      }
      return inv.items[inv.selected] ?? null;
    }

    const armoredTarget = (Number(targetArmor) || 0) > 0;
    const sniperEntry = usable.find((entry) => entry.item.id === "sniper");

    let priority;
    if (armoredTarget && distanceMeters >= 14 && sniperEntry?.readyNow) {
      // Open with Sniper against armored targets to shatter all armor plates in one hit.
      priority = ["sniper", "marksman", "rifle", "pistol"];
    } else if (distanceMeters >= 34) {
      priority = ["sniper", "marksman", "rifle", "pistol"];
    } else if (distanceMeters >= 18) {
      priority = ["marksman", "sniper", "rifle", "pistol"];
    } else if (distanceMeters >= 12) {
      priority = ["rifle", "marksman", "sniper", "pistol"];
    } else {
      priority = ["rifle", "marksman", "pistol", "sniper"];
    }

    const inRangeUsable = usable.filter((entry) => (Number(entry.def?.range) || 28) >= distanceMeters * 0.92);
    const pool = inRangeUsable.length > 0 ? inRangeUsable : usable;

    // Prefer a weapon that can fire immediately rather than one mid-reload at close/mid range.
    for (const requireReady of [true, false]) {
      for (const id of priority) {
        const match = pool.find((entry) => entry.item.id === id && (!requireReady || entry.readyNow));
        if (match) {
          if (inv.selected !== match.idx) {
            weapons.select(botId, match.idx - inv.selected);
          }
          return inv.items[inv.selected];
        }
      }
    }
    return inv.items[inv.selected] ?? null;
  }

  function coordinateSquadRescue(bot, transform, state, standingEnemies, now) {
    const injury = getInjury();
    if (!injury) return false;
    const downedAllies = injury.downedTeammates(bot.id, 95);
    if (!downedAllies.length) {
      if (injury.isRevivingTeammate(bot.id)) {
        injury.pauseTeamRevive(bot.id, "no-downed-ally", now);
      }
      return false;
    }

    downedAllies.sort((a, b) => {
      const aSelfReviving = a.reviverId === bot.id ? -1 : 0;
      const bSelfReviving = b.reviverId === bot.id ? -1 : 0;
      if (aSelfReviving !== bSelfReviving) return aSelfReviving - bSelfReviving;
      const aHuman = !a.entity?.bot ? -1 : 0;
      const bHuman = !b.entity?.bot ? -1 : 0;
      if (aHuman !== bHuman) return aHuman - bHuman;
      if ((b.reviveProgressMs ?? 0) !== (a.reviveProgressMs ?? 0)) {
        return (b.reviveProgressMs ?? 0) - (a.reviveProgressMs ?? 0);
      }
      return a.distance - b.distance;
    });

    const primaryAlly = downedAllies[0];
    const recentAttacker = state.lastDamagedById
      && now - (state.lastDamagedAt ?? 0) <= 1400
      ? standingEnemies.find((e) => e.entityId === state.lastDamagedById)
      : null;
    const closeRushEnemy = standingEnemies.find((e) => e.distance <= 14) ?? null;
    const immediateThreat = closeRushEnemy ?? recentAttacker ?? null;

    const standingMates = squadTeammatesFor(bot.id, { includeHuman: false, includeDowned: false });
    const standingSquadBots = [
      { id: bot.id, transform, state },
      ...standingMates.map((m) => ({ id: m.id, transform: m.transform, state: m.state })),
    ];

    let medicBotId = null;
    const defendingMedic = standingSquadBots.find((b) => (
      b.state?.squadRoleActive === "medic-defending"
      && b.state?.squadTargetAllyId === primaryAlly.entityId
      && now - (b.state?.squadCoordinatedAt ?? 0) <= 2500
    ));
    if (
      primaryAlly.reviverId
      && standingSquadBots.some((b) => b.id === primaryAlly.reviverId)
    ) {
      medicBotId = primaryAlly.reviverId;
    } else if (defendingMedic) {
      medicBotId = defendingMedic.id;
    } else {
      const scoredBots = standingSquadBots.map((candidate) => {
        const distToAlly = distance3(candidate.transform, primaryAlly.transform);
        const enemyCloseToCandidate = distToAlly > 3.5 && standingEnemies.some(
          (e) => distance3(candidate.transform, e.transform) <= 12,
        );
        return {
          id: candidate.id,
          score: distToAlly + (enemyCloseToCandidate ? 35 : 0),
        };
      });
      scoredBots.sort((a, b) => a.score - b.score || String(a.id).localeCompare(String(b.id)));
      medicBotId = scoredBots[0]?.id ?? bot.id;
    }

    if (bot.id === medicBotId) {
      if (immediateThreat) {
        if (injury.isRevivingTeammate(bot.id)) {
          injury.pauseTeamRevive(bot.id, "enemy-rush", now);
        }
        state.squadRoleActive = "medic-defending";
        state.squadTargetAllyId = primaryAlly.entityId;
        state.squadCoordinatedAt = now;
        const rescueInv = ctx.components.get(bot.id, "Weapons");
        const rescueWeaponId = rescueInv?.items?.[rescueInv.selected]?.id ?? "pistol";
        const rescueRange = weaponStandoffRange(rescueWeaponId, 7);
        return executeEngage(bot, transform, state, {
          goal: "engage",
          targetEntityId: immediateThreat.entityId,
          desiredRange: rescueRange,
          tactic: Number(immediateThreat.distance) < rescueRange - 2 ? "space" : "press",
          aiCmd: getAiDecisions()?.commandFor?.(bot.id, now) ?? null,
        }, standingEnemies, now);
      }

      if (armorService?.isPlating(bot.id)) {
        armorService.cancelPlating(bot.id, "medic-revive");
      }
      state.squadRoleActive = "medic";
      state.squadTargetAllyId = primaryAlly.entityId;
      state.squadCoordinatedAt = now;
      const distToAlly = distance3(transform, primaryAlly.transform);
      if (distToAlly <= 2.45) {
        const steering = steeringTo(transform, primaryAlly.transform);
        movement.setInput(bot.id, {
          forward: 0,
          strafe: 0,
          turn: steering.turn,
          targetAngle: steering.targetAngle,
          sprint: false,
          fireHeld: false,
        });
        injury.startTeamRevive(bot.id, primaryAlly.entityId, now);
        state.nextThinkAt = now + 80;
        return true;
      }
      moveTowardPosition(bot, transform, state, primaryAlly.transform, now, {
        sprint: true,
        thinkDelay: 85,
        stopDistance: 1.8,
      });
      if (distance3(transform, primaryAlly.transform) <= 2.65) {
        injury.startTeamRevive(bot.id, primaryAlly.entityId, now);
      }
      return true;
    }

    // Cover / Aggressor role for other standing squad bots
    const allyAttackerId = injury.stateFor(primaryAlly.entityId)?.attackerId ?? null;
    if (standingEnemies.length > 0) {
      if (injury.isRevivingTeammate(bot.id)) {
        injury.pauseTeamRevive(bot.id, "cover-engage", now);
      }
      const prioritized = [...standingEnemies].sort((a, b) => {
        const aScore = a.distance
          - (hasRifleEquippedOrOwned(a.entityId) ? 25 : 0)
          - (a.entityId === allyAttackerId ? 20 : 0);
        const bScore = b.distance
          - (hasRifleEquippedOrOwned(b.entityId) ? 25 : 0)
          - (b.entityId === allyAttackerId ? 20 : 0);
        return aScore - bScore;
      });
      const targetEnemy = prioritized[0];
      state.squadRoleActive = "cover";
      state.squadTargetAllyId = primaryAlly.entityId;
      state.squadCoordinatedAt = now;
      const coverInv = ctx.components.get(bot.id, "Weapons");
      const coverWeaponId = coverInv?.items?.[coverInv.selected]?.id ?? "pistol";
      const coverRange = weaponStandoffRange(coverWeaponId, 8);
      return executeEngage(bot, transform, state, {
        goal: "engage",
        targetEntityId: targetEnemy.entityId,
        desiredRange: coverRange,
        tactic: Number(targetEnemy.distance) < coverRange - 2 ? "space" : "press",
        aiCmd: getAiDecisions()?.commandFor?.(bot.id, now) ?? null,
      }, standingEnemies, now);
    }

    const trackedEnemyId = allyAttackerId ?? state.lastKnownTargetId ?? null;
    const trackedEnemy = trackedEnemyId ? entities.get(trackedEnemyId) : null;
    const teams = getTeams();
    const ownTeam = Number(teams?.teamOf(bot.id)) || 0;
    if (
      trackedEnemy?.alive
      && !injury.isDowned(trackedEnemy.id)
      && (ownTeam <= 0 || (Number(teams?.teamOf(trackedEnemy.id)) || 0) !== ownTeam)
    ) {
      const trackedTransform = ctx.components.get(trackedEnemy.id, "Transform");
      if (trackedTransform && distance3(transform, trackedTransform) <= 65) {
        if (injury.isRevivingTeammate(bot.id)) {
          injury.pauseTeamRevive(bot.id, "cover-hunt", now);
        }
        state.squadRoleActive = "cover";
        state.squadTargetAllyId = primaryAlly.entityId;
        state.squadCoordinatedAt = now;
        return moveTowardPosition(bot, transform, state, trackedTransform, now, {
          sprint: true,
          thinkDelay: 100,
          stopDistance: 6.5,
        });
      }
    }

    const secondaryAlly = downedAllies.find(
      (a) => a.entityId !== primaryAlly.entityId && (!a.reviverId || a.reviverId === bot.id),
    ) ?? primaryAlly;
    state.squadRoleActive = "medic";
    state.squadTargetAllyId = secondaryAlly.entityId;
    state.squadCoordinatedAt = now;
    if (distance3(transform, secondaryAlly.transform) <= 2.45) {
      const steering = steeringTo(transform, secondaryAlly.transform);
      movement.setInput(bot.id, {
        forward: 0,
        strafe: 0,
        turn: steering.turn,
        targetAngle: steering.targetAngle,
        sprint: false,
        fireHeld: false,
      });
      injury.startTeamRevive(bot.id, secondaryAlly.entityId, now);
      state.nextThinkAt = now + 80;
      return true;
    }
    return moveTowardPosition(bot, transform, state, secondaryAlly.transform, now, {
      sprint: true,
      thinkDelay: 85,
      stopDistance: 1.8,
    });
  }

  function coordinateSquadBuyback(bot, transform, state, standingEnemies, now) {
    if (tutorial?.botsPassive?.()) return false;
    if (standingEnemies.length > 0) return false;
    const shopService = getShop();
    if (!shopService) return false;
    const deadMates = shopService.deadTeammatesFor?.(bot.id) ?? [];
    if (!deadMates.length) return false;

    const targetDead = deadMates[0];
    const buybackCost = Number(shopService.constants?.BUYBACK_COST) || 1500;
    const stations = shopService.stations?.() ?? [];
    if (!stations.length) return false;

    const zoneRadius = Math.max(18, Number(battleRoyale.zoneRadiusAt?.(now)) || 400);
    const zoneLimit = Math.max(12, zoneRadius - Math.min(40, zoneRadius * 0.15));
    const safeShops = stations
      .filter((s) => Math.hypot(Number(s.x) || 0, Number(s.z) || 0) <= zoneLimit)
      .sort((a, b) => distance2(transform, a) - distance2(transform, b));
    const targetShop = safeShops[0] ?? stations.slice().sort((a, b) => distance2(transform, a) - distance2(transform, b))[0];
    if (!targetShop) return false;

    const standingMates = squadTeammatesFor(bot.id, { includeHuman: true, includeDowned: false });
    const allTeamStandings = [{ id: bot.id, entity: entities.get(bot.id), transform }, ...standingMates];
    const richCollectors = allTeamStandings.filter((m) => (
      m.entity?.bot && (shopService.balanceOf?.(m.id) ?? 0) >= buybackCost
    ));

    if ((shopService.balanceOf?.(bot.id) ?? 0) >= buybackCost) {
      richCollectors.sort((a, b) => distance2(a.transform, targetShop) - distance2(b.transform, targetShop));
      if (richCollectors.length > 0 && richCollectors[0].id !== bot.id) {
        return false;
      }
      state.squadRoleActive = "buyback-run";
      const distToShop = distance3(transform, targetShop);
      if (distToShop <= 3.6) {
        movement.setInput(bot.id, {});
        const bought = shopService.buy(bot.id, {
          shopId: targetShop.id,
          itemId: "buyback",
          targetId: targetDead.id,
        }, now);
        if (bought?.ok) state.squadRoleActive = null;
        state.nextThinkAt = now + 110;
        return true;
      }
      return moveTowardPosition(bot, transform, state, targetShop, now, {
        sprint: true,
        thinkDelay: 85,
        stopDistance: 2.0,
        sprintDistance: 2.5,
      });
    }

    if (richCollectors.length > 0) return false;

    const unopenedCrates = (map?.crates ?? [])
      .filter((c) => c && !c.opened && Math.hypot(Number(c.x) || 0, Number(c.z) || 0) <= zoneLimit)
      .sort((a, b) => distance3(transform, a) - distance3(transform, b));
    if (unopenedCrates.length > 0 && distance2(transform, unopenedCrates[0]) <= 155) {
      state.squadRoleActive = "loot-for-buyback";
      tryOpenNearbyCrate(bot, transform, state, now);
      if (!unopenedCrates[0].opened) {
        return moveTowardPosition(bot, transform, state, unopenedCrates[0], now, {
          sprint: true,
          thinkDelay: 90,
          stopDistance: 1.5,
          sprintDistance: 2.5,
        });
      }
      return true;
    }

    return false;
  }

  function think(bot, now) {
    const transform = ctx.components.get(bot.id, "Transform");
    const state = ctx.components.get(bot.id, "Bot");
    if (!transform || !state) return;

    const injury = getInjury();
    const stimulants = getStimulants();
    if (injury?.isDowned(bot.id)) {
      if (!state.downedSince) state.downedSince = now;
      const downedState = injury.stateFor(bot.id);
      if (stimulants?.isUsing(bot.id)) {
        state.squadRoleActive = "self-revive";
        movement.setInput(bot.id, {});
        state.nextThinkAt = now + 80;
        return;
      }
      if (downedState?.reviverId) {
        movement.setInput(bot.id, {});
        state.nextThinkAt = now + 80;
        return;
      }
      const standingAllies = squadTeammatesFor(bot.id, { includeHuman: true, includeDowned: false });
      standingAllies.sort((a, b) => distance3(transform, a.transform) - distance3(transform, b.transform));
      const nearestAlly = standingAllies[0] ?? null;
      const nearestAllyDist = nearestAlly ? distance3(transform, nearestAlly.transform) : Infinity;
      const allyUnderFire = standingAllies.some((a) => (
        ["cover", "medic-defending", "breacher", "flanker"].includes(a.state?.squadRoleActive)
        || (a.state?.lastDamagedAt && now - a.state.lastDamagedAt <= 2500)
      ));
      const nearbyStandingEnemies = typeof perception.visibleEnemies === "function"
        ? perception.visibleEnemies(bot.id, 35, { now, limit: 4 }).some((e) => !injury.isDowned(e.entityId))
        : false;
      const downedElapsedMs = Math.max(0, now - (state.downedSince ?? now));
      const selfReviveDelayMs = bot.humanSquad ? 850 : 1400;
      let totalStims = stimulants
        ? (stimulants.totalCount?.(bot.id) ?? stimulants.count(bot.id))
        : 0;
      if (bot.humanSquad && stimulants && totalStims <= 0 && !downedState?.reviverId && downedElapsedMs >= 1200) {
        stimulants.grant?.(bot.id, 1);
        totalStims = stimulants.totalCount?.(bot.id) ?? stimulants.count(bot.id);
      }
      const shouldSelfRevive = stimulants
        && totalStims > 0
        && !downedState?.reviverId
        && (
          (bot.humanSquad && (standingAllies.length === 0 || nearestAllyDist > 22))
          || downedElapsedMs >= selfReviveDelayMs
        );
      if (shouldSelfRevive) {
        movement.setInput(bot.id, {});
        const chosenDownedStim = selectBotStimulantKind({
          downed: true,
          standardCount: stimulants.count?.(bot.id) ?? 0,
          fastCount: stimulants.fastCount?.(bot.id) ?? 0,
          turboCount: stimulants.turboCount?.(bot.id) ?? 0,
          enemiesNearby: Boolean(nearbyStandingEnemies || allyUnderFire),
        });
        const used = chosenDownedStim
          ? stimulants.start(bot.id, now, chosenDownedStim)
          : (stimulants.useAny ? stimulants.useAny(bot.id, now) : stimulants.start(bot.id, now));
        if (used) {
          state.squadRoleActive = "self-revive";
          state.nextThinkAt = now + 80;
          return;
        }
      }
      if (nearestAlly && (!stimulants || totalStims <= 0)) {
        if (nearestAllyDist > 2.0 && nearestAllyDist <= 38) {
          const steering = steeringTo(transform, nearestAlly.transform);
          movement.setInput(bot.id, {
            forward: 0.85,
            strafe: 0,
            turn: steering.turn,
            targetAngle: steering.targetAngle,
            sprint: false,
            fireHeld: false,
          });
          state.nextThinkAt = now + 120;
          return;
        }
      }
      movement.setInput(bot.id, {});
      state.nextThinkAt = now + 80;
      return;
    }
    state.downedSince = null;

    const vehicles = getVehicles();
    if (bot.humanSquad && vehicles) {
      const leader = entities.get(bot.humanSquad);
      const leaderVehicle = leader?.alive
        ? (vehicles.vehicleForDriver?.(leader.id) ?? vehicles.vehicleForPassenger?.(leader.id) ?? null)
        : null;
      if (vehicles.isPassenger?.(bot.id)) {
        const currentVehicle = vehicles.vehicleForPassenger?.(bot.id) ?? null;
        if (!leaderVehicle || !currentVehicle || leaderVehicle.id !== currentVehicle.id) {
          vehicles.exitPassenger?.(bot.id, now, "leader-exited");
          state.boardingVehicleId = null;
          state.boardingVehicleSince = 0;
        } else {
          state.squadRoleActive = "vehicle-passenger";
          state.boardingVehicleId = currentVehicle.id;
          movement.setInput(bot.id, {});
          state.nextThinkAt = now + 110;
          return;
        }
      }
      if (leaderVehicle && !vehicles.isDriving?.(bot.id)) {
        const passengerCount = Array.isArray(leaderVehicle.passengerIds) ? leaderVehicle.passengerIds.length : 0;
        const capacity = Number(vehicles.passengerCapacity ?? 3);
        const ragdoll = ctx.services.has("ragdoll") ? ctx.services.get("ragdoll") : null;
        const canRide = passengerCount < capacity
          && !ctx.components.get(bot.id, "Parachute")?.airborne
          && !ragdoll?.isActive?.(bot.id);
        if (canRide) {
          if (armorService?.isPlating(bot.id)) armorService.cancelPlating(bot.id, "board-vehicle");
          if (injury?.isRevivingTeammate(bot.id)) injury.pauseTeamRevive(bot.id, "board-vehicle", now);
          if (stimulants?.isUsing(bot.id)) stimulants.cancel(bot.id, "board-vehicle");
          if (state.boardingVehicleId !== leaderVehicle.id) {
            state.boardingVehicleId = leaderVehicle.id;
            state.boardingVehicleSince = now;
          }
          const distToCar = distance3(transform, leaderVehicle);
          const carSpeed = Number(leaderVehicle.speed) || 0;
          const boardReach = carSpeed >= 2.2 || now - (state.boardingVehicleSince ?? now) >= 2400 ? 14 : 4.2;
          if (distToCar <= boardReach && vehicles.enterPassenger?.(bot.id, leaderVehicle.id, now)) {
            state.squadRoleActive = "vehicle-passenger";
            movement.setInput(bot.id, {});
            state.nextThinkAt = now + 110;
            return;
          }
          state.squadRoleActive = "board-vehicle";
          moveTowardPosition(bot, transform, state, leaderVehicle, now, {
            sprint: true,
            thinkDelay: 80,
            stopDistance: 1.5,
            sprintDistance: 2.0,
          });
          if (distance3(transform, leaderVehicle) <= boardReach && vehicles.enterPassenger?.(bot.id, leaderVehicle.id, now)) {
            state.squadRoleActive = "vehicle-passenger";
            movement.setInput(bot.id, {});
            state.nextThinkAt = now + 110;
          }
          return;
        }
      } else {
        state.boardingVehicleId = null;
        state.boardingVehicleSince = 0;
      }
    }

    if (now >= (state.tacticUntil ?? 0)) {
      state.strafeDirection = -(state.strafeDirection || 1);
      const seed = Number.parseInt(String(bot.id).replace(/\D/g, ""), 10) || 1;
      state.tacticUntil = now + 1850 + (seed % 5) * 320;
    }

    const inventory = ctx.components.get(bot.id, "Weapons");
    const preSelected = inventory?.items?.[inventory.selected] ?? null;
    const preMaxRange = (inventory?.items ?? []).reduce((best, item) => (
      Math.max(best, Number(weapons.definitions?.[item.id]?.range) || 0)
    ), 48);
    const scanRange = Math.max(48, Math.min(160, preMaxRange));
    const allVisibleEnemies = typeof perception.visibleEnemies === "function"
      ? perception.visibleEnemies(bot.id, scanRange, { now, limit: 8 })
      : [perception.nearestVisibleEnemy(bot.id, scanRange, { now })].filter(Boolean);
    const standingEnemies = injury
      ? allVisibleEnemies.filter((e) => !injury.isDowned(e.entityId))
      : allVisibleEnemies;
    const downedVisibleEnemies = injury
      ? allVisibleEnemies.filter((e) => injury.isDowned(e.entityId))
      : [];
    const finishableDownedEnemies = downedVisibleEnemies.filter(
      (e) => !enemyHasStandingTeammateNearby(e.entityId, 200),
    );
    const primaryPreview = standingEnemies[0] ?? finishableDownedEnemies[0] ?? null;
    const primaryArmor = primaryPreview
      ? (armorService?.describe?.(primaryPreview.entityId)?.current
        ?? (ctx.components.get(primaryPreview.entityId, "Armor")?.current ?? 0))
      : 0;
    const selected = selectBestWeaponForRange(bot.id, primaryPreview?.distance ?? null, {
      targetArmor: primaryArmor,
      now,
    }) ?? preSelected;
    if (selected && selected.reserve > 0) {
      const proactiveCap = selected.id === "sniper" ? 2 : selected.id === "marksman" ? 4 : 3;
      const shouldReloadNow = selected.ammo <= 0
        || (standingEnemies.length === 0 && selected.ammo <= proactiveCap);
      if (shouldReloadNow) {
        weapons.reload(bot.id, now);
      }
    }

    const armorState = armorService?.describe(bot.id) ?? null;
    const needsArmorPlating = Boolean(
      armorState
      && (armorState.plating
        || (armorState.reservePlates > 0 && armorState.current <= armorState.maximum - armorState.plateValue * 0.5)),
    );
    const hp = ctx.components.get(bot.id, "Health");
    const minReserveStims = bot.humanSquad ? 1 : 0;
    const recentlyDamagedForStim = Boolean(state.lastDamagedAt && now - state.lastDamagedAt <= 1100);
    const stimCooldownActive = Boolean(state.lastStimCancelledAt && now - state.lastStimCancelledAt <= 1500);
    const enemiesNearbyForStim = Boolean(
      standingEnemies.length > 0
      || (state.memory && state.memory.expiresAt > now && state.memory.transform && distance3(transform, state.memory.transform) <= 45)
      || (state.distantContact && state.distantContact.expiresAt > now),
    );
    const standingStimKind = stimulants && hp
      ? selectBotStimulantKind({
        downed: false,
        health: hp.current,
        maxHealth: hp.maximum,
        standardCount: stimulants.count?.(bot.id) ?? 0,
        fastCount: stimulants.fastCount?.(bot.id) ?? 0,
        turboCount: stimulants.turboCount?.(bot.id) ?? 0,
        minReserveStims,
        enemiesVisible: standingEnemies.length > 0,
        enemiesNearby: enemiesNearbyForStim,
        inCover: Boolean(transform?.inCover || transform?.crouching),
        recentlyDamaged: recentlyDamagedForStim,
        stimCooldownActive,
      })
      : null;
    const needsStimHeal = Boolean(
      stimulants
      && (stimulants.isUsing(bot.id) || Boolean(standingStimKind)),
    );
    const hasUnopenedCrateNearby = Array.isArray(map?.crates) && map.crates.some(
      (c) => c && !c.opened && distance2(transform, c) <= 35,
    );
    const calmPostKnockdown = standingEnemies.length === 0
      && downedVisibleEnemies.length > 0
      && (needsArmorPlating || needsStimHeal || hasUnopenedCrateNearby);

    if (calmPostKnockdown) {
      state.squadRoleActive = "post-knockdown-loot";
    }
    const visibleEnemies = standingEnemies.length > 0
      ? standingEnemies
      : (calmPostKnockdown ? [] : finishableDownedEnemies);

    if (standingEnemies.length >= 2) {
      shareOutnumberedCalloutWithSquad(bot.id, standingEnemies[0], standingEnemies.length, now);
    } else if (standingEnemies.length === 1 && enemyHasStandingTeammateNearby(standingEnemies[0].entityId, 24)) {
      shareOutnumberedCalloutWithSquad(bot.id, standingEnemies[0], 2, now);
    }

    if (visibleEnemies.length) {
      const primary = visibleEnemies[0];
      rememberTarget(state, primary.entityId, primary.transform, now, BOT_VISIBLE_MEMORY_MS);
      shareTargetWithSquadmate(bot.id, primary.entityId, primary.transform, now, BOT_VISIBLE_MEMORY_MS);
      state.combatFocus = {
        entityId: primary.entityId,
        x: Number(primary.transform.x) || 0,
        y: Number(primary.transform.y) || 0,
        z: Number(primary.transform.z) || 0,
        until: now + 650,
      };
    }

    if (coordinateSquadRescue(bot, transform, state, standingEnemies, now)) {
      return;
    }

    if (coordinateSquadBuyback(bot, transform, state, standingEnemies, now)) {
      return;
    }

    if (standingStimKind && stimulants && !stimulants.isUsing(bot.id)) {
      const earlyRally = !visibleEnemies.length ? squadRallyInterest(bot.id, transform, now) : null;
      const blockedByEscort = Boolean(bot.humanSquad && earlyRally?.separatedByStructure);
      if (!blockedByEscort) {
        stimulants.start(bot.id, now, standingStimKind);
      }
    }

    const tacticsService = ctx.services.has("tactics-inventory")
      ? ctx.services.get("tactics-inventory")
      : null;
    if (bot.humanSquad && tacticsService) {
      const humanLeader = entities.get(bot.humanSquad);
      const humanTransform = humanLeader?.alive ? ctx.components.get(humanLeader.id, "Transform") : null;
      const activeOrder = tacticsService.squadOrderFor?.(bot.id, now) ?? null;

      if (activeOrder?.type === "move" && activeOrder.point) {
        const distToOrder = distance3(transform, activeOrder.point);
        if (visibleEnemies.length && distToOrder <= 8) {
          const primary = visibleEnemies[0];
          if (executeEngage(bot, transform, state, {
            goal: "engage",
            targetEntityId: primary.entityId,
            desiredRange: 10,
            tactic: "flank",
          }, visibleEnemies, now)) return;
        }
        if (distToOrder > 2.8) {
          tacticsService.setCrouch?.(bot.id, false, { now, silent: true, reason: "order-move" });
          moveTowardPosition(bot, transform, state, activeOrder.point, now, {
            sprint: distToOrder > 8,
            thinkDelay: 120,
            stopDistance: 2.4,
          });
          return;
        }
        tacticsService.setCrouch?.(bot.id, true, { now, silent: true, reason: "order-arrived-cover" });
        if (visibleEnemies.length) {
          const primary = visibleEnemies[0];
          if (executeEngage(bot, transform, state, {
            goal: "engage",
            targetEntityId: primary.entityId,
            desiredRange: 10,
            tactic: "space",
          }, visibleEnemies, now)) return;
        }
        movement.setInput(bot.id, { forward: 0, strafe: 0, turn: 0, sprint: false, fireHeld: false });
        return;
      }

      if (activeOrder?.type === "follow" && humanTransform) {
        const distToLeader = distance3(transform, humanTransform);
        if (distToLeader > 4.5) {
          tacticsService.setCrouch?.(bot.id, false, { now, silent: true, reason: "order-follow" });
          moveTowardPosition(bot, transform, state, humanTransform, now, {
            sprint: distToLeader > 9,
            thinkDelay: 120,
            stopDistance: 3.4,
          });
          if (visibleEnemies.length) {
            const primary = visibleEnemies[0];
            weapons.fire(bot.id, now);
            void primary;
          }
          return;
        }
      }

      if (activeOrder?.type === "cover") {
        const currentCover = tacticsService.coverAt?.(transform);
        if (!currentCover?.active) {
          const coverSpot = tacticsService.findCoverPoint?.(transform, 14);
          if (coverSpot && distance3(transform, coverSpot) > 1.6) {
            moveTowardPosition(bot, transform, state, coverSpot, now, {
              sprint: true,
              thinkDelay: 120,
              stopDistance: 1.2,
            });
            return;
          }
        }
        tacticsService.setCrouch?.(bot.id, true, { now, silent: true, reason: "order-cover" });
        if (visibleEnemies.length) {
          const primary = visibleEnemies[0];
          const aimAngle = Math.atan2(
            (Number(primary.transform.x) || 0) - transform.x,
            -(Number(primary.transform.z) || 0) + transform.z,
          );
          movement.setInput(bot.id, { forward: 0, strafe: 0, targetAngle: aimAngle, sprint: false, fireHeld: true });
          weapons.fire(bot.id, now);
          return;
        }
        movement.setInput(bot.id, { forward: 0, strafe: 0, turn: 0, sprint: false, fireHeld: false });
        return;
      }

      if (activeOrder?.type === "hold") {
        const holdPoint = activeOrder.holdPoint ?? transform;
        const distHold = distance3(transform, holdPoint);
        if (distHold > 2.6) {
          moveTowardPosition(bot, transform, state, holdPoint, now, {
            sprint: false,
            thinkDelay: 140,
            stopDistance: 1.8,
          });
          return;
        }
        tacticsService.setCrouch?.(bot.id, true, { now, silent: true, reason: "order-hold" });
        if (visibleEnemies.length) {
          const primary = visibleEnemies[0];
          const aimAngle = Math.atan2(
            (Number(primary.transform.x) || 0) - transform.x,
            -(Number(primary.transform.z) || 0) + transform.z,
          );
          movement.setInput(bot.id, { forward: 0, strafe: 0, targetAngle: aimAngle, sprint: false, fireHeld: true });
          weapons.fire(bot.id, now);
          return;
        }
        movement.setInput(bot.id, { forward: 0, strafe: 0, turn: 0, sprint: false, fireHeld: false });
        return;
      }

      // Mirror player crouch/cover naturally when close by and not ordered to attack
      if (!activeOrder && humanTransform && humanTransform.crouching && distance3(transform, humanTransform) <= 16) {
        tacticsService.setCrouch?.(bot.id, true, { now, silent: true, reason: "mirror-leader" });
      } else if (!activeOrder && transform.crouching && (!humanTransform?.crouching || distance3(transform, humanTransform) > 20)) {
        tacticsService.setCrouch?.(bot.id, false, { now, silent: true, reason: "leader-stood" });
      }
    }

    const rallyInterest = !visibleEnemies.length ? squadRallyInterest(bot.id, transform, now) : null;
    const escortingAcrossStructure = Boolean(bot.humanSquad && rallyInterest?.separatedByStructure);

    if (!standingEnemies.length && !escortingAcrossStructure) {
      tryOpenNearbyCrate(bot, transform, state, now);
    }

    if (!visibleEnemies.length && armorService) {
      if (escortingAcrossStructure && armorService.isPlating(bot.id)) {
        armorService.cancelPlating(bot.id, "escort-regroup");
      } else if (!escortingAcrossStructure) {
        const freshArmorState = armorService.describe(bot.id);
        if (
          freshArmorState
          && !freshArmorState.plating
          && freshArmorState.reservePlates > 0
          && freshArmorState.current <= freshArmorState.maximum - freshArmorState.plateValue * 0.5
        ) {
          armorService.startFullPlating(bot.id, now);
        }
      }
    } else if (visibleEnemies.length && armorService?.isPlating(bot.id)) {
      armorService.cancelPlating(bot.id, "combat");
    }

    let memory = rememberedTarget(state, entities, now);
    if (memory && injury?.isDowned(memory.entityId) && (calmPostKnockdown || enemyHasStandingTeammateNearby(memory.entityId, 200))) {
      clearMemory(state);
      memory = null;
    }
    if (memory && distance3(transform, memory.transform) <= BOT_SEARCH_REACHED_DISTANCE) {
      clearMemory(state);
      memory = null;
    }
    const zoneTarget = battleRoyale.zoneSteeringTarget(bot.id, now);
    let distantContact = null;
    if (!visibleEnemies.length && typeof perception.nearestVisibleEnemy === "function") {
      if ((state.nextDistantContactAt ?? 0) <= now) {
        const contactScanRange = Math.max(105, Math.min(155, preMaxRange));
        const fresh = perception.nearestVisibleEnemy(bot.id, contactScanRange, { now });
        const freshValid = fresh && (!injury?.isDowned(fresh.entityId) || (!calmPostKnockdown && !enemyHasStandingTeammateNearby(fresh.entityId, 200)));
        state.nextDistantContactAt = now + 350;
        state.distantContact = freshValid && fresh?.transform ? {
          entityId: fresh.entityId,
          x: fresh.transform.x,
          y: fresh.transform.y,
          z: fresh.transform.z,
          seenAt: now,
          expiresAt: now + 700,
        } : null;
      }
      distantContact = state.distantContact?.expiresAt > now ? state.distantContact : null;
    } else if (visibleEnemies.length) {
      state.distantContact = null;
      state.nextDistantContactAt = now + 350;
    }
    const contactInterest = distantContact
      ? { kind: "visual-contact-interest", ...distantContact }
      : null;
    if (distantContact && bot.humanSquad) {
      shareTargetWithSquadmate(bot.id, distantContact.entityId, distantContact, now, 2200);
    }
    if (bot.humanSquad && !visibleEnemies.length && rallyInterest && memory) {
      const humanEntity = entities.get(bot.humanSquad);
      const humanTransform = humanEntity?.alive ? ctx.components.get(humanEntity.id, "Transform") : null;
      if (
        humanTransform
        && (distance3(humanTransform, memory.transform) > 22
          || buildingIdAt(humanTransform) !== buildingIdAt(memory.transform))
      ) {
        clearMemory(state);
        memory = null;
      }
    }
    const baseInterest = !visibleEnemies.length && !bot.humanSquad
      ? (contactInterest ?? interest.targetFor(bot.id, transform, now))
      : contactInterest;

    if (!bot.humanSquad && buildingAmbushBehavior(
      bot,
      transform,
      state,
      standingEnemies,
      baseInterest,
      distantContact,
      memory,
      now,
    )) {
      return;
    }

    const squadLootInterest = !visibleEnemies.length && !bot.humanSquad
      ? squadBuildingLootInterest(bot.id, transform, state, now)
      : null;

    if (calmPostKnockdown && squadLootInterest) {
      moveTowardPosition(bot, transform, state, squadLootInterest, now, {
        sprint: false,
        thinkDelay: 120,
        stopDistance: 1.4,
      });
      tryOpenNearbyCrate(bot, transform, state, now);
      return;
    }

    const freeRoamInterest = !visibleEnemies.length && !bot.humanSquad
      ? tacticalFreeRoamInterest(bot.id, transform, state, now)
      : null;

    const prioritizeHumanEscort = Boolean(
      bot.humanSquad
      && rallyInterest?.partnerGoal === "escort-human"
      && (rallyInterest.separatedByStructure || Number(rallyInterest.distToHuman) >= 7.5),
    );
    const interestTarget = !visibleEnemies.length
      ? ((prioritizeHumanEscort ? rallyInterest : null)
        ?? contactInterest
        ?? (rallyInterest?.partnerGoal === "outnumbered-converge" ? rallyInterest : null)
        ?? (bot.humanSquad && rallyInterest ? rallyInterest : null)
        ?? (squadLootInterest?.priorityVisit ? squadLootInterest : null)
        ?? (baseInterest?.kind === "sound-interest" || baseInterest?.priorityVisit
          ? baseInterest
          : (rallyInterest ?? squadLootInterest ?? freeRoamInterest ?? baseInterest)))
      : null;
    const previousDecision = brain.commitmentFor(bot.id);
    const traversal = traversalFor(
      transform,
      visibleEnemies,
      memory,
      interestTarget,
      zoneTarget,
      previousDecision,
    );
    const investigationReached = previousDecision?.goal === "investigate"
      && previousDecision.target
      && distance3(transform, previousDecision.target) <= BOT_INVESTIGATION_REACHED_DISTANCE;

    const matchState = battleRoyale.status(now);
    const finalShowdown = matchState.phase === "active"
      && matchState.alive > 1 && matchState.alive <= 3
      && matchState.zone.radius <= 35.01;
    if (finalShowdown && (!zoneTarget || zoneTarget.distance <= matchState.zone.radius)) {
      if (visibleEnemies.length) {
        const nearest = visibleEnemies[0];
        const sdInv = ctx.components.get(bot.id, "Weapons");
        const sdWeaponId = sdInv?.items?.[sdInv.selected]?.id ?? "pistol";
        const sdRange = weaponStandoffRange(sdWeaponId, 7);
        if (executeEngage(bot, transform, state, {
          goal: "engage", targetEntityId: nearest.entityId,
          desiredRange: sdRange,
          tactic: Number(nearest.distance) < sdRange - 2 ? "space" : "press",
        }, visibleEnemies, now)) return;
      } else {
        const nearest = perception.nearestEnemy?.(bot.id, 140, { humanPriority: 1 });
        const nearestValid = nearest && (!injury?.isDowned(nearest.entityId) || !enemyHasStandingTeammateNearby(nearest.entityId, 200));
        if (nearestValid && nearest?.transform) {
          if (moveTowardPosition(bot, transform, state, nearest.transform, now, {
            sprint: true, thinkDelay: 135, stopDistance: 8,
          })) return;
        }
      }
    }

    const aiDecisions = ctx.services.has("ai-enemy-decisions")
      ? ctx.services.get("ai-enemy-decisions")
      : null;
    const aiCmd = aiDecisions?.commandFor?.(bot.id, now) ?? null;

    let decision = brain.decide(bot.id, {
      visibleEnemies,
      memory,
      zoneTarget,
      interestTarget,
      traversal,
      investigationReached,
    }, now);

    if (aiCmd && decision) {
      if (aiCmd.moveChoice === "retreat_heal") {
        const armorState = armorService?.describe?.(bot.id);
        if (armorService && armorState && !armorState.plating && armorState.reservePlates > 0 && armorState.current < armorState.maximum * 0.7) {
          armorService.startFullPlating(bot.id, now);
        }
      }
      if (aiCmd.moveChoice === "move_zone" && zoneTarget) {
        decision = { goal: "zone", target: zoneTarget, aiCmd };
      } else if (aiCmd.moveChoice === "regroup_squad" && !visibleEnemies.length) {
        const humanAlly = bot.humanSquad ? entities.get(bot.humanSquad) : null;
        const humanAllyTransform = humanAlly?.alive ? ctx.components.get(humanAlly.id, "Transform") : null;
        const standMates = squadTeammatesFor(bot.id, { includeHuman: true, includeDowned: false });
        const rallyDest = humanAllyTransform ?? standMates[0]?.transform ?? null;
        if (rallyDest && distance3(transform, rallyDest) > 5.5) {
          decision = {
            goal: "investigate",
            target: {
              kind: "squad-rally-interest",
              partnerGoal: "escort-human",
              x: Number(rallyDest.x) || 0,
              y: Number(rallyDest.y) || 0,
              z: Number(rallyDest.z) || 0,
            },
            aiCmd,
          };
        } else {
          decision = { ...decision, aiCmd };
        }
      } else if (visibleEnemies.length) {
        let chosen = visibleEnemies[0];
        if (aiCmd.targetChoice === "attacker" && state.lastDamagedById && (now - (state.lastDamagedAt ?? 0) <= 5000)) {
          chosen = visibleEnemies.find((e) => e.entityId === state.lastDamagedById) ?? chosen;
        } else if (aiCmd.targetChoice === "priority_threat" || aiCmd.targetChoice === "human_player") {
          if (aiCmd.isAlly || bot.humanSquad) {
            const allyHuman = bot.humanSquad ? entities.get(bot.humanSquad) : null;
            const allyHumanTransform = allyHuman?.alive ? ctx.components.get(allyHuman.id, "Transform") : null;
            if (allyHumanTransform) {
              chosen = [...visibleEnemies].sort((a, b) => (
                distance3(a.transform, allyHumanTransform) - distance3(b.transform, allyHumanTransform)
              ))[0] ?? chosen;
            }
          } else {
            chosen = visibleEnemies.find((e) => !entities.get(e.entityId)?.bot) ?? chosen;
          }
        } else if (aiCmd.targetChoice === "weakest") {
          chosen = [...visibleEnemies].sort((a, b) => {
            const aTotal = (ctx.components.get(a.entityId, "Health")?.current ?? 200)
              + (ctx.components.get(a.entityId, "Armor")?.current ?? 0);
            const bTotal = (ctx.components.get(b.entityId, "Health")?.current ?? 200)
              + (ctx.components.get(b.entityId, "Armor")?.current ?? 0);
            return aTotal - bTotal || a.distance - b.distance;
          })[0] ?? chosen;
        }
        if (aiCmd.moveChoice === "retreat_heal") {
          decision = {
            goal: "evade",
            targetEntityId: chosen.entityId,
            returnFire: aiCmd.fireChoice !== "hold_fire",
            moveTarget: zoneTarget ?? null,
            aiCmd,
          };
        } else {
          let tactic = decision.tactic ?? "flank";
          let desiredRange = decision.desiredRange ?? 10;
          if (aiCmd.moveChoice === "advance_direct") {
            tactic = "press";
            desiredRange = 5.5;
          } else if (aiCmd.moveChoice === "flank_left") {
            state.strafeDirection = -1;
            tactic = "flank";
          } else if (aiCmd.moveChoice === "flank_right") {
            state.strafeDirection = 1;
            tactic = "flank";
          } else if (aiCmd.moveChoice === "hold_cover") {
            tactic = "hold";
            desiredRange = Math.max(8, Number(chosen.distance) || 12);
          } else if (aiCmd.moveChoice === "kite_back") {
            tactic = "space";
            desiredRange = Math.max(22, Number(desiredRange) || 22);
          } else if (aiCmd.moveChoice === "regroup_squad") {
            tactic = "flank";
            desiredRange = Math.max(8, Number(desiredRange) || 10);
          }
          decision = {
            goal: "engage",
            targetEntityId: chosen.entityId,
            desiredRange,
            tactic,
            aiCmd,
          };
        }
      } else {
        decision = { ...decision, aiCmd };
      }
    }

    const focusActive = Boolean(
      !visibleEnemies.length
      && state.combatFocus?.until > now
      && entities.get(state.combatFocus.entityId)?.alive
      && !injury?.isDowned(state.combatFocus.entityId),
    );
    if (focusActive && !escortingAcrossStructure && !zoneTarget && !rallyInterest?.partnerGoal?.startsWith("outnumbered") && !aiCmd) {
      const steering = steeringTo(transform, state.combatFocus, 95, { maxRate: 0.85, deadzone: 0.02, gain: 1.75 });
      setNavigatedInput(bot, transform, state, {
        forward: steering.distance > 14 ? 0.65 : 0,
        strafe: 0,
        turn: steering.turn,
        targetAngle: steering.targetAngle,
        sprint: false,
        fireHeld: false,
        aimLock: true,
      }, now);
      state.nextThinkAt = now + 95;
      return;
    }

    if (
      bot.humanSquad
      && !visibleEnemies.length
      && !rallyInterest
      && !memory
      && !distantContact
      && !zoneTarget
    ) {
      const humanEntity = entities.get(bot.humanSquad);
      const humanTransform = humanEntity?.alive ? ctx.components.get(humanEntity.id, "Transform") : null;
      if (humanTransform && distance3(transform, humanTransform) <= 5.5) {
        executeEscortOverwatch(bot, transform, state, humanTransform, now);
        return;
      }
    }

    if (!decision) return;
    if (decision.goal === "traverse" && routeToward(bot, transform, state, decision.route, now, 95)) return;
    if ((decision.goal === "engage" || decision.goal === "defend")
      && executeEngage(bot, transform, state, decision, visibleEnemies, now)) return;
    if (decision.goal === "evade" && executeEvade(bot, transform, state, decision, visibleEnemies, now)) return;
    if (decision.goal === "zone" && decision.target) {
      if (moveTowardPosition(bot, transform, state, decision.target, now, { sprint: true, thinkDelay: 180 })) return;
    }
    if (decision.goal === "hunt" && executeHunt(bot, transform, state, decision, now)) return;
    if ((decision.goal === "investigate" || decision.goal === "search") && decision.target) {
      const isEscort = decision.target.partnerGoal === "escort-human";
      const isContinuous = Boolean(
        decision.target.continuousPatrol
        || decision.target.kind === "free-roam-interest"
        || decision.target.kind === "explore-interest",
      );
      if (moveTowardPosition(bot, transform, state, decision.target, now, {
        sprint: (decision.goal === "investigate" && decision.target.kind === "sound-interest")
          || Boolean(decision.target.patrolSprint)
          || (isContinuous && distance2(transform, decision.target) > 20),
        thinkDelay: isEscort ? 85 : (decision.goal === "search" ? 120 : (decision.target.kind === "sound-interest" ? 105 : 140)),
        stopDistance: isEscort ? 1.25 : (isContinuous ? 0.25 : (decision.goal === "search" ? 1.25 : 1.7)),
        sprintDistance: isEscort ? 2.2 : 5,
      })) return;
    }
    executeRoam(bot, transform, state, now);
  }

  const api = {
    combatNet,
    nodeGrid,
    neuralNetSummary: () => combatNet.summary(),
    tacticalGridSummary: () => nodeGrid.summary(),
    squadPartnerId,
    squadRoleFor,
    squadTeammatesFor,
    activeSquadPartner: (botId) => activeSquadPartner(botId),
    tryOpenNearbyCrate: (bot, transform, state, now = Date.now()) => tryOpenNearbyCrate(bot, transform, state, now),
    squadBuildingLootInterest: (botId, transform, state, now = Date.now()) => squadBuildingLootInterest(botId, transform, state, now),
    tick(_dt, now = Date.now()) {
      if (!battleRoyale.isActive()) return;
      if (tutorial) {
        for (const bot of bots.all()) {
          const state = ctx.components.get(bot.id, "Bot");
          const directive = tutorial.botDirective?.(bot.id) ?? { mode: "passive", targetId: null };
          if (directive.mode === "break-armor" || directive.mode === "down-player") {
            const target = entities.get(directive.targetId);
            const transform = ctx.components.get(bot.id, "Transform");
            const targetTransform = ctx.components.get(directive.targetId, "Transform");
            if (bot.alive && target?.alive && transform && targetTransform) {
              const steering = steeringTo(transform, targetTransform);
              movement.setInput(bot.id, {
                forward: 0,
                strafe: 0,
                turn: steering.turn,
                sprint: false,
                fireHeld: steering.aligned,
              });
              if (state) {
                state.reactionUntil = 0;
                state.nextThinkAt = now + 50;
              }
              continue;
            }
          }
          movement.setInput(bot.id, {});
          if (state) state.reactionUntil = 0;
        }
        return;
      }
      grid.rebuild(now);
      for (const bot of bots.all()) {
        if (!bot.alive) continue;
        const state = ctx.components.get(bot.id, "Bot");
        if (!state || state.vehicleControl) continue;
        if (!getInjury()?.isDowned(bot.id) && now < (state.nextThinkAt ?? 0)) continue;
        think(bot, now);
      }
    },
  };

  ctx.services.provide("bot-combat", api);
}
