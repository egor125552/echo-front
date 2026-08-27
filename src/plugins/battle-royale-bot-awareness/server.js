export const BOT_LONG_SIGHT_DISTANCE = 62;
export const BOT_ATTACKER_LOCK_MS = 2_000;
export const BOT_HUMAN_DISTANCE_BIAS = 0.78;
export const BOT_ATTACKER_DISTANCE_BIAS = 0.34;
export const BOT_VERTICAL_SIGHT_TOLERANCE = 1.75;

export const manifest = {
  id: "battle-royale-bot-awareness",
  version: "1.0.1",
  requires: [
    "bot-perception", "bot-brain", "teams", "rapier-physics", "spatial-grid", "entities",
  ],
  capabilities: ["services.consume", "services.provide", "components.read", "events.on"],
};

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}

export async function setup(ctx) {
  const perception = ctx.services.get("bot-perception");
  const brain = ctx.services.get("bot-brain");
  const teams = ctx.services.get("teams");
  const physics = ctx.services.get("physics");
  const grid = ctx.services.get("spatial-grid");
  const entities = ctx.services.get("entities");
  const attackerLocks = new Map();

  function activeAttacker(botId, now = Date.now()) {
    const lock = attackerLocks.get(botId);
    if (!lock) return null;
    if (Number(lock.until) <= Number(now)) {
      attackerLocks.delete(botId);
      return null;
    }
    const attacker = entities.get(lock.attackerId);
    if (!attacker?.alive || teams.teamOf(attacker.id) === teams.teamOf(botId)) {
      attackerLocks.delete(botId);
      return null;
    }
    return lock;
  }

  function worldLineOfSight(from, to) {
    if (!from || !to || typeof physics.raycastWorld !== "function") return false;
    const origin = {
      x: Number(from.x) || 0,
      y: (Number(from.y) || 0) + 1,
      z: Number(from.z) || 0,
    };
    const target = {
      x: Number(to.x) || 0,
      y: (Number(to.y) || 0) + 1,
      z: Number(to.z) || 0,
    };
    const dx = target.x - origin.x;
    const dy = target.y - origin.y;
    const dz = target.z - origin.z;
    const distance = Math.hypot(dx, dy, dz);
    if (distance <= 0.35) return true;
    const hit = physics.raycastWorld(origin, { x: dx, y: dy, z: dz }, Math.max(0.05, distance - 0.28));
    return !hit;
  }

  function awarenessScore(enemy, distance, lock) {
    let score = Math.max(0.1, Number(distance) || 0.1);
    if (!enemy.bot) score *= BOT_HUMAN_DISTANCE_BIAS;
    if (lock?.attackerId === enemy.id) score *= BOT_ATTACKER_DISTANCE_BIAS;
    return score;
  }

  function visibleEnemies(botId, requestedDistance = BOT_LONG_SIGHT_DISTANCE, options = {}) {
    const transform = ctx.components.get(botId, "Transform");
    if (!transform) return [];
    const now = Number(options.now) || Date.now();
    const maxDistance = Math.max(BOT_LONG_SIGHT_DISTANCE, Number(requestedDistance) || 0);
    const requestedLimit = clamp(options.limit ?? 8, 1, 12);
    const ownTeam = teams.teamOf(botId);
    const lock = activeAttacker(botId, now);
    const candidates = [];

    for (const entry of grid.query(transform, maxDistance, now)) {
      const enemy = entry.entity;
      if (!enemy?.alive || enemy.id === botId || teams.teamOf(enemy.id) === ownTeam) continue;
      const vertical = Math.abs((Number(entry.transform.y) || 0) - (Number(transform.y) || 0));
      if (vertical > BOT_VERTICAL_SIGHT_TOLERANCE) continue;
      const distance = Math.hypot(
        (Number(entry.transform.x) || 0) - (Number(transform.x) || 0),
        (Number(entry.transform.z) || 0) - (Number(transform.z) || 0),
      );
      if (distance > maxDistance) continue;
      if (!worldLineOfSight(transform, entry.transform)) continue;
      candidates.push({
        entityId: enemy.id,
        entity: enemy,
        transform: entry.transform,
        distance,
        score: awarenessScore(enemy, distance, lock),
      });
    }

    candidates.sort((a, b) => a.score - b.score || a.distance - b.distance);
    return candidates.slice(0, requestedLimit);
  }

  perception.visibleEnemies = visibleEnemies;
  perception.nearestVisibleEnemy = (botId, maxDistance = BOT_LONG_SIGHT_DISTANCE, options = {}) => (
    visibleEnemies(botId, maxDistance, { ...options, limit: 1 })[0] ?? null
  );

  const originalDecide = brain.decide.bind(brain);
  brain.decide = (botId, context = {}, now = Date.now()) => {
    const visible = Array.isArray(context.visibleEnemies) ? context.visibleEnemies : [];
    const lock = activeAttacker(botId, now);
    const biasedVisible = visible.map((enemy) => ({
      ...enemy,
      distance: Math.max(0.1, Number(enemy.distance) || 0.1)
        * (!enemy.entity?.bot ? BOT_HUMAN_DISTANCE_BIAS : 1)
        * (lock?.attackerId === enemy.entityId ? BOT_ATTACKER_DISTANCE_BIAS : 1),
    }));
    const decision = originalDecide(botId, { ...context, visibleEnemies: biasedVisible }, now);
    const attacker = lock
      ? visible.find((enemy) => enemy.entityId === lock.attackerId)
      : null;
    if (!attacker) return decision;

    const profile = brain.profile(botId);
    const desiredRange = Math.max(8, Number(profile?.preferredRange) || 8);
    return {
      ...(decision ?? {}),
      goal: "defend",
      score: 1,
      target: attacker,
      targetEntityId: attacker.entityId,
      threatCount: visible.length,
      desiredRange,
      tactic: Number(attacker.distance) < desiredRange - 1 ? "space" : "press",
      returnFire: true,
      defensive: true,
      holdUntil: Math.min(Number(lock.until), Number(now) + 350),
      awarenessLock: true,
    };
  };

  ctx.events.on("combat:damage", ({ targetId, attackerId, now = Date.now() }) => {
    if (!targetId || !attackerId) return;
    const target = entities.get(targetId);
    const attacker = entities.get(attackerId);
    if (!target?.bot || !target.alive || !attacker?.alive) return;
    if (teams.teamOf(targetId) === teams.teamOf(attackerId)) return;
    attackerLocks.set(targetId, {
      attackerId,
      startedAt: Number(now) || Date.now(),
      until: (Number(now) || Date.now()) + BOT_ATTACKER_LOCK_MS,
    });
  });

  function clearBot({ entityId } = {}) {
    if (entityId) attackerLocks.delete(entityId);
  }
  ctx.events.on("entity:died", clearBot);
  ctx.events.on("entity:removed", clearBot);
  ctx.events.on("entity:respawned", clearBot);
  ctx.events.on("battle-royale:started", () => attackerLocks.clear());

  ctx.services.provide("bot-awareness", {
    sightDistance: BOT_LONG_SIGHT_DISTANCE,
    attackerLockMs: BOT_ATTACKER_LOCK_MS,
    stateFor(botId, now = Date.now()) {
      return {
        botId,
        sightDistance: BOT_LONG_SIGHT_DISTANCE,
        attacker: activeAttacker(botId, now),
        visible: visibleEnemies(botId, BOT_LONG_SIGHT_DISTANCE, { now, limit: 12 }).map((entry) => ({
          entityId: entry.entityId,
          distance: entry.distance,
          bot: Boolean(entry.entity?.bot),
          score: entry.score,
        })),
      };
    },
  });
}
