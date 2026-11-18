import {
  AI_DECISION_CADENCE_MS,
  AI_DECISION_COMMAND_TTL_MS,
  AI_DECISION_MAX_INPUT_TOKENS,
  AI_DECISION_MAX_REQUESTS,
  AI_DECISION_MAX_UNITS_PER_BATCH,
  AI_DECISION_MODEL,
  requestNearestEnemiesDecisions,
} from "../../server/gemini-decisions.js";

export const manifest = {
  id: "ai-enemy-decisions",
  version: "2.0.0",
  requires: ["entities", "weapons"],
  optional: [
    "teams", "battle-royale", "map-test-arena", "armor", "injury",
    "stimulants", "shop", "vehicles", "bot-perception", "rapier-physics",
  ],
  capabilities: ["services.consume", "services.provide", "components.read", "events.emit", "events.on"],
};

export function normalizeEnemyAiMode(value) {
  return value === "ai" || value === "gemini" || value === "gemini-decision-1"
    ? "ai"
    : "standard";
}

function distance2(a, b) {
  return Math.hypot((Number(a?.x) || 0) - (Number(b?.x) || 0), (Number(a?.z) || 0) - (Number(b?.z) || 0));
}

function round1(v) {
  return Math.round((Number(v) || 0) * 10) / 10;
}

function wrapDeg(rad) {
  let a = rad;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return Math.round((a * 180) / Math.PI);
}

const RAY_ANGLES_RAD = [0, 0.7854, 1.5708, 2.3562, 3.1416, -2.3562, -1.5708, -0.7854];

export async function setup(ctx) {
  const entities = ctx.services.get("entities");
  const getTeams = () => (ctx.services.has("teams") ? ctx.services.get("teams") : null);
  const getBattleRoyale = () => (ctx.services.has("battle-royale") ? ctx.services.get("battle-royale") : null);
  const getMap = () => (ctx.services.has("map") ? ctx.services.get("map") : null);
  const getArmor = () => (ctx.services.has("armor") ? ctx.services.get("armor") : null);
  const getInjury = () => (ctx.services.has("injury") ? ctx.services.get("injury") : null);
  const getStimulants = () => (ctx.services.has("stimulants") ? ctx.services.get("stimulants") : null);
  const getShop = () => (ctx.services.has("shop") ? ctx.services.get("shop") : null);
  const getVehicles = () => (ctx.services.has("vehicles") ? ctx.services.get("vehicles") : null);
  const getPerception = () => (ctx.services.has("bot-perception") ? ctx.services.get("bot-perception") : null);
  const getPhysics = () => (ctx.services.has("physics") ? ctx.services.get("physics") : null);

  let mode = "standard";
  let usedRequests = 0;
  let maxRequests = AI_DECISION_MAX_REQUESTS;
  let inFlight = false;
  let lastRequestAttemptAt = 0;
  let lastBatchAt = 0;
  let lastLatencyMs = null;
  let lastEstimatedTokens = null;
  let lastApiInputTokens = null;
  let lastBudgetSections = [];
  let lastSummary = [];
  let lastError = null;
  let configured = null;
  let urgentEventAt = 0;
  const commands = new Map();
  const recentEvents = [];
  const soundHotspots = [];
  let batchCombatMetrics = { damageEvents: 0, deaths: 0, knockdowns: 0, revives: 0 };

  function pushRecentEvent(summary, now = Date.now(), extra = null) {
    recentEvents.push({
      t: Math.round(Number(now) || 0),
      event: summary,
      ...(extra && typeof extra === "object" ? extra : {}),
    });
    if (recentEvents.length > 60) {
      recentEvents.splice(0, recentEvents.length - 60);
    }
  }

  function setBudgetStats(stats = {}) {
    if (Number.isFinite(Number(stats.usedRequests))) {
      usedRequests = Math.max(0, Math.floor(Number(stats.usedRequests)));
    }
    if (Number.isFinite(Number(stats.maxRequests)) && Number(stats.maxRequests) > 0) {
      maxRequests = Math.floor(Number(stats.maxRequests));
    }
    if (typeof stats.configured === "boolean") {
      configured = stats.configured;
    }
  }

  function setMode(nextMode, now = Date.now()) {
    const normalized = normalizeEnemyAiMode(nextMode);
    if (mode === normalized) return mode;
    mode = normalized;
    if (mode === "standard") {
      commands.clear();
      lastError = null;
      lastSummary = [];
      lastEstimatedTokens = null;
      lastApiInputTokens = null;
      lastBudgetSections = [];
    } else {
      lastRequestAttemptAt = 0;
    }
    ctx.events.emit("ai-decisions:mode-changed", {
      mode,
      usedRequests,
      maxRequests,
      remainingRequests: Math.max(0, maxRequests - usedRequests),
      now,
    });
    return mode;
  }

  function classifyBotRole(entity, humans, teams) {
    if (entity.humanSquad) return "ally_squad";
    if (teams) {
      const botTeam = Number(teams.teamOf(entity.id)) || 0;
      if (botTeam > 0 && humans.some((h) => (Number(teams.teamOf(h.id)) || 0) === botTeam)) {
        return "ally_team";
      }
    }
    return "enemy";
  }

  function buildingBoundsList(map) {
    const list = [];
    const seen = new Set();
    if (map?.building) {
      const id = String(map.building.id ?? "warehouse");
      seen.add(id);
      list.push({ id, bounds: map.building });
    }
    for (const nb of map?.navigationBuildings ?? []) {
      const id = String(nb?.id ?? nb?.bounds?.id ?? "");
      const bounds = nb?.bounds ?? nb;
      if (!id || seen.has(id) || !bounds) continue;
      seen.add(id);
      list.push({ id, bounds });
    }
    return list;
  }

  function buildingIdAtPoint(buildings, pt) {
    if (!pt) return null;
    const x = Number(pt.x) || 0;
    const z = Number(pt.z) || 0;
    for (const entry of buildings) {
      const b = entry.bounds;
      if (b && x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) {
        return entry.id;
      }
    }
    return null;
  }

  function buildLocalTacticalSector(name, center, stepMeters, gridSize, {
    buildings, map, allEntities, humans, teams, injury, vehicles, shops,
  }) {
    const half = Math.floor(gridSize / 2);
    const rows = [];
    const originX = (Number(center?.x) || 0) - half * stepMeters;
    const originZ = (Number(center?.z) || 0) - half * stepMeters;

    const charGrid = Array.from({ length: gridSize }, () => Array(gridSize).fill("."));

    const setCell = (worldX, worldZ, ch, overwrite = true) => {
      const col = Math.floor((worldX - originX) / stepMeters);
      const row = Math.floor((worldZ - originZ) / stepMeters);
      if (row < 0 || row >= gridSize || col < 0 || col >= gridSize) return;
      if (!overwrite && charGrid[row][col] !== ".") return;
      charGrid[row][col] = ch;
    };

    // Paint buildings
    for (let r = 0; r < gridSize; r += 1) {
      const wz = originZ + (r + 0.5) * stepMeters;
      for (let c = 0; c < gridSize; c += 1) {
        const wx = originX + (c + 0.5) * stepMeters;
        if (buildingIdAtPoint(buildings, { x: wx, z: wz })) {
          charGrid[r][c] = "#";
        }
      }
    }
    for (const door of map?.doors ?? []) {
      setCell(Number(door.x) || 0, Number(door.z) || 0, "D", true);
    }
    for (const crate of map?.crates ?? []) {
      if (crate && !crate.opened) setCell(Number(crate.x) || 0, Number(crate.z) || 0, "C", false);
    }
    for (const shop of shops ?? []) {
      setCell(Number(shop.x) || 0, Number(shop.z) || 0, "S", true);
    }
    for (const v of vehicles ?? []) {
      setCell(Number(v.x) || 0, Number(v.z) || 0, "V", true);
    }
    for (const ent of allEntities) {
      if (!ent?.alive) continue;
      const t = ctx.components.get(ent.id, "Transform");
      if (!t) continue;
      if (injury?.isDowned?.(ent.id)) {
        setCell(t.x, t.z, "+", true);
      } else if (!ent.bot) {
        setCell(t.x, t.z, "P", true);
      } else {
        const role = classifyBotRole(ent, humans, teams);
        setCell(t.x, t.z, role === "enemy" ? "E" : "A", true);
      }
    }

    for (let r = 0; r < gridSize; r += 1) {
      rows.push(charGrid[r].join(""));
    }

    return {
      name,
      center: { x: round1(center?.x ?? 0), z: round1(center?.z ?? 0) },
      cellMeters: stepMeters,
      size: gridSize,
      rows,
    };
  }

  function collectNearestEnemiesContext(now = Date.now()) {
    const battleRoyale = getBattleRoyale();
    const isBr = Boolean(battleRoyale);
    if (battleRoyale) {
      const status = battleRoyale.status(now);
      if (status.phase !== "active" || status.deployment?.active) return null;
    }

    const teams = getTeams();
    const map = getMap();
    const armorService = getArmor();
    const injury = getInjury();
    const stimulants = getStimulants();
    const shop = getShop();
    const vehicles = getVehicles();
    const perception = getPerception();
    const physics = getPhysics();

    const allEntities = entities.all();
    const humans = allEntities.filter((e) => !e.bot && e.kind === "human");
    const aliveHumans = humans.filter((h) => h.alive && !injury?.isDowned?.(h.id));
    const humanAnchor = aliveHumans[0] ?? humans[0] ?? null;
    const anchorTransform = humanAnchor ? ctx.components.get(humanAnchor.id, "Transform") : null;
    const maxEnemyRadius = isBr ? 260 : 200;
    const zoneRadius = battleRoyale ? Number(battleRoyale.zoneRadiusAt?.(now) ?? 400) : null;
    const buildings = buildingBoundsList(map);
    const allVehicles = vehicles?.all?.() ?? [];
    const shopStations = shop?.stations?.() ?? [];

    const humanSummaries = humans.map((h) => {
      const t = ctx.components.get(h.id, "Transform");
      const inv = ctx.components.get(h.id, "Weapons");
      const sel = inv?.items?.[inv.selected] ?? null;
      const hp = ctx.components.get(h.id, "Health");
      const armor = ctx.components.get(h.id, "Armor");
      const armorDesc = armorService?.describe?.(h.id) ?? null;
      const input = ctx.components.get(h.id, "Input");
      const v = vehicles?.vehicleForDriver?.(h.id) ?? vehicles?.vehicleForPassenger?.(h.id) ?? null;
      return {
        id: h.id,
        name: String(h.name ?? h.id),
        alive: Boolean(h.alive),
        team: Number(teams?.teamOf(h.id)) || 0,
        downed: Boolean(injury?.isDowned?.(h.id)),
        pos: t ? { x: round1(t.x), y: round1(t.y), z: round1(t.z) } : null,
        deg: t ? wrapDeg(Number(t.angle) || 0) : 0,
        moving: Boolean(input && (Math.abs(input.forward || 0) > 0.1 || Math.abs(input.strafe || 0) > 0.1)),
        sprinting: Boolean(input?.sprint),
        hp: Math.round(Number(hp?.current) || 0),
        hpMax: Math.round(Number(hp?.maximum) || 200),
        armor: Math.round(Number(armor?.current) || 0),
        plates: Math.max(0, Math.round(Number(armorDesc?.platesRemaining) || 0)),
        stims: Math.max(0, Math.round(Number(stimulants?.count?.(h.id)) || 0)),
        money: Math.max(0, Math.round(Number(shop?.balanceOf?.(h.id)) || 0)),
        weapon: sel?.id ?? "pistol",
        ammo: sel?.ammo ?? 0,
        weapons: (inv?.items ?? []).map((it) => ({
          id: it.id,
          ammo: it.ammo ?? 0,
          reserve: it.reserve ?? 0,
        })),
        inVehicle: v ? String(v.id) : false,
        insideBuilding: t ? buildingIdAtPoint(buildings, t) : null,
      };
    });

    const candidates = [];
    for (const bot of allEntities) {
      if (!bot?.alive || !bot.bot) continue;
      if (injury?.isDowned?.(bot.id)) continue;
      const parachute = ctx.components.get(bot.id, "Parachute");
      if (parachute?.airborne) continue;
      const transform = ctx.components.get(bot.id, "Transform");
      if (!transform) continue;

      const role = classifyBotRole(bot, humans, teams);
      const isAlly = role !== "enemy";
      const distToHuman = anchorTransform ? distance2(transform, anchorTransform) : null;
      if (isBr && !isAlly && distToHuman !== null && distToHuman > maxEnemyRadius) continue;

      const botState = ctx.components.get(bot.id, "Bot");
      const visibleRaw = typeof perception?.visibleEnemies === "function"
        ? perception.visibleEnemies(bot.id, 145, { now, limit: 6 })
        : [perception?.nearestVisibleEnemy?.(bot.id, 125, { now })].filter(Boolean);
      const visible = (visibleRaw ?? []).filter((enemy) => enemy && !injury?.isDowned?.(enemy.entityId));

      const hasVisibleHuman = visible.some((v) => !entities.get(v.entityId)?.bot);
      const isDamagedRecently = Boolean(botState?.lastDamagedAt && now - botState.lastDamagedAt <= 3500);
      // Allies (squadmates / TDM teammates) always take top priority so they are never omitted.
      const priorityScore = (isAlly ? -400 : 0)
        + (distToHuman ?? 50)
        - (hasVisibleHuman ? 55 : 0)
        - (visible.length ? 30 : 0)
        - (isDamagedRecently ? 25 : 0);

      candidates.push({
        bot,
        role,
        transform,
        botState,
        distToHuman,
        visible,
        priorityScore,
      });
    }

    if (!candidates.length) return null;
    candidates.sort((a, b) => a.priorityScore - b.priorityScore);
    const chosen = candidates.slice(0, AI_DECISION_MAX_UNITS_PER_BATCH);

    const payloadUnits = chosen.map(({ bot, role, transform, botState, distToHuman, visible }) => {
      const inv = ctx.components.get(bot.id, "Weapons");
      const selected = inv?.items?.[inv.selected] ?? null;
      const hp = ctx.components.get(bot.id, "Health");
      const armor = ctx.components.get(bot.id, "Armor");
      const armorDesc = armorService?.describe?.(bot.id) ?? null;
      const underFire = Boolean(botState?.lastDamagedAt && now - botState.lastDamagedAt <= 3000);
      const radialDist = Math.hypot(Number(transform.x) || 0, Number(transform.z) || 0);
      const outsideZoneMeters = zoneRadius ? Math.max(0, radialDist - zoneRadius) : 0;
      const v = vehicles?.vehicleForDriver?.(bot.id) ?? vehicles?.vehicleForPassenger?.(bot.id) ?? null;

      let clearanceAhead = 2.5;
      let clearance8Way = undefined;
      if (physics?.raycast) {
        const origin = { x: transform.x, y: (transform.y ?? 0) + 1, z: transform.z };
        const baseHeading = Number(transform.angle) || 0;
        clearance8Way = RAY_ANGLES_RAD.map((offsetRad) => {
          const ang = baseHeading + offsetRad;
          const hit = physics.raycast(origin, { x: Math.sin(ang), y: 0, z: -Math.cos(ang) }, 8, bot.id);
          return round1(hit?.distance ?? 8);
        });
        clearanceAhead = clearance8Way[0] ?? 2.5;
      }

      const relDegToHuman = anchorTransform
        ? wrapDeg(Math.atan2(anchorTransform.x - transform.x, -(anchorTransform.z - transform.z)) - (Number(transform.angle) || 0))
        : null;

      const downedAlliesNearby = injury?.downedTeammates?.(bot.id, 95)?.length ?? 0;

      const visibleTargets = visible.map((enemy) => {
        const tEntity = entities.get(enemy.entityId);
        const tHp = ctx.components.get(enemy.entityId, "Health");
        const tArmor = ctx.components.get(enemy.entityId, "Armor");
        const tInv = ctx.components.get(enemy.entityId, "Weapons");
        const tWeapon = tInv?.items?.[tInv.selected]?.id ?? "pistol";
        const desired = Math.atan2(
          (Number(enemy.transform?.x) || 0) - transform.x,
          -((Number(enemy.transform?.z) || 0) - transform.z),
        );
        const threateningHuman = Boolean(
          anchorTransform
          && enemy.transform
          && Math.hypot(enemy.transform.x - anchorTransform.x, enemy.transform.z - anchorTransform.z) <= 45,
        );
        return {
          id: enemy.entityId,
          isHuman: Boolean(tEntity && !tEntity.bot),
          distance: enemy.distance,
          hp: tHp?.current ?? 200,
          armor: tArmor?.current ?? 0,
          downed: Boolean(injury?.isDowned?.(enemy.entityId)),
          weapon: tWeapon,
          relDeg: wrapDeg(desired - (Number(transform.angle) || 0)),
          isAttacker: Boolean(
            (botState?.attackerId && botState.attackerId === enemy.entityId && (botState.attackerUntil ?? 0) > now)
            || (botState?.lastDamagedById && botState.lastDamagedById === enemy.entityId && underFire),
          ),
          threateningHuman,
        };
      });

      const hasRemembered = !visible.length
        && (botState?.lastKnownUntil ?? 0) > now
        && Number.isFinite(botState?.lastKnownX)
        && Number.isFinite(botState?.lastKnownZ);
      const rememberedDist = hasRemembered
        ? Math.hypot(botState.lastKnownX - transform.x, botState.lastKnownZ - transform.z)
        : null;
      const rememberedRelDeg = hasRemembered
        ? wrapDeg(Math.atan2(botState.lastKnownX - transform.x, -(botState.lastKnownZ - transform.z)) - (Number(transform.angle) || 0))
        : null;

      return {
        id: bot.id,
        role,
        team: Number(teams?.teamOf(bot.id)) || 0,
        name: bot.name ?? bot.id,
        x: transform.x,
        y: transform.y ?? 0,
        z: transform.z,
        deg: wrapDeg(Number(transform.angle) || 0),
        weapon: selected?.id ?? "pistol",
        ammo: selected?.ammo ?? 0,
        reserve: selected?.reserve ?? 0,
        reloading: Boolean(selected && Number(selected.reloadUntil) > now),
        weapons: (inv?.items ?? []).map((it) => ({
          id: it.id,
          ammo: it.ammo ?? 0,
          reserve: it.reserve ?? 0,
        })),
        hp: hp?.current ?? 200,
        hpMax: hp?.maximum ?? 200,
        armor: armor?.current ?? 0,
        plates: armorDesc?.platesRemaining ?? 0,
        stims: Math.max(0, Math.round(Number(stimulants?.count?.(bot.id)) || 0)),
        money: Math.max(0, Math.round(Number(shop?.balanceOf?.(bot.id)) || 0)),
        downed: false,
        inVehicle: v ? String(v.id) : false,
        distToHuman,
        relDegToHuman,
        underFire,
        attackerId: botState?.lastDamagedById ?? botState?.attackerId ?? null,
        insideBuilding: buildingIdAtPoint(buildings, transform),
        outsideZoneMeters,
        clearanceAhead,
        clearance8Way,
        downedAlliesNearby,
        currentGoal: botState?.squadRoleActive ?? null,
        visibleTargets,
        rememberedId: botState?.lastKnownTargetId ?? null,
        rememberedDist,
        rememberedRelDeg,
      };
    });

    const buildingSummaries = buildings.map(({ id, bounds }) => {
      const occupants = [];
      for (const u of payloadUnits) {
        if (u.insideBuilding === id) {
          occupants.push({ id: u.id, role: u.role, y: round1(u.y) });
        }
      }
      const doors = (map?.doors ?? [])
        .filter((d) => d && d.x >= bounds.minX - 2.5 && d.x <= bounds.maxX + 2.5 && d.z >= bounds.minZ - 2.5 && d.z <= bounds.maxZ + 2.5)
        .map((d) => ({ x: round1(d.x), y: round1(d.y), z: round1(d.z) }));
      const unopenedCrates = (map?.crates ?? []).filter(
        (c) => c && !c.opened && c.x >= bounds.minX - 3 && c.x <= bounds.maxX + 3 && c.z >= bounds.minZ - 3 && c.z <= bounds.maxZ + 3,
      ).length;
      return {
        id,
        bounds: {
          minX: round1(bounds.minX),
          maxX: round1(bounds.maxX),
          minZ: round1(bounds.minZ),
          maxZ: round1(bounds.maxZ),
          upperY: round1(bounds.upperY ?? 0),
        },
        doors,
        unopenedCrates,
        occupants,
      };
    });

    const deadAllies = humanAnchor
      ? (shop?.deadTeammatesFor?.(humanAnchor.id) ?? []).map((d) => ({ id: d.id, name: d.name }))
      : [];

    const crateSummaries = (map?.crates ?? [])
      .filter((c) => c && !c.opened)
      .map((c) => ({
        id: c.id,
        loot: c.loot ?? (String(c.id).includes("armor") ? "armor" : "rifle"),
        pos: { x: round1(c.x), y: round1(c.y), z: round1(c.z) },
        buildingId: buildingIdAtPoint(buildings, c),
        distToHumanM: anchorTransform ? round1(distance2(c, anchorTransform)) : null,
      }))
      .sort((a, b) => (a.distToHumanM ?? 999) - (b.distToHumanM ?? 999))
      .slice(0, 28);

    const vehicleSummaries = allVehicles
      .map((v) => ({
        id: String(v.id),
        pos: { x: round1(v.x), z: round1(v.z) },
        speed: round1(v.speed),
        driverId: v.driverId ?? null,
        passengers: Array.isArray(v.passengerIds) ? v.passengerIds.length : 0,
        distToHumanM: anchorTransform ? round1(distance2(v, anchorTransform)) : null,
      }))
      .sort((a, b) => (a.distToHumanM ?? 999) - (b.distToHumanM ?? 999))
      .slice(0, 12);

    const activeHotspots = soundHotspots.filter((s) => now - s.t <= 8000).slice(-14);

    const tacticalSectors = [];
    if (anchorTransform) {
      tacticalSectors.push(buildLocalTacticalSector("player_close_2m", anchorTransform, 2, 21, {
        buildings, map, allEntities, humans, teams, injury, vehicles: allVehicles, shops: shopStations,
      }));
      tacticalSectors.push(buildLocalTacticalSector("sector_wide_6m", anchorTransform, 6, 21, {
        buildings, map, allEntities, humans, teams, injury, vehicles: allVehicles, shops: shopStations,
      }));
    } else if (chosen[0]?.transform) {
      tacticalSectors.push(buildLocalTacticalSector("combat_center_4m", chosen[0].transform, 4, 21, {
        buildings, map, allEntities, humans, teams, injury, vehicles: allVehicles, shops: shopStations,
      }));
    }

    const brStatus = battleRoyale?.status?.(now) ?? null;

    return {
      mode: isBr ? "battle-royale" : "tdm",
      simTimeMs: Math.round(now),
      zoneRadius,
      zone: brStatus?.zone
        ? {
            radiusM: round1(brStatus.zone.radius),
            phase: brStatus.phase,
            closing: Boolean(brStatus.zone.closing),
          }
        : null,
      matchStats: {
        totalAlive: allEntities.filter((e) => e.alive).length,
        controlledUnits: payloadUnits.length,
        alliesControlled: payloadUnits.filter((u) => u.role !== "enemy").length,
        enemiesControlled: payloadUnits.filter((u) => u.role === "enemy").length,
      },
      humans: humanSummaries,
      units: payloadUnits,
      enemies: payloadUnits.filter((u) => u.role === "enemy"),
      previousOutcome: lastBatchAt
        ? {
            agoMs: Math.max(0, Math.round(now - lastBatchAt)),
            latencyMs: lastLatencyMs,
            combatSinceLastBatch: { ...batchCombatMetrics },
            lastCommands: lastSummary.slice(0, 16),
          }
        : null,
      recentEvents: recentEvents.slice(-40),
      buildings: buildingSummaries,
      tacticalLogistics: {
        shops: shopStations.map((s) => ({ id: s.id, x: round1(s.x), y: round1(s.y), z: round1(s.z) })),
        deadAllies,
        vehicles: vehicleSummaries,
        crates: crateSummaries,
        soundHotspots: activeHotspots,
      },
      tacticalSectors,
    };
  }

  function applyBatchResult(result, now = Date.now()) {
    if (!result || result.skipped) return;
    if (Number.isFinite(Number(result.usedRequests))) usedRequests = Number(result.usedRequests);
    if (Number.isFinite(Number(result.maxRequests))) maxRequests = Number(result.maxRequests);
    lastLatencyMs = result.latencyMs ?? null;
    lastEstimatedTokens = Number.isFinite(Number(result.estimatedInputTokens))
      ? Number(result.estimatedInputTokens)
      : null;
    lastApiInputTokens = Number.isFinite(Number(result.apiInputTokens))
      ? Number(result.apiInputTokens)
      : null;
    lastBudgetSections = Array.isArray(result.budgetSectionsIncluded)
      ? result.budgetSectionsIncluded
      : [];
    lastBatchAt = now;
    lastError = null;
    batchCombatMetrics = { damageEvents: 0, deaths: 0, knockdowns: 0, revives: 0 };
    lastSummary = Array.isArray(result.summary) ? result.summary.slice(0, 16) : [];

    for (const [entityId, cmd] of Object.entries(result.commands ?? {})) {
      commands.set(entityId, {
        ...cmd,
        issuedAt: now,
        expiresAt: now + AI_DECISION_COMMAND_TTL_MS,
      });
    }
    ctx.events.emit("ai-decisions:batch", {
      model: AI_DECISION_MODEL,
      usedRequests,
      maxRequests,
      remainingRequests: Math.max(0, maxRequests - usedRequests),
      latencyMs: lastLatencyMs,
      estimatedInputTokens: lastEstimatedTokens,
      apiInputTokens: lastApiInputTokens,
      maxInputTokens: result.maxInputTokens ?? AI_DECISION_MAX_INPUT_TOKENS,
      alliesCount: lastSummary.filter((s) => s.role !== "enemy").length,
      enemiesCount: lastSummary.filter((s) => s.role === "enemy").length,
      summary: lastSummary,
      now,
    });
  }

  function recordError(error, budgetState = null, now = Date.now()) {
    if (budgetState) setBudgetStats(budgetState);
    const info = {
      code: String(error?.code ?? "DECISIONS_API_ERROR"),
      status: Number(error?.status) || 502,
      message: String(error?.message ?? error ?? "Gemini Decisions API error").slice(0, 320),
      at: now,
    };
    lastError = info;
    commands.clear();
    lastSummary = [];
    ctx.events.emit("ai-decisions:error", {
      ...info,
      usedRequests,
      maxRequests,
      remainingRequests: Math.max(0, maxRequests - usedRequests),
      now,
    });
    return info;
  }

  async function refreshOnce({ env = null, apiKey = null, clientFactory, reserveBudget, now = Date.now(), maxInputTokens } = {}) {
    if (mode !== "ai") return { skipped: true, reason: "standard-mode" };
    if (inFlight) return { skipped: true, reason: "in-flight" };
    const context = collectNearestEnemiesContext(now);
    if (!context) return { skipped: true, reason: "no-active-units" };
    inFlight = true;
    lastRequestAttemptAt = now;
    try {
      const result = await requestNearestEnemiesDecisions(context, {
        env,
        apiKey,
        clientFactory,
        reserveBudget,
        maxInputTokens,
      });
      applyBatchResult(result, Math.max(now, Date.now()));
      return result;
    } catch (error) {
      recordError(error, error?.details, Math.max(now, Date.now()));
      throw error;
    } finally {
      inFlight = false;
    }
  }

  function shouldRefresh(now = Date.now()) {
    if (mode !== "ai" || inFlight) return false;
    if (usedRequests >= maxRequests) return false;
    const minInterval = lastError
      ? 5000
      : (urgentEventAt > lastRequestAttemptAt ? Math.min(1400, AI_DECISION_CADENCE_MS) : AI_DECISION_CADENCE_MS);
    if (now - lastRequestAttemptAt < minInterval) return false;
    return Boolean(collectNearestEnemiesContext(now));
  }

  function commandFor(entityId, now = Date.now()) {
    if (mode !== "ai") return null;
    const cmd = commands.get(entityId);
    if (!cmd) return null;
    if (now > (cmd.expiresAt ?? 0)) {
      commands.delete(entityId);
      return null;
    }
    return cmd;
  }

  function describe(now = Date.now()) {
    const activeIds = [];
    const activeAllyIds = [];
    const activeEnemyIds = [];
    for (const [id, cmd] of commands.entries()) {
      if (now <= (cmd.expiresAt ?? 0)) {
        activeIds.push(id);
        if (cmd.isAlly || cmd.role === "ally_squad" || cmd.role === "ally_team") {
          activeAllyIds.push(id);
        } else {
          activeEnemyIds.push(id);
        }
      } else {
        commands.delete(id);
      }
    }
    return {
      mode,
      model: AI_DECISION_MODEL,
      configured,
      usedRequests,
      maxRequests,
      remainingRequests: Math.max(0, maxRequests - usedRequests),
      inFlight,
      activeUnitIds: activeIds,
      activeAllyIds,
      activeEnemyIds,
      lastBatchAt: lastBatchAt || null,
      lastLatencyMs,
      lastEstimatedTokens,
      lastApiInputTokens,
      maxInputTokens: AI_DECISION_MAX_INPUT_TOKENS,
      lastBudgetSections,
      lastSummary,
      lastError,
    };
  }

  function clearBot(entityId) {
    commands.delete(entityId);
  }

  ctx.events.on("combat:damage", ({ attackerId, targetId, damage, weaponId, now = Date.now() }) => {
    batchCombatMetrics.damageEvents += 1;
    pushRecentEvent("damage", now, {
      from: attackerId ?? null,
      to: targetId ?? null,
      dmg: Math.round(Number(damage) || 0),
      weapon: weaponId ?? null,
    });
  });

  ctx.events.on("injury:downed", ({ entityId, attackerId, now = Date.now() }) => {
    batchCombatMetrics.knockdowns += 1;
    urgentEventAt = now;
    pushRecentEvent("downed", now, { entity: entityId, by: attackerId ?? null });
  });

  ctx.events.on("injury:revived", ({ entityId, reviverId, now = Date.now() }) => {
    batchCombatMetrics.revives += 1;
    pushRecentEvent("revived", now, { entity: entityId, reviver: reviverId ?? null });
  });

  ctx.events.on("entity:died", ({ entityId, killerId, now = Date.now() }) => {
    clearBot(entityId);
    batchCombatMetrics.deaths += 1;
    pushRecentEvent("died", now, { entity: entityId, by: killerId ?? null });
  });

  ctx.events.on("loot:opened", ({ entityId, loot, x, z, now = Date.now() }) => {
    pushRecentEvent("crate_opened", now, { by: entityId, loot, x: round1(x), z: round1(z) });
  });

  ctx.events.on("shop:purchased", ({ entityId, itemId, now = Date.now() }) => {
    pushRecentEvent("shop_buy", now, { by: entityId, item: itemId });
  });

  ctx.events.on("sound:spatial", (s = {}) => {
    const key = String(s.key ?? "");
    if (!key.startsWith("weapon.") && !key.startsWith("vehicle.")) return;
    soundHotspots.push({
      t: Math.round(Number(s.now) || Date.now()),
      by: s.entityId ?? null,
      kind: key.startsWith("weapon.") ? "shot" : "vehicle",
      x: round1(s.x),
      z: round1(s.z),
    });
    if (soundHotspots.length > 20) soundHotspots.splice(0, soundHotspots.length - 20);
  });

  ctx.events.on("entity:removed", ({ entityId }) => clearBot(entityId));
  ctx.events.on("entity:respawned", ({ entityId }) => clearBot(entityId));
  ctx.events.on("battle-royale:started", () => {
    commands.clear();
    lastSummary = [];
    recentEvents.length = 0;
    soundHotspots.length = 0;
  });

  ctx.services.provide("ai-enemy-decisions", {
    get mode() { return mode; },
    setMode,
    setBudgetStats,
    collectNearestEnemiesContext,
    applyBatchResult,
    recordError,
    refreshOnce,
    shouldRefresh,
    commandFor,
    describe,
    markAttempt(now = Date.now()) { lastRequestAttemptAt = now; },
  });
}
