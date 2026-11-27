import {
  CANNON_CONFIG,
  CANNON_MODES,
  ELECTRO_LUKASHENKO_STATS,
  ELECTRO_RIFLE_MODES,
  ELECTRO_SUPER_JUMP_CONFIG,
  LANDMINE_CONFIG,
  MINI_NUKE_CONFIG,
  RESIDENCE_SITE,
  cannonModeById,
  chooseBotShopAction,
  computeCannonChargeProfile,
  computeMiniNukeTarget,
  createAdaptiveBunkerPuzzle,
  electroModeById,
  evaluateBlastDamage,
  evaluateCannonImpact,
  isInsideResidenceNoGuidanceZone,
  nextCannonMode,
  nextElectroMode,
  submitPuzzleStep,
} from "../../game/special-ops-arsenal.js";

export const manifest = {
  id: "battle-royale-special-ops",
  version: "1.0.0",
  requires: [
    "entities",
    "teams",
    "movement",
    "weapons",
    "combat",
    "rapier-physics",
    "map-test-arena",
    "battle-royale",
    "match-api",
  ],
  optional: [
    "armor",
    "stimulants",
    "injury",
    "ragdoll",
    "parachute",
    "battle-royale-shop",
    "battle-royale-navigation",
    "battle-royale-crate-generator",
    "battle-royale-crate-physics",
    "battle-royale-tutorial",
    "target-assist",
  ],
  capabilities: [
    "services.consume",
    "services.provide",
    "components.read",
    "components.write",
    "events.on",
    "events.emit",
  ],
};

function finite(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function distance2(a, b) {
  return Math.hypot(finite(a?.x) - finite(b?.x), finite(a?.z) - finite(b?.z));
}

function distance3(a, b) {
  return Math.hypot(
    finite(a?.x) - finite(b?.x),
    finite(a?.y) - finite(b?.y),
    finite(a?.z) - finite(b?.z),
  );
}

export async function setup(ctx) {
  const entities = ctx.services.get("entities");
  const teams = ctx.services.get("teams");
  const movement = ctx.services.get("movement");
  const weapons = ctx.services.get("weapons");
  const combat = ctx.services.get("combat");
  const physics = ctx.services.get("physics");
  const map = ctx.services.get("map");
  const battleRoyale = ctx.services.get("battle-royale");
  const matchApi = ctx.services.get("match-api");

  const armor = ctx.services.has("armor") ? ctx.services.get("armor") : null;
  const stimulants = ctx.services.has("stimulants") ? ctx.services.get("stimulants") : null;
  const injury = ctx.services.has("injury") ? ctx.services.get("injury") : null;
  const targeting = ctx.services.has("targeting") ? ctx.services.get("targeting") : null;
  const ragdoll = ctx.services.has("ragdoll") ? ctx.services.get("ragdoll") : null;
  const parachute = ctx.services.has("parachute") ? ctx.services.get("parachute") : null;
  const shop = ctx.services.has("shop")
    ? ctx.services.get("shop")
    : (ctx.services.has("battle-royale-shop") ? ctx.services.get("battle-royale-shop") : null);
  const navigation = ctx.services.has("navigation") ? ctx.services.get("navigation") : null;
  const tutorial = ctx.services.has("battle-royale-tutorial") ? ctx.services.get("battle-royale-tutorial") : null;

  // Per-entity state
  const mineCounts = new Map();
  const nukeCounts = new Map();
  const electroModes = new Map();
  const cannonModes = new Map();
  const cannonCharges = new Map(); // entityId -> { startedAt, lastMilestone, active: true }
  const electroJumpStates = new Map(); // entityId -> { phase, startY, currentY, apexY, vx, vy, vz, startedAt, glideStartedAt, targetX, targetZ }
  const electroJumpCooldowns = new Map();
  const nukeAimStates = new Map(); // entityId -> { active, distanceIndex, startedAt }
  const internalStimCooldowns = new Map();
  const nukeLaunchCooldowns = new Map();
  const botShopCooldowns = new Map();
  const botMineCooldowns = new Map();
  const botBossActionCooldowns = new Map();
  const bunkerPuzzles = new Map(); // playerId -> puzzleState

  const vehicles = ctx.services.has("vehicles") ? ctx.services.get("vehicles") : null;

  // Balance tuning: empower human squadmates and prevent random enemy bots from shredding them unfairly
  const originalCombatDamage = combat.damage.bind(combat);
  combat.damage = (targetId, amount, source = {}) => {
    const rawAmount = Number(amount);
    const weaponId = source?.weaponId ?? null;
    if (
      !Number.isFinite(rawAmount)
      || rawAmount <= 0
      || weaponId === "bleed-out"
      || weaponId === "zone"
      || weaponId === "landmine"
      || weaponId === "mini-nuke"
      || weaponId === "cannon"
    ) {
      return originalCombatDamage(targetId, amount, source);
    }
    const attacker = source?.attackerId ? entities.get(source.attackerId) : null;
    const target = targetId ? entities.get(targetId) : null;
    const isLiveProjectileShot = Number.isFinite(Number(source?.distance));
    let multiplier = 1;
    if (attacker?.bot && target) {
      if (attacker.humanSquad && !target.humanSquad && target.id !== attacker.humanSquad) {
        multiplier = 1.55;
      } else if (!attacker.humanSquad && !attacker.juggernaut && !attacker.electroLukashenko) {
        if (target.bot && target.humanSquad) {
          multiplier = attacker.official ? 0.68 : 0.55;
        } else if (!target.bot && isLiveProjectileShot) {
          multiplier = attacker.official ? 0.85 : 0.78;
        }
      }
    }
    const scaled = multiplier === 1 ? rawAmount : Math.max(1, Math.round(rawAmount * multiplier));
    return originalCombatDamage(targetId, scaled, source);
  };

  const plantedMines = [];
  const pendingNukes = [];
  const activeCannonballs = [];
  const pendingCannonSalvos = [];
  let mineSerial = 0;
  let nukeSerial = 0;
  let cannonballSerial = 0;
  let directorCrateSerial = 0;
  let vaultUnlocked = false;
  let vaultLooted = false;
  let officialsInitialized = false;
  let lastBunkerBeaconAt = 0;
  let lastBotLoopAt = 0;
  let lastRivalNukeAt = 0;
  let lastLateGameCashAt = 0;
  let lastDirectorDropAt = 0;

  // World positions for Residence Hatch, Deep Bunker Exit, and Bunker Vault
  const HATCH_TOP = Object.freeze({
    x: RESIDENCE_SITE.x + RESIDENCE_SITE.hatchLocalX,
    y: 0,
    z: RESIDENCE_SITE.z + RESIDENCE_SITE.hatchLocalZ,
  });
  const BUNKER_ENTRANCE = Object.freeze({
    x: RESIDENCE_SITE.x,
    y: RESIDENCE_SITE.bunkerY,
    z: RESIDENCE_SITE.z + RESIDENCE_SITE.bunkerHalfZ - 2.5,
  });
  const BUNKER_VAULT = Object.freeze({
    x: RESIDENCE_SITE.x + RESIDENCE_SITE.vaultLocalX,
    y: RESIDENCE_SITE.bunkerY,
    z: RESIDENCE_SITE.z + RESIDENCE_SITE.vaultLocalZ,
  });

  // Build deep subterranean Residence Bunker & Labyrinth at y = -14 (cleanly below y = 0 ground slab)
  function buildResidenceBunkerGeometry() {
    const cx = RESIDENCE_SITE.x;
    const cz = RESIDENCE_SITE.z;
    const by = RESIDENCE_SITE.bunkerY;
    const hx = RESIDENCE_SITE.bunkerHalfX;
    const hz = RESIDENCE_SITE.bunkerHalfZ;
    const wallH = 3.2;

    physics.beginBatch?.();
    try {
      physics.createFloor({
        x: cx,
        y: by,
        z: cz,
        hx: hx + 1,
        hz: hz + 1,
        thickness: 0.4,
        kind: "building-floor",
        surface: "concrete",
        accessibleName: "пол бункера резиденции",
      });

      const addBunkerWall = (x, z, whx, whz, name = "стена бункера") => {
        physics.createWall({
          x,
          y: by,
          z,
          hx: whx,
          hz: whz,
          height: wallH,
          kind: "building-wall",
          material: "concrete",
          accessibleName: name,
        });
      };

      // Outer bunker perimeter
      addBunkerWall(cx, cz - hz, hx + 0.3, 0.3, "северная стена бункера");
      addBunkerWall(cx, cz + hz, hx + 0.3, 0.3, "южная стена бункера");
      addBunkerWall(cx - hx, cz, 0.3, hz + 0.3, "западная стена бункера");
      addBunkerWall(cx + hx, cz, 0.3, hz + 0.3, "восточная стена бункера");

      // Interior labyrinth baffles (wide 4m+ passages so blind navigation by sound/walls is fair & fun!)
      addBunkerWall(cx - 3.5, cz + 5.0, 9.0, 0.28, "перегородка лабиринта бункера");
      addBunkerWall(cx + 3.5, cz - 0.5, 9.0, 0.28, "перегородка лабиринта бункера");
      addBunkerWall(cx - 4.0, cz - 6.0, 8.0, 0.28, "перегородка лабиринта бункера");
    } finally {
      physics.endBatch?.();
    }
  }

  buildResidenceBunkerGeometry();

  // Initialize mines/nukes for existing and newly spawned entities
  function ensureStock(entityId) {
    if (!mineCounts.has(entityId)) mineCounts.set(entityId, LANDMINE_CONFIG.startingCount);
    if (!nukeCounts.has(entityId)) nukeCounts.set(entityId, 0);
    if (!electroModes.has(entityId)) electroModes.set(entityId, ELECTRO_RIFLE_MODES[0].id);
    if (!cannonModes.has(entityId)) cannonModes.set(entityId, CANNON_MODES[0].id);
  }

  for (const entity of entities.all()) {
    if (entity?.id) ensureStock(entity.id);
  }

  ctx.events.on("entity:spawned", ({ entityId }) => {
    if (!entityId) return;
    mineCounts.set(entityId, LANDMINE_CONFIG.startingCount);
    nukeCounts.set(entityId, 0);
    electroModes.set(entityId, ELECTRO_RIFLE_MODES[0].id);
    cannonModes.set(entityId, CANNON_MODES[0].id);
    cannonCharges.delete(entityId);
  });

  ctx.events.on("entity:removed", ({ entityId }) => {
    mineCounts.delete(entityId);
    nukeCounts.delete(entityId);
    electroModes.delete(entityId);
    cannonModes.delete(entityId);
    cannonCharges.delete(entityId);
    electroJumpStates.delete(entityId);
    electroJumpCooldowns.delete(entityId);
    nukeAimStates.delete(entityId);
    internalStimCooldowns.delete(entityId);
    botBossActionCooldowns.delete(entityId);
    bunkerPuzzles.delete(entityId);
  });

  ctx.events.on("entity:died", ({ entityId }) => {
    if (!entityId) return;
    cannonCharges.delete(entityId);
  });

  ctx.events.on("weapon:selected", ({ entityId, weaponId }) => {
    if (!entityId || weaponId === "cannon") return;
    if (cannonCharges.has(entityId)) {
      cannonCharges.delete(entityId);
      ctx.events.emit("cannon:charge-cancelled", { entityId, reason: "weapon-switched", now: Date.now() });
    }
  });

  ctx.events.on("entity:respawned", ({ entityId }) => {
    if (!entityId) return;
    mineCounts.set(entityId, Math.max(mineCounts.get(entityId) ?? 0, LANDMINE_CONFIG.startingCount));
    electroJumpStates.delete(entityId);
    cannonCharges.delete(entityId);
    const ent = entities.get(entityId);
    if (ent) ent.electroJumpActive = false;
    nukeAimStates.delete(entityId);
  });

  function mineCountOf(entityId) {
    ensureStock(entityId);
    return Math.max(0, Math.floor(mineCounts.get(entityId) ?? 0));
  }

  function grantMines(entityId, amount = 2) {
    const entity = entities.get(entityId);
    if (!entity?.alive) return 0;
    const current = mineCountOf(entityId);
    const added = Math.min(LANDMINE_CONFIG.maxCarry - current, Math.max(0, Math.floor(amount)));
    if (added > 0) mineCounts.set(entityId, current + added);
    return added;
  }

  function nukeCountOf(entityId) {
    ensureStock(entityId);
    return Math.max(0, Math.floor(nukeCounts.get(entityId) ?? 0));
  }

  function grantNuke(entityId, amount = MINI_NUKE_CONFIG.packCharges) {
    const entity = entities.get(entityId);
    if (!entity?.alive) return 0;
    const current = nukeCountOf(entityId);
    const added = Math.min(MINI_NUKE_CONFIG.maxCarry - current, Math.max(0, Math.floor(amount)));
    if (added > 0) nukeCounts.set(entityId, current + added);
    return added;
  }

  function electroModeOf(entityId) {
    ensureStock(entityId);
    return electroModeById(electroModes.get(entityId));
  }

  function cycleElectroMode(entityId, now = Date.now()) {
    const entity = entities.get(entityId);
    if (!entity?.alive) return null;
    if (!weapons.has?.(entityId, "electro-rifle")) {
      ctx.events.emit("special:info", {
        entityId,
        text: "У тебя пока нет электрического автомата-шокера. Найди его в бункере Резиденции или закажи груз в магазине.",
        now,
      });
      return null;
    }
    const next = nextElectroMode(electroModes.get(entityId));
    electroModes.set(entityId, next.id);
    ctx.events.emit("special:electro-mode-changed", {
      entityId,
      modeId: next.id,
      modeLabel: next.label,
      shortLabel: next.shortLabel,
      now,
    });
    return next;
  }

  function cannonModeOf(entityId) {
    ensureStock(entityId);
    return cannonModeById(cannonModes.get(entityId));
  }

  function setCannonMode(entityId, modeId, now = Date.now()) {
    const entity = entities.get(entityId);
    if (!entity?.alive) return null;
    if (!weapons.has?.(entityId, "cannon")) {
      ctx.events.emit("special:info", {
        entityId,
        text: "У тебя нет эксклюзивной пушки «Смертонос». Её можно купить в магазине или получить с Джаггернаутом / Электрическим Лукашенко.",
        now,
      });
      return null;
    }
    const mode = cannonModeById(modeId);
    cannonModes.set(entityId, mode.id);
    if (cannonCharges.has(entityId)) {
      cannonCharges.delete(entityId);
      ctx.events.emit("cannon:charge-cancelled", { entityId, reason: "mode-changed", now });
    }
    ctx.events.emit("special:cannon-mode-changed", {
      entityId,
      modeId: mode.id,
      modeLabel: mode.label,
      shortLabel: mode.shortLabel,
      now,
    });
    return mode;
  }

  function cycleCannonMode(entityId, now = Date.now()) {
    const entity = entities.get(entityId);
    if (!entity?.alive) return null;
    if (!weapons.has?.(entityId, "cannon")) {
      ctx.events.emit("special:info", {
        entityId,
        text: "У тебя нет эксклюзивной пушки «Смертонос». Её можно купить в магазине или получить с Джаггернаутом / Электрическим Лукашенко.",
        now,
      });
      return null;
    }
    const next = nextCannonMode(cannonModes.get(entityId));
    return setCannonMode(entityId, next.id, now);
  }

  function grantExclusiveCannon(entityId, { select = false } = {}) {
    if (!weapons.grant(entityId, "cannon")) {
      weapons.restock?.(entityId, "cannon", 20);
    }
    if (select) weapons.selectById?.(entityId, "cannon");
  }

  function isBlockedBySolidWall(origin, targetPos, excludeA = null, excludeB = null) {
    if (typeof physics?.raycast !== "function") return false;
    const dx = finite(targetPos?.x) - finite(origin?.x);
    const dy = (finite(targetPos?.y) + 1.0) - (finite(origin?.y) + 0.65);
    const dz = finite(targetPos?.z) - finite(origin?.z);
    const dist = Math.hypot(dx, dy, dz);
    if (dist < 1.0) return false;
    const hit = physics.raycast(
      { x: finite(origin?.x), y: finite(origin?.y) + 0.65, z: finite(origin?.z) },
      { x: dx / dist, y: dy / dist, z: dz / dist },
      dist - 0.55,
      excludeA,
    );
    if (!hit) return false;
    if (hit.entityId && (hit.entityId === excludeA || hit.entityId === excludeB)) return false;
    const worldObj = hit.worldObject ?? hit.metadata ?? null;
    const kind = String(worldObj?.kind ?? hit.kind ?? "");
    if (worldObj?.vehicleId || kind === "vehicle-chassis" || kind === "vehicle-ballast") return false;
    return !hit.entityId;
  }

  function detonateCannonball(ball, impactPos, now = Date.now(), {
    directEntityId = null,
    directVehicleId = null,
  } = {}) {
    const ix = finite(impactPos?.x, ball.x);
    const iy = Math.max(0, finite(impactPos?.y, ball.y));
    const iz = finite(impactPos?.z, ball.z);
    const owner = entities.get(ball.ownerId);
    const ownerTeam = Number(teams.teamOf(ball.ownerId)) || 0;
    const launchedVehicles = vehicles?.applyBlastImpulse?.(
      { x: ix, y: iy, z: iz },
      {
        radius: ball.blastRadius + 14,
        maxUpVelocity: ball.vehicleUp,
        maxOutVelocity: ball.vehicleOut,
        maxSpin: ball.vehicleSpin,
        direction: { x: ball.vx, z: ball.vz },
        directVehicleId,
        now,
      },
    ) ?? [];

    let hitCount = 0;
    let mitigatedCount = 0;
    for (const target of entities.all()) {
      if (!target?.alive || target.id === ball.ownerId) continue;
      if (ball.piercing && ball.piercedEntities.has(target.id) && directEntityId !== target.id) continue;
      const targetTeam = Number(teams.teamOf(target.id)) || 0;
      if (ownerTeam > 0 && targetTeam === ownerTeam) continue;
      const pos = ctx.components.get(target.id, "Transform");
      if (!pos) continue;
      const dx = finite(pos.x) - ix;
      const dy = (finite(pos.y) - iy) * 0.55;
      const dz = finite(pos.z) - iz;
      const dist = Math.hypot(dx, dy, dz);
      const isDirect = directEntityId === target.id;
      if (!isDirect && dist > ball.blastRadius) continue;

      const blockedByCover = !isDirect && !ball.piercing && (
        Boolean(pos.inCover) || isBlockedBySolidWall({ x: ix, y: iy, z: iz }, pos, ball.ownerId, target.id)
      );
      const impact = evaluateCannonImpact({
        distance: dist,
        blastRadius: ball.blastRadius,
        lethalCoreRadius: ball.lethalCoreRadius,
        maxDamage: ball.maxDamage,
        minEdgeDamage: ball.minEdgeDamage,
        ragdollUp: ball.ragdollUp,
        ragdollOut: ball.ragdollOut,
        piercing: ball.piercing,
        targetBlockedByCover: blockedByCover,
        targetCrouching: Boolean(pos.crouching),
        targetElectro: Boolean(target.electroLukashenko),
        targetJuggernaut: Boolean(target.juggernaut),
        directHit: isDirect,
      });
      if (!impact.hit) continue;
      hitCount += 1;
      if (impact.mitigatedByCover) mitigatedCount += 1;

      combat.damage(target.id, impact.damage, {
        attackerId: ball.ownerId,
        weaponId: "cannon",
        distance: Math.round(ball.traveled),
      });

      if (ragdoll?.trigger && impact.ragdollOut > 0.5) {
        const horiz = Math.hypot(dx, dz);
        const dirX = horiz > 0.2 ? dx / horiz : (ball.dirX || 0.7);
        const dirZ = horiz > 0.2 ? dz / horiz : (ball.dirZ || -0.7);
        ragdoll.trigger(target.id, {
          reason: "cannon-blast",
          vx: dirX * impact.ragdollOut,
          vy: Math.max(4.5, impact.ragdollUp),
          vz: dirZ * impact.ragdollOut,
          dead: !target.alive,
          allowDowned: true,
          now,
        });
      }
    }

    // Chain-detonate any planted landmines caught in the cannonball's blast wave
    for (const mine of plantedMines) {
      if (mine.detonated) continue;
      if (distance3({ x: ix, y: iy, z: iz }, mine) <= ball.blastRadius) {
        detonatePlantedMine(mine, now, ball.ownerId);
      }
    }

    ctx.events.emit("sound:spatial", {
      entityId: ball.ownerId,
      key: "cannon.impact",
      x: ix,
      y: iy,
      z: iz,
      radius: 1200,
      offset: LANDMINE_CONFIG.soundOffsetSec,
    });
    ctx.events.emit("cannon:impact", {
      ballId: ball.id,
      ownerId: ball.ownerId,
      ownerName: owner?.name ?? "Боец",
      modeId: ball.modeId,
      chargeRatio: ball.chargeRatio,
      blastRadius: ball.blastRadius,
      x: Number(ix.toFixed(2)),
      y: Number(iy.toFixed(2)),
      z: Number(iz.toFixed(2)),
      traveled: Math.round(ball.traveled),
      hitCount,
      mitigatedCount,
      launchedVehicles: launchedVehicles.length,
      now,
    });
  }

  function applyStandingCannonRecoil(entityId, transform, { heavy = false, now = Date.now() } = {}) {
    if (!transform || transform.crouching) return false;
    const backX = -Math.sin(finite(transform.angle));
    const backZ = Math.cos(finite(transform.angle));
    if (heavy && ragdoll?.trigger) {
      ragdoll.trigger(entityId, {
        reason: "cannon-recoil",
        vx: backX * CANNON_CONFIG.standingHeavyRecoilPush,
        vy: CANNON_CONFIG.standingHeavyRecoilVy,
        vz: backZ * CANNON_CONFIG.standingHeavyRecoilPush,
        dead: false,
        allowDowned: false,
        now,
      });
    } else if (typeof physics?.moveCharacter === "function") {
      const moved = physics.moveCharacter(entityId, {
        x: backX * CANNON_CONFIG.standingRecoilPush,
        y: 0,
        z: backZ * CANNON_CONFIG.standingRecoilPush,
      });
      if (moved) {
        transform.x = moved.x;
        transform.y = moved.y;
        transform.z = moved.z;
      }
    } else {
      const limit = Math.max(40, finite(map.halfSize, 1000) - 4);
      transform.x = Math.max(-limit, Math.min(limit, finite(transform.x) + backX * CANNON_CONFIG.standingRecoilPush));
      transform.z = Math.max(-limit, Math.min(limit, finite(transform.z) + backZ * CANNON_CONFIG.standingRecoilPush));
    }
    ctx.events.emit("cannon:recoil-unbraced", {
      entityId,
      heavy,
      x: finite(transform.x),
      y: finite(transform.y),
      z: finite(transform.z),
      now,
    });
    return true;
  }

  function resolveCannonAim(entityId, transform, mode, startY, speed, gravity) {
    const baseYaw = finite(transform.angle);
    const baseDirX = Math.sin(baseYaw);
    const baseDirZ = -Math.cos(baseYaw);
    const baseDir = { x: baseDirX, y: 0, z: baseDirZ };
    const sx = finite(transform.x);
    const sz = finite(transform.z);
    const maxAssistRange = Math.min(700, finite(mode?.range, CANNON_CONFIG.range));

    // Candidate 1: enemy target assist (works across full cannon range)
    let bestCandidate = null;
    const resolved = targeting?.resolveShot
      ? targeting.resolveShot(entityId, baseDir, maxAssistRange, {
        weaponId: "cannon",
        piercesVehicles: true,
      })
      : null;
    if (resolved?.targetId) {
      const targetPos = ctx.components.get(resolved.targetId, "Transform");
      if (targetPos && Math.abs(finite(targetPos.y) - finite(transform.y)) <= 12) {
        const dx = finite(targetPos.x) - sx;
        const dz = finite(targetPos.z) - sz;
        const dist = Math.hypot(dx, dz);
        if (dist >= 2.5 && dist <= maxAssistRange) {
          const dot = (dx * baseDirX + dz * baseDirZ) / dist;
          bestCandidate = {
            kind: "enemy",
            x: finite(targetPos.x),
            y: finite(targetPos.y) + 1.02,
            z: finite(targetPos.z),
            dist,
            dot,
          };
        }
      }
    }

    // For piercing mode, also assist locking enemies behind walls inside a tight 6.5 deg forward cone
    if (!bestCandidate && mode?.piercing) {
      const ownerTeam = Number(teams.teamOf(entityId)) || 0;
      const minEnemyDot = Math.cos((6.5 * Math.PI) / 180);
      for (const target of entities.all()) {
        if (!target?.alive || target.id === entityId) continue;
        const tTeam = Number(teams.teamOf(target.id)) || 0;
        if (ownerTeam > 0 && tTeam === ownerTeam) continue;
        const tPos = ctx.components.get(target.id, "Transform");
        if (!tPos) continue;
        const dx = finite(tPos.x) - sx;
        const dz = finite(tPos.z) - sz;
        const dist = Math.hypot(dx, dz);
        if (dist < 2.5 || dist > maxAssistRange) continue;
        if (Math.abs(finite(tPos.y) - finite(transform.y)) > 16) continue;
        const dot = (dx * baseDirX + dz * baseDirZ) / dist;
        if (dot < minEnemyDot) continue;
        if (!bestCandidate || dot > bestCandidate.dot + 0.004 || (Math.abs(dot - bestCandidate.dot) <= 0.004 && dist < bestCandidate.dist)) {
          bestCandidate = {
            kind: "enemy",
            x: finite(tPos.x),
            y: finite(tPos.y) + 1.02,
            z: finite(tPos.z),
            dist,
            dot,
          };
        }
      }
    }

    // Candidate 2: vehicle aim-assist within 9.5 deg cone so blind players aiming by 3D sound hit cars cleanly at 50..450m!
    const activeVehicles = typeof vehicles?.snapshot === "function" ? vehicles.snapshot() : [];
    const minVehDot = Math.cos((9.5 * Math.PI) / 180);
    for (const veh of activeVehicles) {
      if (!veh) continue;
      const vx = finite(veh.x);
      const vy = finite(veh.y, 1.1);
      const vz = finite(veh.z);
      const dx = vx - sx;
      const dz = vz - sz;
      const dist = Math.hypot(dx, dz);
      if (dist < 3.0 || dist > maxAssistRange) continue;
      if (Math.abs(vy - finite(transform.y)) > 14) continue;
      const dot = (dx * baseDirX + dz * baseDirZ) / dist;
      if (dot < minVehDot) continue;
      if (
        !bestCandidate
        || dot > bestCandidate.dot + 0.005
        || (Math.abs(dot - bestCandidate.dot) <= 0.005 && dist < bestCandidate.dist)
      ) {
        bestCandidate = {
          kind: "vehicle",
          x: vx,
          y: Math.max(0.85, vy),
          z: vz,
          dist,
          dot,
        };
      }
    }

    if (!bestCandidate) {
      return {
        yaw: baseYaw,
        pitchRad: CANNON_CONFIG.pitchUpRad,
      };
    }

    const dx = bestCandidate.x - sx;
    const dz = bestCandidate.z - sz;
    const aimYaw = Math.atan2(dx, -dz);
    const flightTime = bestCandidate.dist / Math.max(40, speed);
    const compensatedDy = (bestCandidate.y - startY) + 0.5 * gravity * flightTime * flightTime;
    const rawPitch = Math.atan2(compensatedDy, Math.max(1, bestCandidate.dist));
    const pitchRad = Math.max(-0.18, Math.min(0.085, rawPitch));
    return {
      yaw: aimYaw,
      pitchRad,
    };
  }

  function spawnCannonball(entityId, mode, {
    yawOffsetRad = 0,
    chargeRatio = 0,
    emitShotAudio = true,
    now = Date.now(),
  } = {}) {
    const entity = entities.get(entityId);
    const transform = ctx.components.get(entityId, "Transform");
    if (!entity?.alive || !transform) return null;

    const chargeProfile = mode.id === "charged" ? computeCannonChargeProfile(chargeRatio) : null;
    const speed = chargeProfile ? chargeProfile.speed : mode.speed;
    const gravity = chargeProfile ? chargeProfile.gravity : mode.gravity;
    const wakeRadius = chargeProfile ? chargeProfile.wakeRadius : (mode.wakeRadius ?? CANNON_CONFIG.wakeRadius);
    const blastRadius = chargeProfile ? chargeProfile.blastRadius : mode.blastRadius;
    const lethalCoreRadius = chargeProfile ? chargeProfile.lethalCoreRadius : mode.lethalCoreRadius;
    const maxDamage = chargeProfile ? chargeProfile.maxDamage : mode.maxDamage;
    const minEdgeDamage = chargeProfile ? chargeProfile.minEdgeDamage : mode.minEdgeDamage;
    const ragdollUp = chargeProfile ? chargeProfile.ragdollUp : mode.ragdollUp;
    const ragdollOut = chargeProfile ? chargeProfile.ragdollOut : mode.ragdollOut;
    const vehicleUp = chargeProfile ? chargeProfile.vehicleUp : mode.vehicleUp;
    const vehicleOut = chargeProfile ? chargeProfile.vehicleOut : mode.vehicleOut;
    const vehicleSpin = chargeProfile ? chargeProfile.vehicleSpin : mode.vehicleSpin;

    const startY = finite(transform.y) + (transform.crouching ? 0.98 : 1.18);
    const aim = resolveCannonAim(entityId, transform, mode, startY, speed, gravity);
    const yaw = aim.yaw + yawOffsetRad;
    const dirX = Math.sin(yaw);
    const dirZ = -Math.cos(yaw);
    // Flat heavy cannonball trajectory (with slope/gravity compensation when locked onto a car or enemy)
    const pitchUp = aim.pitchRad;
    const cosPitch = Math.cos(pitchUp);
    const vx = dirX * cosPitch * speed;
    const vy = Math.sin(pitchUp) * speed;
    const vz = dirZ * cosPitch * speed;

    const startX = finite(transform.x) + dirX * 1.15;
    const startZ = finite(transform.z) + dirZ * 1.15;

    cannonballSerial += 1;
    const ball = {
      id: `cannonball-${cannonballSerial}`,
      ownerId: entityId,
      team: Number(teams.teamOf(entityId)) || 0,
      modeId: mode.id,
      chargeRatio: Number((chargeProfile?.chargeRatio ?? 0).toFixed(3)),
      x: startX,
      y: startY,
      z: startZ,
      vx,
      vy,
      vz,
      dirX,
      dirZ,
      speed,
      gravity,
      wakeRadius,
      traveled: 0,
      maxRange: mode.range,
      blastRadius,
      lethalCoreRadius,
      maxDamage,
      minEdgeDamage,
      ragdollUp,
      ragdollOut,
      vehicleUp,
      vehicleOut,
      vehicleSpin,
      piercing: Boolean(mode.piercing),
      piercedEntities: new Set(),
      piercedVehicles: new Set(),
      wakeHitEntities: new Set(),
      wakeRockedVehicles: new Set(),
      lastWallPierceTraveled: -10,
      createdAt: now,
    };
    activeCannonballs.push(ball);

    if (emitShotAudio) {
      ctx.events.emit("weapon:fired", {
        entityId,
        weaponId: "cannon",
        modeId: mode.id,
        chargeRatio: ball.chargeRatio,
        shooterIsHuman: !entity.bot,
        shooterTeam: ball.team,
        x: startX,
        y: startY,
        z: startZ,
        directionX: dirX,
        directionZ: dirZ,
        now,
      });
      ctx.events.emit("sound:spatial", {
        entityId,
        key: "weapon.cannon",
        modeId: mode.id,
        chargeRatio: ball.chargeRatio,
        x: startX,
        y: startY,
        z: startZ,
        radius: 900,
      });
    }
    ctx.events.emit("cannon:launched", {
      ballId: ball.id,
      ownerId: entityId,
      modeId: mode.id,
      chargeRatio: ball.chargeRatio,
      x: startX,
      y: startY,
      z: startZ,
      vx,
      vy,
      vz,
      maxRange: mode.range,
      now,
    });
    return ball;
  }

  function fireCannon(entityId, now = Date.now(), { chargeRatio = 0 } = {}) {
    const entity = entities.get(entityId);
    const transform = ctx.components.get(entityId, "Transform");
    if (!entity?.alive || !transform || injury?.isDowned?.(entityId)) return false;
    if (vehicles?.isDriving?.(entityId) || vehicles?.isPassenger?.(entityId)) return false;
    const selected = weapons.selected?.(entityId);
    if (selected?.id !== "cannon") return false;

    const mode = cannonModeOf(entityId);
    const reloadMs = mode.id === "salvo" || (mode.id === "charged" && chargeRatio >= 0.7)
      ? CANNON_CONFIG.heavyReloadMs
      : CANNON_CONFIG.reloadMs;
    const ammoRequested = mode.id === "salvo" ? CANNON_CONFIG.salvoCount : 1;
    const spent = weapons.consumeAmmo?.(entityId, ammoRequested, now, {
      reloadMs,
      minIntervalMs: CANNON_CONFIG.minFireIntervalMs,
    });
    if (!spent?.ok) return false;

    const unbracedSpread = transform.crouching ? 0 : 0.032;
    if (mode.id === "shrapnel") {
      CANNON_CONFIG.shrapnelSpreadDeg.forEach((deg, idx) => {
        const rad = (deg * Math.PI) / 180 + (idx === 3 ? 0 : unbracedSpread * (idx % 2 === 0 ? 1 : -1));
        spawnCannonball(entityId, mode, {
          yawOffsetRad: rad,
          chargeRatio: 0,
          emitShotAudio: idx === 0,
          now,
        });
      });
      applyStandingCannonRecoil(entityId, transform, { heavy: false, now });
      return true;
    }

    if (mode.id === "salvo") {
      const count = Math.max(1, Math.min(CANNON_CONFIG.salvoCount, spent.spent));
      for (let i = 0; i < count; i += 1) {
        const deg = CANNON_CONFIG.salvoSpreadDeg[i % CANNON_CONFIG.salvoSpreadDeg.length] ?? 0;
        const rad = (deg * Math.PI) / 180;
        if (i === 0) {
          spawnCannonball(entityId, mode, { yawOffsetRad: rad, chargeRatio: 0, emitShotAudio: true, now });
        } else {
          pendingCannonSalvos.push({
            entityId,
            mode,
            yawOffsetRad: rad,
            fireAt: now + i * CANNON_CONFIG.salvoIntervalMs,
          });
        }
      }
      applyStandingCannonRecoil(entityId, transform, { heavy: true, now });
      return true;
    }

    const effectiveRatio = mode.id === "charged"
      ? Math.max(CANNON_CONFIG.chargeMinRatio, Math.min(1, finite(chargeRatio, CANNON_CONFIG.chargeMinRatio)))
      : 0;
    spawnCannonball(entityId, mode, {
      yawOffsetRad: 0,
      chargeRatio: effectiveRatio,
      emitShotAudio: true,
      now,
    });
    applyStandingCannonRecoil(entityId, transform, {
      heavy: mode.id === "charged" && effectiveRatio >= 0.65,
      now,
    });
    return true;
  }

  function startCannonCharge(entityId, now = Date.now()) {
    const entity = entities.get(entityId);
    if (!entity?.alive || injury?.isDowned?.(entityId)) return false;
    if (vehicles?.isDriving?.(entityId) || vehicles?.isPassenger?.(entityId)) return false;
    if (weapons.selected?.(entityId)?.id !== "cannon") return false;
    if (cannonModeOf(entityId).id !== "charged") return false;
    if (cannonCharges.has(entityId)) return true;
    const inv = ctx.components.get(entityId, "Weapons");
    const cannonItem = inv?.items?.[inv.selected];
    if (!cannonItem || cannonItem.ammo <= 0 || cannonItem.reloadUntil > now) return false;

    cannonCharges.set(entityId, {
      startedAt: now,
      lastMilestone: 0,
      active: true,
    });
    ctx.events.emit("cannon:charge-started", { entityId, now });
    return true;
  }

  function releaseCannonCharge(entityId, now = Date.now()) {
    const state = cannonCharges.get(entityId);
    if (!state) return false;
    cannonCharges.delete(entityId);
    const elapsed = Math.max(0, now - finite(state.startedAt, now));
    const ratio = Math.max(
      CANNON_CONFIG.chargeMinRatio,
      Math.min(1, elapsed / CANNON_CONFIG.chargeMaxMs),
    );
    return fireCannon(entityId, now, { chargeRatio: ratio });
  }

  function tickCannonballs(now = Date.now(), dt = 0.05) {
    const safeDt = Math.max(0.001, Math.min(0.1, finite(dt, 0.05)));

    // 1. Update charging players (auto-cancel if invalid, emit 50%/100% milestones)
    for (const [entityId, charge] of [...cannonCharges.entries()]) {
      const entity = entities.get(entityId);
      const selectedId = weapons.selected?.(entityId)?.id ?? null;
      if (
        !entity?.alive
        || injury?.isDowned?.(entityId)
        || selectedId !== "cannon"
        || cannonModeOf(entityId).id !== "charged"
        || vehicles?.isDriving?.(entityId)
        || vehicles?.isPassenger?.(entityId)
      ) {
        cannonCharges.delete(entityId);
        ctx.events.emit("cannon:charge-cancelled", { entityId, reason: "interrupted", now });
        continue;
      }
      const ratio = Math.max(0, Math.min(1, (now - charge.startedAt) / CANNON_CONFIG.chargeMaxMs));
      const milestone = ratio >= 1 ? 100 : (ratio >= 0.5 ? 50 : 0);
      if (milestone > charge.lastMilestone) {
        charge.lastMilestone = milestone;
        ctx.events.emit("cannon:charge-milestone", {
          entityId,
          percent: milestone,
          chargeRatio: Number(ratio.toFixed(2)),
          now,
        });
      }
    }

    // 2. Fire queued salvo cannonballs
    for (let i = pendingCannonSalvos.length - 1; i >= 0; i -= 1) {
      const item = pendingCannonSalvos[i];
      if (now < item.fireAt) continue;
      pendingCannonSalvos.splice(i, 1);
      const ent = entities.get(item.entityId);
      if (!ent?.alive || injury?.isDowned?.(item.entityId)) continue;
      spawnCannonball(item.entityId, item.mode, {
        yawOffsetRad: item.yawOffsetRad,
        chargeRatio: 0,
        emitShotAudio: true,
        now,
      });
    }

    // 3. Integrate flying physical cannonballs step-by-step (no tunneling!)
    if (!activeCannonballs.length) return;
    const activeVehicles = typeof vehicles?.snapshot === "function" ? vehicles.snapshot() : [];
    const aliveList = entities.all().filter((e) => e?.alive);
    const mapLimit = Math.max(80, finite(map.halfSize, 1000) - 2);

    for (let idx = activeCannonballs.length - 1; idx >= 0; idx -= 1) {
      const ball = activeCannonballs[idx];
      const totalSpeed = Math.hypot(ball.vx, ball.vy, ball.vz);
      const totalStepDist = totalSpeed * safeDt;
      const substeps = Math.max(1, Math.min(12, Math.ceil(totalStepDist / 3.5)));
      const subDt = safeDt / substeps;
      let removed = false;

      for (let s = 0; s < substeps; s += 1) {
        const prevX = ball.x;
        const prevY = ball.y;
        const prevZ = ball.z;
        ball.vy -= ball.gravity * subDt;
        const nextX = prevX + ball.vx * subDt;
        const nextY = prevY + ball.vy * subDt;
        const nextZ = prevZ + ball.vz * subDt;
        const segDx = nextX - prevX;
        const segDy = nextY - prevY;
        const segDz = nextZ - prevZ;
        const segLen = Math.hypot(segDx, segDy, segDz);
        if (segLen <= 0.0001) continue;

        const applyPiercingVehicleHit = (vehId, hitPos) => {
          if (!vehId || ball.piercedVehicles.has(vehId)) return;
          ball.piercedVehicles.add(vehId);
          ball.wakeRockedVehicles.add(vehId);
          const hx = finite(hitPos?.x, ball.x);
          const hy = Math.max(0, finite(hitPos?.y, ball.y));
          const hz = finite(hitPos?.z, ball.z);
          const launched = vehicles?.applyBlastImpulse?.(
            { x: hx, y: hy, z: hz },
            {
              radius: 28,
              maxUpVelocity: ball.vehicleUp,
              maxOutVelocity: ball.vehicleOut,
              maxSpin: ball.vehicleSpin,
              direction: { x: ball.vx, z: ball.vz },
              directVehicleId: vehId,
              now,
            },
          ) ?? [];
          let splashHits = 0;
          for (const target of aliveList) {
            if (!target?.alive || target.id === ball.ownerId || ball.piercedEntities.has(target.id)) continue;
            const tTeam = Number(teams.teamOf(target.id)) || 0;
            if (ball.team > 0 && tTeam === ball.team) continue;
            const tPos = ctx.components.get(target.id, "Transform");
            if (!tPos) continue;
            const d = Math.hypot(finite(tPos.x) - hx, finite(tPos.z) - hz);
            if (d > 24) continue;
            ball.piercedEntities.add(target.id);
            splashHits += 1;
            const scale = 1 - (d / 24) * 0.45;
            combat.damage(target.id, Math.round(ball.maxDamage * 0.78 * scale), {
              attackerId: ball.ownerId,
              weaponId: "cannon",
              distance: Math.round(ball.traveled),
            });
            if (ragdoll?.trigger) {
              const outDirX = d > 0.2 ? (finite(tPos.x) - hx) / d : ball.dirX;
              const outDirZ = d > 0.2 ? (finite(tPos.z) - hz) / d : ball.dirZ;
              ragdoll.trigger(target.id, {
                reason: "cannon-pierce",
                vx: outDirX * ball.ragdollOut * scale,
                vy: Math.max(9.5, ball.ragdollUp * scale),
                vz: outDirZ * ball.ragdollOut * scale,
                dead: !target.alive,
                allowDowned: true,
                now,
              });
            }
          }
          const owner = entities.get(ball.ownerId);
          ctx.events.emit("sound:spatial", {
            entityId: ball.ownerId,
            key: "cannon.pierce",
            x: hx,
            y: hy,
            z: hz,
            radius: 1100,
            offset: LANDMINE_CONFIG.soundOffsetSec,
          });
          ctx.events.emit("cannon:impact", {
            ballId: ball.id,
            ownerId: ball.ownerId,
            ownerName: owner?.name ?? "Боец",
            modeId: ball.modeId,
            chargeRatio: ball.chargeRatio,
            blastRadius: 28,
            pierced: true,
            x: Number(hx.toFixed(2)),
            y: Number(hy.toFixed(2)),
            z: Number(hz.toFixed(2)),
            traveled: Math.round(ball.traveled),
            hitCount: splashHits,
            mitigatedCount: 0,
            launchedVehicles: Math.max(1, launched.length),
            now,
          });
        };

        const applyPiercingEntityHit = (target, hitPos) => {
          if (!target || ball.piercedEntities.has(target.id)) return;
          ball.piercedEntities.add(target.id);
          ball.wakeHitEntities.add(target.id);
          const hx = finite(hitPos?.x, ball.x);
          const hy = Math.max(0, finite(hitPos?.y, ball.y));
          const hz = finite(hitPos?.z, ball.z);
          combat.damage(target.id, ball.maxDamage, {
            attackerId: ball.ownerId,
            weaponId: "cannon",
            distance: Math.round(ball.traveled),
          });
          if (ragdoll?.trigger) {
            ragdoll.trigger(target.id, {
              reason: "cannon-pierce",
              vx: ball.dirX * ball.ragdollOut,
              vy: ball.ragdollUp,
              vz: ball.dirZ * ball.ragdollOut,
              dead: !target.alive,
              allowDowned: true,
              now,
            });
          }
          const owner = entities.get(ball.ownerId);
          ctx.events.emit("sound:spatial", {
            entityId: ball.ownerId,
            key: "cannon.pierce",
            x: hx,
            y: hy,
            z: hz,
            radius: 860,
            offset: LANDMINE_CONFIG.soundOffsetSec,
          });
          ctx.events.emit("cannon:impact", {
            ballId: ball.id,
            ownerId: ball.ownerId,
            ownerName: owner?.name ?? "Боец",
            modeId: ball.modeId,
            chargeRatio: ball.chargeRatio,
            blastRadius: 12,
            pierced: true,
            x: Number(hx.toFixed(2)),
            y: Number(hy.toFixed(2)),
            z: Number(hz.toFixed(2)),
            traveled: Math.round(ball.traveled),
            hitCount: 1,
            mitigatedCount: 0,
            launchedVehicles: 0,
            now,
          });
        };

        // 3a. Wall / vehicle / static geometry check via Rapier raycast
        if (typeof physics?.raycast === "function") {
          const hit = physics.raycast(
            { x: prevX, y: prevY, z: prevZ },
            { x: segDx / segLen, y: segDy / segLen, z: segDz / segLen },
            segLen,
            ball.ownerId,
          );
          if (hit) {
            const worldObj = hit.worldObject ?? hit.metadata ?? null;
            const hitKind = String(worldObj?.kind ?? hit.kind ?? "");
            const hitVehId = worldObj?.vehicleId ?? null;
            const hitDist = Math.max(0, Math.min(segLen, finite(hit.distance ?? hit.toi, segLen)));
            const hitX = hit.point?.x ?? (prevX + (segDx / segLen) * hitDist);
            const hitY = hit.point?.y ?? (prevY + (segDy / segLen) * hitDist);
            const hitZ = hit.point?.z ?? (prevZ + (segDz / segLen) * hitDist);

            if (hitVehId) {
              if (ball.piercing) {
                ball.traveled += hitDist;
                applyPiercingVehicleHit(hitVehId, { x: hitX, y: hitY, z: hitZ });
                ball.traveled -= hitDist;
              } else {
                ball.x = hitX;
                ball.y = hitY;
                ball.z = hitZ;
                ball.traveled += hitDist;
                detonateCannonball(ball, { x: ball.x, y: ball.y, z: ball.z }, now, { directVehicleId: hitVehId });
                activeCannonballs.splice(idx, 1);
                removed = true;
                break;
              }
            } else if (!hit.entityId && hitKind !== "ground" && hitKind !== "floor") {
              if (ball.piercing) {
                // Piercing cannonball punches straight through building walls & cover with heavy concrete shatter!
                if (ball.traveled - ball.lastWallPierceTraveled >= 2.5) {
                  ball.lastWallPierceTraveled = ball.traveled;
                  ball.vx *= 0.985;
                  ball.vz *= 0.985;
                  ctx.events.emit("sound:spatial", {
                    entityId: ball.ownerId,
                    key: "cannon.pierce",
                    x: hitX,
                    y: hitY,
                    z: hitZ,
                    radius: 860,
                    offset: LANDMINE_CONFIG.soundOffsetSec,
                  });
                }
              } else {
                ball.x = hitX;
                ball.y = hitY;
                ball.z = hitZ;
                ball.traveled += hitDist;
                detonateCannonball(ball, { x: ball.x, y: ball.y, z: ball.z }, now);
                activeCannonballs.splice(idx, 1);
                removed = true;
                break;
              }
            }
          }
        }

        ball.x = nextX;
        ball.y = nextY;
        ball.z = nextZ;
        ball.traveled += segLen;

        // 3b. Direct vehicle proximity hit (dense massive cannonball body)
        let directVehicleHit = null;
        for (const veh of activeVehicles) {
          if (!veh || ball.piercedVehicles.has(veh.id)) continue;
          const horizDist = Math.hypot(ball.x - finite(veh.x), ball.z - finite(veh.z));
          const vertDist = Math.abs(ball.y - finite(veh.y, 1.1));
          if (horizDist <= 5.0 && vertDist <= 3.4) {
            directVehicleHit = veh;
            break;
          }
        }
        if (directVehicleHit) {
          if (ball.piercing) {
            applyPiercingVehicleHit(directVehicleHit.id, { x: ball.x, y: ball.y, z: ball.z });
          } else {
            detonateCannonball(ball, { x: ball.x, y: ball.y, z: ball.z }, now, { directVehicleId: directVehicleHit.id });
            activeCannonballs.splice(idx, 1);
            removed = true;
            break;
          }
        }

        // 3c. Direct enemy hit (wider dense iron core)
        let directTarget = null;
        for (const target of aliveList) {
          if (!target.alive || target.id === ball.ownerId || ball.piercedEntities.has(target.id)) continue;
          const tTeam = Number(teams.teamOf(target.id)) || 0;
          if (ball.team > 0 && tTeam === ball.team) continue;
          const tPos = ctx.components.get(target.id, "Transform");
          if (!tPos) continue;
          const hd = Math.hypot(ball.x - finite(tPos.x), ball.z - finite(tPos.z));
          const vd = Math.abs(ball.y - (finite(tPos.y) + 1.0));
          if (hd <= 2.4 && vd <= 2.4) {
            directTarget = target;
            break;
          }
        }
        if (directTarget) {
          if (ball.piercing) {
            applyPiercingEntityHit(directTarget, { x: ball.x, y: ball.y, z: ball.z });
          } else {
            detonateCannonball(ball, { x: ball.x, y: ball.y, z: ball.z }, now, { directEntityId: directTarget.id });
            activeCannonballs.splice(idx, 1);
            removed = true;
            break;
          }
        }

        // 3c-2. Dense aerodynamic shockwave wake along the flying cannonball's corridor
        if (ball.traveled >= 4.5 && ball.wakeRadius > 0) {
          const wakeR = ball.wakeRadius;
          for (const target of aliveList) {
            if (!target.alive || target.id === ball.ownerId) continue;
            if (ball.wakeHitEntities.has(target.id) || ball.piercedEntities.has(target.id)) continue;
            const tTeam = Number(teams.teamOf(target.id)) || 0;
            if (ball.team > 0 && tTeam === ball.team) continue;
            const tPos = ctx.components.get(target.id, "Transform");
            if (!tPos) continue;
            const dx = finite(tPos.x) - ball.x;
            const dz = finite(tPos.z) - ball.z;
            const hd = Math.hypot(dx, dz);
            const vd = Math.abs(ball.y - (finite(tPos.y) + 1.0));
            if (hd > wakeR || vd > 3.6) continue;
            ball.wakeHitEntities.add(target.id);
            const proximity = 1 - Math.min(1, hd / wakeR) * 0.5;
            const wakeDmg = Math.round((CANNON_CONFIG.wakeDamage + ball.chargeRatio * 75) * proximity);
            combat.damage(target.id, wakeDmg, {
              attackerId: ball.ownerId,
              weaponId: "cannon",
              distance: Math.round(ball.traveled),
            });
            if (ragdoll?.trigger) {
              const outX = hd > 0.2 ? dx / hd : -ball.dirZ;
              const outZ = hd > 0.2 ? dz / hd : ball.dirX;
              ragdoll.trigger(target.id, {
                reason: "cannon-wake",
                vx: (outX * 0.7 + ball.dirX * 0.5) * CANNON_CONFIG.wakeRagdollOut * proximity,
                vy: Math.max(7, CANNON_CONFIG.wakeRagdollUp * proximity),
                vz: (outZ * 0.7 + ball.dirZ * 0.5) * CANNON_CONFIG.wakeRagdollOut * proximity,
                dead: !target.alive,
                allowDowned: true,
                now,
              });
            }
          }
          for (const veh of activeVehicles) {
            if (!veh || ball.piercedVehicles.has(veh.id) || ball.wakeRockedVehicles.has(veh.id)) continue;
            const hd = Math.hypot(ball.x - finite(veh.x), ball.z - finite(veh.z));
            const vd = Math.abs(ball.y - finite(veh.y, 1.1));
            if (hd <= wakeR + 2.4 && vd <= 4.2) {
              ball.wakeRockedVehicles.add(veh.id);
              vehicles?.applyBlastImpulse?.(
                { x: ball.x, y: ball.y, z: ball.z },
                {
                  radius: wakeR + 4,
                  maxUpVelocity: ball.vehicleUp * 0.48,
                  maxOutVelocity: ball.vehicleOut * 0.52,
                  maxSpin: ball.vehicleSpin * 0.65,
                  direction: { x: ball.vx, z: ball.vz },
                  directVehicleId: veh.id,
                  now,
                },
              );
            }
          }
        }

        // 3d. Ground, maxRange (700m), or map boundary impact
        if (
          ball.y <= 0.12
          || ball.traveled >= ball.maxRange
          || Math.abs(ball.x) >= mapLimit
          || Math.abs(ball.z) >= mapLimit
        ) {
          detonateCannonball(ball, { x: ball.x, y: Math.max(0, ball.y), z: ball.z }, now);
          activeCannonballs.splice(idx, 1);
          removed = true;
          break;
        }
      }
      if (removed) continue;
    }
  }

  function equipElectroLukashenko(entityId, now = Date.now(), source = "crate") {
    const entity = entities.get(entityId);
    if (!entity?.alive) return false;
    entity.electroLukashenko = true;
    entity.juggernaut = true;

    const hp = ctx.components.get(entityId, "Health");
    if (hp) {
      hp.maximum = Math.max(Number(hp.maximum) || 200, ELECTRO_LUKASHENKO_STATS.maxHealth);
      hp.current = ELECTRO_LUKASHENKO_STATS.maxHealth;
      ctx.events.emit("health:changed", {
        entityId,
        health: hp.current,
        maximum: hp.maximum,
      });
    }
    armor?.grantElectroLukashenkoArmor?.(entityId);
    if (!weapons.grant(entityId, "electro-rifle")) {
      weapons.restock?.(entityId, "electro-rifle", 360);
    } else {
      weapons.restock?.(entityId, "electro-rifle", 240);
    }
    // Also grant exclusive Smertonos cannon to Electro-Lukashenko!
    grantExclusiveCannon(entityId, { select: false });
    // Select electro-rifle immediately
    weapons.selectById?.(entityId, "electro-rifle");

    stimulants?.grantJuggernautStims?.(entityId);
    grantMines(entityId, 2);
    grantNuke(entityId, MINI_NUKE_CONFIG.packCharges);

    const pos = ctx.components.get(entityId, "Transform") ?? { x: 0, y: 0, z: 0 };
    ctx.events.emit("special:electro-equipped", {
      entityId,
      name: entity.name ?? "Боец",
      bot: Boolean(entity.bot),
      health: ELECTRO_LUKASHENKO_STATS.maxHealth,
      armor: ELECTRO_LUKASHENKO_STATS.maxArmor,
      source,
      x: finite(pos.x),
      y: finite(pos.y),
      z: finite(pos.z),
      now,
    });
    return true;
  }

  // Convert 5 mid-pool enemy bots into patrolling Чиновники-революционеры at the Residence & Bunker
  function initializeOfficialsIfNeeded() {
    if (officialsInitialized || tutorial) return;
    officialsInitialized = true;
    const spots = [
      { x: RESIDENCE_SITE.x - 5.0, y: 0, z: RESIDENCE_SITE.z + 12.0, label: "у входа Резиденции" },
      { x: RESIDENCE_SITE.x + 5.0, y: 0, z: RESIDENCE_SITE.z + 12.0, label: "у входа Резиденции" },
      { x: RESIDENCE_SITE.x - 4.0, y: 0, z: RESIDENCE_SITE.z + 3.5, label: "в зале Резиденции" },
      { x: RESIDENCE_SITE.x + 4.5, y: 0, z: RESIDENCE_SITE.z - 4.0, label: "у люка бункера" },
      { x: RESIDENCE_SITE.x + 3.0, y: RESIDENCE_SITE.bunkerY, z: RESIDENCE_SITE.z - 4.5, label: "в лабиринте бункера" },
    ];
    let idx = 0;
    for (const bot of entities.all()) {
      if (idx >= spots.length) break;
      if (!bot?.bot || !bot.alive || bot.humanSquad) continue;
      const m = /^br-bot-(\d+)$/.exec(String(bot.id));
      const num = m ? Number(m[1]) : 0;
      if (num < 41 || num > 48) continue;
      const spot = spots[idx];
      idx += 1;
      bot.official = true;
      bot.name = `Чиновник-революционер ${idx}`;
      bot.residenceGuard = true;
      bot.team = 99_500;
      bot.squadId = "residence-officials";
      const teamComp = ctx.components.get(bot.id, "Team");
      if (teamComp) teamComp.id = 99_500;
      const para = ctx.components.get(bot.id, "Parachute");
      if (para) {
        Object.assign(para, {
          phase: "landed",
          airborne: false,
          simulatedVerticalVelocity: 0,
        });
      }
      movement.teleport(bot.id, { x: spot.x, y: spot.y, z: spot.z, angle: Math.PI });
      shop?.grantCash?.(bot.id, 1200, "official-treasury");
    }
  }

  // Plant a landmine at entity's position
  function plantMine(entityId, now = Date.now()) {
    const entity = entities.get(entityId);
    const transform = ctx.components.get(entityId, "Transform");
    if (!entity?.alive || !transform || injury?.isDowned?.(entityId)) return false;
    const count = mineCountOf(entityId);
    if (count <= 0) {
      if (!entity.bot) {
        ctx.events.emit("mine:failed", {
          entityId,
          reason: "empty",
          text: "Мины закончились. Можно купить ещё в магазине.",
          now,
        });
      }
      return false;
    }
    mineCounts.set(entityId, count - 1);
    mineSerial += 1;
    const mine = {
      id: `mine-${mineSerial}`,
      ownerId: entityId,
      team: Number(teams.teamOf(entityId)) || 0,
      x: Number(finite(transform.x).toFixed(2)),
      y: Number(finite(transform.y).toFixed(2)),
      z: Number(finite(transform.z).toFixed(2)),
      plantedAt: now,
      armsAt: now + LANDMINE_CONFIG.armDelayMs,
      detonated: false,
    };
    plantedMines.push(mine);
    ctx.events.emit("mine:planted", {
      entityId,
      mineId: mine.id,
      remaining: count - 1,
      x: mine.x,
      y: mine.y,
      z: mine.z,
      now,
    });
    ctx.events.emit("sound:spatial", {
      entityId,
      key: "armor.plate.start",
      x: mine.x,
      y: mine.y,
      z: mine.z,
      radius: 18,
    });
    return true;
  }

  // Detonate a mine, mini-nuke, or electro meteor slam and apply real 360° blast damage + ragdoll + bomb audio
  function detonateBlast({
    kind,
    ownerId,
    x,
    y,
    z,
    blastRadius,
    lethalCoreRadius,
    maxDamage,
    minEdgeDamage,
    allowSelfDamage = true,
    weaponId,
    now = Date.now(),
  }) {
    const affected = [];
    const hitIds = new Set();
    const activeVehicles = typeof vehicles?.snapshot === "function" ? vehicles.snapshot() : [];

    const applyBlastToTarget = (target, tPos) => {
      if (!target?.alive || hitIds.has(target.id)) return;
      if (!allowSelfDamage && target.id === ownerId) return;
      const res = evaluateBlastDamage(
        { x, y, z },
        tPos,
        { blastRadius, lethalCoreRadius, maxDamage, minEdgeDamage },
      );
      if (!res.hit) return;
      hitIds.add(target.id);

      // Shred armor first on heavy explosions
      const isElectroTarget = Boolean(target.electroLukashenko);
      const isNukeOnElectro = kind === "nuke" && isElectroTarget;
      const finalDamage = isNukeOnElectro
        ? Math.min(
          MINI_NUKE_CONFIG.electroMaxDamage,
          Math.max(15, Math.round(res.damage * MINI_NUKE_CONFIG.electroDamageMultiplier)),
        )
        : res.damage;

      const armorComp = ctx.components.get(target.id, "Armor");
      if (armorComp && armorComp.current > 0) {
        const shredRatio = isNukeOnElectro
          ? 0.42
          : (kind === "electro-slam" ? 0.9 : (kind === "nuke" ? 0.8 : 0.5));
        const shred = Math.min(armorComp.current, Math.round(finalDamage * shredRatio));
        armorComp.current = Math.max(0, armorComp.current - shred);
      }
      combat.damage(target.id, finalDamage, {
        attackerId: ownerId,
        weaponId,
        ignoreTeamCheck: target.id === ownerId,
        now,
      });
      // Inside a Mini-Nuke's lethal fireball core (<= lethalCoreRadius), finish downed non-Electro targets outright
      if (kind === "nuke" && !isElectroTarget && target.alive && res.distance <= lethalCoreRadius && injury?.isDowned?.(target.id)) {
        combat.damage(target.id, 480, {
          attackerId: ownerId,
          weaponId,
          ignoreTeamCheck: target.id === ownerId,
          now,
        });
      }
      if (ragdoll?.trigger) {
        const dx = finite(tPos.x) - x;
        const dz = finite(tPos.z) - z;
        const horiz = Math.hypot(dx, dz);
        const dirX = horiz > 0.2 ? dx / horiz : 0.7;
        const dirZ = horiz > 0.2 ? dz / horiz : -0.7;
        const pushScale = kind === "electro-slam"
          ? ELECTRO_SUPER_JUMP_CONFIG.knockbackPush
          : (kind === "nuke" ? MINI_NUKE_CONFIG.ragdollOut : 14);
        const upScale = kind === "electro-slam"
          ? ELECTRO_SUPER_JUMP_CONFIG.knockbackUp
          : (kind === "nuke" ? MINI_NUKE_CONFIG.ragdollUp : 8.5);
        ragdoll.trigger(target.id, {
          reason: weaponId,
          vx: dirX * pushScale * res.knockback,
          vy: Math.max(kind === "nuke" ? 11.5 : 4.5, upScale * res.knockback),
          vz: dirZ * pushScale * res.knockback,
          dead: !target.alive,
          allowDowned: true,
          now,
        });
      }
      affected.push({ entityId: target.id, distance: res.distance, damage: finalDamage });
    };

    // Physically launch every vehicle caught in the blast shockwave!
    const vehicleBlastOptions = kind === "nuke"
      ? {
        radius: Math.max(blastRadius + 30, MINI_NUKE_CONFIG.vehicleBlastRadius),
        maxUpVelocity: MINI_NUKE_CONFIG.vehicleUp,
        maxOutVelocity: MINI_NUKE_CONFIG.vehicleOut,
        maxSpin: MINI_NUKE_CONFIG.vehicleSpin,
        now,
      }
      : kind === "electro-slam"
        ? {
          radius: blastRadius + 8,
          maxUpVelocity: 30,
          maxOutVelocity: 38,
          maxSpin: 7.0,
          now,
        }
        : {
          radius: blastRadius + 4,
          maxUpVelocity: 16,
          maxOutVelocity: 22,
          maxSpin: 4.5,
          now,
        };
    const launchedVehicles = vehicles?.applyBlastImpulse?.({ x, y, z }, vehicleBlastOptions) ?? [];

    for (const target of [...entities.all()]) {
      if (!target?.alive) continue;
      const tPos = ctx.components.get(target.id, "Transform");
      if (!tPos) continue;
      applyBlastToTarget(target, tPos);
    }

    // Also blast occupants of any vehicles caught inside the 360° blast radius
    if (Array.isArray(activeVehicles) && activeVehicles.length) {
      for (const veh of activeVehicles) {
        const occupants = Array.isArray(veh?.occupants)
          ? veh.occupants
          : (veh?.driverId ? [veh.driverId] : []);
        for (const occId of occupants) {
          const occ = entities.get(occId);
          if (!occ?.alive || hitIds.has(occId)) continue;
          applyBlastToTarget(occ, { x: finite(veh.x), y: finite(veh.y), z: finite(veh.z) });
        }
      }
    }

    // Chain-reaction: heavy blasts (Mini-Nuke & Electro Slam) detonate any planted mines inside the radius!
    if (kind === "nuke" || kind === "electro-slam") {
      for (const mine of plantedMines) {
        if (mine.detonated) continue;
        if (distance3({ x, y, z }, mine) <= blastRadius) {
          detonatePlantedMine(mine, now, ownerId);
        }
      }
    }

    if (kind === "mine") {
      ctx.events.emit("sound:spatial", {
        entityId: ownerId,
        key: "bomb.mine",
        offset: LANDMINE_CONFIG.soundOffsetSec,
        x,
        y,
        z,
        radius: 160,
      });
      ctx.events.emit("mine:detonated", {
        ownerId,
        x,
        y,
        z,
        hitCount: affected.length,
        launchedVehicles: launchedVehicles.length,
        affected,
        now,
      });
    } else if (kind === "electro-slam") {
      const owner = entities.get(ownerId);
      ctx.events.emit("sound:spatial", {
        entityId: ownerId,
        key: "bomb.mine",
        offset: LANDMINE_CONFIG.soundOffsetSec,
        x,
        y,
        z,
        radius: 220,
      });
      ctx.events.emit("special:electro-jump", {
        entityId: ownerId,
        name: owner?.name ?? "Электрический Лукашенко",
        bot: Boolean(owner?.bot),
        phase: "slam",
        x,
        y,
        z,
        blastRadius,
        hitCount: affected.length,
        launchedVehicles: launchedVehicles.length,
        affected,
        now,
      });
    } else {
      ctx.events.emit("nuke:detonated", {
        ownerId,
        x,
        y,
        z,
        blastRadius,
        hitCount: affected.length,
        launchedVehicles: launchedVehicles.length,
        affected,
        now,
      });
    }
    return affected;
  }

  // Electro-Lukashenko Super-Jump Flight:
  // 1) Hold Square/Space/J -> rocket UP (to 500-600m) + ACCELERATE FAR FORWARD for up to 15 seconds of boost fuel!
  // 2) Release at any time -> thrust cuts immediately and player starts falling ("gliding") forward across the map!
  // 3) While falling ("gliding"), player chooses:
  //    - Hold Square/J again (if 15s boost fuel remains) -> re-ignite upward & forward thrust!
  //    - Press Cross (X/A) / Parachute / Space -> Open Parachute straight from 500-600m!
  //    - Tap Square / Fire / J -> Meteor Slam straight DOWN (28m 360° electric explosion!)
  //    - Do nothing -> land safely on feet (zero fall damage)!
  function electroJumpPhaseOf(entityId, now = Date.now()) {
    const activeState = electroJumpStates.get(entityId);
    if (activeState) return activeState.phase;
    const lastUsed = electroJumpCooldowns.get(entityId) ?? 0;
    if (lastUsed > 0 && now - lastUsed < ELECTRO_SUPER_JUMP_CONFIG.cooldownMs) {
      return "cooldown";
    }
    return "ready";
  }

  function electroJumpCooldownRemainingMs(entityId, now = Date.now()) {
    if (electroJumpStates.has(entityId)) return 0;
    const lastUsed = electroJumpCooldowns.get(entityId) ?? 0;
    if (!lastUsed) return 0;
    return Math.max(0, ELECTRO_SUPER_JUMP_CONFIG.cooldownMs - (now - lastUsed));
  }

  function releaseElectroJump(entityId, now = Date.now()) {
    const state = electroJumpStates.get(entityId);
    if (!state || state.phase !== "rising") return false;
    const entity = entities.get(entityId);
    const pos = ctx.components.get(entityId, "Transform");
    state.phase = "gliding";
    state.glideStartedAt = now;
    // Cut upward thrust cleanly so releasing Square immediately transitions into falling
    state.vy = Math.min(finite(state.vy, 0), 1.5);
    const altitude = Math.max(0, Math.round(finite(state.currentY, finite(pos?.y))));
    ctx.events.emit("special:electro-jump", {
      entityId,
      name: entity?.name ?? "Электрический Лукашенко",
      bot: Boolean(entity?.bot),
      phase: "glide",
      altitude,
      remainingFuelMs: Math.max(0, Math.round(finite(state.fuelMs, 0))),
      fuelExhausted: finite(state.fuelMs, 0) <= 50,
      x: finite(pos?.x),
      y: finite(state.currentY, finite(pos?.y)),
      z: finite(pos?.z),
      now,
    });
    return true;
  }

  function resumeElectroJumpBoost(entityId, now = Date.now()) {
    const state = electroJumpStates.get(entityId);
    if (!state || state.phase !== "gliding") return false;
    if (finite(state.fuelMs, 0) <= 80) return false;
    const entity = entities.get(entityId);
    const pos = ctx.components.get(entityId, "Transform");
    if (!entity?.alive || !pos) return false;
    state.phase = "rising";
    state.vy = Math.max(finite(state.vy, 0), ELECTRO_SUPER_JUMP_CONFIG.riseSpeedStart * 0.75);
    ctx.events.emit("sound:spatial", {
      entityId,
      key: "armor.plate.start",
      x: finite(pos.x),
      y: finite(state.currentY, finite(pos.y)),
      z: finite(pos.z),
      radius: 100,
    });
    ctx.events.emit("special:electro-jump", {
      entityId,
      name: entity.name ?? "Электрический Лукашенко",
      bot: Boolean(entity.bot),
      phase: "boost-resume",
      altitude: Math.max(0, Math.round(finite(state.currentY, finite(pos.y)))),
      remainingFuelMs: Math.max(0, Math.round(finite(state.fuelMs, 0))),
      x: finite(pos.x),
      y: finite(state.currentY, finite(pos.y)),
      z: finite(pos.z),
      now,
    });
    return true;
  }

  function deployParachuteFromElectroJump(entityId, now = Date.now()) {
    const state = electroJumpStates.get(entityId);
    if (!state || (state.phase !== "rising" && state.phase !== "gliding")) return false;
    const entity = entities.get(entityId);
    const pos = ctx.components.get(entityId, "Transform");
    if (!entity?.alive || !pos || !parachute?.launch) return false;

    const floorY = state.startY <= -6
      ? RESIDENCE_SITE.bunkerY
      : Math.max(0, finite(physics.groundHeightAt?.(pos.x, pos.z, state.currentY), 0));
    const currentY = finite(state.currentY, finite(pos.y));
    if (currentY < floorY + 2.2) return false;

    const angle = finite(pos.angle);
    const horizSpeed = Math.hypot(finite(state.vx), finite(state.vz));
    entity.electroJumpActive = false;
    entity.electroJumpFallImmuneUntil = now + 2200;
    electroJumpStates.delete(entityId);
    electroJumpCooldowns.set(entityId, now);

    const launched = parachute.launch(entityId, {
      x: finite(pos.x),
      z: finite(pos.z),
      angle,
      altitude: currentY,
    }, now);
    if (launched) {
      parachute.deploy?.(entityId, now, {
        initialGlideSpeed: Math.max(5.5, Math.min(10.5, horizSpeed * 0.35)),
      });
    }
    ctx.events.emit("special:electro-jump", {
      entityId,
      name: entity.name ?? "Электрический Лукашенко",
      bot: Boolean(entity.bot),
      phase: "parachute",
      x: finite(pos.x),
      y: currentY,
      z: finite(pos.z),
      now,
    });
    return Boolean(launched);
  }

  function handleElectroJumpAction(entityId, now = Date.now(), botTargetPos = null) {
    const entity = entities.get(entityId);
    const pos = ctx.components.get(entityId, "Transform");
    if (!entity?.alive || !pos || injury?.isDowned?.(entityId) || vehicles?.isDriving?.(entityId)) {
      return false;
    }
    if (!entity.electroLukashenko) {
      if (!entity.bot) {
        ctx.events.emit("special:info", {
          entityId,
          text: "Суперпрыжок с ударной волной доступен только в костюме «Электрический Лукашенко».",
          now,
        });
      }
      return false;
    }

    const activeState = electroJumpStates.get(entityId);
    if (activeState) {
      if (activeState.phase === "rising" || activeState.phase === "gliding") {
        activeState.phase = "diving";
        activeState.vx *= 0.35;
        activeState.vz *= 0.35;
        activeState.vy = -ELECTRO_SUPER_JUMP_CONFIG.diveSpeed;
        ctx.events.emit("sound:spatial", {
          entityId,
          key: "armor.plate.start",
          x: finite(pos.x),
          y: finite(pos.y),
          z: finite(pos.z),
          radius: 90,
        });
        ctx.events.emit("special:electro-jump", {
          entityId,
          name: entity.name ?? "Электрический Лукашенко",
          bot: Boolean(entity.bot),
          phase: "dive",
          x: finite(pos.x),
          y: finite(pos.y),
          z: finite(pos.z),
          now,
        });
        return true;
      }
      return false;
    }

    const remainMs = electroJumpCooldownRemainingMs(entityId, now);
    if (remainMs > 0) {
      if (!entity.bot) {
        ctx.events.emit("special:info", {
          entityId,
          text: `Суперпрыжок перезаряжается: ещё ${Math.ceil(remainMs / 1000)} сек.`,
          now,
        });
      }
      return false;
    }

    const startY = finite(pos.y);
    const inBunker = startY <= -6;
    const isBot = Boolean(entity.bot);
    const maxFuelMs = inBunker
      ? 1400
      : (isBot ? ELECTRO_SUPER_JUMP_CONFIG.botBoostDurationMs : ELECTRO_SUPER_JUMP_CONFIG.boostDurationMs);
    const apexOffset = inBunker
      ? ELECTRO_SUPER_JUMP_CONFIG.bunkerApexOffset
      : (isBot ? ELECTRO_SUPER_JUMP_CONFIG.botApexOffset : ELECTRO_SUPER_JUMP_CONFIG.launchApexOffset);
    const apexY = startY + apexOffset;

    let launchAngle = finite(pos.angle);
    let forwardSpeed = inBunker
      ? 12
      : (isBot ? ELECTRO_SUPER_JUMP_CONFIG.botForwardSpeed : ELECTRO_SUPER_JUMP_CONFIG.forwardBoostStart);
    if (isBot && botTargetPos && Number.isFinite(Number(botTargetPos.x)) && Number.isFinite(Number(botTargetPos.z))) {
      const dx = Number(botTargetPos.x) - finite(pos.x);
      const dz = Number(botTargetPos.z) - finite(pos.z);
      launchAngle = Math.atan2(dx, -dz);
      pos.angle = launchAngle;
      forwardSpeed = Math.min(24, Math.max(12, Math.hypot(dx, dz) * 0.9));
    }

    ragdoll?.cancel?.(entityId, now, "electro-jump");
    entity.electroJumpActive = true;
    electroJumpStates.set(entityId, {
      phase: "rising",
      startY,
      currentY: startY,
      apexY,
      vx: Math.sin(launchAngle) * forwardSpeed,
      vy: isBot ? 22 : ELECTRO_SUPER_JUMP_CONFIG.riseSpeedStart,
      vz: -Math.cos(launchAngle) * forwardSpeed,
      startedAt: now,
      glideStartedAt: 0,
      fuelMs: maxFuelMs,
      maxFuelMs,
      boostUsedMs: 0,
      lastAnnouncedAltBand: Math.floor(Math.max(0, startY) / 100) * 100,
      targetX: Number.isFinite(Number(botTargetPos?.x)) ? Number(botTargetPos.x) : null,
      targetZ: Number.isFinite(Number(botTargetPos?.z)) ? Number(botTargetPos.z) : null,
    });

    ctx.events.emit("sound:spatial", {
      entityId,
      key: "armor.plate.start",
      x: finite(pos.x),
      y: startY,
      z: finite(pos.z),
      radius: 120,
    });
    ctx.events.emit("special:electro-jump", {
      entityId,
      name: entity.name ?? "Электрический Лукашенко",
      bot: isBot,
      phase: "launch",
      x: finite(pos.x),
      y: startY,
      z: finite(pos.z),
      apexY,
      maxFuelMs,
      now,
    });
    return true;
  }

  function tickElectroJumps(now, dt = 0.05) {
    if (!electroJumpStates.size) return;
    const stepDt = Math.max(0.01, Math.min(0.15, finite(dt, 0.05)));
    const mapLimit = Math.max(40, finite(map.halfSize, 1000) - 8);

    for (const [entityId, state] of [...electroJumpStates.entries()]) {
      const entity = entities.get(entityId);
      const pos = ctx.components.get(entityId, "Transform");
      if (!entity?.alive || !pos || injury?.isDowned?.(entityId) || vehicles?.isDriving?.(entityId)) {
        if (entity) entity.electroJumpActive = false;
        electroJumpStates.delete(entityId);
        continue;
      }

      const input = ctx.components.get(entityId, "Input") ?? {};
      let angle = finite(pos.angle);

      // Full mid-air body turning for humans:
      // movement/server.js already integrates input.turn (Right Stick / Cmd+Arrows / 2-finger drag).
      // Also allow Left Stick / ArrowLeft-ArrowRight (input.strafe) to rotate body smoothly when
      // input.turn is idle (crucial on gamepad while right thumb holds Square!).
      if (!entity.bot) {
        const turnAxis = Math.abs(finite(input.turn)) >= 0.05 ? 0 : finite(input.strafe);
        if (Math.abs(turnAxis) >= 0.05) {
          angle += turnAxis * ELECTRO_SUPER_JUMP_CONFIG.airTurnSpeed * stepDt;
        }
      }

      let nextX = finite(pos.x);
      let nextZ = finite(pos.z);
      let nextY = finite(state.currentY, finite(pos.y));
      const inBunker = state.startY <= -6;

      if (entity.bot && state.targetX != null && state.targetZ != null) {
        const dx = state.targetX - nextX;
        const dz = state.targetZ - nextZ;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.8) {
          angle = Math.atan2(dx, -dz);
          const horizSpeed = state.phase === "diving" ? 11 : 18;
          state.vx = (dx / dist) * horizSpeed;
          state.vz = (dz / dist) * horizSpeed;
        } else {
          state.vx *= 0.6;
          state.vz *= 0.6;
        }
      } else {
        // Steer human forward flight velocity smoothly along current facing angle!
        const dirX = Math.sin(angle);
        const dirZ = -Math.cos(angle);
        const forwardInput = finite(input.forward);
        if (state.phase === "rising") {
          const boostRamp = Math.max(0, Math.min(1, finite(state.boostUsedMs) / Math.max(1000, finite(state.maxFuelMs, ELECTRO_SUPER_JUMP_CONFIG.boostDurationMs))));
          const baseBoost = inBunker
            ? 12
            : (ELECTRO_SUPER_JUMP_CONFIG.forwardBoostStart
              + (ELECTRO_SUPER_JUMP_CONFIG.forwardBoostMax - ELECTRO_SUPER_JUMP_CONFIG.forwardBoostStart) * boostRamp);
          const targetSpeed = baseBoost * (1 + forwardInput * 0.15);
          const steerAlpha = Math.min(1, stepDt * 6.5);
          state.vx += (dirX * targetSpeed - state.vx) * steerAlpha;
          state.vz += (dirZ * targetSpeed - state.vz) * steerAlpha;
        } else if (state.phase === "gliding") {
          const curSpeed = Math.hypot(state.vx, state.vz);
          const dragFactor = Math.max(0.5, 1 - ELECTRO_SUPER_JUMP_CONFIG.glideDrag * stepDt);
          const accelFactor = 1 + forwardInput * 0.25 * stepDt;
          const nextSpeed = Math.max(8, Math.min(ELECTRO_SUPER_JUMP_CONFIG.forwardBoostMax, curSpeed * dragFactor * accelFactor));
          const steerAlpha = Math.min(1, stepDt * 4.5);
          state.vx += (dirX * nextSpeed - state.vx) * steerAlpha;
          state.vz += (dirZ * nextSpeed - state.vz) * steerAlpha;
        }
      }

      nextX += state.vx * stepDt;
      nextZ += state.vz * stepDt;

      // Clamp to arena or deep bunker perimeter so flight never clips out of bounds
      if (inBunker) {
        const minBx = RESIDENCE_SITE.x - (RESIDENCE_SITE.bunkerHalfX - 1.2);
        const maxBx = RESIDENCE_SITE.x + (RESIDENCE_SITE.bunkerHalfX - 1.2);
        const minBz = RESIDENCE_SITE.z - (RESIDENCE_SITE.bunkerHalfZ - 1.2);
        const maxBz = RESIDENCE_SITE.z + (RESIDENCE_SITE.bunkerHalfZ - 1.2);
        nextX = Math.max(minBx, Math.min(maxBx, nextX));
        nextZ = Math.max(minBz, Math.min(maxBz, nextZ));
      } else {
        nextX = Math.max(-mapLimit, Math.min(mapLimit, nextX));
        nextZ = Math.max(-mapLimit, Math.min(mapLimit, nextZ));
      }

      const floorY = inBunker
        ? RESIDENCE_SITE.bunkerY
        : Math.max(0, finite(physics.groundHeightAt?.(nextX, nextZ, Math.max(nextY, 2)), 0));

      if (state.phase === "rising") {
        const stepMs = stepDt * 1000;
        state.fuelMs = Math.max(0, finite(state.fuelMs, 0) - stepMs);
        state.boostUsedMs = finite(state.boostUsedMs, 0) + stepMs;
        const boostRamp = Math.max(0, Math.min(1, state.boostUsedMs / Math.max(1000, finite(state.maxFuelMs, ELECTRO_SUPER_JUMP_CONFIG.boostDurationMs))));
        const riseRate = inBunker
          ? 8
          : (entity.bot
            ? 22
            : (ELECTRO_SUPER_JUMP_CONFIG.riseSpeedStart
              + (ELECTRO_SUPER_JUMP_CONFIG.riseSpeedMax - ELECTRO_SUPER_JUMP_CONFIG.riseSpeedStart) * Math.min(1, boostRamp * 1.35)));
        state.vy = nextY < state.apexY ? riseRate : 0;
        nextY = Math.min(state.apexY, nextY + riseRate * stepDt);

        // Announce every 100m altitude band while climbing so blind players feel exact height up to 600m
        if (!entity.bot && !inBunker) {
          const altBand = Math.floor(Math.max(0, nextY) / 100) * 100;
          if (altBand >= 100 && altBand > finite(state.lastAnnouncedAltBand, 0)) {
            state.lastAnnouncedAltBand = altBand;
            ctx.events.emit("special:electro-jump", {
              entityId,
              name: entity.name ?? "Электрический Лукашенко",
              bot: false,
              phase: "altitude",
              altitude: altBand,
              ceiling: nextY >= state.apexY - 2,
              remainingFuelMs: Math.round(state.fuelMs),
              x: nextX,
              y: nextY,
              z: nextZ,
              now,
            });
          }
        }

        const botReachedApex = entity.bot && nextY >= state.apexY;
        const bunkerReachedApex = inBunker && nextY >= state.apexY;
        if (state.fuelMs <= 0 || botReachedApex || bunkerReachedApex) {
          state.phase = "gliding";
          state.glideStartedAt = now;
          state.vy = inBunker ? 1.5 : 0;
          ctx.events.emit("special:electro-jump", {
            entityId,
            name: entity.name ?? "Электрический Лукашенко",
            bot: Boolean(entity.bot),
            phase: "glide",
            altitude: Math.max(0, Math.round(nextY)),
            remainingFuelMs: Math.round(state.fuelMs),
            fuelExhausted: state.fuelMs <= 0,
            x: nextX,
            y: nextY,
            z: nextZ,
            now,
          });
        }
      } else if (state.phase === "gliding") {
        state.vy = Math.max(
          -ELECTRO_SUPER_JUMP_CONFIG.maxFallSpeed,
          state.vy - ELECTRO_SUPER_JUMP_CONFIG.glideGravity * stepDt,
        );
        nextY += state.vy * stepDt;

        // Rival Electro-Lukashenko bot still performs Meteor Slam when near target!
        const botReadyToSlam = entity.bot
          && (now - state.glideStartedAt >= 420
            || (state.targetX != null && Math.hypot(state.targetX - nextX, state.targetZ - nextZ) <= 5.5));
        if (botReadyToSlam) {
          state.phase = "diving";
          state.vx *= 0.35;
          state.vz *= 0.35;
          state.vy = -ELECTRO_SUPER_JUMP_CONFIG.diveSpeed;
          ctx.events.emit("special:electro-jump", {
            entityId,
            name: entity.name ?? "Электрический Лукашенко",
            bot: Boolean(entity.bot),
            phase: "dive",
            x: nextX,
            y: nextY,
            z: nextZ,
            now,
          });
        } else if (nextY <= floorY + 0.15 && state.vy <= 0) {
          // Natural safe landing after riding the long ballistic arc!
          nextY = floorY;
          movement.teleport(entityId, {
            x: nextX,
            y: nextY,
            z: nextZ,
            angle,
          });
          entity.electroJumpActive = false;
          entity.electroJumpFallImmuneUntil = now + 2200;
          electroJumpStates.delete(entityId);
          electroJumpCooldowns.set(entityId, now);
          ctx.events.emit("sound:spatial", {
            entityId,
            key: "armor.plate.start",
            x: nextX,
            y: nextY,
            z: nextZ,
            radius: 48,
          });
          ctx.events.emit("special:electro-jump", {
            entityId,
            name: entity.name ?? "Электрический Лукашенко",
            bot: Boolean(entity.bot),
            phase: "land",
            x: nextX,
            y: nextY,
            z: nextZ,
            now,
          });
          continue;
        }
      } else if (state.phase === "diving") {
        nextY -= ELECTRO_SUPER_JUMP_CONFIG.diveSpeed * stepDt;
        if (nextY <= floorY + 0.15) {
          nextY = floorY;
          movement.teleport(entityId, {
            x: nextX,
            y: nextY,
            z: nextZ,
            angle,
          });
          entity.electroJumpActive = false;
          entity.electroJumpFallImmuneUntil = now + 2200;
          electroJumpStates.delete(entityId);
          electroJumpCooldowns.set(entityId, now);
          detonateBlast({
            kind: "electro-slam",
            ownerId: entityId,
            x: nextX,
            y: nextY,
            z: nextZ,
            blastRadius: ELECTRO_SUPER_JUMP_CONFIG.slamRadius,
            lethalCoreRadius: ELECTRO_SUPER_JUMP_CONFIG.slamCoreRadius,
            maxDamage: ELECTRO_SUPER_JUMP_CONFIG.slamMaxDamage,
            minEdgeDamage: ELECTRO_SUPER_JUMP_CONFIG.slamMinEdgeDamage,
            allowSelfDamage: false,
            weaponId: "electro-slam",
            now,
          });
          continue;
        }
      }

      state.currentY = nextY;
      movement.teleport(entityId, {
        x: nextX,
        y: nextY,
        z: nextZ,
        angle,
      });
    }
  }

  // Mini-Nuke 2-step aim & launch
  function handleNukeAction(entityId, actionType, distanceMeters = null, now = Date.now(), delta = 1) {
    const entity = entities.get(entityId);
    const transform = ctx.components.get(entityId, "Transform");
    if (!entity?.alive || !transform || injury?.isDowned?.(entityId)) return false;

    const count = nukeCountOf(entityId);
    if (count <= 0) {
      nukeAimStates.delete(entityId);
      ctx.events.emit("nuke:failed", {
        entityId,
        reason: "empty",
        text: "Мини-ядерки нет. Купи её в магазине или забери в бункере Резиденции.",
        now,
      });
      return false;
    }

    const currentAim = nukeAimStates.get(entityId) ?? null;

    if (actionType === "nuke-cycle-distance") {
      const len = MINI_NUKE_CONFIG.distances.length;
      const step = delta < 0 ? -1 : 1;
      const nextIdx = currentAim
        ? (currentAim.distanceIndex + step + len) % len
        : 2;
      const preset = MINI_NUKE_CONFIG.distances[nextIdx];
      nukeAimStates.set(entityId, { active: true, distanceIndex: nextIdx, startedAt: now });
      ctx.events.emit("nuke:aiming", {
        entityId,
        distanceMeters: preset.meters,
        distanceLabel: preset.label,
        text: `Мини-ядерка: дальность ${preset.label}. Нажми огонь или подтверди запуск!`,
        now,
      });
      return true;
    }

    if (actionType === "nuke-aim" && !currentAim?.active) {
      const preset = MINI_NUKE_CONFIG.distances[2]; // default 215m (safe outside 185m blast radius)
      nukeAimStates.set(entityId, { active: true, distanceIndex: 2, startedAt: now });
      ctx.events.emit("nuke:aiming", {
        entityId,
        distanceMeters: preset.meters,
        distanceLabel: preset.label,
        text: `Выберите точку удара мини-ядеркой (радиус взрыва ${MINI_NUKE_CONFIG.blastRadius} м)! Дистанция: ${preset.label}. Повернись куда бить и нажми огонь (R2) для запуска, или смени дистанцию.`,
        now,
      });
      return true;
    }

    // Launch!
    const lastLaunch = nukeLaunchCooldowns.get(entityId) ?? 0;
    if (lastLaunch > 0 && now - lastLaunch < MINI_NUKE_CONFIG.launchCooldownMs) {
      ctx.events.emit("nuke:failed", {
        entityId,
        reason: "cooldown",
        text: "Перезарядка пуска мини-ядерки, подожди секунду.",
        now,
      });
      return false;
    }
    nukeLaunchCooldowns.set(entityId, now);
    const distIdx = currentAim?.distanceIndex ?? 2;
    const chosenDistance = distanceMeters != null
      ? finite(distanceMeters, MINI_NUKE_CONFIG.distances[2].meters)
      : MINI_NUKE_CONFIG.distances[distIdx].meters;
    const preliminary = computeMiniNukeTarget(transform, chosenDistance, map.halfSize ?? 1000);
    const groundY = finite(transform.y) <= -6
      ? finite(transform.y)
      : Math.max(0, finite(physics?.groundHeightAt?.(preliminary.x, preliminary.z, 0), 0));
    const target = computeMiniNukeTarget(transform, chosenDistance, map.halfSize ?? 1000, groundY);
    nukeCounts.set(entityId, count - 1);
    nukeAimStates.delete(entityId);
    nukeSerial += 1;

    const nuke = {
      id: `nuke-${nukeSerial}`,
      ownerId: entityId,
      x: target.x,
      y: target.y,
      z: target.z,
      distanceMeters: target.distanceMeters,
      launchedAt: now,
      detonatesAt: now + MINI_NUKE_CONFIG.impactDelayMs,
      detonated: false,
    };
    pendingNukes.push(nuke);

    // Play uploaded falling-whistle + explosion MP3 along a real 3D ballistic arc from launch to impact!
    const launchStartX = finite(transform.x);
    const launchStartY = finite(transform.y) + 2;
    const launchStartZ = finite(transform.z);
    const arcHeight = Math.max(36, Math.min(130, nuke.distanceMeters * 0.45));
    ctx.events.emit("sound:spatial", {
      entityId,
      key: "bomb.nuke",
      x: nuke.x,
      y: nuke.y,
      z: nuke.z,
      trajectory: {
        startX: launchStartX,
        startY: launchStartY,
        startZ: launchStartZ,
        endX: nuke.x,
        endY: nuke.y,
        endZ: nuke.z,
        arcHeight,
        flightMs: MINI_NUKE_CONFIG.impactDelayMs,
      },
      radius: 1500,
    });
    ctx.events.emit("nuke:launched", {
      entityId,
      ownerName: entity.name ?? "Боец",
      bot: Boolean(entity.bot),
      nukeId: nuke.id,
      x: nuke.x,
      y: nuke.y,
      z: nuke.z,
      distanceMeters: nuke.distanceMeters,
      blastRadius: MINI_NUKE_CONFIG.blastRadius,
      remaining: count - 1,
      text: `Мини-ядерка запущена на ${Math.round(nuke.distanceMeters)} метров! Радиус поражения ${MINI_NUKE_CONFIG.blastRadius} метров — в укрытие!`,
      now,
    });
    return true;
  }

  // Bunker Hatch & Vault Puzzle interaction
  function handleBunkerInteraction(playerId, now = Date.now()) {
    const transform = ctx.components.get(playerId, "Transform");
    if (!transform) return false;

    // 1. Descend through Residence Hatch -> Deep Bunker
    if (distance3(transform, HATCH_TOP) <= 3.0) {
      navigation?.stop?.(playerId, now, "residence-no-guidance");
      movement.teleport(playerId, {
        x: BUNKER_ENTRANCE.x,
        y: BUNKER_ENTRANCE.y,
        z: BUNKER_ENTRANCE.z,
        angle: 0,
      });
      ctx.events.emit("bunker:transition", {
        entityId: playerId,
        direction: "enter",
        text: "Ты спустился в глубокий бункер Резиденции. Автоведение здесь отключено — иди по лабиринту на электрический гул хранилища!",
        now,
      });
      return true;
    }

    // 2. Climb back up from Deep Bunker -> Residence
    if (distance3(transform, BUNKER_ENTRANCE) <= 3.0) {
      movement.teleport(playerId, {
        x: HATCH_TOP.x,
        y: HATCH_TOP.y,
        z: HATCH_TOP.z + 1.8,
        angle: Math.PI,
      });
      ctx.events.emit("bunker:transition", {
        entityId: playerId,
        direction: "exit",
        text: "Ты поднялся из бункера обратно в Резиденцию.",
        now,
      });
      return true;
    }

    // 3. Interact with Deep Bunker Vault («Хранилище Электрического Лукашенко»)
    if (distance3(transform, BUNKER_VAULT) <= 3.4) {
      if (vaultLooted) {
        ctx.events.emit("bunker:info", {
          entityId: playerId,
          text: "Хранилище «Электрический Лукашенко» уже пусто.",
          now,
        });
        return true;
      }
      if (vaultUnlocked) {
        vaultLooted = true;
        equipElectroLukashenko(playerId, now, "bunker-vault");
        return true;
      }
      // Open adaptive puzzle lock!
      let puzzle = bunkerPuzzles.get(playerId);
      if (!puzzle || puzzle.solved) {
        puzzle = createAdaptiveBunkerPuzzle((now % 97) + 1, 0);
        bunkerPuzzles.set(playerId, puzzle);
      }
      const stage = puzzle.stages[puzzle.currentStage];
      ctx.events.emit("bunker:puzzle-opened", {
        entityId: playerId,
        stage: stage.stage,
        totalStages: puzzle.stages.length,
        hint: stage.hint,
        text: `Адаптивный замок бункера. Этап ${stage.stage} из ${puzzle.stages.length}. Подсказка: ${stage.hint}.`,
        now,
      });
      return true;
    }

    return false;
  }

  function submitBunkerPuzzleChoice(playerId, switchId, now = Date.now()) {
    let puzzle = bunkerPuzzles.get(playerId);
    if (!puzzle) {
      puzzle = createAdaptiveBunkerPuzzle(1, 0);
      bunkerPuzzles.set(playerId, puzzle);
    }
    const result = submitPuzzleStep(puzzle, switchId);
    ctx.events.emit("bunker:puzzle-step", {
      entityId: playerId,
      ...result,
      currentStage: puzzle.currentStage + 1,
      totalStages: puzzle.stages.length,
      now,
    });
    if (result.solved && !vaultLooted) {
      vaultUnlocked = true;
      vaultLooted = true;
      bunkerPuzzles.delete(playerId);
      equipElectroLukashenko(playerId, now, "bunker-vault");
    }
    return result;
  }

  function detonatePlantedMine(mine, now = Date.now(), triggerOwnerId = null) {
    if (!mine || mine.detonated) return false;
    mine.detonated = true;
    detonateBlast({
      kind: "mine",
      ownerId: triggerOwnerId || mine.ownerId,
      x: mine.x,
      y: mine.y,
      z: mine.z,
      blastRadius: LANDMINE_CONFIG.blastRadius,
      lethalCoreRadius: 3.4,
      maxDamage: LANDMINE_CONFIG.maxDamage,
      minEdgeDamage: LANDMINE_CONFIG.minEdgeDamage,
      allowSelfDamage: true,
      weaponId: "landmine",
      now,
    });
    return true;
  }

  // Shoot near a planted mine -> instant detonation! + Electro-rifle super-gun impact effects
  ctx.events.on("projectile:impact", (payload = {}) => {
    const now = finite(payload.now, Date.now());

    // Any gunshot landing within 2.4m of a planted mine sets it off immediately
    if (Number.isFinite(Number(payload.x)) && Number.isFinite(Number(payload.z))) {
      const impactPos = { x: finite(payload.x), y: finite(payload.y), z: finite(payload.z) };
      for (const mine of plantedMines) {
        if (mine.detonated) continue;
        if (distance2(mine, impactPos) <= 2.4 && Math.abs(impactPos.y - mine.y) <= 2.4) {
          detonatePlantedMine(mine, now, payload.shooterId || mine.ownerId);
        }
      }
    }

    if (payload.weaponId !== "electro-rifle" || !payload.targetId || payload.blockedByCover) return;
    const shooter = entities.get(payload.shooterId);
    const target = entities.get(payload.targetId);
    if (!shooter || !target) return;
    if (teams.teamOf(shooter.id) === teams.teamOf(target.id)) return;

    const mode = electroModeOf(shooter.id);
    const targetPos = ctx.components.get(target.id, "Transform");
    const shooterPos = ctx.components.get(shooter.id, "Transform");

    // Heavy armor shred + super-gun electric bonus + official revolutionary critical bonus
    if (target.alive) {
      const armorComp = ctx.components.get(target.id, "Armor");
      if (armorComp && armorComp.current > 0) {
        const bonusShred = Math.round(85 * mode.armorMultiplier);
        armorComp.current = Math.max(0, armorComp.current - bonusShred);
      }
      let extraDamage = mode.id === "overload" ? 72 : (mode.id === "chain" ? 24 : 32);
      if (target.official) {
        extraDamage += Math.round(60 * mode.officialBonus);
      }
      if (extraDamage > 0 && target.alive) {
        combat.damage(target.id, extraDamage, {
          attackerId: shooter.id,
          weaponId: "electro-rifle-shock",
          now,
        });
      }
    }

    // ALWAYS catapult enemy sky-high on hit — even if shot #1 killed or downed them!
    if (targetPos && shooterPos && ragdoll?.trigger) {
      const dx = finite(targetPos.x) - finite(shooterPos.x);
      const dz = finite(targetPos.z) - finite(shooterPos.z);
      const len = Math.max(0.1, Math.hypot(dx, dz));
      ragdoll.trigger(target.id, {
        reason: "electro-shock",
        vx: (dx / len) * mode.knockbackPush,
        vy: mode.knockbackUp,
        vz: (dz / len) * mode.knockbackPush,
        dead: !target.alive,
        allowDowned: true,
        now,
      });
    }

    // Chain mode: arc lightning to up to 3 nearby enemies around the primary target + knockback toss!
    if (mode.chainTargets > 0 && targetPos) {
      const shooterTeam = Number(teams.teamOf(shooter.id)) || 0;
      const nearby = [];
      for (const candidate of entities.all()) {
        if (!candidate?.alive || candidate.id === shooter.id || candidate.id === target.id) continue;
        if (shooterTeam > 0 && Number(teams.teamOf(candidate.id)) === shooterTeam) continue;
        const cPos = ctx.components.get(candidate.id, "Transform");
        if (!cPos) continue;
        const dist = distance3(targetPos, cPos);
        if (dist <= mode.chainRadius) nearby.push({ entity: candidate, pos: cPos, dist });
      }
      nearby.sort((a, b) => a.dist - b.dist);
      for (const hit of nearby.slice(0, mode.chainTargets)) {
        const cArmor = ctx.components.get(hit.entity.id, "Armor");
        if (cArmor && cArmor.current > 0) {
          cArmor.current = Math.max(0, cArmor.current - 150);
        }
        const chainDmg = hit.entity.official ? 190 : 110;
        combat.damage(hit.entity.id, chainDmg, {
          attackerId: shooter.id,
          weaponId: "electro-rifle-chain",
          now,
        });
        if (ragdoll?.trigger) {
          const dx = finite(hit.pos.x) - finite(targetPos.x);
          const dz = finite(hit.pos.z) - finite(targetPos.z);
          const len = Math.max(0.1, Math.hypot(dx, dz));
          ragdoll.trigger(hit.entity.id, {
            reason: "electro-chain",
            vx: (dx / len) * 10.5,
            vy: 7.5,
            vz: (dz / len) * 10.5,
            dead: !hit.entity.alive,
            allowDowned: true,
            now,
          });
        }
      }
    }
  });

  // Also grant Electro-Lukashenko gear when ANY entity (human OR bandit bot!) picks up an electro-lukashenko crate
  ctx.events.on("loot:opened", (payload = {}) => {
    if (!payload.entityId) return;
    if (payload.loot === "electro-lukashenko") {
      equipElectroLukashenko(payload.entityId, finite(payload.now, Date.now()), "airdrop");
    } else if (payload.loot === "juggernaut") {
      const ent = entities.get(payload.entityId);
      if (ent?.bot && !ent.juggernaut) {
        ent.juggernaut = true;
        const hp = ctx.components.get(ent.id, "Health");
        if (hp) {
          hp.maximum = Math.max(Number(hp.maximum) || 200, 700);
          hp.current = 700;
        }
        armor?.grantJuggernautArmor?.(ent.id);
      }
      // Exclusive Smertonos cannon is also granted with Juggernaut drops!
      if (ent?.alive) {
        grantExclusiveCannon(ent.id, { select: false });
      }
    }
  });

  // Periodic tick: electro super-jump physics, cannonballs, mines, mini-nukes, internal stim, bunker beacon, living rival economy & boss AI
  function tickSpecialOps(now = Date.now(), dt = 0.05) {
    if (!battleRoyale.isActive?.()) return;
    initializeOfficialsIfNeeded();

    // 0. Smoothly integrate Electro-Lukashenko Super-Jump + Meteor Slam flights every physics tick
    tickElectroJumps(now, dt);

    // 0b. Integrate flying physical Smertonos cannonballs & charged shots every physics tick
    tickCannonballs(now, dt);

    // 1. Check armed landmines (horizontal proximity + elevation tolerance + occupied enemy vehicles)
    const activeVehicles = typeof vehicles?.snapshot === "function" ? vehicles.snapshot() : [];
    for (const mine of plantedMines) {
      if (mine.detonated || now < mine.armsAt) continue;
      let triggered = false;
      for (const ent of entities.all()) {
        if (!ent?.alive || ent.id === mine.ownerId) continue;
        const entTeam = Number(teams.teamOf(ent.id)) || 0;
        if (mine.team > 0 && entTeam === mine.team) continue;
        const pos = ctx.components.get(ent.id, "Transform");
        if (!pos) continue;
        if (
          distance2(mine, pos) <= LANDMINE_CONFIG.triggerRadius
          && Math.abs(finite(pos.y) - mine.y) <= 2.5
        ) {
          detonatePlantedMine(mine, now);
          triggered = true;
          break;
        }
      }
      if (!triggered && Array.isArray(activeVehicles) && activeVehicles.length) {
        for (const veh of activeVehicles) {
          const driverId = veh?.driverId ?? veh?.occupants?.[0] ?? null;
          if (!driverId || driverId === mine.ownerId) continue;
          const driverTeam = Number(teams.teamOf(driverId)) || 0;
          if (mine.team > 0 && driverTeam === mine.team) continue;
          if (
            distance2(mine, veh) <= LANDMINE_CONFIG.triggerRadius + 1.2
            && Math.abs(finite(veh.y) - mine.y) <= 2.8
          ) {
            detonatePlantedMine(mine, now);
            break;
          }
        }
      }
    }

    // 2. Check in-flight mini-nukes (exact 2.15s sync to audio explosion!)
    for (const nuke of pendingNukes) {
      if (nuke.detonated || now < nuke.detonatesAt) continue;
      nuke.detonated = true;
      detonateBlast({
        kind: "nuke",
        ownerId: nuke.ownerId,
        x: nuke.x,
        y: nuke.y,
        z: nuke.z,
        blastRadius: MINI_NUKE_CONFIG.blastRadius,
        lethalCoreRadius: MINI_NUKE_CONFIG.lethalCoreRadius,
        maxDamage: MINI_NUKE_CONFIG.maxDamage,
        minEdgeDamage: MINI_NUKE_CONFIG.minEdgeDamage,
        allowSelfDamage: true, // Can kill launcher if launched under themselves!
        weaponId: "mini-nuke",
        now,
      });
    }

    // 3. Internal stimulator for Electro-Lukashenko suit + auto-stop guidance inside bunker
    for (const ent of entities.all()) {
      if (!ent?.alive) continue;
      const pos = ctx.components.get(ent.id, "Transform");
      if (!ent.bot && pos && isInsideResidenceNoGuidanceZone(pos)) {
        const navState = navigation?.stateFor?.(ent.id, now);
        if (navState?.active) {
          navigation.stop(ent.id, now, "residence-no-guidance");
        }
      }
      if (ent.electroLukashenko) {
        const lastStim = internalStimCooldowns.get(ent.id) ?? 0;
        if (now - lastStim >= ELECTRO_LUKASHENKO_STATS.internalStimIntervalMs) {
          const hp = ctx.components.get(ent.id, "Health");
          const isDowned = Boolean(injury?.isDowned?.(ent.id));
          if (isDowned) {
            const revived = Boolean(injury?.revive?.(ent.id, now, null, { targetHealth: 450 }));
            if (revived) {
              internalStimCooldowns.set(ent.id, now);
              ctx.events.emit("special:internal-stim", {
                entityId: ent.id,
                revived: true,
                text: "Внутренний стимулятор костюма поднял тебя на ноги!",
                now,
              });
            }
          } else if (hp && hp.current < hp.maximum * ELECTRO_LUKASHENKO_STATS.internalStimThresholdRatio) {
            internalStimCooldowns.set(ent.id, now);
            hp.current = Math.min(hp.maximum, hp.current + ELECTRO_LUKASHENKO_STATS.internalStimHealAmount);
            ctx.events.emit("health:changed", {
              entityId: ent.id,
              health: hp.current,
              maximum: hp.maximum,
            });
            ctx.events.emit("special:internal-stim", {
              entityId: ent.id,
              revived: false,
              health: hp.current,
              text: `Внутренний стимулятор восстановил здоровье до ${Math.round(hp.current)}.`,
              now,
            });
          }
        }
      }
    }

    // 4. Spatial electrical vault beacon inside deep bunker (helps blind player navigate labyrinth by ear!)
    if (!vaultLooted && now - lastBunkerBeaconAt >= 3600) {
      const anyHumanInBunker = entities.all().some((e) => {
        if (!e?.alive || e.bot) return false;
        const p = ctx.components.get(e.id, "Transform");
        return Boolean(p && finite(p.y) <= -6);
      });
      if (anyHumanInBunker) {
        lastBunkerBeaconAt = now;
        ctx.events.emit("sound:spatial", {
          entityId: "bunker-vault",
          key: "armor.plate.start",
          x: BUNKER_VAULT.x,
          y: BUNKER_VAULT.y + 1.0,
          z: BUNKER_VAULT.z,
          radius: 36,
        });
      }
    }

    // 5. Living Bandit & Rival Boss AI: rich late-game scavenging, full squad buybacks, rival Electro-Lukashenko bosses, Super-Jump slams & Mini-Nukes!
    if (now - lastBotLoopAt >= 1800) {
      lastBotLoopAt = now;
      runRivalLateGameStep(now);
    }
  }

  function runRivalLateGameStep(now = Date.now(), { forceDirector = false } = {}) {
    const allEntities = entities.all();
    const aliveEntities = allEntities.filter((e) => e?.alive);
    const totalAlive = aliveEntities.length;
    const totalEnemyBotsPool = allEntities.filter((e) => e?.bot && !e.humanSquad).length;
    const isFullMatch = forceDirector || (!tutorial && totalEnemyBotsPool >= 10);
    const stations = shop?.stations?.() ?? [];
    let activeEnemyElectros = aliveEntities.filter((e) => e.bot && !e.humanSquad && e.electroLukashenko).length;

    // 5a. Mid/Late-game economy boost (<= 45 alive): surviving enemy squads scavenge heavy cash ("мотать бабло") to afford full buybacks ($1500), Mini-Nukes ($2500) & Electro-Lukashenko ($3000)!
    if (isFullMatch && shop && totalAlive <= 45 && (forceDirector || now - lastLateGameCashAt >= 5500)) {
      lastLateGameCashAt = now;
      const bountyCash = totalAlive <= 12 ? 1250 : (totalAlive <= 25 ? 850 : 550);
      for (const bot of aliveEntities) {
        if (!bot?.bot || bot.humanSquad || injury?.isDowned?.(bot.id)) continue;
        if ((shop.balanceOf?.(bot.id) ?? 0) < 7500) {
          shop.grantCash?.(bot.id, bountyCash, "late-game-scavenge");
        }
      }
    }

    // 5b. Late-game Action Director (<= 28 alive): drop contested Electro-Lukashenko supply crates inside the safe zone (strictly 1 active enemy boss at a time!)
    if (
      isFullMatch
      && totalAlive <= 28
      && totalAlive >= 3
      && activeEnemyElectros < 1
      && (forceDirector || now - lastDirectorDropAt >= 34_000)
    ) {
      const zoneRadius = Math.max(45, finite(battleRoyale.zoneRadiusAt?.(now), 220));
      const unopenedElectroInZone = (map.crates ?? []).some((c) => (
        c && !c.opened && c.loot === "electro-lukashenko" && Math.hypot(finite(c.x), finite(c.z)) <= zoneRadius * 0.85
      ));
      if (!unopenedElectroInZone) {
        lastDirectorDropAt = now;
        directorCrateSerial += 1;
        const dropAngle = ((now * 0.0017 + directorCrateSerial * 2.1) % (Math.PI * 2));
        const dropDist = Math.min(zoneRadius * 0.42, 130);
        const dropX = Number((Math.sin(dropAngle) * dropDist).toFixed(2));
        const dropZ = Number((Math.cos(dropAngle) * dropDist).toFixed(2));
        const crate = {
          id: `electro-director-${directorCrateSerial}`,
          x: dropX,
          y: 0,
          z: dropZ,
          loot: "electro-lukashenko",
          electroLukashenko: true,
          airdrop: true,
          opened: false,
          spawnedAt: now,
        };
        if (Array.isArray(map.crates)) map.crates.push(crate);
        ctx.events.emit("crate:airdrop-incoming", {
          crateId: crate.id,
          electroLukashenko: true,
          x: dropX,
          z: dropZ,
          now,
        });
        ctx.events.emit("crate:airdrop-landed", {
          crateId: crate.id,
          electroLukashenko: true,
          x: dropX,
          y: 0,
          z: dropZ,
          now,
        });
      }
    }

    for (const bot of aliveEntities) {
      if (!bot?.bot || bot.humanSquad || injury?.isDowned?.(bot.id)) continue;
      const pos = ctx.components.get(bot.id, "Transform");
      if (!pos) continue;

      // 5c. Grab nearby Juggernaut or Electro-Lukashenko crate (respecting max 1 active enemy Electro boss!)
      for (const crate of map.crates ?? []) {
        if (!crate || crate.opened) continue;
        if (crate.loot !== "juggernaut" && crate.loot !== "electro-lukashenko") continue;
        if (crate.loot === "electro-lukashenko" && activeEnemyElectros >= 1) continue;
        if (crate.airdropPhase === "descending") continue;
        if (distance3(pos, crate) <= 3.0) {
          crate.opened = true;
          ctx.events.emit("loot:opened", {
            entityId: bot.id,
            crateId: crate.id,
            loot: crate.loot,
            x: crate.x,
            y: crate.y,
            z: crate.z,
            now,
          });
          if (crate.loot === "electro-lukashenko") activeEnemyElectros += 1;
          break;
        }
      }

      // 5d. Visit shop when nearby: loop to buy back ALL dead squadmates AND purchase Electro-Lukashenko / Mini-Nuke / mines / armor!
      if (shop && now - (botShopCooldowns.get(bot.id) ?? 0) >= 4000) {
        const nearStation = stations.find((st) => distance3(pos, st) <= 6.5);
        if (nearStation) {
          botShopCooldowns.set(bot.id, now);
          bot.lastShopVisitAt = now;
          for (let buyStep = 0; buyStep < 4; buyStep += 1) {
            const cash = shop.balanceOf?.(bot.id) ?? 0;
            const desc = shop.describeFor?.(bot.id) ?? {};
            const action = chooseBotShopAction({
              cash,
              deadTeammates: desc.deadTeammates?.length ?? 0,
              mineCount: mineCountOf(bot.id),
              armorReserve: armor?.describe?.(bot.id)?.reservePlates ?? 0,
              fastStimCount: stimulants?.fastCount?.(bot.id) ?? 0,
              hasMarksman: Boolean(weapons.has?.(bot.id, "marksman")),
              isElectroLukashenko: Boolean(bot.electroLukashenko),
              nukeCount: nukeCountOf(bot.id),
              allowElectroDrop: activeEnemyElectros < 1,
              allowMiniNuke: isFullMatch,
              prices: desc.prices ?? {},
            });
            if (!action) break;
            const res = shop.buy(bot.id, { shopId: nearStation.id, itemId: action.itemId }, now);
            if (!res?.ok) break;
            if (action.itemId === "buyback") {
              ctx.events.emit("special:rival-buyback", {
                entityId: bot.id,
                name: bot.name ?? "Противник",
                squadId: bot.squadId ?? null,
                shopName: nearStation.name ?? "Магазин",
                x: finite(pos.x),
                z: finite(pos.z),
                now,
              });
            }
            if (action.itemId === "electro-drop") {
              activeEnemyElectros += 1;
            }
          }
        }
      }

      // 5e. Rival Electro-Lukashenko Boss combat tactics: switch modes + Electro Super-Jump Meteor Slam!
      if (bot.electroLukashenko && !electroJumpStates.has(bot.id) && now - (botBossActionCooldowns.get(bot.id) ?? 0) >= 2200) {
        const botTeam = Number(teams.teamOf(bot.id)) || 0;
        let nearestHostile = null;
        let nearestDist = Infinity;
        let closeCluster = 0;
        for (const cand of aliveEntities) {
          if (cand.id === bot.id) continue;
          if (botTeam > 0 && Number(teams.teamOf(cand.id)) === botTeam) continue;
          const cPos = ctx.components.get(cand.id, "Transform");
          if (!cPos) continue;
          const d = distance3(pos, cPos);
          if (d < nearestDist) {
            nearestDist = d;
            nearestHostile = { entity: cand, pos: cPos, dist: d };
          }
          if (d <= 24) closeCluster += 1;
        }
        if (nearestHostile) {
          botBossActionCooldowns.set(bot.id, now);
          const desiredMode = closeCluster >= 2 ? "chain" : (nearestDist <= 26 ? "overload" : "shock");
          electroModes.set(bot.id, desiredMode);
          // Perform Electro Super-Jump Meteor Slam if enemy is in strike range (10-34m)
          const lastJump = electroJumpCooldowns.get(bot.id) ?? 0;
          if (nearestDist >= 10 && nearestDist <= 34 && (lastJump === 0 || now - lastJump >= 11_000)) {
            handleElectroJumpAction(bot.id, now, nearestHostile.pos);
          }
        }
      }

      // 5f. Rival Mini-Nuke tactical strikes (rich rivals or enemy Electro-Lukashenko launch nukes from solid ground at safe distance outside blastRadius!)
      const botPara = ctx.components.get(bot.id, "Parachute");
      const botGroundY = finite(pos.y) <= -6
        ? finite(pos.y)
        : Math.max(0, finite(physics?.groundHeightAt?.(pos.x, pos.z, 0), 0));
      const botAirborne = Boolean(botPara?.airborne || electroJumpStates.has(bot.id) || (finite(pos.y) > botGroundY + 3.5));
      if (
        isFullMatch
        && !botAirborne
        && nukeCountOf(bot.id) > 0
        && (forceDirector || now - lastRivalNukeAt >= 32_000)
      ) {
        const botTeam = Number(teams.teamOf(bot.id)) || 0;
        const minSafeDist = MINI_NUKE_CONFIG.blastRadius + 20; // 205m -> safely outside 185m blast!
        const maxStrikeDist = 340;
        let nukeTarget = null;
        let bestDist = Infinity;
        for (const cand of aliveEntities) {
          if (cand.id === bot.id) continue;
          if (botTeam > 0 && Number(teams.teamOf(cand.id)) === botTeam) continue;
          const cPos = ctx.components.get(cand.id, "Transform");
          if (!cPos || finite(cPos.y) <= -6 || finite(cPos.y) > 25) continue;
          const d = distance2(pos, cPos);
          if (d >= minSafeDist && d <= maxStrikeDist && d < bestDist) {
            bestDist = d;
            nukeTarget = cPos;
          }
        }
        if (nukeTarget) {
          lastRivalNukeAt = now;
          pos.angle = Math.atan2(finite(nukeTarget.x) - finite(pos.x), -(finite(nukeTarget.z) - finite(pos.z)));
          handleNukeAction(bot.id, "nuke-launch", bestDist, now);
        }
      }

      // 5g. Plant mines inside buildings so bandits trap houses!
      const inBuilding = typeof map.insideAnyBuilding === "function"
        ? map.insideAnyBuilding(pos, 1.5)
        : [map.building, ...(map.navigationBuildings ?? []).map((b) => b?.bounds)].some((b) => (
          b
          && pos.x >= b.minX - 1.5 && pos.x <= b.maxX + 1.5
          && pos.z >= b.minZ - 1.5 && pos.z <= b.maxZ + 1.5
        ));
      if (
        mineCountOf(bot.id) > 0
        && now - (botMineCooldowns.get(bot.id) ?? 0) >= 18_000
        && inBuilding
      ) {
        const alreadyMinedNearby = plantedMines.some((m) => !m.detonated && distance3(m, pos) <= 6.0);
        if (!alreadyMinedNearby) {
          botMineCooldowns.set(bot.id, now);
          plantMine(bot.id, now);
        }
      }
    }
  }

  // Wrap matchApi.handleInput, step, snapshotFor, and eventsForPlayer
  const originalHandleInput = matchApi.handleInput.bind(matchApi);
  const originalStep = matchApi.step.bind(matchApi);
  const originalSnapshotFor = matchApi.snapshotFor.bind(matchApi);
  const originalEventsForPlayer = matchApi.eventsForPlayer.bind(matchApi);

  matchApi.handleInput = (playerId, input = {}, now = Date.now()) => {
    const tNow = finite(now, Date.now());
    const entity = entities.get(playerId);
    if (entity?.alive) {
      // Intercept nuke aim controls & firePressed when Mini-Nuke aiming is active!
      const aimingNuke = nukeAimStates.get(playerId);
      if (aimingNuke?.active) {
        if (input.nukeCancelPressed) {
          nukeAimStates.delete(playerId);
          ctx.events.emit("nuke:cancelled", { entityId: playerId, text: "Наведение мини-ядерки отменено.", now: tNow });
          return;
        }
        const cycleDelta = Number(input.nukeCycleDelta) || 0;
        if (cycleDelta !== 0) {
          handleNukeAction(playerId, "nuke-cycle-distance", null, tNow, cycleDelta);
          return;
        }
        if (input.firePressed) {
          handleNukeAction(playerId, "nuke-launch", null, tNow);
          return;
        }
      }
      if (input.minePressed) {
        plantMine(playerId, tNow);
      }
      if (input.nukePressed) {
        handleNukeAction(playerId, aimingNuke?.active ? "nuke-launch" : "nuke-aim", null, tNow);
      }
      if (input.electroModePressed) {
        const selectedWeapon = weapons.selected?.(playerId)?.id ?? null;
        if (selectedWeapon === "cannon") {
          cycleCannonMode(playerId, tNow);
        } else if (weapons.has?.(playerId, "electro-rifle")) {
          cycleElectroMode(playerId, tNow);
        } else if (weapons.has?.(playerId, "cannon")) {
          cycleCannonMode(playerId, tNow);
        } else {
          cycleElectroMode(playerId, tNow);
        }
      }
      const activeJump = electroJumpStates.get(playerId);
      if (input.electroJumpReleased) {
        releaseElectroJump(playerId, tNow);
      }
      if (activeJump && activeJump.phase === "gliding" && input.electroJumpHeld && !input.electroJumpReleased) {
        resumeElectroJumpBoost(playerId, tNow);
      }
      if (activeJump && (activeJump.phase === "rising" || activeJump.phase === "gliding") && input.parachutePressed) {
        if (deployParachuteFromElectroJump(playerId, tNow)) {
          return originalHandleInput(playerId, { ...input, parachutePressed: false }, now);
        }
      }
      if (input.electroJumpPressed) {
        handleElectroJumpAction(playerId, tNow);
      } else if (activeJump && activeJump.phase === "gliding" && (input.firePressed || input.jumpPressed)) {
        handleElectroJumpAction(playerId, tNow);
        return originalHandleInput(playerId, { ...input, firePressed: false, jumpPressed: false }, now);
      }

      // Smertonos physical cannon firing & hold-to-charge handling
      const holdingCannon = weapons.selected?.(playerId)?.id === "cannon"
        && !vehicles?.isDriving?.(playerId)
        && !vehicles?.isPassenger?.(playerId)
        && !injury?.isDowned?.(playerId);
      if (holdingCannon) {
        const cMode = cannonModeOf(playerId);
        if (cMode.id === "charged") {
          if (input.fireHeld) {
            if (!cannonCharges.has(playerId)) startCannonCharge(playerId, tNow);
          } else if (cannonCharges.has(playerId)) {
            releaseCannonCharge(playerId, tNow);
          } else if (input.firePressed) {
            // Quick tap in charged mode fires a quick low-charge cannonball
            fireCannon(playerId, tNow, { chargeRatio: CANNON_CONFIG.chargeMinRatio });
          }
        } else {
          if (cannonCharges.has(playerId)) {
            cannonCharges.delete(playerId);
            ctx.events.emit("cannon:charge-cancelled", { entityId: playerId, reason: "mode-switched", now: tNow });
          }
          if (input.firePressed) {
            fireCannon(playerId, tNow);
          }
        }
      } else if (cannonCharges.has(playerId)) {
        cannonCharges.delete(playerId);
        ctx.events.emit("cannon:charge-cancelled", { entityId: playerId, reason: "interrupted", now: tNow });
      }

      if (input.specialAction && typeof input.specialAction === "object") {
        const type = String(input.specialAction.type ?? "");
        if (type === "plant-mine") plantMine(playerId, tNow);
        else if (type === "cycle-electro-mode") cycleElectroMode(playerId, tNow);
        else if (type === "cycle-cannon-mode") cycleCannonMode(playerId, tNow);
        else if (type === "set-cannon-mode") setCannonMode(playerId, input.specialAction.modeId, tNow);
        else if (type === "electro-jump") handleElectroJumpAction(playerId, tNow);
        else if (type === "nuke-aim" || type === "nuke-cycle-distance" || type === "nuke-launch") {
          handleNukeAction(playerId, type, input.specialAction.distanceMeters ?? null, tNow);
        } else if (type === "nuke-cancel") {
          nukeAimStates.delete(playerId);
          ctx.events.emit("nuke:cancelled", { entityId: playerId, text: "Наведение мини-ядерки отменено.", now: tNow });
        } else if (type === "bunker-puzzle-step") {
          submitBunkerPuzzleChoice(playerId, input.specialAction.switchId, tNow);
        }
      }
      if (input.interactPressed) {
        if (handleBunkerInteraction(playerId, tNow)) return;
      }
    }
    return originalHandleInput(playerId, input, now);
  };

  matchApi.step = (dt, now = Date.now()) => {
    const res = originalStep(dt, now);
    tickSpecialOps(finite(now, Date.now()), finite(dt, 0.05));
    return res;
  };

  matchApi.snapshotFor = (playerId, now = Date.now()) => {
    const tNow = finite(now, Date.now());
    const snap = originalSnapshotFor(playerId, tNow);
    const selfPos = ctx.components.get(playerId, "Transform");
    const aim = nukeAimStates.get(playerId);
    const puzzle = bunkerPuzzles.get(playerId);
    const mode = electroModeOf(playerId);
    const cMode = cannonModeOf(playerId);
    const cCharge = cannonCharges.get(playerId) ?? null;
    const cChargeRatio = cCharge
      ? Number(Math.max(0, Math.min(1, (tNow - cCharge.startedAt) / CANNON_CONFIG.chargeMaxMs)).toFixed(3))
      : 0;
    const selectedId = weapons.selected?.(playerId)?.id ?? null;
    const nearHatch = Boolean(selfPos && distance3(selfPos, HATCH_TOP) <= 3.5);
    const nearExit = Boolean(selfPos && distance3(selfPos, BUNKER_ENTRANCE) <= 3.5);
    const nearVault = Boolean(selfPos && distance3(selfPos, BUNKER_VAULT) <= 3.8);

    snap.cannonballs = activeCannonballs.map((ball) => ({
      id: ball.id,
      ownerId: ball.ownerId,
      modeId: ball.modeId,
      chargeRatio: ball.chargeRatio,
      x: Number(ball.x.toFixed(2)),
      y: Number(ball.y.toFixed(2)),
      z: Number(ball.z.toFixed(2)),
      vx: Number(ball.vx.toFixed(1)),
      vy: Number(ball.vy.toFixed(1)),
      vz: Number(ball.vz.toFixed(1)),
    }));

    snap.specialOps = {
      mines: mineCountOf(playerId),
      maxMines: LANDMINE_CONFIG.maxCarry,
      miniNukes: nukeCountOf(playerId),
      nukeAiming: Boolean(aim?.active),
      nukeDistance: aim?.active ? MINI_NUKE_CONFIG.distances[aim.distanceIndex] : MINI_NUKE_CONFIG.distances[2],
      hasElectroRifle: Boolean(weapons.has?.(playerId, "electro-rifle")),
      hasCannon: Boolean(weapons.has?.(playerId, "cannon")),
      cannonSelected: selectedId === "cannon",
      cannonMode: {
        id: cMode.id,
        label: cMode.label,
        shortLabel: cMode.shortLabel,
      },
      cannonCharging: Boolean(cCharge),
      cannonChargeRatio: cChargeRatio,
      electroLukashenko: Boolean(entities.get(playerId)?.electroLukashenko),
      electroMode: {
        id: mode.id,
        label: mode.label,
        shortLabel: mode.shortLabel,
      },
      electroJumpPhase: electroJumpPhaseOf(playerId, tNow),
      electroJumpCooldownMs: electroJumpCooldownRemainingMs(playerId, tNow),
      electroJumpFuelMs: electroJumpStates.has(playerId)
        ? Math.max(0, Math.round(finite(electroJumpStates.get(playerId)?.fuelMs, 0)))
        : 0,
      inBunker: Boolean(selfPos && finite(selfPos.y) <= -6),
      inNoGuidanceZone: Boolean(selfPos && isInsideResidenceNoGuidanceZone(selfPos)),
      nearbyBunkerPrompt: nearHatch
        ? "Люк в глубокий бункер Резиденции (нажми E)"
        : (nearExit
          ? "Выход из бункера наверх (нажми E)"
          : (nearVault && !vaultLooted ? "Хранилище «Электрический Лукашенко» (нажми E)" : null)),
      bunkerPuzzle: puzzle && !puzzle.solved ? {
        stage: puzzle.currentStage + 1,
        totalStages: puzzle.stages.length,
        hint: puzzle.stages[puzzle.currentStage]?.hint ?? "",
        enteredCount: puzzle.entered.length,
        expectedCount: puzzle.stages[puzzle.currentStage]?.code?.length ?? 2,
        relaxed: Boolean(puzzle.relaxed),
        switches: puzzle.switches,
      } : null,
      vaultUnlocked,
      vaultLooted,
    };
    return snap;
  };

  matchApi.eventsForPlayer = (playerId, packets = []) => {
    const filtered = originalEventsForPlayer(playerId, packets);
    const extras = packets.filter((packet) => {
      const ev = String(packet?.event ?? "");
      if (
        !ev.startsWith("special:")
        && !ev.startsWith("bunker:")
        && !ev.startsWith("mine:")
        && !ev.startsWith("nuke:")
        && !ev.startsWith("cannon:")
        && ev !== "vehicle:launched"
      ) return false;
      const p = packet.payload ?? {};
      if (
        ev === "mine:detonated"
        || ev === "nuke:detonated"
        || ev === "nuke:launched"
        || ev === "cannon:launched"
        || ev === "cannon:impact"
        || ev === "vehicle:launched"
        || ev === "special:electro-equipped"
        || ev === "special:electro-jump"
        || ev === "special:rival-buyback"
      ) {
        return true;
      }
      return p.entityId === playerId;
    });
    if (!extras.length) return filtered;
    const seen = new Set(filtered);
    const merged = [...filtered];
    for (const pkt of extras) {
      if (!seen.has(pkt)) {
        seen.add(pkt);
        merged.push(pkt);
      }
    }
    return merged;
  };

  ctx.services.provide("special-ops", {
    mineCountOf,
    grantMines,
    nukeCountOf,
    grantNuke,
    plantMine,
    handleNukeAction,
    handleElectroJumpAction,
    releaseElectroJump,
    deployParachuteFromElectroJump,
    electroJumpPhaseOf,
    electroModeOf,
    cycleElectroMode,
    cannonModeOf,
    setCannonMode,
    cycleCannonMode,
    fireCannon,
    startCannonCharge,
    releaseCannonCharge,
    grantExclusiveCannon,
    equipElectroLukashenko,
    handleBunkerInteraction,
    submitBunkerPuzzleChoice,
    runRivalLateGameStep,
    plantedMines,
    pendingNukes,
    activeCannonballs,
    pendingCannonSalvos,
    sites: {
      HATCH_TOP,
      BUNKER_ENTRANCE,
      BUNKER_VAULT,
      RESIDENCE_SITE,
    },
  });
}
