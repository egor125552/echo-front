export const SNAPSHOT_INTERVAL_MS = 125;
export const ENTITY_INTEREST_RADIUS = 125;
export const JUGGERNAUT_HEALTH = 700;
export const EARLY_DROP_IN_WINDOW_MS = 90_000;
export const MIN_ALIVE_FOR_EARLY_DROP_IN = 30;

export const manifest = {
  id: "match-api",
  version: "2.4.1",
  requires: [
    "entities", "movement", "weapons", "teams", "map-test-arena",
    "battle-royale", "bot-fill", "bot-combat", "battle-royale-vehicle-fleet",
  ],
  optional: ["armor", "aim-steering", "health-regeneration", "battle-royale-tutorial", "ai-enemy-decisions"],
  capabilities: [
    "services.consume", "services.provide",
    "components.read", "events.on", "events.emit",
  ],
};

function distance2(a, b) {
  return Math.hypot((a.x ?? 0) - (b.x ?? 0), (a.z ?? 0) - (b.z ?? 0));
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

export async function setup(ctx) {
  const entities = ctx.services.get("entities");
  const movement = ctx.services.get("movement");
  const weapons = ctx.services.get("weapons");
  const teams = ctx.services.get("teams");
  const map = ctx.services.get("map");
  const battleRoyale = ctx.services.get("battle-royale");
  const botFill = ctx.services.get("bot-fill");
  const botCombat = ctx.services.get("bot-combat");
  const vehicles = ctx.services.get("vehicles");
  const armorService = ctx.services.has("armor") ? ctx.services.get("armor") : null;
  const aimSteering = ctx.services.has("aim-steering") ? ctx.services.get("aim-steering") : null;
  const healthRegeneration = ctx.services.has("health-regeneration")
    ? ctx.services.get("health-regeneration")
    : null;
  const tutorial = ctx.services.has("battle-royale-tutorial")
    ? ctx.services.get("battle-royale-tutorial")
    : null;
  const aiDecisions = ctx.services.has("ai-enemy-decisions")
    ? ctx.services.get("ai-enemy-decisions")
    : null;
  let humanSerial = 0;
  const expiredHumanSessions = new Set();

  botFill.ensure();
  const spectatorTargets = new Map();
  const entityKills = new Map();
  const teamKills = new Map();

  ctx.events.on("entity:spawned", ({ entityId }) => {
    entityKills.set(entityId, 0);
  });

  ctx.events.on("entity:died", ({ entityId, killerId }) => {
    if (!killerId || killerId === entityId) return;
    const victimTeam = Number(teams.teamOf(entityId)) || 0;
    const killerTeam = Number(teams.teamOf(killerId)) || 0;
    if (victimTeam > 0 && victimTeam === killerTeam) return;
    entityKills.set(killerId, (entityKills.get(killerId) ?? 0) + 1);
    if (killerTeam > 0) {
      teamKills.set(killerTeam, (teamKills.get(killerTeam) ?? 0) + 1);
    }
  });

  function acousticOcclusion(listener, source) {
    if (!listener || !source || typeof map.acousticOcclusionBetween !== "function") return null;
    const value = Number(map.acousticOcclusionBetween(listener, source));
    return Number.isFinite(value) ? clamp01(value) : null;
  }

  function nearestAliveEntity(reference, excludedId = null) {
    let best = null;
    let bestDistance = Infinity;
    for (const entity of entities.all()) {
      if (!entity.alive || entity.id === excludedId) continue;
      const transform = ctx.components.get(entity.id, "Transform");
      if (!transform) continue;
      const distance = reference ? distance2(reference, transform) : 0;
      if (best && distance >= bestDistance) continue;
      best = entity;
      bestDistance = distance;
    }
    return best;
  }

  function spectatorTargetFor(playerId) {
    const player = entities.get(playerId);
    if (!player || player.alive || battleRoyale.status().phase === "ended") return null;
    const ownTeam = Number(teams.teamOf(playerId)) || 0;
    const currentId = spectatorTargets.get(playerId);
    const current = currentId ? entities.get(currentId) : null;
    const sameTeamCurrent = current?.alive && (ownTeam <= 0 || (Number(teams.teamOf(current.id)) || 0) === ownTeam);
    if (sameTeamCurrent) return current;
    if (ownTeam > 0) {
      const aliveMate = entities.all().find((entity) => (
        entity.alive && entity.id !== playerId && (Number(teams.teamOf(entity.id)) || 0) === ownTeam
      ));
      if (aliveMate) {
        spectatorTargets.set(playerId, aliveMate.id);
        return aliveMate;
      }
    }
    if (current?.alive) return current;
    const reference = ctx.components.get(playerId, "Transform");
    const next = nearestAliveEntity(reference, playerId);
    if (next) spectatorTargets.set(playerId, next.id);
    else spectatorTargets.delete(playerId);
    return next;
  }

  ctx.events.on("battle-royale:eliminated", ({ entityId }) => {
    const entity = entities.get(entityId);
    if (!entity || entity.bot) return;
    spectatorTargets.delete(entityId);
    spectatorTargetFor(entityId);
  });

  ctx.events.on("entity:removed", ({ entityId }) => {
    spectatorTargets.delete(entityId);
    for (const [viewerId, targetId] of spectatorTargets) {
      if (targetId === entityId) spectatorTargets.delete(viewerId);
    }
  });

  ctx.events.on("parachute:landed", ({ entityId }) => {
    const human = entities.get(entityId);
    if (!human?.alive || human.bot || human.kind !== "human") return;
    const humanTransform = ctx.components.get(entityId, "Transform");
    const ownTeam = Number(teams.teamOf(entityId)) || 0;
    const botParachutes = ctx.services.has("bot-parachutes") ? ctx.services.get("bot-parachutes") : null;
    if (!humanTransform || ownTeam <= 0 || !botParachutes?.retarget) return;
    const mates = entities.all().filter((e) => (
      e.alive && e.bot && (Number(teams.teamOf(e.id)) || 0) === ownTeam
    ));
    mates.forEach((mate, idx) => {
      const angle = (idx * Math.PI * 2) / Math.max(1, mates.length);
      botParachutes.retarget(mate.id, {
        x: (Number(humanTransform.x) || 0) + Math.cos(angle) * 10,
        y: 0,
        z: (Number(humanTransform.z) || 0) + Math.sin(angle) * 10,
        kind: "squad-drop",
      });
    });
  });

  function recruitHumanSquadBots(playerId, team, squadId) {
    if (tutorial) return [];
    const humanTransform = ctx.components.get(playerId, "Transform");
    const candidates = entities.all()
      .filter((e) => e.bot && e.alive && !e.humanSquad && (Number(teams.teamOf(e.id)) || 0) < 100_000)
      .filter((e) => {
        const m = /^br-bot-(\d+)$/.exec(String(e.id));
        const n = m ? Number(m[1]) : 999;
        return n > 30 && n !== 94;
      });
    const chosen = candidates.slice(-3);
    const recruited = [];
    const stimService = ctx.services.has("stimulants") ? ctx.services.get("stimulants") : null;
    const armorService = ctx.services.has("armor") ? ctx.services.get("armor") : null;
    chosen.forEach((bot, idx) => {
      bot.team = team;
      bot.squadId = squadId;
      bot.humanSquad = playerId;
      bot.squadSlot = idx;
      bot.name = `Напарник ${idx + 1}`;
      const armorComp = ctx.components.get(bot.id, "Armor");
      if (armorComp) {
        armorComp.maximum = Math.max(Number(armorComp.maximum) || 150, 150);
        armorComp.current = armorComp.maximum;
        armorComp.reservePlates = Math.max(Number(armorComp.reservePlates) || 0, 6);
      } else {
        armorService?.grantPlates?.(bot.id, 6);
      }
      stimService?.setCount?.(bot.id, 1);
      stimService?.grantTransfer?.(bot.id, "fast", 2);
      const teamComp = ctx.components.get(bot.id, "Team");
      if (teamComp) teamComp.id = team;
      if (idx === 0) {
        weapons.grant(bot.id, "rifle");
        weapons.grant(bot.id, "marksman");
        weapons.selectById?.(bot.id, "rifle");
      } else if (idx === 1) {
        weapons.grant(bot.id, "marksman");
        weapons.grant(bot.id, "rifle");
        weapons.selectById?.(bot.id, "marksman");
      } else if (idx === 2) {
        weapons.grant(bot.id, "sniper");
        weapons.grant(bot.id, "rifle");
        weapons.selectById?.(bot.id, "sniper");
      }
      if (humanTransform) {
        const angle = (idx * Math.PI * 2) / Math.max(1, chosen.length);
        const spawnY = (Number(humanTransform.y) || 0) > 10 ? 0 : (Number(humanTransform.y) || 0);
        movement.teleport(bot.id, {
          x: (Number(humanTransform.x) || 0) + Math.cos(angle) * 9,
          y: spawnY,
          z: (Number(humanTransform.z) || 0) + Math.sin(angle) * 9,
          angle: Number(humanTransform.angle) || 0,
        });
      }
      recruited.push(bot.id);
    });
    return recruited;
  }

  function squadmatesFor(playerId) {
    const ownTeam = Number(teams.teamOf(playerId)) || 0;
    if (ownTeam <= 0) return [];
    return entities.all()
      .filter((e) => e.id !== playerId && e.alive && (Number(teams.teamOf(e.id)) || 0) === ownTeam)
      .map((e) => e.id);
  }

  function joinStatusFor(playerId, now = Date.now(), options = {}) {
    const matchStatus = battleRoyale.status(now);
    const allowEarly = options?.allowEarlyDropIn !== false;
    if (playerId && expiredHumanSessions.has(playerId)) {
      return { joinable: false, reason: "reconnect-expired" };
    }
    const existing = playerId ? entities.get(playerId) : null;
    if (existing) {
      if (existing.kind !== "human" || existing.bot) {
        return { joinable: false, reason: "non-human-conflict" };
      }
      if (matchStatus.phase === "ended" || matchStatus.ended) {
        return { joinable: false, reason: "ended" };
      }
      if (!existing.alive) {
        return { joinable: false, reason: "eliminated" };
      }
      return { joinable: true, reason: "resumed" };
    }
    if (matchStatus.phase === "ended" || matchStatus.ended) {
      return { joinable: false, reason: "ended" };
    }
    if (matchStatus.phase === "waiting") {
      return { joinable: true, reason: "waiting" };
    }
    if (matchStatus.phase === "active" && matchStatus.deployment?.active) {
      return { joinable: true, reason: "deployment" };
    }
    if (
      allowEarly
      && matchStatus.phase === "active"
      && Number(matchStatus.startedAt) > 0
      && (Number(now) - Number(matchStatus.startedAt) <= EARLY_DROP_IN_WINDOW_MS)
      && Number(matchStatus.alive) >= MIN_ALIVE_FOR_EARLY_DROP_IN
    ) {
      return { joinable: true, reason: "early-drop-in" };
    }
    return { joinable: false, reason: "late-match" };
  }

  function connectHuman(playerId, now = Date.now(), options = {}) {
    const existing = entities.get(playerId);
    if (existing) {
      if (existing.kind !== "human" || existing.bot) {
        throw new Error(`Session id already belongs to a non-human entity: ${playerId}`);
      }
      movement.setInput(playerId, {});
      const team = teams.teamOf(playerId);
      return {
        playerId,
        team,
        squadId: existing.squadId ?? `squad:${team}`,
        squadmates: squadmatesFor(playerId),
        resumed: true,
        mode: "battle-royale",
      };
    }

    const matchStatus = battleRoyale.status(now);
    if (expiredHumanSessions.has(playerId)) {
      throw new Error(`Reconnect grace expired for this battle-royale session: ${playerId}`);
    }
    const allowEarlyDropIn = Boolean(options?.allowEarlyDropIn)
      && matchStatus.phase === "active"
      && !matchStatus.ended
      && Number(matchStatus.startedAt) > 0
      && (Number(now) - Number(matchStatus.startedAt) <= EARLY_DROP_IN_WINDOW_MS)
      && Number(matchStatus.alive) >= MIN_ALIVE_FOR_EARLY_DROP_IN;
    if (matchStatus.phase === "ended" || (matchStatus.phase === "active" && !matchStatus.deployment?.active && !allowEarlyDropIn)) {
      throw new Error(`Battle royale already in progress; late join is not available: ${playerId}`);
    }

    botFill.makeRoomForHuman();
    humanSerial += 1;
    const team = 100_000 + humanSerial;
    const squadId = `squad:${team}`;
    entities.spawn({
      id: playerId,
      kind: "human",
      name: "Игрок",
      bot: false,
      team,
      squadId,
      health: 200,
      armorPlates: 3,
      armorPlateValue: 50,
      armorCurrent: 100,
      armorReserve: 0,
      weapons: ["pistol"],
    });
    const spawned = entities.get(playerId);
    if (spawned) spawned.squadId = squadId;
    const squadmates = recruitHumanSquadBots(playerId, team, squadId);
    tutorial?.start?.(playerId);
    battleRoyale.arm(Number(now) || Date.now());
    return { playerId, team, squadId, squadmates, resumed: false, mode: "battle-royale" };
  }

  function suspendHuman(playerId) {
    const entity = entities.get(playerId);
    if (!entity || entity.kind !== "human" || entity.bot) return false;
    movement.setInput(playerId, {});
    if (vehicles.isDriving?.(playerId)) {
      vehicles.setInput(playerId, { forward: 0, strafe: 0, sprint: true, fireHeld: false });
    }
    armorService?.cancelPlating(playerId, "disconnect");
    return true;
  }

  function disconnectHuman(playerId, now = Date.now()) {
    const entity = entities.get(playerId);
    if (!entity || entity.kind !== "human" || entity.bot) return false;
    const eventNow = Number(now) || Date.now();
    const status = battleRoyale.status(eventNow);
    armorService?.cancelPlating(playerId, "disconnect");
    spectatorTargets.delete(playerId);
    expiredHumanSessions.add(playerId);
    if (status.phase === "active" && !status.deployment?.active && entity.alive) {
      battleRoyale.forfeit?.(playerId, eventNow, "disconnect");
    }
    entities.remove(playerId);
    if (status.phase === "waiting" || status.deployment?.active) botFill.ensure();
    return true;
  }

  function hasInterruptingAction(input) {
    return Boolean(input.firePressed || input.fireHeld || input.reload || input.selectDelta
      || input.interactPressed || input.stimulantPressed);
  }

  function armorCratePlateCount(crateId) {
    const text = String(crateId ?? "armor-crate");
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) hash = ((hash * 31) + text.charCodeAt(i)) >>> 0;
    return 3 + (hash % 2);
  }

  function handleInteraction(playerId) {
    const transform = ctx.components.get(playerId, "Transform");
    if (!transform || typeof map.interact !== "function") return false;
    const result = map.interact({ entityId: playerId, ...transform });
    if (!result || result.type !== "crate") return Boolean(result);

    let applied = false;
    let quantity = 0;
    let restocked = false;
    if (result.loot === "rifle" || result.loot === "marksman" || result.loot === "sniper") {
      const restockAmount = result.loot === "sniper" ? 10 : result.loot === "marksman" ? 24 : 60;
      applied = weapons.grant(playerId, result.loot);
      if (!applied) {
        quantity = weapons.restock?.(playerId, result.loot, restockAmount) ?? 0;
        restocked = quantity > 0;
        applied = restocked;
      }
    }
    if (result.loot === "armor") {
      quantity = armorService?.grantPlates(playerId, armorCratePlateCount(result.crateId)) ?? 0;
      applied = quantity > 0;
    }
    if (result.loot === "airdrop") {
      const grantedSniper = weapons.grant(playerId, "sniper");
      if (!grantedSniper) {
        weapons.restock?.(playerId, "sniper", 10);
      }
      const grantedMarksman = weapons.grant(playerId, "marksman");
      if (!grantedMarksman) {
        weapons.restock?.(playerId, "marksman", 24);
      }
      weapons.restock?.(playerId, "rifle", 60);
      const satchelGranted = Boolean(armorService?.grantSatchel?.(playerId));
      const platesAdded = armorService?.grantPlates?.(playerId, 8) ?? 0;
      quantity = platesAdded;
      applied = Boolean(grantedSniper || grantedMarksman || satchelGranted || platesAdded > 0);
    }
    if (result.loot === "juggernaut") {
      const entity = entities.get(playerId);
      if (entity) entity.juggernaut = true;
      const healthComp = ctx.components.get(playerId, "Health");
      if (healthComp) {
        healthComp.maximum = Math.max(Number(healthComp.maximum) || 200, JUGGERNAUT_HEALTH);
        healthComp.current = JUGGERNAUT_HEALTH;
        ctx.events.emit("health:changed", {
          entityId: playerId,
          health: healthComp.current,
          maximum: healthComp.maximum,
        });
      }
      armorService?.grantJuggernautArmor?.(playerId);
      if (!weapons.grant(playerId, "sniper")) weapons.restock?.(playerId, "sniper", 20);
      else weapons.restock?.(playerId, "sniper", 15);
      if (!weapons.grant(playerId, "marksman")) weapons.restock?.(playerId, "marksman", 48);
      else weapons.restock?.(playerId, "marksman", 36);
      if (!weapons.grant(playerId, "rifle")) weapons.restock?.(playerId, "rifle", 90);
      else weapons.restock?.(playerId, "rifle", 60);
      quantity = 12;
      applied = true;
      ctx.events.emit("juggernaut:equipped", {
        entityId: playerId,
        crateId: result.crateId,
        health: JUGGERNAUT_HEALTH,
        armor: 600,
        x: result.x,
        y: result.y,
        z: result.z,
      });
    }
    if (result.loot === "electro-lukashenko") {
      quantity = 1;
      applied = true;
    }
    if (result.loot === "drop-pack" && result.dropItem) {
      const drop = result.dropItem;
      const stimulantsService = ctx.services.has("stimulants") ? ctx.services.get("stimulants") : null;
      const itemId = String(drop.itemId ?? "");
      const amount = Math.max(1, Math.floor(Number(drop.quantity) || 1));
      if (itemId === "armor-plate") {
        quantity = armorService?.grantPlates?.(playerId, amount) ?? 0;
        applied = quantity > 0;
      } else if (itemId === "stim-standard") {
        quantity = stimulantsService?.grantTransfer?.(playerId, "standard", amount) ?? 0;
        applied = quantity > 0;
      } else if (itemId === "stim-fast") {
        quantity = stimulantsService?.grantTransfer?.(playerId, "fast", amount) ?? 0;
        applied = quantity > 0;
      } else if (itemId === "stim-turbo") {
        quantity = stimulantsService?.grantTransfer?.(playerId, "turbo", amount) ?? 0;
        applied = quantity > 0;
      } else if (itemId.startsWith("ammo-")) {
        const weaponId = itemId.slice(5);
        quantity = weapons.grantAmmo?.(playerId, weaponId, amount) ?? 0;
        applied = quantity > 0;
      }
      if (quantity < amount) {
        const crateRef = Array.isArray(map.crates)
          ? map.crates.find((crate) => crate.id === result.crateId)
          : null;
        if (crateRef && crateRef.dropItem) {
          crateRef.dropItem.quantity = Math.max(1, amount - quantity);
          crateRef.opened = false;
        }
      }
    }
    ctx.events.emit("loot:picked", {
      entityId: playerId,
      crateId: result.crateId,
      loot: result.loot,
      dropItem: result.dropItem ?? null,
      applied,
      quantity,
      restocked,
      x: result.x,
      y: result.y,
      z: result.z,
    });
    return true;
  }

  function handleInput(playerId, input = {}, now = Date.now()) {
    const entity = entities.get(playerId);
    if (!entity?.alive) return;
    tutorial?.handleInput?.(playerId, input, now);

    if (!battleRoyale.canAct(now)) {
      movement.setInput(playerId, {});
      return;
    }

    if (input.platePressed && armorService?.startFullPlating(playerId, now)) {
      // Keep movement active while the armor sequence starts.
    }

    if (armorService?.isPlating(playerId)) {
      if (hasInterruptingAction(input)) armorService.cancelPlating(playerId, "action");
      // Movement is allowed during plating.
    }

    if (input.interactPressed) {
      movement.setInput(playerId, {});
      if (handleInteraction(playerId)) return;
    }

    const movementInput = aimSteering?.adjustInput(playerId, input, now) ?? input;
    movement.setInput(playerId, movementInput);
    if (input.firePressed) weapons.fire(playerId, now, { pressed: true });
    if (input.reload) weapons.reload(playerId, now);
    if (input.selectDelta) weapons.select(playerId, input.selectDelta);
  }

  function step(dt, now = Date.now()) {
    battleRoyale.tick(now);
    armorService?.tick(now);
    if (!battleRoyale.isActive()) {
      for (const entity of entities.all()) movement.setInput(entity.id, {});
      return;
    }
    botCombat.tick(dt, now);
    movement.tick(dt, now);
    weapons.tickAutomatic(now);
    healthRegeneration?.tick(dt, now);
  }

  // Snapshot is read-only. Using ComponentRegistry.snapshot() here would
  // structuredClone *every* component, for every visible entity, for
  // every recipient. Only the fields used by the network view are needed.
  // A network broadcast observes one synchronous, unchanging world frame.
  // Share base entity descriptions across listeners inside that frame only.
  // Direct Engine Control queries and normal snapshots never use this cache.
  let networkFrameEntities = null;
  function withSnapshotBatch(callback) {
    const previous = networkFrameEntities;
    networkFrameEntities = new Map();
    try {
      return callback();
    } finally {
      networkFrameEntities = previous;
    }
  }

  function entitySnapshot(entity) {
    const cached = networkFrameEntities?.get(entity.id);
    if (cached) return { ...cached };
    const transform = ctx.components.get(entity.id, "Transform") ?? null;
    const health = ctx.components.get(entity.id, "Health") ?? null;
    const armor = ctx.components.get(entity.id, "Armor") ?? null;
    const armorDescription = armorService?.describe(entity.id) ?? null;
    const inventory = ctx.components.get(entity.id, "Weapons") ?? null;
    const selected = inventory?.items?.[inventory.selected] ?? null;
    const position = {
      x: transform?.x ?? 0,
      y: transform?.y ?? 0,
      z: transform?.z ?? 0,
    };
    const drivenVehicle = vehicles.vehicleForDriver?.(entity.id) ?? null;
    const semanticPosition = drivenVehicle
      ? { x: drivenVehicle.x, y: 0, z: drivenVehicle.z }
      : position;
    const teamId = ctx.components.get(entity.id, "Team")?.id ?? 0;
    const personalKills = entityKills.get(entity.id) ?? 0;
    const totalSquadKills = teamId > 0 ? Math.max(personalKills, teamKills.get(teamId) ?? 0) : personalKills;
    const view = {
      id: entity.id,
      name: entity.name,
      bot: entity.bot,
      alive: entity.alive,
      team: teamId,
      kills: personalKills,
      squadKills: totalSquadKills,
      x: position.x,
      y: position.y,
      z: position.z,
      angle: transform?.angle ?? 0,
      surface: map.surfaceAt?.(semanticPosition) ?? map.defaultSurface ?? "forest",
      acousticZone: map.acousticZoneAt?.(semanticPosition) ?? "outdoor",
      location: map.locationAt?.(semanticPosition) ?? "Карта",
      health: health?.current ?? null,
      healthMax: health?.maximum ?? null,
      armor: armor?.current ?? null,
      armorMax: armor?.maximum ?? null,
      armorPlates: armorDescription?.platesRemaining ?? null,
      armorPlateMax: armorDescription?.maximumPlates ?? null,
      armorReserve: armorDescription?.reservePlates ?? null,
      armorReserveMax: armorDescription?.reserveCapacity ?? null,
      armorSatchel: armorDescription?.hasSatchel ?? false,
      juggernaut: Boolean(entity.juggernaut),
      electroLukashenko: Boolean(entity.electroLukashenko),
      official: Boolean(entity.official),
      plating: armorDescription?.plating ?? false,
      weapon: selected?.id ?? null,
      weapons: inventory?.items?.map((item) => item.id) ?? [],
      ammo: selected?.ammo ?? null,
      reserve: selected?.reserve ?? null,
    };
    if (networkFrameEntities) networkFrameEntities.set(entity.id, view);
    return view;
  }

  function mapSnapshot(listener = null) {
    const lx = Number(listener?.x) || 0;
    const ly = Number(listener?.y) || 0;
    const lz = Number(listener?.z) || 0;
    return {
      id: map.id,
      halfSize: map.halfSize,
      crates: Array.isArray(map.crates)
        ? map.crates.map((crate) => {
          const isAirdrop = Boolean(crate.airdrop);
          const opened = Boolean(crate.opened);
          let occlusion = 0;
          if (listener && !opened) {
            const cy = Number(crate.y) || 0;
            const dx = (Number(crate.x) || 0) - lx;
            const dz = (Number(crate.z) || 0) - lz;
            const maxHoriz = isAirdrop ? 90 : 35;
            const maxVert = isAirdrop ? 18 : 12;
            if (Math.abs(ly - cy) <= maxVert && (dx * dx + dz * dz) <= maxHoriz * maxHoriz) {
              occlusion = acousticOcclusion(listener, crate) ?? 0;
            }
          }
          return {
            id: crate.id,
            x: crate.x,
            y: crate.y ?? 0,
            z: crate.z,
            loot: crate.loot ?? null,
            airdrop: isAirdrop,
            juggernaut: Boolean(crate.juggernaut || crate.loot === "juggernaut"),
            electroLukashenko: Boolean(crate.electroLukashenko || crate.loot === "electro-lukashenko"),
            airdropPhase: crate.airdropPhase ?? null,
            opened,
            occlusion,
          };
        })
        : [],
    };
  }

  function setEnemyAiMode(nextMode, now = Date.now()) {
    return aiDecisions?.setMode?.(nextMode, now) ?? "standard";
  }

  function aiEnemiesState(now = Date.now()) {
    return aiDecisions?.describe?.(now) ?? null;
  }

  function snapshot(now = Date.now()) {
    const aiEnemies = aiDecisions?.describe?.(now) ?? null;
    return {
      now,
      mode: "battle-royale",
      map: mapSnapshot(),
      match: battleRoyale.status(now),
      ...(aiEnemies ? { aiEnemies } : {}),
      entities: entities.all().map(entity => entitySnapshot(entity, now)),
    };
  }

  function snapshotFor(playerId, now = Date.now()) {
    const selfEntity = entities.get(playerId);
    const selfTransform = selfEntity ? ctx.components.get(playerId, "Transform") : null;
    const spectatorTarget = spectatorTargetFor(playerId);
    const listenerTransform = spectatorTarget
      ? ctx.components.get(spectatorTarget.id, "Transform")
      : selfTransform;
    const ownTeam = Number(teams.teamOf(playerId)) || 0;
    const visible = [];
    for (const entity of entities.all()) {
      const sameTeamAlive = ownTeam > 0
        && entity.alive
        && (Number(teams.teamOf(entity.id)) || 0) === ownTeam;
      const otherAliveHuman = entity.alive && !entity.bot && entity.kind === "human";
      if (entity.id === playerId || entity.id === spectatorTarget?.id || sameTeamAlive || otherAliveHuman) {
        visible.push(entitySnapshot(entity, now));
        continue;
      }
      if (!listenerTransform) continue;
      const transform = ctx.components.get(entity.id, "Transform");
      if (!transform) continue;
      const radius = entity.alive ? ENTITY_INTEREST_RADIUS : 30;
      if (distance2(listenerTransform, transform) <= radius) visible.push(entitySnapshot(entity, now));
    }
    const tutorialState = tutorial?.describe?.(playerId) ?? null;
    const aiEnemies = aiDecisions?.describe?.(now) ?? null;
    return {
      now,
      mode: "battle-royale",
      map: mapSnapshot(listenerTransform),
      match: battleRoyale.status(now),
      ...(tutorialState ? { tutorial: tutorialState } : {}),
      ...(aiEnemies ? { aiEnemies } : {}),
      playerPlacement: battleRoyale.placementOf(playerId),
      spectator: spectatorTarget ? {
        active: true,
        targetId: spectatorTarget.id,
        targetName: spectatorTarget.name,
      } : null,
      entities: visible,
    };
  }

  function eventsForPlayer(playerId, packets = []) {
    const spectatorTarget = spectatorTargetFor(playerId);
    const listenerId = spectatorTarget?.id ?? playerId;
    const self = ctx.components.get(listenerId, "Transform");
    const ownTeam = Number(teams.teamOf(listenerId)) || 0;
    const listenerVehicleId = vehicles?.vehicleForDriver?.(listenerId)?.id
      ?? vehicles?.vehicleForPassenger?.(listenerId)?.id
      ?? null;
    const globalEvents = new Set([
      "battle-royale:deployment",
      "battle-royale:started",
      "battle-royale:remaining",
      "battle-royale:ended",
      "battle-royale:zone-closing",
      "crate:airdrop-incoming",
      "crate:airdrop-landed",
      "crate:airdrop-opened",
      "crate:juggernaut-incoming",
      "crate:juggernaut-landed",
      "juggernaut:equipped",
      "combat:killfeed",
    ]);
    const selected = packets.filter((packet) => {
      const payload = packet.payload ?? {};
      if (packet.event.startsWith("ai-decisions:")) return true;
      if (globalEvents.has(packet.event)) return true;
      if (packet.event === "feedback:sound") return payload.recipientId === playerId;
      if (packet.event === "movement:blocked") return payload.recipientId === playerId;
      if (packet.event.startsWith("ragdoll:")) return payload.entityId === playerId;
      if (packet.event === "battle-royale:zone-damage") return payload.entityId === playerId;
      if (packet.event.startsWith("armor:")) {
        if (payload.entityId === playerId || payload.entityId === listenerId) return true;
        if (packet.event === "armor:changed") {
          return ownTeam > 0 && payload.entityId && (Number(teams.teamOf(payload.entityId)) || 0) === ownTeam;
        }
        if (self && Number.isFinite(payload.x) && Number.isFinite(payload.z)) {
          return distance2(self, payload) <= Number(payload.radius ?? 34) + 4;
        }
        return ownTeam > 0 && payload.entityId && (Number(teams.teamOf(payload.entityId)) || 0) === ownTeam;
      }
      if (packet.event === "weapon:selected" || packet.event === "weapon:unlocked") return payload.entityId === playerId;
      if (packet.event === "loot:picked") return payload.entityId === playerId;
      if (packet.event === "combat:damage") return payload.targetId === playerId || payload.attackerId === playerId;
      if (packet.event === "entity:died") {
        if (payload.entityId === playerId || payload.killerId === playerId) return true;
        if (ownTeam > 0 && payload.killerId && (Number(teams.teamOf(payload.killerId)) || 0) === ownTeam) return true;
        return ownTeam > 0 && payload.entityId && (Number(teams.teamOf(payload.entityId)) || 0) === ownTeam;
      }
      if (packet.event === "vehicle:passenger-entered" || packet.event === "vehicle:passenger-exited") {
        if (payload.entityId === listenerId || payload.driverId === listenerId) return true;
        if (listenerVehicleId && payload.vehicleId === listenerVehicleId) return true;
        return ownTeam > 0 && payload.entityId && (Number(teams.teamOf(payload.entityId)) || 0) === ownTeam;
      }
      if (packet.event === "squad:callout") {
        if (payload.recipientId === playerId || payload.killerId === listenerId) return true;
        if (ownTeam > 0 && (payload.targetTeamId === ownTeam || payload.teamId === ownTeam)) return true;
        if (self && Number.isFinite(payload.x) && Number.isFinite(payload.z)) {
          return distance2(self, payload) <= Number(payload.radius ?? 65);
        }
        return false;
      }
      if (!self) return false;
      if (packet.event === "sound:spatial") {
        if (payload.entityId === playerId) return true;
        return distance2(self, payload) <= Number(payload.radius ?? 40) + 4;
      }
      if (packet.event === "weapon:fired") {
        if (payload.entityId === playerId) return true;
        if (payload.shooterIsHuman && payload.assistedTargetId === playerId) return true;
        const firedRange = payload.shooterIsHuman ? 220 : 125;
        return distance2(self, payload) <= firedRange;
      }
      if (packet.event === "world:door") return payload.entityId === playerId || distance2(self, payload) <= 35;
      if (packet.event === "loot:opened") return payload.entityId === playerId || distance2(self, payload) <= 28;
      if (packet.event === "battle-royale:eliminated") {
        if (payload.entityId === playerId || payload.killerId === playerId) return true;
        return ownTeam > 0 && payload.killerId && (Number(teams.teamOf(payload.killerId)) || 0) === ownTeam;
      }
      return false;
    });

    if (!self) return selected;
    return selected.map((packet) => {
      if (
        packet.event !== "sound:spatial"
        && packet.event !== "loot:opened"
        && packet.event !== "crate:airdrop-landed"
        && packet.event !== "crate:juggernaut-landed"
        && !packet.event.startsWith("armor:")
      ) return packet;
      const payload = packet.payload ?? {};
      if (!Number.isFinite(payload.x) || !Number.isFinite(payload.z)) return packet;
      const occlusion = acousticOcclusion(self, payload);
      if (occlusion == null) return packet;
      return {
        ...packet,
        payload: { ...payload, occlusion },
      };
    });
  }

  ctx.services.provide("match-api", {
    withSnapshotBatch,
    mode: "battle-royale",
    snapshotIntervalMs: SNAPSHOT_INTERVAL_MS,
    joinStatusFor,
    connectHuman,
    suspendHuman,
    disconnectHuman,
    handleInput,
    step,
    snapshot,
    snapshotFor,
    eventsForPlayer,
    setEnemyAiMode,
    aiEnemiesState,
  });
}
