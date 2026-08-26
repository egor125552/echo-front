export const BOT_VISIBLE_MEMORY_MS = 10_000;
export const BOT_DAMAGE_MEMORY_MS = 12_000;
export const BOT_SEARCH_REACHED_DISTANCE = 2.2;
export const BOT_INVESTIGATION_REACHED_DISTANCE = 3.2;
export const BOT_REACTION_MIN_MS = 650;
export const BOT_REACTION_SPREAD_MS = 450;
export const BOT_RETURN_FIRE_REACTION_MS = 220;
export const BOT_BURST_MIN_MS = 260;
export const BOT_BURST_SPREAD_MS = 220;
export const BOT_BURST_PAUSE_MIN_MS = 420;
export const BOT_BURST_PAUSE_SPREAD_MS = 480;
export const BOT_STAIR_ENTRY_OFFSET = 1.15;
export const BOT_STAIR_ENTRY_TOLERANCE = 0.32;

export const manifest = {
  id: "bot-combat",
  version: "4.3.1",
  requires: [
    "bot-controller", "bot-perception", "bot-navigation", "battle-royale-bot-interest",
    "bot-brain", "movement", "weapons", "entities", "spatial-grid", "battle-royale",
    "map-test-arena",
  ],
  capabilities: ["services.consume", "services.provide", "components.read", "events.on"],
};

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

function stagedStairRoute(transform, route) {
  if (route?.kind !== "stair") return route;
  const transformY = Number(transform?.y) || 0;
  const routeY = Number(route?.y) || 0;
  const approachingBottomFromEast = (
    transformY < 0.45
    && routeY < 0.2
    && transform.x >= route.x - 0.15
  );
  if (!approachingBottomFromEast) return route;
  const approach = { ...route, x: route.x + BOT_STAIR_ENTRY_OFFSET, stairStage: "align" };
  const centered = Math.abs(transform.z - route.z) <= 0.22;
  if (!centered || distance2(transform, approach) > BOT_STAIR_ENTRY_TOLERANCE) return approach;
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

export async function setup(ctx) {
  const bots = ctx.services.get("bots");
  const perception = ctx.services.get("bot-perception");
  const navigation = ctx.services.get("bot-navigation");
  const interest = ctx.services.get("bot-interest");
  const brain = ctx.services.get("bot-brain");
  const movement = ctx.services.get("movement");
  const entities = ctx.services.get("entities");
  const grid = ctx.services.get("spatial-grid");
  const battleRoyale = ctx.services.get("battle-royale");
  const map = ctx.services.get("map");

  ctx.events.on("combat:damage", ({ targetId, attackerId, now = Date.now() }) => {
    if (!targetId || !attackerId) return;
    const bot = entities.get(targetId);
    const attacker = entities.get(attackerId);
    if (!bot?.bot || !bot.alive || !attacker?.alive) return;
    const state = ctx.components.get(targetId, "Bot");
    const attackerTransform = ctx.components.get(attackerId, "Transform");
    rememberTarget(state, attackerId, attackerTransform, now, BOT_DAMAGE_MEMORY_MS);
    if (!state) return;
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
    if (route?.kind === "stair" || route?.kind === "door") {
      movement.setInput(bot.id, {
        ...input,
        strafe: 0,
        sprint: route.kind === "door" ? Boolean(input.sprint) : false,
      });
      return;
    }
    setNavigatedInput(bot, transform, state, input, now);
  }

  function routeToward(bot, transform, state, route, now, thinkDelay = 120) {
    if (!route) return false;
    openRouteDoor(bot.id, transform, route, now);
    const stagedRoute = stagedStairRoute(transform, route);
    const upperY = Math.max(1, Number(map.building?.upperY) || 3.2);
    const midStair = stagedRoute?.kind === "stair"
      && Number(transform.y) > 0.2
      && Number(transform.y) < upperY - 0.15;
    const preciseRoute = midStair
      ? { ...stagedRoute, z: Number(transform.z) || 0, stairStage: "traverse" }
      : stagedRoute;
    const steering = steeringTo(transform, preciseRoute);
    const headingError = Math.abs(wrapAngle(
      Math.atan2(preciseRoute.x - transform.x, -(preciseRoute.z - transform.z)) - transform.angle,
    ));
    let forward;
    if (preciseRoute.kind === "stair") {
      forward = headingError > 0.28
        ? 0
        : headingError > 0.14
          ? 0.3
          : (preciseRoute.stairStage === "align" ? 0.55 : 0.82);
    } else if (preciseRoute.kind === "door") {
      forward = headingError > 0.55 ? 0 : (headingError > 0.2 ? 0.42 : 1);
    } else {
      forward = headingError > 1.35 ? 0.28 : 1;
    }
    setRouteInput(bot, transform, state, preciseRoute, {
      forward,
      strafe: 0,
      turn: steering.turn,
      sprint: preciseRoute.kind !== "stair" && steering.distance > 18,
      fireHeld: false,
    }, now);
    state.nextThinkAt = now + thinkDelay;
    return true;
  }

  function moveTowardPosition(bot, transform, state, target, now, {
    sprint = false,
    thinkDelay = 150,
    stopDistance = 1.5,
  } = {}) {
    if (!target) return false;
    const route = typeof map.navigationWaypoint === "function"
      ? map.navigationWaypoint(transform, target)
      : null;
    if (routeToward(bot, transform, state, route, now, thinkDelay)) return true;
    const steering = steeringTo(transform, target);
    const headingError = Math.abs(wrapAngle(
      Math.atan2(target.x - transform.x, -(target.z - transform.z)) - transform.angle,
    ));
    setNavigatedInput(bot, transform, state, {
      forward: steering.distance <= stopDistance ? 0 : (headingError > 1.35 ? 0.25 : 1),
      strafe: 0,
      turn: steering.turn,
      sprint: sprint && steering.distance > 5,
      fireHeld: false,
    }, now);
    state.nextThinkAt = now + thinkDelay;
    return true;
  }

  function executeEngage(bot, transform, state, decision, visibleEnemies, now) {
    const visible = visibleEnemies.find((enemy) => enemy.entityId === decision.targetEntityId)
      ?? visibleEnemies[0];
    if (!visible) return false;
    rememberTarget(state, visible.entityId, visible.transform, now, BOT_VISIBLE_MEMORY_MS);
    const steering = steeringTo(transform, visible.transform);
    const desiredRange = Math.max(4, Number(decision.desiredRange) || 8);
    let forward = 0.12;
    let strafe = 0;
    if (decision.tactic === "flank") {
      forward = steering.distance > desiredRange + 3 ? 0.65 : 0.18;
      strafe = state.strafeDirection * 0.9;
    } else if (decision.tactic === "space") {
      forward = steering.distance < desiredRange ? -0.68 : 0.08;
      strafe = state.strafeDirection * 0.5;
    } else {
      forward = steering.distance > desiredRange + 1.5
        ? 1
        : steering.distance < desiredRange - 1.5
          ? -0.38
          : 0.14;
      if (Math.abs(steering.distance - desiredRange) < 4) strafe = state.strafeDirection * 0.5;
    }
    const aimed = steering.aligned && visible.distance <= 28;
    const reacted = reactionReady(bot.id, state, visible.entityId, now);
    const fireHeld = reacted && aimed && burstAllowsFire(bot.id, state, now);
    setNavigatedInput(bot, transform, state, {
      forward,
      strafe,
      turn: steering.turn,
      sprint: steering.distance > desiredRange + 8 && decision.tactic === "press",
      fireHeld,
    }, now);
    state.nextThinkAt = now + 95;
    return true;
  }

  function executeEvade(bot, transform, state, decision, visibleEnemies, now) {
    const attacker = decision.returnFire
      ? visibleEnemies.find((enemy) => enemy.entityId === decision.targetEntityId)
      : null;
    if (attacker) {
      rememberTarget(state, attacker.entityId, attacker.transform, now, BOT_VISIBLE_MEMORY_MS);
      const steering = steeringTo(transform, attacker.transform);
      const reacted = reactionReady(bot.id, state, attacker.entityId, now);
      const fireHeld = reacted && steering.aligned && attacker.distance <= 28
        && burstAllowsFire(bot.id, state, now);
      setNavigatedInput(bot, transform, state, {
        forward: -0.72,
        strafe: state.strafeDirection * 0.48,
        turn: steering.turn,
        sprint: false,
        fireHeld,
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
    });
  }

  function executeHunt(bot, transform, state, decision, now) {
    const target = decision.target;
    if (!target) return false;
    if (distance3(transform, target) <= BOT_SEARCH_REACHED_DISTANCE) {
      clearMemory(state);
      return false;
    }
    return moveTowardPosition(bot, transform, state, target, now, {
      sprint: distance3(transform, target) > 18,
      thinkDelay: 135,
      stopDistance: BOT_SEARCH_REACHED_DISTANCE,
    });
  }

  function executeRoam(bot, transform, state, now) {
    const seed = Number.parseInt(String(bot.id).replace(/\D/g, ""), 10) || 1;
    const phase = (Math.floor(now / 2200) + seed) % 7;
    const turn = phase < 2 ? state.wanderTurn : phase === 6 ? -state.wanderTurn : 0;
    setNavigatedInput(bot, transform, state, {
      forward: 0.82,
      strafe: phase === 5 ? state.strafeDirection * 0.25 : 0,
      turn,
      sprint: phase === 3,
      fireHeld: false,
    }, now);
    state.nextThinkAt = now + 300;
    return true;
  }

  function traversalFor(transform, visibleEnemies, memory, interestTarget, zoneTarget, previousDecision) {
    const upperY = Math.max(1, Number(map.building?.upperY) || 3.2);
    const previousTraversalTarget = previousDecision?.target ?? previousDecision?.resumeTarget ?? null;
    const midStair = previousDecision?.goal === "traverse"
      && previousDecision.route?.kind === "stair"
      && stairRouteMatchesTargetFloor(previousDecision.route, previousTraversalTarget, upperY)
      && Number(transform.y) > 0.02
      && Number(transform.y) < upperY - 0.12;
    if (midStair) {
      return {
        active: true,
        route: previousDecision.route,
        target: previousTraversalTarget,
        committed: true,
      };
    }

    const carriedBehaviorTarget = ["investigate", "search"].includes(previousDecision?.goal)
      ? previousDecision.target
      : (previousDecision?.goal === "traverse" && previousDecision?.resumeTarget
        ? previousDecision.resumeTarget
        : null);
    const freshSoundTarget = interestTarget?.kind === "sound-interest"
      && Number(interestTarget.heardAt) > Number(previousDecision?.heardAt ?? previousDecision?.resumeHeardAt ?? -Infinity)
      ? interestTarget
      : null;
    const target = visibleEnemies[0]?.transform
      ?? memory?.transform
      ?? freshSoundTarget
      ?? carriedBehaviorTarget
      ?? interestTarget
      ?? zoneTarget
      ?? null;
    if (!target || typeof map.navigationWaypoint !== "function") return null;
    let route = map.navigationWaypoint(transform, target);
    if (route?.kind === "stair" && sameResolvedFloor(transform, target, upperY)) {
      route = null;
    }
    if (!route || (route.kind !== "stair" && route.kind !== "door")) return null;
    return { active: true, route, target, committed: false };
  }

  function think(bot, now) {
    const transform = ctx.components.get(bot.id, "Transform");
    const state = ctx.components.get(bot.id, "Bot");
    if (!transform || !state) return;

    if (now >= (state.tacticUntil ?? 0)) {
      state.strafeDirection = -(state.strafeDirection || 1);
      const seed = Number.parseInt(String(bot.id).replace(/\D/g, ""), 10) || 1;
      state.tacticUntil = now + 700 + (seed % 5) * 140;
    }

    const visibleEnemies = typeof perception.visibleEnemies === "function"
      ? perception.visibleEnemies(bot.id, 28, { now, limit: 8 })
      : [perception.nearestVisibleEnemy(bot.id, 28, { now })].filter(Boolean);

    let memory = rememberedTarget(state, entities, now);
    if (memory && distance3(transform, memory.transform) <= BOT_SEARCH_REACHED_DISTANCE) {
      clearMemory(state);
      memory = null;
    }
    const zoneTarget = battleRoyale.zoneSteeringTarget(bot.id, now);
    const interestTarget = !visibleEnemies.length
      ? interest.targetFor(bot.id, transform, now)
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

    const decision = brain.decide(bot.id, {
      visibleEnemies,
      memory,
      zoneTarget,
      interestTarget,
      traversal,
      investigationReached,
    }, now);

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
      if (moveTowardPosition(bot, transform, state, decision.target, now, {
        sprint: decision.goal === "investigate" && decision.target.kind === "sound-interest",
        thinkDelay: decision.goal === "search" ? 120 : (decision.target.kind === "sound-interest" ? 105 : 165),
        stopDistance: decision.goal === "search" ? 1.25 : 1.7,
      })) return;
    }
    executeRoam(bot, transform, state, now);
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
