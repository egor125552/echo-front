export const BOT_DECISION_HOLD_MIN_MS = 550;
export const BOT_DECISION_HOLD_SPREAD_MS = 650;
export const BOT_THREAT_MEMORY_MS = 3_500;
export const BOT_DEFENSIVE_RESPONSE_MS = 900;
export const BOT_DEFENSIVE_RESPONSE_COOLDOWN_MS = 2_500;
export const BOT_SOUND_SEARCH_MS = 12_000;
export const BOT_SOUND_SEARCH_REACHED = 1.8;

export const manifest = {
  id: "bot-brain",
  version: "2.1.0",
  requires: ["bot-controller", "entities", "battle-royale", "map-test-arena", "bot-state-machine"],
  capabilities: ["services.consume", "services.provide", "components.read", "events.on"],
};

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function stableHash(value) {
  let hash = 2166136261;
  for (const char of String(value ?? "")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function trait(botId, salt, min, max) {
  const unit = (stableHash(`${botId}:${salt}`) % 1001) / 1000;
  return min + (max - min) * unit;
}

export function botPersonality(botId, weaponId = "pistol") {
  const rifle = weaponId === "rifle";
  return Object.freeze({
    aggression: trait(botId, "aggression", 0.28, 0.9),
    caution: trait(botId, "caution", 0.3, 0.92),
    curiosity: trait(botId, "curiosity", 0.28, 0.9),
    persistence: trait(botId, "persistence", 0.3, 0.92),
    preferredRange: rifle
      ? trait(botId, "range", 10.5, 16)
      : trait(botId, "range", 5.5, 9.5),
    flankBias: trait(botId, "flank", 0.25, 0.95),
  });
}

function enemyDurability(enemy) {
  const health = Math.max(0, Number(enemy?.health) || 0);
  const armor = Math.max(0, Number(enemy?.armor) || 0);
  const maxHealth = Math.max(1, Number(enemy?.healthMax) || 200);
  const maxArmor = Math.max(0, Number(enemy?.armorMax) || 150);
  return clamp01((health + armor) / Math.max(1, maxHealth + maxArmor));
}

function zonePressure(zoneTarget) {
  if (!zoneTarget) return 0;
  const distance = Math.max(0, Number(zoneTarget.distance) || 0);
  const radius = Math.max(1, Number(zoneTarget.radius) || 1);
  return clamp01((distance - radius * 0.72) / (radius * 0.28));
}

function soundInterestScore(profile, ownDurability, interestTarget) {
  if (interestTarget?.kind !== "sound-interest") return null;
  const confidence = clamp01((Number(interestTarget.confidence) || 1) / 4);
  const priority = clamp01((Number(interestTarget.priority) || 1) / 3);
  return clamp01(
    0.48
    + profile.curiosity * 0.24
    + ownDurability * 0.05
    + confidence * 0.16
    + priority * 0.12
  );
}

export function chooseUtilityDecision({
  profile,
  ownDurability = 1,
  visibleEnemies = [],
  memory = null,
  zoneTarget = null,
  interestTarget = null,
  underFire = false,
  threatTargetId = null,
} = {}) {
  const safeProfile = profile ?? botPersonality("bot");
  const durability = clamp01(ownDurability);
  const visible = Array.isArray(visibleEnemies) ? visibleEnemies : [];
  const threatCount = visible.length;

  let target = null;
  let targetScore = Infinity;
  for (const enemy of visible) {
    const distance = Math.max(0.1, Number(enemy.distance) || 999);
    const weakness = 1 - enemyDurability(enemy);
    const attackerPriority = underFire && threatTargetId && enemy.entityId === threatTargetId ? 0.42 : 1;
    const score = distance * (1 - weakness * 0.22) * attackerPriority;
    if (score >= targetScore) continue;
    target = enemy;
    targetScore = score;
  }

  const nearestDistance = target ? Math.max(0.1, Number(target.distance) || 0.1) : Infinity;
  const targetWeakness = target ? 1 - enemyDurability(target) : 0;
  const surrounded = clamp01((threatCount - 1) / 2);
  const closePressure = Number.isFinite(nearestDistance)
    ? clamp01((10 - nearestDistance) / 10)
    : 0;
  const rangeAdvantage = target && nearestDistance <= safeProfile.preferredRange + 2 ? 1 : 0;
  const ringPressure = zonePressure(zoneTarget);
  const defendingAgainstAttacker = Boolean(
    underFire && target && (!threatTargetId || target.entityId === threatTargetId),
  );

  const engageScore = target ? clamp01(
    0.12
    + safeProfile.aggression * 0.48
    + durability * 0.16
    + targetWeakness * 0.28
    + rangeAdvantage * 0.08
    + closePressure * 0.1
    + (defendingAgainstAttacker ? 0.3 : 0)
    - safeProfile.caution * 0.18
    - surrounded * safeProfile.caution * 0.3
    - (1 - durability) * 0.24
    - ringPressure * safeProfile.caution * 0.16
  ) : 0;

  const evadeScore = target ? clamp01(
    0.12
    + safeProfile.caution * 0.34
    + (1 - safeProfile.aggression) * 0.22
    + (1 - durability) * 0.58
    + surrounded * 0.36
    - targetWeakness * 0.16
    - rangeAdvantage * safeProfile.aggression * 0.08
    - (defendingAgainstAttacker ? 0.12 : 0)
  ) : 0;

  const zoneScore = zoneTarget ? clamp01(
    0.38 + ringPressure * 0.48 + safeProfile.caution * 0.18 + (1 - durability) * 0.08
  ) : 0;
  const huntScore = !target && memory ? clamp01(
    0.3 + safeProfile.persistence * 0.52 + durability * 0.12
  ) : 0;
  const heardScore = !target ? soundInterestScore(safeProfile, durability, interestTarget) : null;
  const isSoundInterest = interestTarget?.kind === "sound-interest";
  const interestScore = !target && interestTarget
    ? (heardScore ?? clamp01(0.22 + safeProfile.curiosity * 0.58 + durability * 0.08))
    : 0;

  if (zoneTarget && !target) {
    const urgentZoneScore = zoneScore + (ringPressure > 0.65 ? 0.16 : 0);
    if (urgentZoneScore >= huntScore && urgentZoneScore >= interestScore) {
      return { goal: "zone", score: zoneScore, target: zoneTarget, threatCount };
    }
  }

  if (target) {
    if (
      zoneTarget
      && !defendingAgainstAttacker
      && nearestDistance > 8
      && zoneScore > engageScore + 0.04
      && zoneScore > evadeScore
    ) {
      return { goal: "zone", score: zoneScore, target: zoneTarget, threatCount };
    }

    if (evadeScore > engageScore + 0.03) {
      return {
        goal: "evade",
        score: evadeScore,
        target,
        threatCount,
        desiredRange: safeProfile.preferredRange + 5,
        tactic: safeProfile.flankBias > 0.62 ? "break-angle" : "withdraw",
        returnFire: defendingAgainstAttacker || nearestDistance <= 10,
      };
    }
    return {
      goal: "engage",
      score: engageScore,
      target,
      threatCount,
      desiredRange: safeProfile.preferredRange,
      tactic: safeProfile.flankBias > 0.68 && nearestDistance < safeProfile.preferredRange + 4
        ? "flank"
        : (nearestDistance < safeProfile.preferredRange - 2 ? "space" : "press"),
    };
  }

  if (isSoundInterest && interestScore > huntScore) {
    return { goal: "investigate", score: interestScore, target: interestTarget, threatCount: 0 };
  }
  if (memory) {
    return { goal: "hunt", score: huntScore, target: memory.transform ?? memory, memory, threatCount: 0 };
  }
  if (zoneTarget) {
    return { goal: "zone", score: zoneScore, target: zoneTarget, threatCount: 0 };
  }
  if (interestTarget) {
    return { goal: "investigate", score: interestScore, target: interestTarget, threatCount: 0 };
  }
  return { goal: "roam", score: 0.2 + safeProfile.curiosity * 0.15, target: null, threatCount: 0 };
}

function retreatPoint(transform, enemy, profile) {
  const dx = (transform.x ?? 0) - (enemy?.transform?.x ?? enemy?.x ?? 0);
  const dz = (transform.z ?? 0) - (enemy?.transform?.z ?? enemy?.z ?? 0);
  const length = Math.hypot(dx, dz) || 1;
  const ux = dx / length;
  const uz = dz / length;
  const lateral = profile.flankBias > 0.55 ? 1 : -1;
  const sideX = -uz * lateral;
  const sideZ = ux * lateral;
  const distance = 9 + profile.caution * 7;
  return {
    x: (transform.x ?? 0) + ux * distance + sideX * 4,
    y: transform.y ?? 0,
    z: (transform.z ?? 0) + uz * distance + sideZ * 4,
  };
}

function distance3(a, b) {
  return Math.hypot(
    (Number(a?.x) || 0) - (Number(b?.x) || 0),
    (Number(a?.y) || 0) - (Number(b?.y) || 0),
    (Number(a?.z) || 0) - (Number(b?.z) || 0),
  );
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function insideBuilding(position, building) {
  return Boolean(building)
    && Number(position?.x) >= building.minX
    && Number(position?.x) <= building.maxX
    && Number(position?.z) >= building.minZ
    && Number(position?.z) <= building.maxZ;
}

function buildSearchWaypoints(sound, map) {
  const building = map?.building;
  if (insideBuilding(sound, building)) {
    const upperY = Number(building.upperY) || 3.2;
    const sameY = Number(sound.y) > upperY / 2 ? upperY : 0;
    const otherY = sameY > 0 ? 0 : upperY;
    const cx = (building.minX + building.maxX) / 2;
    const cz = (building.minZ + building.maxZ) / 2;
    const x0 = clamp(Number(sound.x) || cx, building.minX + 2, building.maxX - 2);
    const z0 = clamp(Number(sound.z) || cz, building.minZ + 2, building.maxZ - 2);
    const points = [
      { x: x0, y: sameY, z: clamp(z0 + 5, building.minZ + 2, building.maxZ - 2) },
      { x: clamp(x0 - 6, building.minX + 2, building.maxX - 2), y: sameY, z: z0 },
      { x: cx, y: sameY, z: cz },
      { x: clamp(x0 + 6, building.minX + 2, building.maxX - 2), y: sameY, z: clamp(z0 - 5, building.minZ + 2, building.maxZ - 2) },
    ];
    if ((Number(sound.priority) || 0) >= 3 || (Number(sound.confidence) || 0) >= 3) {
      points.push(
        { x: cx + 5, y: otherY, z: cz - 5 },
        { x: cx - 5, y: otherY, z: cz + 5 },
      );
    }
    return points;
  }

  const x = Number(sound.x) || 0;
  const y = Number(sound.y) || 0;
  const z = Number(sound.z) || 0;
  return [
    { x: x + 5, y, z },
    { x, y, z: z + 5 },
    { x: x - 5, y, z },
    { x, y, z: z - 5 },
    { x: x + 7, y, z: z + 7 },
  ];
}

export async function setup(ctx) {
  const entities = ctx.services.get("entities");
  const battleRoyale = ctx.services.get("battle-royale");
  const map = ctx.services.get("map");
  const stateMachine = ctx.services.get("bot-state-machine");
  const legacyCommitments = new Map();
  const threats = new Map();

  function ownDurability(botId) {
    const health = ctx.components.get(botId, "Health");
    const armor = ctx.components.get(botId, "Armor");
    const current = Math.max(0, Number(health?.current) || 0) + Math.max(0, Number(armor?.current) || 0);
    const maximum = Math.max(1, Number(health?.maximum) || 200) + Math.max(0, Number(armor?.maximum) || 150);
    return clamp01(current / maximum);
  }

  function weaponId(botId) {
    const inventory = ctx.components.get(botId, "Weapons");
    const selected = inventory?.items?.[inventory.selected] ?? null;
    return selected?.id ?? "pistol";
  }

  function enrichEnemies(enemies) {
    return (enemies ?? []).map((enemy) => {
      const health = ctx.components.get(enemy.entityId, "Health");
      const armor = ctx.components.get(enemy.entityId, "Armor");
      return {
        ...enemy,
        health: health?.current ?? 200,
        healthMax: health?.maximum ?? 200,
        armor: armor?.current ?? 0,
        armorMax: armor?.maximum ?? 150,
      };
    });
  }

  function defaultHold(botId, now) {
    const cycle = stableHash(`${botId}:${Math.floor(now / 250)}`);
    return now + BOT_DECISION_HOLD_MIN_MS + (cycle % (BOT_DECISION_HOLD_SPREAD_MS + 1));
  }

  function decorate(botId, raw, profile, now) {
    const decision = {
      ...raw,
      profile,
      targetEntityId: raw.targetEntityId ?? raw.target?.entityId ?? raw.memory?.entityId ?? null,
      heardAt: raw.heardAt ?? raw.target?.heardAt ?? null,
      holdUntil: Number(raw.holdUntil) || defaultHold(botId, now),
    };
    if (decision.goal === "evade" && decision.target && !decision.moveTarget) {
      const transform = ctx.components.get(botId, "Transform");
      if (transform) decision.moveTarget = retreatPoint(transform, decision.target, profile);
    }
    return decision;
  }

  function legacyResolve(botId, candidate, meta) {
    const previous = legacyCommitments.get(botId);
    const sameTarget = previous?.targetEntityId && previous.targetEntityId === candidate.targetEntityId;
    const peaceful = previous && ["roam", "investigate", "hunt", "zone"].includes(previous.goal);
    const keep = previous
      && meta.now < Number(previous.holdUntil || 0)
      && !meta.force
      && ((peaceful && !meta.visibleThreat && !meta.freshSound) || sameTarget);
    if (keep) return { ...previous, profile: candidate.profile };
    legacyCommitments.set(botId, candidate);
    return candidate;
  }

  function activeThreatFor(botId, now) {
    const threat = threats.get(botId);
    if (!threat) return null;
    if (threat.expiresAt <= now) {
      threats.delete(botId);
      return null;
    }
    return threat;
  }

  function continueSearch(botId, machineState, transform, now, urgent) {
    if (machineState?.machineState !== "search" || urgent) return null;
    const previous = machineState.decision;
    if (!previous?.searchPoints?.length || now >= Number(previous.searchUntil || 0)) {
      return { finished: true };
    }
    let index = Number(previous.searchIndex) || 0;
    while (
      index < previous.searchPoints.length
      && distance3(transform, previous.searchPoints[index]) <= BOT_SOUND_SEARCH_REACHED
    ) index += 1;
    if (index >= previous.searchPoints.length) return { finished: true };
    return {
      decision: {
        ...previous,
        goal: "search",
        searchIndex: index,
        target: previous.searchPoints[index],
        holdUntil: previous.searchUntil,
      },
    };
  }

  function decide(botId, context = {}, now = Date.now()) {
    const entity = entities.get(botId);
    if (!entity?.alive || !battleRoyale.isActive()) return null;
    const transform = ctx.components.get(botId, "Transform");
    if (!transform) return null;

    const profile = botPersonality(botId, weaponId(botId));
    const visibleEnemies = enrichEnemies(context.visibleEnemies);
    const machineState = stateMachine.stateFor(botId);
    const previousDecision = machineState.decision ?? legacyCommitments.get(botId) ?? null;
    const threat = activeThreatFor(botId, now);
    const attacker = threat
      ? visibleEnemies.find((enemy) => enemy.entityId === threat.attackerId)
      : null;
    const underFire = Boolean(threat);
    const freshSound = context.interestTarget?.kind === "sound-interest"
      && Number(context.interestTarget.heardAt) > Number(previousDecision?.heardAt ?? -Infinity);
    const visibleThreat = visibleEnemies.length > 0;
    const traversalActive = Boolean(context.traversal?.active && context.traversal?.route);

    const meta = {
      now,
      underFire,
      visibleThreat,
      freshSound,
      traversalActive,
      investigationReached: Boolean(context.investigationReached),
      force: false,
    };

    let candidate;
    const urgent = visibleThreat || underFire || freshSound;

    if (traversalActive) {
      const carriedInvestigation = context.traversal.target?.kind === "sound-interest"
        ? context.traversal.target
        : (previousDecision?.resumeGoal === "investigate" ? previousDecision.resumeTarget : null);
      candidate = decorate(botId, {
        goal: "traverse",
        score: 1,
        target: context.traversal.target,
        route: context.traversal.route,
        targetEntityId: visibleEnemies[0]?.entityId ?? context.memory?.entityId ?? previousDecision?.targetEntityId ?? null,
        resumeGoal: carriedInvestigation ? "investigate" : previousDecision?.resumeGoal ?? null,
        resumeTarget: carriedInvestigation ?? previousDecision?.resumeTarget ?? null,
        resumeHeardAt: carriedInvestigation?.heardAt ?? previousDecision?.resumeHeardAt ?? null,
        holdUntil: now + 450,
      }, profile, now);
      return stateMachine.resolve(botId, candidate, { ...meta, force: true });
    }

    if (
      machineState.machineState === "traverse"
      && previousDecision?.resumeGoal === "investigate"
      && previousDecision.resumeTarget
      && !urgent
    ) {
      candidate = decorate(botId, {
        goal: "investigate",
        score: 1,
        target: previousDecision.resumeTarget,
        heardAt: previousDecision.resumeHeardAt ?? previousDecision.resumeTarget.heardAt ?? null,
        holdUntil: now + 900,
      }, profile, now);
      return stateMachine.resolve(botId, candidate, { ...meta, force: true });
    }

    const search = continueSearch(botId, machineState, transform, now, urgent);
    if (search?.decision) {
      candidate = decorate(botId, search.decision, profile, now);
      return stateMachine.resolve(botId, candidate, meta);
    }

    if (
      machineState.machineState === "investigate"
      && context.investigationReached
      && previousDecision?.target?.kind === "sound-interest"
      && !urgent
    ) {
      const searchPoints = buildSearchWaypoints(previousDecision.target, map);
      if (searchPoints.length) {
        candidate = decorate(botId, {
          goal: "search",
          score: 1,
          searchOrigin: previousDecision.target,
          searchPoints,
          searchIndex: 0,
          searchUntil: now + BOT_SOUND_SEARCH_MS,
          target: searchPoints[0],
          heardAt: previousDecision.heardAt,
          holdUntil: now + BOT_SOUND_SEARCH_MS,
        }, profile, now);
        return stateMachine.resolve(botId, candidate, { ...meta, force: true });
      }
    }

    if (attacker && now < threat.forceUntil) {
      const desiredRange = Math.max(8, Number(profile.preferredRange) || 8);
      candidate = decorate(botId, {
        goal: "defend",
        score: 1,
        target: attacker,
        targetEntityId: attacker.entityId,
        threatCount: visibleEnemies.length,
        desiredRange,
        tactic: Number(attacker.distance) < desiredRange - 1 ? "space" : "press",
        returnFire: true,
        defensive: true,
        holdUntil: Math.min(threat.forceUntil, now + 350),
      }, profile, now);
    } else if (search?.finished && !urgent) {
      candidate = decorate(botId, { goal: "roam", score: 0.3, target: null, holdUntil: now + 650 }, profile, now);
      meta.force = true;
    } else {
      candidate = decorate(botId, chooseUtilityDecision({
        profile,
        ownDurability: ownDurability(botId),
        visibleEnemies,
        memory: context.memory,
        zoneTarget: context.zoneTarget,
        interestTarget: context.interestTarget,
        underFire,
        threatTargetId: threat?.attackerId ?? null,
      }), profile, now);
    }

    if (machineState.orchestration === "legacy") {
      candidate = legacyResolve(botId, candidate, {
        ...meta,
        force: meta.force || underFire || visibleThreat || freshSound,
      });
    }

    return stateMachine.resolve(botId, candidate, meta);
  }

  ctx.events.on("combat:damage", ({ targetId, attackerId, now = Date.now() }) => {
    if (!targetId || !attackerId) return;
    const target = entities.get(targetId);
    const attacker = entities.get(attackerId);
    if (!target?.bot || !target.alive || !attacker?.alive) return;
    const previous = threats.get(targetId);
    const continuing = previous
      && previous.attackerId === attackerId
      && previous.expiresAt > now;
    let forceUntil = now + BOT_DEFENSIVE_RESPONSE_MS;
    let nextForceAt = now + BOT_DEFENSIVE_RESPONSE_COOLDOWN_MS;
    if (continuing && now < previous.nextForceAt) {
      forceUntil = previous.forceUntil;
      nextForceAt = previous.nextForceAt;
    }
    threats.set(targetId, {
      attackerId,
      forceUntil,
      nextForceAt,
      expiresAt: now + BOT_THREAT_MEMORY_MS,
    });
    legacyCommitments.delete(targetId);
  });

  function clearBot(entityId) {
    legacyCommitments.delete(entityId);
    threats.delete(entityId);
  }
  ctx.events.on("entity:died", ({ entityId }) => clearBot(entityId));
  ctx.events.on("entity:removed", ({ entityId }) => clearBot(entityId));
  ctx.events.on("entity:respawned", ({ entityId }) => clearBot(entityId));
  ctx.events.on("battle-royale:started", () => {
    legacyCommitments.clear();
    threats.clear();
  });

  ctx.services.provide("bot-brain", {
    decide,
    profile(botId) { return botPersonality(botId, weaponId(botId)); },
    commitmentFor(botId) {
      const state = stateMachine.stateFor(botId);
      return state.decision ?? legacyCommitments.get(botId) ?? null;
    },
    stateFor(botId) {
      const state = stateMachine.stateFor(botId);
      return {
        ...state,
        profile: botPersonality(botId, weaponId(botId)),
        threat: activeThreatFor(botId, Date.now()),
      };
    },
    threatFor(botId, now = Date.now()) { return activeThreatFor(botId, now); },
  });
}
