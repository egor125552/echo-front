export const BOT_THREAT_MEMORY_MS = 3_500;
export const BOT_SOUND_SEARCH_MS = 12_000;
export const BOT_SOUND_SEARCH_REACHED = 1.8;
export const BOT_STAIR_COMMIT_MIN_Y = 0.02;

export const manifest = {
  id: "battle-royale-bot-tactics",
  version: "1.0.0",
  requires: ["bot-brain", "battle-royale-bot-interest", "entities", "map-test-arena"],
  capabilities: ["services.consume", "components.read", "events.on"],
};

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

function searchWaypoints(sound, map) {
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
  const brain = ctx.services.get("bot-brain");
  const interest = ctx.services.get("bot-interest");
  const entities = ctx.services.get("entities");
  const map = ctx.services.get("map");
  const originalDecide = brain.decide.bind(brain);
  const originalTargetFor = interest.targetFor.bind(interest);
  const threats = new Map();
  const lastSounds = new Map();
  const searches = new Map();

  ctx.events.on("combat:damage", ({ targetId, attackerId, now = Date.now() }) => {
    const target = entities.get(targetId);
    const attacker = entities.get(attackerId);
    if (!target?.bot || !target.alive || !attacker?.alive) return;
    threats.set(targetId, {
      attackerId,
      expiresAt: now + BOT_THREAT_MEMORY_MS,
    });
  });

  function clearBot(entityId) {
    threats.delete(entityId);
    lastSounds.delete(entityId);
    searches.delete(entityId);
  }

  ctx.events.on("entity:died", ({ entityId }) => clearBot(entityId));
  ctx.events.on("entity:removed", ({ entityId }) => clearBot(entityId));
  ctx.events.on("entity:respawned", ({ entityId }) => clearBot(entityId));
  ctx.events.on("battle-royale:started", () => {
    threats.clear();
    lastSounds.clear();
    searches.clear();
  });

  interest.targetFor = function tacticalTargetFor(botId, transform, now = Date.now()) {
    const target = originalTargetFor(botId, transform, now);

    if (target?.kind === "sound-interest") {
      const previous = lastSounds.get(botId);
      const fresh = !previous
        || Number(target.heardAt) > Number(previous.heardAt ?? -Infinity)
        || target.sourceId !== previous.sourceId;
      if (fresh) {
        lastSounds.set(botId, { ...target });
        searches.delete(botId);
      }
      return target;
    }

    const heard = lastSounds.get(botId);
    if (!heard) return target;

    let search = searches.get(botId);
    if (!search) {
      if (distance3(transform, heard) > 2.8) return target;
      search = {
        origin: { ...heard },
        points: searchWaypoints(heard, map),
        index: 0,
        expiresAt: now + BOT_SOUND_SEARCH_MS,
      };
      searches.set(botId, search);
    }

    if (now >= search.expiresAt || !search.points.length) {
      searches.delete(botId);
      lastSounds.delete(botId);
      return target;
    }

    while (
      search.index < search.points.length
      && distance3(transform, search.points[search.index]) <= BOT_SOUND_SEARCH_REACHED
    ) {
      search.index += 1;
    }
    if (search.index >= search.points.length) {
      searches.delete(botId);
      lastSounds.delete(botId);
      return target;
    }

    const point = search.points[search.index];
    return {
      kind: "sound-interest",
      phase: "search",
      sourceId: search.origin.sourceId,
      key: search.origin.key,
      priority: Math.max(1, Number(search.origin.priority) || 1),
      confidence: Math.max(2, Number(search.origin.confidence) || 1),
      heardAt: search.origin.heardAt,
      expiresAt: search.expiresAt,
      x: point.x,
      y: point.y,
      z: point.z,
    };
  };

  brain.decide = function tacticalDecide(botId, context = {}, now = Date.now()) {
    const base = originalDecide(botId, context, now);
    if (!base) return base;
    const transform = ctx.components.get(botId, "Transform");
    if (!transform) return base;

    const visible = Array.isArray(context.visibleEnemies) ? context.visibleEnemies : [];
    const threat = threats.get(botId);
    if (threat && threat.expiresAt <= now) threats.delete(botId);
    const activeThreat = threat && threat.expiresAt > now ? threat : null;
    const attacker = activeThreat
      ? visible.find((enemy) => enemy.entityId === activeThreat.attackerId)
      : null;

    // Being shot is an immediate tactical fact. A bot may reposition, but it may
    // not calmly ignore a visible attacker because a long-term utility score said
    // that another plan looked nicer.
    if (attacker) {
      const profile = base.profile ?? brain.profile(botId);
      const desiredRange = Math.max(8, Number(profile?.preferredRange) || 8);
      return {
        ...base,
        goal: "engage",
        score: 1,
        target: attacker,
        targetEntityId: attacker.entityId,
        threatCount: visible.length,
        desiredRange,
        tactic: Number(attacker.distance) < desiredRange - 1 ? "space" : "press",
        defensive: true,
        holdUntil: Math.min(Number(base.holdUntil) || now + 350, now + 350),
      };
    }

    const upperY = Math.max(1, Number(map?.building?.upperY) || 3.2);
    const onStairTransition = Number(transform.y) >= BOT_STAIR_COMMIT_MIN_Y
      && Number(transform.y) < upperY - 0.12;
    if (!onStairTransition) return base;

    // Once the capsule has physically started changing floors, do not let an
    // evade/curiosity re-plan turn it around on the first centimetres of ramp.
    const visibleTarget = visible[0] ?? null;
    if (visibleTarget && Math.abs(Number(visibleTarget.transform?.y) - Number(transform.y)) > 0.8) {
      return {
        ...base,
        goal: "engage",
        target: visibleTarget,
        targetEntityId: visibleTarget.entityId,
        desiredRange: Math.max(8, Number(base.profile?.preferredRange) || 8),
        tactic: "press",
        holdUntil: now + 350,
      };
    }
    if (context.memory?.transform && Math.abs(Number(context.memory.transform.y) - Number(transform.y)) > 0.8) {
      return {
        ...base,
        goal: "hunt",
        target: context.memory.transform,
        memory: context.memory,
        targetEntityId: context.memory.entityId ?? null,
        holdUntil: now + 350,
      };
    }
    return base;
  };
}
