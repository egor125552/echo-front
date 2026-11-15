export const BOT_VISIBLE_MEMORY_MS = 10_000;
export const BOT_DAMAGE_MEMORY_MS = 12_000;
export const BOT_SEARCH_REACHED_DISTANCE = 2.2;
export const BOT_INVESTIGATION_REACHED_DISTANCE = 3.2;
export const BOT_REACTION_MIN_MS = 280;
export const BOT_REACTION_SPREAD_MS = 220;
export const BOT_RETURN_FIRE_REACTION_MS = 140;
export const BOT_BURST_MIN_MS = 460;
export const BOT_BURST_SPREAD_MS = 350;
export const BOT_BURST_PAUSE_MIN_MS = 180;
export const BOT_BURST_PAUSE_SPREAD_MS = 280;
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
  optional: ["battle-royale-tutorial", "armor"],
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
    turn: Math.max(-1, Math.min(1, delta * 2.4)),
    aligned: Math.abs(delta) < 0.25,
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

export function normalizeRouteForTarget(transform, target, route, upperY = 3.2) {
  if (route?.kind !== "stair" || !target) return route;
  const targetUpper = Number(target?.y) > upperY / 2;
  const currentY = Number(transform?.y) || 0;
  if (!targetUpper && currentY < BOT_GROUND_RAMP_ESCAPE_Y) return null;
  return route;
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

  function squadRallyInterest(botId, transform, now) {
    const allMates = squadTeammatesFor(botId, { includeHuman: true, includeDowned: false });
    const humanMate = allMates.find((m) => !m.entity.bot);
    if (humanMate) {
      const distToHuman = distance3(transform, humanMate.transform);
      if (distToHuman >= 14 && distToHuman <= 88) {
        const role = squadRoleFor(botId);
        const lateralOffset = role === "flanker" ? 4.0 : -4.0;
        const angle = Number(humanMate.transform.angle) || 0;
        return {
          kind: "squad-rally-interest",
          partnerId: humanMate.id,
          partnerGoal: "escort-human",
          x: (Number(humanMate.transform.x) || 0) + Math.cos(angle) * lateralOffset,
          y: Number(humanMate.transform.y) || 0,
          z: (Number(humanMate.transform.z) || 0) + Math.sin(angle) * lateralOffset,
          expiresAt: now + 1800,
        };
      }
    }
    const partner = activeSquadPartner(botId);
    if (!partner) return null;
    const dist = distance3(transform, partner.transform);
    if (dist < 13 || dist > 82) return null;
    const partnerDecision = brain.commitmentFor?.(partner.id, now) ?? null;
    const partnerInCombat = ["engage", "defend", "hunt"].includes(partnerDecision?.goal);
    if (!partnerInCombat && dist < 22) return null;
    const role = squadRoleFor(botId);
    const lateralOffset = role === "flanker" ? 3.2 : -3.2;
    const targetPos = partnerInCombat && partnerDecision?.target?.transform
      ? partnerDecision.target.transform
      : (partnerInCombat && partnerDecision?.target?.x !== undefined ? partnerDecision.target : partner.transform);
    const angle = Number(partner.transform.angle) || 0;
    const rallyX = (Number(targetPos.x) || 0) + Math.cos(angle) * lateralOffset;
    const rallyZ = (Number(targetPos.z) || 0) + Math.sin(angle) * lateralOffset;
    return {
      kind: "squad-rally-interest",
      partnerId: partner.id,
      partnerGoal: partnerDecision?.goal ?? "roam",
      x: rallyX,
      y: Number(targetPos.y) || 0,
      z: rallyZ,
      expiresAt: now + 1800,
    };
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

  function fireInBurst(botId, state, allowed, now) {
    if (!allowed) return false;
    const inventory = ctx.components.get(botId, "Weapons");
    const selected = inventory?.items?.[inventory.selected];
    if (selected?.id !== "pistol") return true;
    if (now >= (state.nextShotAt ?? 0)) {
      const variation = stableSeed(botId + ":" + state.burstCycle + ":pistol-tap");
      weapons.fire(botId, now, { pressed: true });
      state.nextShotAt = now + 125 + (variation % 95);
    }
    // A pistol bot sends individual shots instead of a held-auto input.
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
    const upperY = Math.max(1, Number(map.building?.upperY) || 3.2);
    let route = typeof map.navigationWaypoint === "function"
      ? map.navigationWaypoint(transform, target)
      : null;
    route = normalizeRouteForTarget(transform, target, route, upperY);
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
    shareTargetWithSquadmate(bot.id, visible.entityId, visible.transform, now, BOT_VISIBLE_MEMORY_MS);

    const partner = activeSquadPartner(bot.id);
    const partnerTargetingSame = Boolean(
      partner
      && distance3(transform, partner.transform) <= 48
      && (partner.state.lastKnownTargetId === visible.entityId
        || brain.commitmentFor?.(partner.id, now)?.targetEntityId === visible.entityId),
    );
    const role = squadRoleFor(bot.id);
    let effectiveTactic = decision.tactic;
    let desiredRange = Math.max(4, Number(decision.desiredRange) || 8);
    if (partnerTargetingSame) {
      const selfDist = distance3(transform, visible.transform);
      const partnerDist = distance3(partner.transform, visible.transform);
      const isLeadBreacher = selfDist + 1.5 < partnerDist || (Math.abs(selfDist - partnerDist) <= 1.5 && role === "breacher");
      state.strafeDirection = isLeadBreacher ? 1 : -1;
      const preserveRescueRole = state.squadCoordinatedAt === now
        && (state.squadRoleActive === "cover" || state.squadRoleActive === "medic-defending");
      state.squadCoordinatedAt = now;
      if (!preserveRescueRole) {
        state.squadRoleActive = isLeadBreacher ? "breacher" : "flanker";
      }
      if (isLeadBreacher) {
        effectiveTactic = "press";
        desiredRange = Math.max(4.5, desiredRange - 1.8);
      } else {
        effectiveTactic = "flank";
        desiredRange = desiredRange + 2.2;
      }
    }

    const steering = steeringTo(transform, visible.transform);
    const aimed = steering.aligned && visible.distance <= 28;
    const reacted = reactionReady(bot.id, state, visible.entityId, now);
    const fireHeld = fireInBurst(bot.id, state, reacted && aimed && burstAllowsFire(bot.id, state, now), now);

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
      const staged = stagedStairRoute(transform, combatRoute);
      const localLegs = worldToLocalMove(
        Number(transform.angle) || 0,
        (Number(staged.x) || 0) - (Number(transform.x) || 0),
        (Number(staged.z) || 0) - (Number(transform.z) || 0),
      );
      movement.setInput(bot.id, {
        forward: Math.max(-0.85, Math.min(0.85, localLegs.forward * 0.82)),
        strafe: combatRoute.kind === "stair" ? 0 : Math.max(-0.75, Math.min(0.75, localLegs.strafe * 0.75)),
        turn: steering.turn,
        sprint: false,
        fireHeld,
      });
      state.nextThinkAt = now + 95;
      return true;
    }

    let forward = 0.12;
    let strafe = 0;
    if (effectiveTactic === "flank") {
      forward = steering.distance > desiredRange + 3 ? 0.68 : 0.22;
      strafe = state.strafeDirection * 0.92;
    } else if (effectiveTactic === "space") {
      forward = steering.distance < desiredRange ? -0.68 : 0.08;
      strafe = state.strafeDirection * 0.5;
    } else {
      forward = steering.distance > desiredRange + 1.5
        ? 1
        : steering.distance < desiredRange - 1.5
          ? -0.38
          : 0.16;
      if (Math.abs(steering.distance - desiredRange) < 4) strafe = state.strafeDirection * 0.52;
    }
    setNavigatedInput(bot, transform, state, {
      forward,
      strafe,
      turn: steering.turn,
      sprint: steering.distance > desiredRange + 8 && effectiveTactic === "press",
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
      shareTargetWithSquadmate(bot.id, attacker.entityId, attacker.transform, now, BOT_VISIBLE_MEMORY_MS);
      const steering = steeringTo(transform, attacker.transform);
      const reacted = reactionReady(bot.id, state, attacker.entityId, now);
      const fireHeld = fireInBurst(bot.id, state,
        reacted && steering.aligned && attacker.distance <= 28
          && burstAllowsFire(bot.id, state, now), now);
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
      const retainedRoute = normalizeRouteForTarget(
        transform,
        previousTraversalTarget,
        previousDecision.route,
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

  function enemyHasStandingTeammateNearby(enemyId, maxDist = 45) {
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
    return Boolean(inv?.items?.some((item) => item.id === "rifle"));
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
    if (
      primaryAlly.reviverId
      && standingSquadBots.some((b) => b.id === primaryAlly.reviverId)
    ) {
      medicBotId = primaryAlly.reviverId;
    } else {
      const scoredBots = standingSquadBots.map((candidate) => {
        const distToAlly = distance3(candidate.transform, primaryAlly.transform);
        const enemyCloseToCandidate = standingEnemies.some(
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
        return executeEngage(bot, transform, state, {
          goal: "engage",
          targetEntityId: immediateThreat.entityId,
          desiredRange: 7,
          tactic: "press",
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
      return executeEngage(bot, transform, state, {
        goal: "engage",
        targetEntityId: targetEnemy.entityId,
        desiredRange: 8,
        tactic: "press",
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

  function think(bot, now) {
    const transform = ctx.components.get(bot.id, "Transform");
    const state = ctx.components.get(bot.id, "Bot");
    if (!transform || !state) return;

    const injury = getInjury();
    if (injury?.isDowned(bot.id)) {
      const downedState = injury.stateFor(bot.id);
      if (downedState?.reviverId) {
        movement.setInput(bot.id, {});
        state.nextThinkAt = now + 80;
        return;
      }
      const standingAllies = squadTeammatesFor(bot.id, { includeHuman: true, includeDowned: false });
      if (standingAllies.length > 0) {
        standingAllies.sort((a, b) => distance3(transform, a.transform) - distance3(transform, b.transform));
        const nearestAlly = standingAllies[0];
        const dist = distance3(transform, nearestAlly.transform);
        if (dist > 2.0 && dist <= 38) {
          const steering = steeringTo(transform, nearestAlly.transform);
          movement.setInput(bot.id, {
            forward: 0.85,
            strafe: 0,
            turn: steering.turn,
            sprint: false,
            fireHeld: false,
          });
          state.nextThinkAt = now + 120;
          return;
        }
      }
      movement.setInput(bot.id, {});
      state.nextThinkAt = now + 120;
      return;
    }

    if (now >= (state.tacticUntil ?? 0)) {
      state.strafeDirection = -(state.strafeDirection || 1);
      const seed = Number.parseInt(String(bot.id).replace(/\D/g, ""), 10) || 1;
      state.tacticUntil = now + 700 + (seed % 5) * 140;
    }

    const inventory = ctx.components.get(bot.id, "Weapons");
    const selected = inventory?.items?.[inventory.selected] ?? null;
    if (selected && selected.ammo <= 4 && selected.reserve > 0) {
      weapons.reload(bot.id, now);
    }

    const allVisibleEnemies = typeof perception.visibleEnemies === "function"
      ? perception.visibleEnemies(bot.id, 28, { now, limit: 8 })
      : [perception.nearestVisibleEnemy(bot.id, 28, { now })].filter(Boolean);
    const standingEnemies = injury
      ? allVisibleEnemies.filter((e) => !injury.isDowned(e.entityId))
      : allVisibleEnemies;
    const finishableDownedEnemies = injury
      ? allVisibleEnemies.filter((e) => injury.isDowned(e.entityId) && !enemyHasStandingTeammateNearby(e.entityId, 45))
      : [];
    const visibleEnemies = standingEnemies.length > 0 ? standingEnemies : finishableDownedEnemies;

    if (visibleEnemies.length) {
      const primary = visibleEnemies[0];
      rememberTarget(state, primary.entityId, primary.transform, now, BOT_VISIBLE_MEMORY_MS);
      shareTargetWithSquadmate(bot.id, primary.entityId, primary.transform, now, BOT_VISIBLE_MEMORY_MS);
    }

    if (coordinateSquadRescue(bot, transform, state, standingEnemies, now)) {
      return;
    }

    if (!visibleEnemies.length && armorService) {
      const armorState = armorService.describe(bot.id);
      if (
        armorState
        && !armorState.plating
        && armorState.reservePlates > 0
        && armorState.current <= armorState.maximum - armorState.plateValue * 0.5
      ) {
        armorService.startFullPlating(bot.id, now);
      }
    } else if (visibleEnemies.length && armorService?.isPlating(bot.id)) {
      armorService.cancelPlating(bot.id, "combat");
    }

    let memory = rememberedTarget(state, entities, now);
    if (memory && injury?.isDowned(memory.entityId) && enemyHasStandingTeammateNearby(memory.entityId, 45)) {
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
        const fresh = perception.nearestVisibleEnemy(bot.id, 105, { now });
        const freshValid = fresh && (!injury?.isDowned(fresh.entityId) || !enemyHasStandingTeammateNearby(fresh.entityId, 45));
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
    const baseInterest = !visibleEnemies.length
      ? (contactInterest ?? interest.targetFor(bot.id, transform, now))
      : null;
    const interestTarget = !visibleEnemies.length
      ? (baseInterest?.kind === "sound-interest" || baseInterest?.priorityVisit
        ? baseInterest
        : (squadRallyInterest(bot.id, transform, now) ?? baseInterest))
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
        if (executeEngage(bot, transform, state, {
          goal: "engage", targetEntityId: nearest.entityId,
          desiredRange: 7, tactic: "press",
        }, visibleEnemies, now)) return;
      } else {
        const nearest = perception.nearestEnemy?.(bot.id, 140, { humanPriority: 1 });
        if (nearest?.transform) {
          if (moveTowardPosition(bot, transform, state, nearest.transform, now, {
            sprint: true, thinkDelay: 135, stopDistance: 8,
          })) return;
        }
      }
    }

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
    squadPartnerId,
    squadRoleFor,
    squadTeammatesFor,
    activeSquadPartner: (botId) => activeSquadPartner(botId),
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
        if (!state || state.vehicleControl || now < (state.nextThinkAt ?? 0)) continue;
        think(bot, now);
      }
    },
  };

  ctx.services.provide("bot-combat", api);
}
