export const BOT_DECISION_HOLD_MIN_MS = 550;
export const BOT_DECISION_HOLD_SPREAD_MS = 650;

export const manifest = {
  id: "bot-brain",
  version: "1.2.0",
  requires: ["bot-controller", "entities", "battle-royale"],
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

export function chooseUtilityDecision({
  profile,
  ownDurability = 1,
  visibleEnemies = [],
  memory = null,
  zoneTarget = null,
  interestTarget = null,
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
    const score = distance * (1 - weakness * 0.22);
    if (score >= targetScore) continue;
    target = enemy;
    targetScore = score;
  }

  const nearestDistance = target ? Math.max(0.1, Number(target.distance) || 0.1) : Infinity;
  const targetWeakness = target ? 1 - enemyDurability(target) : 0;
  const surrounded = clamp01((threatCount - 1) / 2);
  const closePressure = Number.isFinite(nearestDistance)
    ? clamp01((8 - nearestDistance) / 8)
    : 0;
  const ringPressure = zonePressure(zoneTarget);

  const engageScore = target ? clamp01(
    0.22
    + safeProfile.aggression * 0.48
    + durability * 0.3
    + targetWeakness * 0.18
    - safeProfile.caution * surrounded * 0.34
    - (1 - durability) * 0.34
    - ringPressure * safeProfile.caution * 0.18
  ) : 0;

  const evadeScore = target ? clamp01(
    0.06
    + safeProfile.caution * 0.28
    + (1 - durability) * 0.62
    + surrounded * 0.38
    + closePressure * safeProfile.caution * 0.18
    - safeProfile.aggression * 0.14
  ) : 0;

  const zoneScore = zoneTarget ? clamp01(
    0.38 + ringPressure * 0.48 + safeProfile.caution * 0.18 + (1 - durability) * 0.08
  ) : 0;
  const huntScore = !target && memory ? clamp01(
    0.3 + safeProfile.persistence * 0.52 + durability * 0.12
  ) : 0;
  const interestScore = !target && interestTarget ? clamp01(
    0.22 + safeProfile.curiosity * 0.58 + durability * 0.08
  ) : 0;

  if (zoneTarget && !target) {
    return { goal: "zone", score: zoneScore, target: zoneTarget, threatCount };
  }

  if (target) {
    if (zoneTarget && nearestDistance > 8 && zoneScore > engageScore + 0.04 && zoneScore > evadeScore) {
      return { goal: "zone", score: zoneScore, target: zoneTarget, threatCount };
    }

    if (evadeScore > engageScore + 0.06) {
      return {
        goal: "evade",
        score: evadeScore,
        target,
        threatCount,
        desiredRange: safeProfile.preferredRange + 5,
        tactic: safeProfile.flankBias > 0.62 ? "break-angle" : "withdraw",
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

  if (zoneTarget && zoneScore >= huntScore && zoneScore >= interestScore) {
    return { goal: "zone", score: zoneScore, target: zoneTarget, threatCount: 0 };
  }
  if (memory && huntScore >= interestScore) {
    return { goal: "hunt", score: huntScore, target: memory.transform ?? memory, memory, threatCount: 0 };
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

export async function setup(ctx) {
  const entities = ctx.services.get("entities");
  const battleRoyale = ctx.services.get("battle-royale");
  const commitments = new Map();

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

  function decide(botId, context = {}, now = Date.now()) {
    const entity = entities.get(botId);
    if (!entity?.alive || !battleRoyale.isActive()) return null;
    const transform = ctx.components.get(botId, "Transform");
    if (!transform) return null;

    const profile = botPersonality(botId, weaponId(botId));
    const visibleEnemies = enrichEnemies(context.visibleEnemies);
    const hasVisibleThreat = visibleEnemies.length > 0;
    const urgentZone = Boolean(context.zoneTarget) && !hasVisibleThreat;
    const previous = commitments.get(botId);
    const currentPreviousTarget = previous?.targetEntityId
      ? visibleEnemies.find((enemy) => enemy.entityId === previous.targetEntityId)
      : null;

    const peacefulCommitment = previous && ["roam", "investigate", "hunt", "zone"].includes(previous.goal);
    const mayKeepPeacefulPlan = peacefulCommitment && !hasVisibleThreat && !urgentZone;
    const mayKeepCombatPlan = Boolean(currentPreviousTarget)
      && (previous?.goal === "engage" || previous?.goal === "evade");

    if (previous && now < previous.holdUntil && (mayKeepPeacefulPlan || mayKeepCombatPlan)) {
      if (currentPreviousTarget) {
        const refreshed = { ...previous, target: currentPreviousTarget, profile };
        if (refreshed.goal === "evade") {
          refreshed.moveTarget = retreatPoint(transform, currentPreviousTarget, profile);
        }
        return refreshed;
      }
      return { ...previous, profile };
    }

    const raw = chooseUtilityDecision({
      profile,
      ownDurability: ownDurability(botId),
      visibleEnemies,
      memory: context.memory,
      zoneTarget: context.zoneTarget,
      interestTarget: context.interestTarget,
    });

    const cycle = stableHash(`${botId}:${Math.floor(now / 250)}`);
    const holdUntil = now + BOT_DECISION_HOLD_MIN_MS + (cycle % (BOT_DECISION_HOLD_SPREAD_MS + 1));
    const decision = {
      ...raw,
      targetEntityId: raw.target?.entityId ?? raw.memory?.entityId ?? null,
      holdUntil,
      profile,
    };
    if (decision.goal === "evade" && decision.target) {
      decision.moveTarget = retreatPoint(transform, decision.target, profile);
    }
    commitments.set(botId, decision);
    return decision;
  }

  ctx.events.on("combat:damage", ({ targetId }) => {
    const entity = entities.get(targetId);
    if (entity?.bot) commitments.delete(targetId);
  });
  ctx.events.on("entity:died", ({ entityId }) => commitments.delete(entityId));
  ctx.events.on("entity:removed", ({ entityId }) => commitments.delete(entityId));
  ctx.events.on("entity:respawned", ({ entityId }) => commitments.delete(entityId));
  ctx.events.on("battle-royale:started", () => commitments.clear());

  ctx.services.provide("bot-brain", {
    decide,
    profile(botId) { return botPersonality(botId, weaponId(botId)); },
    commitmentFor(botId) { return commitments.get(botId) ?? null; },
  });
}
