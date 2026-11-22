export const INITIAL_GENERATED_CRATE_COUNT = 22;
export const MAX_ACTIVE_GENERATED_CRATES = 32;
export const ACTIVE_SAFE_ZONE_CRATE_TARGET = 18;
export const LOW_SAFE_ZONE_CRATE_THRESHOLD = 8;
export const GENERATION_INTERVAL_MS = 15_000;
export const MIN_CRATE_SPACING = 16;
export const BUILDING_CLEARANCE = 7;
export const SHOP_CLEARANCE = 10;
export const VEHICLE_CLEARANCE = 7;
export const ENTITY_CLEARANCE = 4;

export const AIRDROP_FIRST_DELAY_MS = 22_000;
export const AIRDROP_INTERVAL_MS = 48_000;
export const AIRDROP_ALTITUDE = 156;
export const AIRDROP_DESCENT_SPEED = 26;
export const MAX_ACTIVE_AIRDROPS = 3;

export const manifest = {
  id: "battle-royale-crate-generator",
  version: "1.1.0",
  requires: [
    "map-test-arena",
    "battle-royale",
    "battle-royale-crate-physics",
    "battle-royale-vehicle-fleet",
    "match-api",
  ],
  optional: ["battle-royale-shop", "battle-royale-tutorial", "entities", "rapier-physics"],
  capabilities: ["services.consume", "services.provide", "components.read", "events.on", "events.emit"],
};

function finite(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function distance2(a, b) {
  return Math.hypot(finite(a?.x) - finite(b?.x), finite(a?.z) - finite(b?.z));
}

export async function setup(ctx) {
  const map = ctx.services.get("map");
  const battleRoyale = ctx.services.get("battle-royale");
  const cratePhysics = ctx.services.get("crate-physics");
  const vehicles = ctx.services.get("vehicles");
  const matchApi = ctx.services.get("match-api");
  const shop = ctx.services.has("battle-royale-shop")
    ? ctx.services.get("battle-royale-shop")
    : (ctx.services.has("shop") ? ctx.services.get("shop") : null);
  const entities = ctx.services.has("entities") ? ctx.services.get("entities") : null;
  const physics = ctx.services.has("physics") ? ctx.services.get("physics") : null;
  const tutorial = ctx.services.has("battle-royale-tutorial")
    ? ctx.services.get("battle-royale-tutorial")
    : null;

  if (!Array.isArray(map.crates)) map.crates = [];

  let serial = 0;
  let airdropSerial = 0;
  let lastGenerationAt = 0;
  let nextCheckAt = 0;
  let nextAirdropAt = 0;
  const generatedIds = [];
  const airdropIds = [];

  function worldLimit() {
    return Math.max(80, finite(map.halfSize, 1000) - 45);
  }

  function shopStations() {
    return shop?.stations?.() ?? [];
  }

  function isClearSpot(candidate, minCrateSpacing = MIN_CRATE_SPACING) {
    const limit = worldLimit();
    if (Math.abs(candidate.x) > limit || Math.abs(candidate.z) > limit) return false;
    if (map.insideAnyBuilding?.({ x: candidate.x, y: 0, z: candidate.z }, BUILDING_CLEARANCE)) {
      return false;
    }

    for (const station of shopStations()) {
      if (distance2(candidate, station) < SHOP_CLEARANCE) return false;
    }

    for (const vehicle of vehicles.snapshot?.() ?? []) {
      if (distance2(candidate, vehicle) < VEHICLE_CLEARANCE) return false;
    }

    for (const crate of map.crates) {
      if (Math.abs(finite(crate?.y)) > 1.5 && !crate?.airdrop) continue;
      if (distance2(candidate, crate) < minCrateSpacing) return false;
    }

    if (entities) {
      for (const ent of entities.all()) {
        if (!ent?.alive) continue;
        const t = ctx.components.get(ent.id, "Transform");
        if (t && distance2(candidate, t) < ENTITY_CLEARANCE) return false;
      }
    }

    return true;
  }

  function pickCandidateSpot({ minRadius = 32, maxRadius = 620 } = {}) {
    const safeMax = Math.max(minRadius + 10, Math.min(worldLimit(), finite(maxRadius, 620)));
    const safeMin = Math.max(24, Math.min(minRadius, safeMax - 8));
    for (let attempt = 0; attempt < 48; attempt += 1) {
      const angle = Math.random() * Math.PI * 2;
      const t = attempt < 36 ? Math.random() : Math.random() * 0.65;
      const radius = safeMin + Math.sqrt(t) * (safeMax - safeMin);
      const spot = {
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
      };
      const spacing = attempt < 28 ? MIN_CRATE_SPACING : MIN_CRATE_SPACING * 0.65;
      if (isClearSpot(spot, spacing)) return spot;
    }
    return null;
  }

  function pickAirdropSpot(now = Date.now(), nearEntityId = null) {
    const zoneRadius = Math.max(45, finite(battleRoyale.zoneRadiusAt?.(now), 650));
    const safeLimit = Math.min(worldLimit(), zoneRadius * 0.82);
    let anchor = null;
    if (entities) {
      if (nearEntityId) {
        const ent = entities.get(nearEntityId);
        if (ent?.alive) anchor = ctx.components.get(ent.id, "Transform") ?? null;
      }
      if (!anchor) {
        const humans = entities.all().filter((e) => e?.alive && !e.bot);
        for (const human of humans) {
          const t = ctx.components.get(human.id, "Transform");
          if (t && finite(t.y) <= 8) {
            anchor = t;
            break;
          }
        }
      }
    }

    if (anchor) {
      for (let attempt = 0; attempt < 36; attempt += 1) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 42 + Math.random() * 64;
        let x = finite(anchor.x) + Math.cos(angle) * dist;
        let z = finite(anchor.z) + Math.sin(angle) * dist;
        const radial = Math.hypot(x, z);
        if (radial > safeLimit && radial > 0.01) {
          const scale = (safeLimit * 0.9) / radial;
          x *= scale;
          z *= scale;
        }
        const candidate = { x, z };
        if (isClearSpot(candidate, MIN_CRATE_SPACING * 0.75)) {
          return candidate;
        }
      }
    }

    return pickCandidateSpot({
      minRadius: Math.min(28, safeLimit * 0.25),
      maxRadius: Math.max(36, safeLimit),
    });
  }

  function recycleOldestOpened(now, zoneRadius) {
    const openedCandidates = [];
    for (let i = 0; i < generatedIds.length; i += 1) {
      const id = generatedIds[i];
      const crate = map.crates.find((c) => c?.id === id);
      if (!crate) {
        generatedIds.splice(i, 1);
        i -= 1;
        continue;
      }
      if (crate.opened || Math.hypot(crate.x, crate.z) > zoneRadius + 20) {
        openedCandidates.push({ index: i, id, crate });
      }
    }
    const chosen = openedCandidates.find((c) => c.crate.opened) ?? openedCandidates[0] ?? null;
    if (!chosen) return false;

    generatedIds.splice(chosen.index, 1);
    const mapIdx = map.crates.findIndex((c) => c?.id === chosen.id);
    if (mapIdx >= 0) map.crates.splice(mapIdx, 1);
    cratePhysics.unregisterCrate?.(chosen.id);
    return true;
  }

  function recycleOldestAirdrop(zoneRadius) {
    for (let i = 0; i < airdropIds.length; i += 1) {
      const id = airdropIds[i];
      const crate = map.crates.find((c) => c?.id === id);
      if (!crate) {
        airdropIds.splice(i, 1);
        i -= 1;
        continue;
      }
      if (crate.opened || Math.hypot(crate.x, crate.z) > zoneRadius + 25) {
        airdropIds.splice(i, 1);
        const mapIdx = map.crates.findIndex((c) => c?.id === id);
        if (mapIdx >= 0) map.crates.splice(mapIdx, 1);
        cratePhysics.unregisterCrate?.(id);
        return true;
      }
    }
    return false;
  }

  function spawnCrate({
    loot = null,
    x = null,
    y = 0,
    z = null,
    minRadius = 32,
    maxRadius = null,
    now = Date.now(),
    reason = "supply",
  } = {}) {
    const zoneRadius = Math.max(45, finite(battleRoyale.zoneRadiusAt?.(now), 650));
    const effectiveMaxRadius = maxRadius ?? Math.min(worldLimit(), zoneRadius * 0.88);
    if (generatedIds.length >= MAX_ACTIVE_GENERATED_CRATES) {
      if (!recycleOldestOpened(now, zoneRadius)) return null;
    }

    let spot = null;
    if (x != null && z != null && Number.isFinite(Number(x)) && Number.isFinite(Number(z))) {
      spot = { x: Number(x), z: Number(z) };
    } else {
      spot = pickCandidateSpot({ minRadius, maxRadius: effectiveMaxRadius });
    }
    if (!spot) return null;

    serial += 1;
    const cratePool = ["armor", "rifle", "armor", "marksman", "rifle", "sniper", "armor", "marksman"];
    const allowedLoots = new Set(["rifle", "armor", "marksman", "sniper"]);
    const resolvedLoot = allowedLoots.has(loot)
      ? loot
      : cratePool[(serial - 1) % cratePool.length];

    const crate = {
      id: `crate-gen-${serial}`,
      x: Number(spot.x.toFixed(2)),
      y: finite(y, 0),
      z: Number(spot.z.toFixed(2)),
      loot: resolvedLoot,
      opened: false,
      generated: true,
    };

    map.crates.push(crate);
    generatedIds.push(crate.id);
    cratePhysics.registerCrate?.(crate);
    ctx.events.emit("crate:generated", {
      crateId: crate.id,
      loot: crate.loot,
      x: crate.x,
      y: crate.y,
      z: crate.z,
      reason,
      generated: true,
      now,
    });
    return crate;
  }

  function finalizeAirdropLanding(crate, now = Date.now()) {
    if (!crate || crate.airdropPhase === "landed") return false;
    crate.y = 0;
    crate.airdropPhase = "landed";
    crate.landedAt = now;
    cratePhysics.registerCrate?.(crate);
    const isJuggernaut = Boolean(crate.juggernaut || crate.loot === "juggernaut");
    const isElectro = Boolean(crate.electroLukashenko || crate.loot === "electro-lukashenko");
    const payload = {
      crateId: crate.id,
      loot: crate.loot,
      x: crate.x,
      y: 0,
      z: crate.z,
      airdrop: true,
      juggernaut: isJuggernaut,
      electroLukashenko: isElectro,
      now,
    };
    ctx.events.emit("crate:airdrop-landed", payload);
    if (isJuggernaut) {
      ctx.events.emit("crate:juggernaut-landed", payload);
    }
    ctx.events.emit("sound:spatial", {
      entityId: null,
      key: (isJuggernaut || isElectro) ? "airdrop.juggernaut" : "airdrop.landed",
      x: crate.x,
      y: 0,
      z: crate.z,
      radius: (isJuggernaut || isElectro) ? 900 : 135,
      now,
    });
    return true;
  }

  function spawnAirdrop({
    x = null,
    z = null,
    altitude = AIRDROP_ALTITUDE,
    nearEntityId = null,
    juggernaut = false,
    loot = null,
    now = Date.now(),
    reason = "sky-drop",
  } = {}) {
    const zoneRadius = Math.max(45, finite(battleRoyale.zoneRadiusAt?.(now), 650));
    const isElectro = Boolean(loot === "electro-lukashenko");
    const isJuggernaut = Boolean(!isElectro && (juggernaut || loot === "juggernaut"));
    const activeUnopened = map.crates.filter((c) => c?.airdrop && !c.opened);
    if (!isJuggernaut && !isElectro && activeUnopened.length >= MAX_ACTIVE_AIRDROPS) {
      if (!recycleOldestAirdrop(zoneRadius)) return null;
    } else if (airdropIds.length >= MAX_ACTIVE_AIRDROPS * 2 + 2) {
      recycleOldestAirdrop(zoneRadius);
    }

    let spot = null;
    if (x != null && z != null && Number.isFinite(Number(x)) && Number.isFinite(Number(z))) {
      spot = { x: Number(x), z: Number(z) };
    } else {
      spot = pickAirdropSpot(now, nearEntityId);
    }
    if (!spot) return null;

    airdropSerial += 1;
    const startY = Math.max(0, finite(altitude, AIRDROP_ALTITUDE));
    const crate = {
      id: isElectro
        ? `crate-electro-${airdropSerial}`
        : (isJuggernaut ? `crate-juggernaut-${airdropSerial}` : `crate-airdrop-${airdropSerial}`),
      x: Number(spot.x.toFixed(2)),
      y: Number(startY.toFixed(2)),
      z: Number(spot.z.toFixed(2)),
      hx: 0.85,
      hz: 0.85,
      loot: isElectro ? "electro-lukashenko" : (isJuggernaut ? "juggernaut" : "airdrop"),
      opened: false,
      generated: false,
      airdrop: true,
      juggernaut: isJuggernaut,
      electroLukashenko: isElectro,
      airdropPhase: startY > 0 ? "descending" : "landed",
      spawnedAt: now,
      landedAt: startY > 0 ? null : now,
    };

    map.crates.push(crate);
    airdropIds.push(crate.id);

    const incomingPayload = {
      crateId: crate.id,
      loot: crate.loot,
      x: crate.x,
      y: crate.y,
      z: crate.z,
      altitude: crate.y,
      reason,
      airdrop: true,
      juggernaut: isJuggernaut,
      electroLukashenko: isElectro,
      buyerId: nearEntityId ?? null,
      now,
    };
    ctx.events.emit("crate:airdrop-incoming", incomingPayload);
    if (isJuggernaut) {
      ctx.events.emit("crate:juggernaut-incoming", incomingPayload);
    }

    if (startY <= 0) {
      finalizeAirdropLanding(crate, now);
    }
    return crate;
  }

  function spawnJuggernautDrop(options = {}) {
    return spawnAirdrop({
      ...options,
      juggernaut: true,
      loot: "juggernaut",
      reason: options.reason ?? "juggernaut-drop",
    });
  }

  function spawnElectroLukashenkoDrop(options = {}) {
    const crate = spawnAirdrop({
      ...options,
      juggernaut: false,
      loot: "electro-lukashenko",
      reason: options.reason ?? "electro-lukashenko-drop",
    });
    if (crate) {
      crate.electroLukashenko = true;
      crate.name = "Груз «Электрический Лукашенко»";
    }
    return crate;
  }

  function stepAirdrops(dt = 0.05, now = Date.now()) {
    if (tutorial) return;

    const safeDt = Math.max(0.001, Math.min(1, finite(dt, 0.05)));
    for (const crate of map.crates) {
      if (!crate?.airdrop || crate.opened || crate.airdropPhase !== "descending") continue;
      crate.y = Math.max(0, Number((finite(crate.y, AIRDROP_ALTITUDE) - AIRDROP_DESCENT_SPEED * safeDt).toFixed(2)));
      if (crate.y <= 0) {
        finalizeAirdropLanding(crate, now);
      }
    }

    if (!battleRoyale.isActive?.()) return;
    if (battleRoyale.status?.(now)?.deployment?.active) return;

    if (nextAirdropAt <= 0) {
      nextAirdropAt = now + AIRDROP_FIRST_DELAY_MS;
    }

    if (now >= nextAirdropAt) {
      nextAirdropAt = now + AIRDROP_INTERVAL_MS;
      const hasUnopenedJuggernaut = map.crates.some((c) => c?.juggernaut && !c.opened);
      const makeJuggernaut = !hasUnopenedJuggernaut && airdropSerial % 2 === 0;
      spawnAirdrop({
        now,
        juggernaut: makeJuggernaut,
        reason: makeJuggernaut ? "scheduled-juggernaut" : "scheduled",
      });
    }
  }

  function generateInitial(count = INITIAL_GENERATED_CRATE_COUNT, now = Date.now()) {
    if (tutorial) return [];
    const created = [];
    const total = Math.max(0, Math.floor(count));
    const innerCount = Math.round(total * 0.28);
    const midCount = Math.round(total * 0.36);
    const initialCycle = ["armor", "rifle", "marksman", "armor", "sniper", "rifle", "armor", "marksman", "sniper"];

    physics?.beginBatch?.();
    try {
      for (let i = 0; i < total; i += 1) {
        const minRadius = i < innerCount ? 34 : (i < innerCount + midCount ? 140 : 320);
        const maxRadius = i < innerCount ? 140 : (i < innerCount + midCount ? 330 : 620);
        const crate = spawnCrate({
          minRadius,
          maxRadius,
          loot: initialCycle[i % initialCycle.length],
          now,
          reason: "initial",
        });
        if (crate) created.push(crate);
      }
    } finally {
      physics?.endBatch?.();
    }
    lastGenerationAt = now;
    nextCheckAt = now + GENERATION_INTERVAL_MS;
    return created;
  }

  function unopenedInSafeZone(now = Date.now()) {
    const zoneRadius = Math.max(30, finite(battleRoyale.zoneRadiusAt?.(now), 1450));
    const limit = zoneRadius * 0.94;
    let count = 0;
    for (const crate of map.crates) {
      if (!crate || crate.opened || crate.airdrop) continue;
      if (Math.hypot(finite(crate.x), finite(crate.z)) <= limit) count += 1;
    }
    return count;
  }

  function tick(now = Date.now()) {
    if (tutorial || !battleRoyale.isActive?.()) return [];
    if (battleRoyale.status?.(now)?.deployment?.active) return [];
    if (now < nextCheckAt) return [];

    nextCheckAt = now + GENERATION_INTERVAL_MS;
    const zoneRadius = Math.max(38, finite(battleRoyale.zoneRadiusAt?.(now), 650));
    const currentInZone = unopenedInSafeZone(now);
    const needed = currentInZone < ACTIVE_SAFE_ZONE_CRATE_TARGET
      ? Math.min(3, ACTIVE_SAFE_ZONE_CRATE_TARGET - currentInZone)
      : (now - lastGenerationAt >= GENERATION_INTERVAL_MS * 2 ? 1 : 0);

    if (needed <= 0) return [];

    const spawned = [];
    physics?.beginBatch?.();
    try {
      for (let i = 0; i < needed; i += 1) {
        const crate = spawnCrate({
          minRadius: Math.min(28, zoneRadius * 0.25),
          maxRadius: Math.max(36, zoneRadius * 0.85),
          now,
          reason: "replenish",
        });
        if (crate) spawned.push(crate);
      }
    } finally {
      physics?.endBatch?.();
    }
    if (spawned.length) lastGenerationAt = now;
    return spawned;
  }

  generateInitial(INITIAL_GENERATED_CRATE_COUNT);

  ctx.events.on("loot:opened", (payload = {}) => {
    if (tutorial) return;
    const eventNow = finite(payload.now, Date.now());
    const crate = map.crates.find((c) => c?.id === payload.crateId);
    if (crate?.airdrop || payload.loot === "airdrop" || payload.loot === "juggernaut" || payload.loot === "electro-lukashenko") {
      ctx.events.emit("crate:airdrop-opened", {
        crateId: payload.crateId ?? crate?.id ?? null,
        entityId: payload.entityId ?? null,
        juggernaut: Boolean(crate?.juggernaut || payload.loot === "juggernaut"),
        electroLukashenko: Boolean(crate?.electroLukashenko || payload.loot === "electro-lukashenko"),
        x: finite(payload.x, crate?.x ?? 0),
        y: finite(payload.y, crate?.y ?? 0),
        z: finite(payload.z, crate?.z ?? 0),
        now: eventNow,
      });
      return;
    }
    if (unopenedInSafeZone(eventNow) <= LOW_SAFE_ZONE_CRATE_THRESHOLD) {
      nextCheckAt = Math.min(nextCheckAt, eventNow + 1200);
    }
  });

  const originalStep = matchApi.step.bind(matchApi);
  matchApi.step = (dt, now = Date.now()) => {
    stepAirdrops(dt, now);
    tick(now);
    return originalStep(dt, now);
  };

  ctx.services.provide("crate-generator", {
    generateInitial,
    spawnCrate,
    spawnAirdrop,
    spawnJuggernautDrop,
    spawnElectroLukashenkoDrop,
    stepAirdrops,
    tick,
    unopenedInSafeZone,
    airdrops() {
      return map.crates.filter((c) => Boolean(c?.airdrop));
    },
    juggernautDrops() {
      return map.crates.filter((c) => Boolean(c?.juggernaut));
    },
    stats() {
      const total = map.crates.length;
      const unopened = map.crates.filter((c) => c && !c.opened).length;
      const generatedTotal = generatedIds.length;
      const generatedUnopened = map.crates.filter((c) => c?.generated && !c.opened).length;
      const activeAirdrops = map.crates.filter((c) => c?.airdrop && !c.opened).length;
      return {
        total,
        unopened,
        generatedTotal,
        generatedUnopened,
        activeAirdrops,
      };
    },
    constants: {
      INITIAL_GENERATED_CRATE_COUNT,
      MAX_ACTIVE_GENERATED_CRATES,
      ACTIVE_SAFE_ZONE_CRATE_TARGET,
      LOW_SAFE_ZONE_CRATE_THRESHOLD,
      GENERATION_INTERVAL_MS,
      MIN_CRATE_SPACING,
      AIRDROP_FIRST_DELAY_MS,
      AIRDROP_INTERVAL_MS,
      AIRDROP_ALTITUDE,
      AIRDROP_DESCENT_SPEED,
      MAX_ACTIVE_AIRDROPS,
    },
  });
}
