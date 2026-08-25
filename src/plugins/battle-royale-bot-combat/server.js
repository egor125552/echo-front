export const BOT_VISIBLE_MEMORY_MS = 10_000;
export const BOT_DAMAGE_MEMORY_MS = 12_000;
export const BOT_SEARCH_REACHED_DISTANCE = 2.2;

export const manifest = {
  id: "bot-combat",
  version: "2.3.0",
  requires: [
    "bot-controller", "bot-perception", "bot-navigation", "battle-royale-bot-interest",
    "movement", "weapons", "entities", "spatial-grid", "battle-royale", "map-test-arena",
  ],
  capabilities: ["services.consume", "services.provide", "components.read", "events.on"],
};

function wrapAngle(value) {
  let angle = value;
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function distance3(a, b) {
  return Math.hypot(
    (a.x ?? 0) - (b.x ?? 0),
    (a.y ?? 0) - (b.y ?? 0),
    (a.z ?? 0) - (b.z ?? 0),
  );
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

export async function setup(ctx) {
  const bots = ctx.services.get("bots");
  const perception = ctx.services.get("bot-perception");
  const navigation = ctx.services.get("bot-navigation");
  const interest = ctx.services.get("bot-interest");
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
    if (route?.kind === "stair") {
      // A stair is already a deliberately selected safe corridor. Generic
      // obstacle avoidance can mistake the ramp/floor transition for a wall
      // and steer the bot sideways off the narrow run, so keep it centered.
      movement.setInput(bot.id, {
        ...input,
        strafe: 0,
        sprint: false,
      });
      return;
    }
    setNavigatedInput(bot, transform, state, input, now);
  }

  function routeToward(bot, transform, state, route, now, thinkDelay = 120) {
    if (!route) return false;
    openRouteDoor(bot.id, transform, route, now);
    const steering = steeringTo(transform, route);
    const headingError = Math.abs(wrapAngle(
      Math.atan2(route.x - transform.x, -(route.z - transform.z)) - transform.angle,
    ));
    setRouteInput(bot, transform, state, route, {
      forward: headingError > 1.35 ? 0.28 : 1,
      strafe: 0,
      turn: steering.turn,
      sprint: route.kind !== "stair" && steering.distance > 18,
      fireHeld: false,
    }, now);
    state.nextThinkAt = now + thinkDelay;
    return true;
  }

  function moveTowardInterest(bot, transform, state, target, now) {
    const route = typeof map.navigationWaypoint === "function"
      ? map.navigationWaypoint(transform, target)
      : null;
    if (routeToward(bot, transform, state, route, now, target.kind === "sound-interest" ? 105 : 165)) {
      return true;
    }

    const steering = steeringTo(transform, target);
    const verticalDifference = Math.abs((target.y ?? 0) - (transform.y ?? 0));
    setNavigatedInput(bot, transform, state, {
      forward: steering.distance > 1.7 ? 1 : 0,
      strafe: 0,
      turn: steering.turn,
      sprint: target.kind === "sound-interest"
        ? steering.distance > 10 && verticalDifference < 1
        : steering.distance > 16 && verticalDifference < 1,
      fireHeld: false,
    }, now);
    state.nextThinkAt = now + (target.kind === "sound-interest" ? 105 : 165);
    return true;
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

    const visible = perception.nearestVisibleEnemy(bot.id, 28, { now });
    if (visible) {
      rememberTarget(state, visible.entityId, visible.transform, now, BOT_VISIBLE_MEMORY_MS);
      const route = typeof map.navigationWaypoint === "function"
        ? map.navigationWaypoint(transform, visible.transform)
        : null;

      // If the map says a door or stair is required, reaching that route is
      // more important than combat strafing. This prevents a bot that spots an
      // upper-floor player from endlessly dancing halfway up the stairs.
      if (routeToward(bot, transform, state, route, now, 95)) return;

      const steering = steeringTo(transform, visible.transform);
      setNavigatedInput(bot, transform, state, {
        forward: visible.distance > 9 ? 1 : visible.distance < 4.5 ? -0.45 : 0.2,
        strafe: visible.distance < 13 ? state.strafeDirection * 0.7 : 0,
        turn: steering.turn,
        sprint: visible.distance > 18,
        fireHeld: steering.aligned && visible.distance <= 28,
      }, now);
      state.nextThinkAt = now + 95;
      return;
    }

    let memory = rememberedTarget(state, entities, now);
    if (memory) {
      const route = typeof map.navigationWaypoint === "function"
        ? map.navigationWaypoint(transform, memory.transform)
        : null;
      if (!route && distance3(transform, memory.transform) <= BOT_SEARCH_REACHED_DISTANCE) {
        clearMemory(state);
        memory = null;
      } else {
        if (routeToward(bot, transform, state, route, now, 135)) return;
        const target = memory.transform;
        const steering = steeringTo(transform, target);
        const verticalDifference = Math.abs((target.y ?? 0) - (transform.y ?? 0));
        setNavigatedInput(bot, transform, state, {
          forward: Math.abs(wrapAngle(Math.atan2(target.x - transform.x, -(target.z - transform.z)) - transform.angle)) > 1.35 ? 0.28 : 1,
          strafe: 0,
          turn: steering.turn,
          sprint: steering.distance > 18 && verticalDifference < 1,
          fireHeld: false,
        }, now);
        state.nextThinkAt = now + 135;
        return;
      }
    }

    // Survival still wins over curiosity. A bot near or outside the ring must
    // return to safety before it investigates a warehouse or a sound cue.
    const zoneTarget = battleRoyale.zoneSteeringTarget(bot.id, now);
    if (zoneTarget) {
      const route = typeof map.navigationWaypoint === "function"
        ? map.navigationWaypoint(transform, zoneTarget)
        : null;
      if (routeToward(bot, transform, state, route, now, 220)) return;
      const steering = steeringTo(transform, zoneTarget);
      setNavigatedInput(bot, transform, state, {
        forward: 1,
        strafe: 0,
        turn: steering.turn,
        sprint: steering.distance > 10,
        fireHeld: false,
      }, now);
      state.nextThinkAt = now + 220;
      return;
    }

    const interestTarget = interest.targetFor(bot.id, transform, now);
    if (interestTarget && moveTowardInterest(bot, transform, state, interestTarget, now)) return;

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
