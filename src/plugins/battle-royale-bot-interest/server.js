export const BOT_INTEREST_CAPACITY = 5;
export const BOT_INTEREST_ACTIVATION_RADIUS = 95;
export const BOT_INTEREST_NEAR_RADIUS = 35;
export const BOT_INTEREST_MID_RADIUS = 70;
export const BOT_INTEREST_VISIT_MS = 45_000;
export const BOT_INTEREST_COOLDOWN_MS = 25_000;
export const BOT_HEARING_FOOTSTEP_TTL_MS = 7_000;
export const BOT_HEARING_WEAPON_TTL_MS = 12_000;
export const BOT_WEAPON_INVESTIGATION_CAP = 10;
export const BOT_AIRDROP_INVESTIGATION_CAP = 6;
export const BOT_JUGGERNAUT_INVESTIGATION_CAP = 14;
export const BOT_AIRDROP_INTEREST_RADIUS = 195;
export const BOT_JUGGERNAUT_INTEREST_RADIUS = 560;
export const BOT_AIRDROP_INTEREST_TTL_MS = 24_000;
export const BOT_JUGGERNAUT_INTEREST_TTL_MS = 45_000;
export const BOT_COMBAT_LULL_MS = 24_000;
export const BOT_HUNTER_DISPATCH_COOLDOWN_MS = 28_000;
export const BOT_HEARING_REPEAT_WINDOW_MS = 3_000;
export const BOT_HEARING_MAX_CONFIDENCE = 4;
export const BOT_INTEREST_REACHED_DISTANCE = 2.4;
export const BOT_EXPLORATION_REACHED_DISTANCE = 2.8;
export const BOT_EXPLORATION_MIN_DISTANCE = 20;
export const BOT_EXPLORATION_DISTANCE_SPREAD = 24;
export const BOT_EXPLORATION_MIN_MS = 14_000;
export const BOT_EXPLORATION_TIME_SPREAD_MS = 8_000;
export const BOT_EXPLORATION_PAUSE_MIN_MS = 700;
export const BOT_EXPLORATION_PAUSE_SPREAD_MS = 700;

export const manifest = {
  id: "battle-royale-bot-interest",
  version: "1.6.0",
  requires: ["bot-controller", "entities", "teams", "spatial-grid", "map-test-arena"],
  optional: ["battle-royale", "battle-royale-tutorial", "battle-royale-bot-parachute", "battle-royale-bot-vehicles", "battle-royale-vehicle-fleet"],
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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function insideBuilding(position, building, padding = 0) {
  return Boolean(building)
    && Number(position?.x) >= building.minX - padding
    && Number(position?.x) <= building.maxX + padding
    && Number(position?.z) >= building.minZ - padding
    && Number(position?.z) <= building.maxZ + padding;
}

function insideAnyBuilding(position, map, padding = 0) {
  if (insideBuilding(position, map?.building, padding)) return true;
  for (const building of map?.navigationBuildings ?? []) {
    if (insideBuilding(position, building?.bounds, padding)) return true;
  }
  return false;
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
  return value.startsWith("weapon.") || value.startsWith("footstep.") || value.startsWith("airdrop.");
}

function soundPriority(sound) {
  const key = String(sound?.key ?? "");
  if (key === "airdrop.juggernaut") return 5.0;
  if (key.startsWith("airdrop.")) return 3.4;
  if (key.startsWith("weapon.")) return 3;
  return sound?.gait === "run" ? 1.35 : 1;
}

function soundTtl(sound) {
  const key = String(sound?.key ?? "");
  if (key === "airdrop.juggernaut") return BOT_JUGGERNAUT_INTEREST_TTL_MS;
  if (key.startsWith("airdrop.")) return BOT_AIRDROP_INTEREST_TTL_MS;
  return key.startsWith("weapon.")
    ? BOT_HEARING_WEAPON_TTL_MS
    : BOT_HEARING_FOOTSTEP_TTL_MS;
}

function warehouseVisitChance(distance) {
  if (distance <= BOT_INTEREST_NEAR_RADIUS) return 100;
  if (distance <= BOT_INTEREST_MID_RADIUS) return 70;
  return 35;
}

export async function setup(ctx) {
  const bots = ctx.services.get("bots");
  const entities = ctx.services.get("entities");
  const teams = ctx.services.get("teams");
  const grid = ctx.services.get("spatial-grid");
  const map = ctx.services.get("map");
  const tutorial = ctx.services.has("battle-royale-tutorial")
    ? ctx.services.get("battle-royale-tutorial")
    : null;
  const points = buildWarehouseInterestPoints(map);
  const assignments = new Map();
  const cooldowns = new Map();
  const heard = new Map();
  const exploration = new Map();
  const lastCombatAtByTeam = new Map();
  const lastHunterDispatchByPlayer = new Map();
  let lastLullCheckAt = 0;

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
    const roam = exploration.get(botId);
    if (roam && roam.expiresAt <= now) exploration.delete(botId);
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
    const chance = warehouseVisitChance(closestDistance);
    if ((stableHash(`${botId}:${cycle}`) % 100) >= chance) return null;

    const groupPoints = points.filter((point) => point.group === group);
    const pointIndex = stableHash(`${botId}:poi`) % groupPoints.length;
    const assignment = {
      group,
      pointId: groupPoints[pointIndex].id,
      pointIndex,
      expiresAt: now + BOT_INTEREST_VISIT_MS,
    };
    assignments.set(botId, assignment);
    exploration.delete(botId);
    return groupPoints[pointIndex];
  }

  function safeZoneLimit(now) {
    const br = ctx.services.has("battle-royale") ? ctx.services.get("battle-royale") : null;
    if (!br || typeof br.zoneRadiusAt !== "function") return Infinity;
    const r = Number(br.zoneRadiusAt(now));
    if (!Number.isFinite(r) || r <= 0) return Infinity;
    const buffer = Math.min(70, r * 0.22);
    return Math.max(8, r - buffer - 2);
  }

  function clampInsideZone(point, limit, halfSize, margin) {
    let x = clamp(Number(point?.x) || 0, -halfSize + margin, halfSize - margin);
    let z = clamp(Number(point?.z) || 0, -halfSize + margin, halfSize - margin);
    const dist = Math.hypot(x, z);
    if (Number.isFinite(limit) && dist > limit && dist > 0.01) {
      const scale = (limit * 0.88) / dist;
      x *= scale;
      z *= scale;
    }
    return { x, y: Number(point?.y) || 0, z };
  }

  function nextExplorationTarget(botId, transform, now) {
    const previous = exploration.get(botId);
    const sequence = (previous?.sequence ?? -1) + 1;
    const halfSize = Math.max(40, Number(map?.halfSize) || 400);
    const margin = 12;
    const zoneLimit = safeZoneLimit(now);
    const fromInside = insideAnyBuilding(transform, map, 0.1);
    const minLeg = Number.isFinite(zoneLimit)
      ? Math.min(BOT_EXPLORATION_MIN_DISTANCE, Math.max(7, zoneLimit * 0.45))
      : BOT_EXPLORATION_MIN_DISTANCE;
    const spreadLeg = Number.isFinite(zoneLimit)
      ? Math.min(BOT_EXPLORATION_DISTANCE_SPREAD, Math.max(6, zoneLimit * 0.45))
      : BOT_EXPLORATION_DISTANCE_SPREAD;

    let chosen = null;
    const botEntity = entities.get(botId);
    const squadKey = `${botEntity?.team || botId}`;
    const squadHash = stableHash(`${squadKey}:route-style`);
    const routeStyle = squadHash % 4;
    const effectiveRadius = Number.isFinite(zoneLimit)
      ? Math.min(halfSize - margin, zoneLimit)
      : (halfSize - margin);

    // Distribute squads across the whole map:
    // style 0: perimeter near landmarks/buildings (30-65m outside a building across the map)
    // style 1: mid-ring sector circuit (35-60% of safe zone radius)
    // style 2: wide outer-ring patrol across far map edges (62-88% of safe zone radius)
    // style 3: cross-map forward-biased roam
    if (routeStyle === 0 && !fromInside && effectiveRadius >= 75) {
      const navBuildings = [
        ...(map?.building ? [map.building] : []),
        ...((map?.navigationBuildings ?? []).map((b) => b?.bounds).filter(Boolean)),
      ];
      if (navBuildings.length > 0) {
        const targetB = navBuildings[(squadHash + sequence) % navBuildings.length];
        const cx = ((Number(targetB.minX) || 0) + (Number(targetB.maxX) || 0)) * 0.5;
        const cz = ((Number(targetB.minZ) || 0) + (Number(targetB.maxZ) || 0)) * 0.5;
        const standAngle = (((squadHash + sequence * 67) % 360) * Math.PI) / 180;
        const standDist = 34 + ((squadHash >>> 8) % 32);
        const candidate = clampInsideZone({
          x: cx + Math.cos(standAngle) * standDist,
          y: 0,
          z: cz + Math.sin(standAngle) * standDist,
        }, zoneLimit, halfSize, margin);
        if (!insideAnyBuilding(candidate, map, 1.6) && distance3(transform, candidate) >= minLeg * 0.55) {
          chosen = candidate;
        }
      }
    } else if ((routeStyle === 1 || routeStyle === 2) && !fromInside && effectiveRadius >= 65) {
      const sectorAngle = (((squadHash % 360) + sequence * (routeStyle === 2 ? 47 : 59)) * Math.PI) / 180;
      const ringBand = routeStyle === 2
        ? (0.62 + ((squadHash >>> 9) % 24) / 100)
        : (0.34 + ((squadHash >>> 9) % 24) / 100);
      const radialDist = Math.max(minLeg, effectiveRadius * ringBand);
      const candidate = clampInsideZone({
        x: Math.cos(sectorAngle) * radialDist,
        y: 0,
        z: Math.sin(sectorAngle) * radialDist,
      }, zoneLimit, halfSize, margin);
      if (!insideAnyBuilding(candidate, map, 1.6) && distance3(transform, candidate) >= minLeg * 0.55) {
        chosen = candidate;
      }
    }

    const baseTravelAngle = Number.isFinite(transform?.angle)
      ? (Number(transform.angle) - Math.PI / 2)
      : 0;
    for (let attempt = 0; !chosen && attempt < 12; attempt += 1) {
      const seed = stableHash(`${botId}:explore:${sequence}:${attempt}`);
      const angle = attempt < 7
        ? baseTravelAngle + ((((seed % 65536) / 65536) * 2 - 1) * 1.25)
        : ((seed % 65536) / 65536) * Math.PI * 2;
      const distance = minLeg + ((seed >>> 16) % (Math.floor(spreadLeg) + 1));
      const rawCandidate = {
        x: (Number(transform?.x) || 0) + Math.cos(angle) * distance,
        y: Number(transform?.y) || 0,
        z: (Number(transform?.z) || 0) + Math.sin(angle) * distance,
      };
      const candidate = clampInsideZone(rawCandidate, zoneLimit, halfSize, margin);
      if (!fromInside && insideAnyBuilding(candidate, map, 1.6)) continue;
      if (distance3(transform, candidate) < minLeg * 0.55) continue;
      chosen = candidate;
      break;
    }

    if (!chosen) {
      const fallbackSeed = stableHash(`${botId}:explore-fallback:${sequence}`);
      const angle = ((fallbackSeed % 360) * Math.PI) / 180;
      const rawFallback = {
        x: (Number(transform?.x) || 0) + Math.cos(angle) * minLeg,
        y: Number(transform?.y) || 0,
        z: (Number(transform?.z) || 0) + Math.sin(angle) * minLeg,
      };
      chosen = clampInsideZone(rawFallback, zoneLimit, halfSize, margin);
    }

    const durationSeed = stableHash(`${botId}:explore-time:${sequence}`);
    const target = {
      kind: "explore-interest",
      routeStyle,
      sequence,
      x: chosen.x,
      y: chosen.y,
      z: chosen.z,
      createdAt: now,
      arrivedAt: null,
      expiresAt: now + BOT_EXPLORATION_MIN_MS
        + (durationSeed % (BOT_EXPLORATION_TIME_SPREAD_MS + 1)),
    };
    exploration.set(botId, target);
    return target;
  }

  function explorationTargetFor(botId, transform, now) {
    let target = exploration.get(botId);
    const zoneLimit = safeZoneLimit(now);
    const targetOutsideZone = target
      && Number.isFinite(zoneLimit)
      && Math.hypot(Number(target.x) || 0, Number(target.z) || 0) > zoneLimit + 2;
    if (
      !target
      || target.expiresAt <= now
      || targetOutsideZone
      || distance3(transform, target) <= BOT_EXPLORATION_REACHED_DISTANCE
    ) {
      target = nextExplorationTarget(botId, transform, now);
    }
    return target ? { ...target } : null;
  }

  function recordSound(sound, now = Date.now()) {
    const isAirdropSound = String(sound?.key ?? "").startsWith("airdrop.");
    if ((!sound?.entityId && !isAirdropSound) || !isInvestigatableSound(sound?.key)) return 0;
    if (sound.entityId) {
      const source = entities.get(sound.entityId);
      if (!source?.alive) return 0;
    }
    const radius = Math.max(0, Number(sound.radius) || 0);
    if (radius <= 0) return 0;

    const sourcePosition = {
      x: Number(sound.x) || 0,
      y: Number(sound.y) || 0,
      z: Number(sound.z) || 0,
    };
    const sourceTeam = sound.entityId ? teams.teamOf(sound.entityId) : null;
    if (sourceTeam) lastCombatAtByTeam.set(sourceTeam, now);
    const priority = soundPriority(sound);
    const candidates = [];

    for (const nearby of grid.query(sourcePosition, radius, now)) {
      const bot = nearby.entity;
      if (!bot?.bot || !bot.alive || bot.id === sound.entityId) continue;
      if (isAirdropSound && bot.humanSquad) continue;
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
    const cap = isAirdropSound
      ? BOT_AIRDROP_INVESTIGATION_CAP
      : (priority >= 3 ? BOT_WEAPON_INVESTIGATION_CAP : candidates.length);
    const selected = candidates.slice(0, cap);

    let listeners = 0;
    for (let idx = 0; idx < selected.length; idx += 1) {
      const { bot } = selected[idx];
      const previous = heard.get(bot.id);
      if (previous && previous.expiresAt > now && previous.priority > priority) continue;
      const repeated = previous
        && previous.sourceId === (sound.entityId ?? sound.crateId ?? "airdrop")
        && now - (previous.heardAt ?? -Infinity) <= BOT_HEARING_REPEAT_WINDOW_MS;
      const confidence = repeated
        ? Math.min(BOT_HEARING_MAX_CONFIDENCE, (previous.confidence ?? 1) + 1)
        : (isAirdropSound ? 3 : 1);
      const spreadAngle = (idx * Math.PI * 2) / Math.max(1, selected.length);
      const spreadRadius = isAirdropSound ? 4.5 + (idx % 3) * 2.5 : 0;
      heard.set(bot.id, {
        kind: "sound-interest",
        sourceId: sound.entityId ?? sound.crateId ?? "airdrop",
        key: sound.key,
        gait: sound.gait ?? (isAirdropSound ? "run" : null),
        priority,
        confidence,
        heardAt: now,
        x: sourcePosition.x + Math.cos(spreadAngle) * spreadRadius,
        y: sourcePosition.y,
        z: sourcePosition.z + Math.sin(spreadAngle) * spreadRadius,
        expiresAt: now + soundTtl(sound),
      });
      listeners += 1;
    }
    return listeners;
  }

  function recordJuggernautInterest(payload = {}, now = Date.now()) {
    const dropPoint = {
      x: Number(payload.x) || 0,
      y: 0,
      z: Number(payload.z) || 0,
    };

    const botParachutes = ctx.services.has("bot-parachutes") ? ctx.services.get("bot-parachutes") : null;
    const botVehicles = ctx.services.has("bot-vehicles") ? ctx.services.get("bot-vehicles") : null;
    const vehicles = ctx.services.has("vehicles") ? ctx.services.get("vehicles") : null;
    const freeCars = Array.isArray(vehicles?.snapshot?.())
      ? vehicles.snapshot().filter((v) => v && !v.occupied)
      : [];

    const candidates = [];
    for (const bot of entities.all()) {
      if (!bot?.bot || !bot.alive || bot.humanSquad) continue;
      const t = ctx.components.get(bot.id, "Transform");
      if (!t) continue;
      const dist = Math.hypot((Number(t.x) || 0) - dropPoint.x, (Number(t.z) || 0) - dropPoint.z);
      if (dist > BOT_JUGGERNAUT_INTEREST_RADIUS) continue;
      candidates.push({ bot, t, dist });
    }
    candidates.sort((a, b) => a.dist - b.dist || String(a.bot.id).localeCompare(String(b.bot.id)));
    // Only rally a portion (~35%, up to 14 bots) of enemy bots in large lobbies so the rest remain distributed across the map
    const maxToSelect = candidates.length <= 6
      ? candidates.length
      : Math.min(BOT_JUGGERNAUT_INVESTIGATION_CAP, Math.max(4, Math.ceil(candidates.length * 0.35)));
    const selected = candidates.slice(0, maxToSelect);

    let assigned = 0;
    let vehicleDispatched = 0;
    const usedCarIds = new Set();

    for (let i = 0; i < selected.length; i += 1) {
      const { bot, t, dist } = selected[i];
      const angle = (i * Math.PI * 2) / Math.max(1, Math.min(14, selected.length));
      const standoff = 2.2 + (i % 4) * 2.2;
      const targetX = dropPoint.x + Math.cos(angle) * standoff;
      const targetZ = dropPoint.z + Math.sin(angle) * standoff;

      if (botParachutes?.retarget) {
        botParachutes.retarget(bot.id, {
          x: targetX,
          y: 0,
          z: targetZ,
          kind: "juggernaut-drop",
        });
      }

      heard.set(bot.id, {
        kind: "sound-interest",
        sourceId: payload.crateId ?? "juggernaut",
        key: "airdrop.juggernaut",
        gait: "run",
        priority: 5.0,
        confidence: 4,
        heardAt: now,
        x: targetX,
        y: 0,
        z: targetZ,
        expiresAt: now + BOT_JUGGERNAUT_INTEREST_TTL_MS,
      });
      assigned += 1;

      if (vehicleDispatched < 3 && botVehicles?.assign && dist >= 42 && (Number(t.y) || 0) <= 2 && freeCars.length > 0) {
        let bestCar = null;
        let bestCarDist = Infinity;
        for (const car of freeCars) {
          if (usedCarIds.has(car.id)) continue;
          const dCar = Math.hypot((Number(t.x) || 0) - (Number(car.x) || 0), (Number(t.z) || 0) - (Number(car.z) || 0));
          if (dCar <= 115 && dCar < bestCarDist) {
            bestCar = car;
            bestCarDist = dCar;
          }
        }
        if (bestCar) {
          const ok = botVehicles.assign(
            bot.id,
            bestCar.id,
            { x: targetX, y: 0, z: targetZ, drivePurpose: "juggernaut-rush" },
            now,
            { maxDistance: 120, minDistance: 32 },
          );
          if (ok) {
            usedCarIds.add(bestCar.id);
            vehicleDispatched += 1;
          }
        }
      }
    }
    return { assigned, vehicleDispatched };
  }

  function recordAirdropInterest(payload = {}, now = Date.now()) {
    if (
      payload?.juggernaut
      || payload?.loot === "juggernaut"
      || payload?.electroLukashenko
      || payload?.loot === "electro-lukashenko"
    ) {
      return recordJuggernautInterest(payload, now).assigned;
    }
    const dropPoint = {
      x: Number(payload.x) || 0,
      y: 0,
      z: Number(payload.z) || 0,
    };
    const candidates = [];
    for (const bot of entities.all()) {
      if (!bot?.bot || !bot.alive || bot.humanSquad) continue;
      const t = ctx.components.get(bot.id, "Transform");
      if (!t || (Number(t.y) || 0) > 12) continue;
      const dist = Math.hypot((Number(t.x) || 0) - dropPoint.x, (Number(t.z) || 0) - dropPoint.z);
      if (dist > BOT_AIRDROP_INTEREST_RADIUS) continue;
      candidates.push({ bot, dist });
    }
    candidates.sort((a, b) => a.dist - b.dist || String(a.bot.id).localeCompare(String(b.bot.id)));
    const selected = candidates.slice(0, BOT_AIRDROP_INVESTIGATION_CAP);
    let assigned = 0;
    for (let i = 0; i < selected.length; i += 1) {
      const { bot } = selected[i];
      const angle = (i * Math.PI * 2) / Math.max(1, selected.length);
      const standoff = 5 + (i % 3) * 3;
      heard.set(bot.id, {
        kind: "sound-interest",
        sourceId: payload.crateId ?? "airdrop",
        key: "airdrop.beacon",
        gait: "run",
        priority: 3.4,
        confidence: 3,
        heardAt: now,
        x: dropPoint.x + Math.cos(angle) * standoff,
        y: 0,
        z: dropPoint.z + Math.sin(angle) * standoff,
        expiresAt: now + BOT_AIRDROP_INTEREST_TTL_MS,
      });
      assigned += 1;
    }
    return assigned;
  }

  function directHuntersTowardAction(now = Date.now(), { force = false } = {}) {
    if (tutorial) return 0;
    const br = ctx.services.has("battle-royale") ? ctx.services.get("battle-royale") : null;
    if (br && (!br.isActive?.() || br.status?.(now)?.deployment?.active)) return 0;

    const allEntities = entities.all();
    const humans = allEntities.filter((e) => e?.alive && !e.bot);
    if (!humans.length) return 0;

    const enemyBots = allEntities.filter((e) => e?.alive && e.bot && !e.humanSquad);
    if (!force && enemyBots.length < 6) return 0;

    let totalDispatched = 0;
    for (const human of humans) {
      const ht = ctx.components.get(human.id, "Transform");
      if (!ht || (Number(ht.y) || 0) > 8) continue;
      const humanTeam = Number(teams.teamOf(human.id)) || 0;
      const lastCombatAt = lastCombatAtByTeam.get(humanTeam) ?? 0;

      let nearbyEnemy = false;
      for (const bot of enemyBots) {
        if (humanTeam > 0 && (Number(teams.teamOf(bot.id)) || 0) === humanTeam) continue;
        const bt = ctx.components.get(bot.id, "Transform");
        if (!bt) continue;
        if (Math.hypot((Number(bt.x) || 0) - (Number(ht.x) || 0), (Number(bt.z) || 0) - (Number(ht.z) || 0)) <= 38) {
          nearbyEnemy = true;
          break;
        }
      }
      if (nearbyEnemy && !force) {
        lastCombatAtByTeam.set(humanTeam, now);
        continue;
      }

      const lastDispatchAt = lastHunterDispatchByPlayer.get(human.id) ?? 0;
      if (!force) {
        if (lastCombatAt > 0 && now - lastCombatAt < BOT_COMBAT_LULL_MS) continue;
        if (now - lastDispatchAt < BOT_HUNTER_DISPATCH_COOLDOWN_MS) continue;
      }

      const candidates = [];
      for (const bot of enemyBots) {
        if (humanTeam > 0 && (Number(teams.teamOf(bot.id)) || 0) === humanTeam) continue;
        const bt = ctx.components.get(bot.id, "Transform");
        if (!bt || (Number(bt.y) || 0) > 10) continue;
        const dist = Math.hypot((Number(bt.x) || 0) - (Number(ht.x) || 0), (Number(bt.z) || 0) - (Number(ht.z) || 0));
        if (!force && (dist < 60 || dist > 210)) continue;
        candidates.push({ bot, dist });
      }
      candidates.sort((a, b) => a.dist - b.dist || String(a.bot.id).localeCompare(String(b.bot.id)));
      const hunters = candidates.slice(0, 2);
      if (!hunters.length) continue;

      lastHunterDispatchByPlayer.set(human.id, now);
      for (let i = 0; i < hunters.length; i += 1) {
        const { bot } = hunters[i];
        const angle = (i * Math.PI * 2) / Math.max(1, hunters.length);
        const radius = 16 + (i % 2) * 8;
        heard.set(bot.id, {
          kind: "sound-interest",
          sourceId: human.id,
          key: "weapon.hunt",
          gait: "run",
          priority: 3.25,
          confidence: 3,
          heardAt: now,
          x: (Number(ht.x) || 0) + Math.cos(angle) * radius,
          y: 0,
          z: (Number(ht.z) || 0) + Math.sin(angle) * radius,
          expiresAt: now + 18_000,
        });
        totalDispatched += 1;
      }
    }
    return totalDispatched;
  }

  function targetFor(botId, transform, now = Date.now()) {
    if (now - lastLullCheckAt >= 5_000) {
      lastLullCheckAt = now;
      directHuntersTowardAction(now);
    }
    clearExpired(botId, now);

    const sound = heard.get(botId);
    if (sound) return { ...sound };

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
    if (point) {
      exploration.delete(botId);
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

    return explorationTargetFor(botId, transform, now);
  }

  function clearBot(entityId) {
    assignments.delete(entityId);
    cooldowns.delete(entityId);
    heard.delete(entityId);
    exploration.delete(entityId);
  }

  ctx.events.on("sound:spatial", (sound) => {
    const eventNow = Number.isFinite(sound?.now) ? Number(sound.now) : Date.now();
    recordSound(sound, eventNow);
  });
  ctx.events.on("crate:airdrop-incoming", (payload) => {
    const eventNow = Number.isFinite(payload?.now) ? Number(payload.now) : Date.now();
    recordAirdropInterest(payload, eventNow);
  });
  ctx.events.on("crate:airdrop-landed", (payload) => {
    const eventNow = Number.isFinite(payload?.now) ? Number(payload.now) : Date.now();
    recordAirdropInterest(payload, eventNow);
  });
  ctx.events.on("combat:damage", ({ attackerId, targetId, now } = {}) => {
    const eventNow = Number.isFinite(now) ? Number(now) : Date.now();
    const aTeam = attackerId ? Number(teams.teamOf(attackerId)) || 0 : 0;
    const tTeam = targetId ? Number(teams.teamOf(targetId)) || 0 : 0;
    if (aTeam > 0) lastCombatAtByTeam.set(aTeam, eventNow);
    if (tTeam > 0) lastCombatAtByTeam.set(tTeam, eventNow);
  });
  ctx.events.on("entity:removed", ({ entityId }) => clearBot(entityId));
  ctx.events.on("entity:died", ({ entityId }) => {
    assignments.delete(entityId);
    heard.delete(entityId);
    exploration.delete(entityId);
  });
  ctx.events.on("entity:respawned", ({ entityId }) => clearBot(entityId));

  ctx.services.provide("bot-interest", {
    points,
    recordSound,
    recordAirdropInterest,
    recordJuggernautInterest,
    directHuntersTowardAction,
    targetFor,
    assignmentFor(botId) { return assignments.get(botId) ?? null; },
    heardFor(botId) { return heard.get(botId) ?? null; },
    explorationFor(botId) { return exploration.get(botId) ?? null; },
    activeAssignmentCount(group, now = Date.now()) { return activeAssignmentCount(group, now); },
  });
}
