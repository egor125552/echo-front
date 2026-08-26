export const BOT_INTEREST_CAPACITY = 5;
export const BOT_INTEREST_ACTIVATION_RADIUS = 180;
export const BOT_INTEREST_VISIT_MS = 45_000;
export const BOT_INTEREST_COOLDOWN_MS = 25_000;
export const BOT_HEARING_FOOTSTEP_TTL_MS = 7_000;
export const BOT_HEARING_WEAPON_TTL_MS = 8_000;
export const BOT_WEAPON_INVESTIGATION_CAP = 6;
export const BOT_HEARING_REPEAT_WINDOW_MS = 3_000;
export const BOT_HEARING_MAX_CONFIDENCE = 4;
export const BOT_INTEREST_REACHED_DISTANCE = 2.4;

export const manifest = {
  id: "battle-royale-bot-interest",
  version: "1.2.0",
  requires: ["bot-controller", "entities", "teams", "spatial-grid", "map-test-arena"],
  capabilities: [
    "services.consume", "services.provide",
    "components.read", "events.on",
  ],
};

function distance3(a, b) {
  return Math.hypot(
    (Number(a?.x) || 0) - (Number(b?.x) || 0),
    (Number(a?.y) || 0) - (Number(b?.y) || 0),
    (Number(a?.z) || 0) - (Number(b?.z) || 0),
  );
}

function stableHash(value) {
  const text = String(value ?? "");
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function buildWarehouseInterestPoints(map) {
  const building = map?.building;
  if (!building) return [];
  const centerX = (building.minX + building.maxX) / 2;
  const centerZ = (building.minZ + building.maxZ) / 2;
  const upperY = Number(building.upperY) || 0;
  const width = building.maxX - building.minX;
  const depth = building.maxZ - building.minZ;
  const westX = building.minX + width * 0.25;
  const eastX = building.maxX - width * 0.3;
  const northZ = building.minZ + depth * 0.22;
  const southZ = building.maxZ - depth * 0.22;

  return [
    { id: `${building.id}-ground-east`, group: building.id, x: eastX, y: 0, z: southZ },
    { id: `${building.id}-ground-west`, group: building.id, x: westX, y: 0, z: northZ },
    { id: `${building.id}-upper-east-north`, group: building.id, x: eastX, y: upperY, z: northZ },
    { id: `${building.id}-upper-east-south`, group: building.id, x: eastX, y: upperY, z: southZ },
    { id: `${building.id}-upper-west`, group: building.id, x: westX, y: upperY, z: centerZ },
  ];
}

function isInvestigatableSound(key) {
  const value = String(key ?? "");
  return value.startsWith("weapon.") || value.startsWith("footstep.");
}

function soundPriority(sound) {
  if (String(sound?.key ?? "").startsWith("weapon.")) return 3;
  return sound?.gait === "run" ? 1.35 : 1;
}

function soundTtl(sound) {
  return String(sound?.key ?? "").startsWith("weapon.")
    ? BOT_HEARING_WEAPON_TTL_MS
    : BOT_HEARING_FOOTSTEP_TTL_MS;
}

export async function setup(ctx) {
  const bots = ctx.services.get("bots");
  const entities = ctx.services.get("entities");
  const teams = ctx.services.get("teams");
  const grid = ctx.services.get("spatial-grid");
  const map = ctx.services.get("map");
  const points = buildWarehouseInterestPoints(map);
  const assignments = new Map();
  const cooldowns = new Map();
  const heard = new Map();

  function activeAssignmentCount(group, now) {
    let count = 0;
    for (const assignment of assignments.values()) {
      if (assignment.group === group && assignment.expiresAt > now) count += 1;
    }
    return count;
  }

  function clearExpired(botId, now) {
    const assignment = assignments.get(botId);
    if (assignment && assignment.expiresAt <= now) {
      assignments.delete(botId);
      cooldowns.set(botId, now + BOT_INTEREST_COOLDOWN_MS);
    }
    const sound = heard.get(botId);
    if (sound && sound.expiresAt <= now) heard.delete(botId);
  }

  function nextPoint(assignment) {
    const groupPoints = points.filter((point) => point.group === assignment.group);
    if (!groupPoints.length) return null;
    assignment.pointIndex = (assignment.pointIndex + 1) % groupPoints.length;
    assignment.pointId = groupPoints[assignment.pointIndex].id;
    return groupPoints[assignment.pointIndex];
  }

  function pointForAssignment(assignment) {
    return points.find((point) => point.id === assignment?.pointId) ?? null;
  }

  function startVisit(botId, transform, now) {
    if (!points.length) return null;
    if ((cooldowns.get(botId) ?? 0) > now) return null;

    const group = points[0].group;
    if (activeAssignmentCount(group, now) >= BOT_INTEREST_CAPACITY) return null;

    const closestDistance = Math.min(...points.map((point) => distance3(transform, point)));
    if (closestDistance > BOT_INTEREST_ACTIVATION_RADIUS) return null;

    const cycle = Math.floor(now / 30_000);
    if ((stableHash(`${botId}:${cycle}`) % 100) >= 48) return null;

    const groupPoints = points.filter((point) => point.group === group);
    const pointIndex = stableHash(`${botId}:poi`) % groupPoints.length;
    const assignment = {
      group,
      pointId: groupPoints[pointIndex].id,
      pointIndex,
      expiresAt: now + BOT_INTEREST_VISIT_MS,
    };
    assignments.set(botId, assignment);
    return groupPoints[pointIndex];
  }

  function recordSound(sound, now = Date.now()) {
    if (!sound?.entityId || !isInvestigatableSound(sound.key)) return 0;
    const source = entities.get(sound.entityId);
    if (!source?.alive) return 0;
    const radius = Math.max(0, Number(sound.radius) || 0);
    if (radius <= 0) return 0;

    const sourcePosition = {
      x: Number(sound.x) || 0,
      y: Number(sound.y) || 0,
      z: Number(sound.z) || 0,
    };
    const sourceTeam = teams.teamOf(sound.entityId);
    const priority = soundPriority(sound);
    const candidates = [];

    for (const nearby of grid.query(sourcePosition, radius, now)) {
      const bot = nearby.entity;
      if (!bot?.bot || !bot.alive || bot.id === sound.entityId) continue;
      if (sourceTeam && teams.teamOf(bot.id) === sourceTeam) continue;

      const distance = distance3(nearby.transform, sourcePosition);
      const occlusion = typeof map.acousticOcclusionBetween === "function"
        ? Math.max(0, Math.min(1, Number(map.acousticOcclusionBetween(nearby.transform, sourcePosition)) || 0))
        : 0;
      const effectiveRadius = radius * Math.max(0.35, 1 - occlusion * 0.55);
      if (distance > effectiveRadius) continue;
      candidates.push({ bot, distance });
    }

    candidates.sort((a, b) => a.distance - b.distance || String(a.bot.id).localeCompare(String(b.bot.id)));
    const selected = priority >= 3
      ? candidates.slice(0, BOT_WEAPON_INVESTIGATION_CAP)
      : candidates;

    let listeners = 0;
    for (const { bot } of selected) {
      const previous = heard.get(bot.id);
      if (previous && previous.expiresAt > now && previous.priority > priority) continue;
      const repeated = previous
        && previous.sourceId === sound.entityId
        && now - (previous.heardAt ?? -Infinity) <= BOT_HEARING_REPEAT_WINDOW_MS;
      const confidence = repeated
        ? Math.min(BOT_HEARING_MAX_CONFIDENCE, (previous.confidence ?? 1) + 1)
        : 1;
      heard.set(bot.id, {
        kind: "sound-interest",
        sourceId: sound.entityId,
        key: sound.key,
        gait: sound.gait ?? null,
        priority,
        confidence,
        heardAt: now,
        x: sourcePosition.x,
        y: sourcePosition.y,
        z: sourcePosition.z,
        expiresAt: now + soundTtl(sound),
      });
      listeners += 1;
    }
    return listeners;
  }

  function targetFor(botId, transform, now = Date.now()) {
    clearExpired(botId, now);

    const sound = heard.get(botId);
    if (sound) {
      const source = entities.get(sound.sourceId);
      if (!source?.alive || distance3(transform, sound) <= BOT_INTEREST_REACHED_DISTANCE) {
        heard.delete(botId);
      } else {
        return { ...sound };
      }
    }

    let assignment = assignments.get(botId);
    let point = pointForAssignment(assignment);
    if (assignment && !point) {
      assignments.delete(botId);
      assignment = null;
    }

    if (assignment && point && distance3(transform, point) <= BOT_INTEREST_REACHED_DISTANCE) {
      point = nextPoint(assignment);
    }

    if (!assignment) point = startVisit(botId, transform, now);
    if (!point) return null;

    return {
      kind: "poi-interest",
      group: point.group,
      pointId: point.id,
      x: point.x,
      y: point.y,
      z: point.z,
      expiresAt: assignments.get(botId)?.expiresAt ?? now,
    };
  }

  ctx.events.on("sound:spatial", (sound) => {
    const eventNow = Number.isFinite(sound?.now) ? Number(sound.now) : Date.now();
    recordSound(sound, eventNow);
  });
  ctx.events.on("entity:removed", ({ entityId }) => {
    assignments.delete(entityId);
    cooldowns.delete(entityId);
    heard.delete(entityId);
  });
  ctx.events.on("entity:died", ({ entityId }) => {
    assignments.delete(entityId);
    heard.delete(entityId);
  });
  ctx.events.on("entity:respawned", ({ entityId }) => {
    assignments.delete(entityId);
    cooldowns.delete(entityId);
    heard.delete(entityId);
  });

  ctx.services.provide("bot-interest", {
    points,
    recordSound,
    targetFor,
    assignmentFor(botId) { return assignments.get(botId) ?? null; },
    heardFor(botId) { return heard.get(botId) ?? null; },
    activeAssignmentCount(group, now = Date.now()) { return activeAssignmentCount(group, now); },
  });
}
