export const ARMOR_PLATE_VALUE = 50;
export const DEFAULT_MAX_PLATES = 3;
export const DEFAULT_RESERVE_PLATE_CAPACITY = 5;
export const SATCHEL_RESERVE_PLATE_CAPACITY = 8;
export const PLATING_DURATION_MS = 1050;

export const manifest = {
  id: "armor",
  version: "3.0.0",
  requires: ["health", "entities"],
  capabilities: [
    "services.consume", "services.provide",
    "components.register", "components.read", "components.write",
    "events.on", "events.emit",
  ],
};

function clampArmor(value, maximum) {
  return Math.max(0, Math.min(maximum, Number(value) || 0));
}

function clampReserve(value, capacity) {
  return Math.max(0, Math.min(capacity, Math.floor(Number(value) || 0)));
}

export function plateCountForArmor(value, plateValue = ARMOR_PLATE_VALUE) {
  const current = Math.max(0, Number(value) || 0);
  if (current <= 0) return 0;
  return Math.ceil(current / plateValue);
}

export function computeArmorAbsorption({
  armorCurrent = 0,
  armorMaximum = 150,
  incomingDamage = 0,
  armorMultiplier = 1,
  shattersArmor = false,
  isJuggernaut = false,
  distanceMultiplier = 1,
} = {}) {
  const before = Math.max(0, Number(armorCurrent) || 0);
  const maximum = Math.max(before, Number(armorMaximum) || 0);
  const remaining = Math.max(0, Number(incomingDamage) || 0);
  if (before <= 0 || remaining <= 0) {
    return { brokenArmor: 0, remainingDamage: remaining, armorAfter: before, armorBroke: false };
  }

  const heavyArmor = Boolean(isJuggernaut || maximum > 200);
  const distFactor = Math.max(0.25, Math.min(1, Number(distanceMultiplier) || 1));
  const baseMultiplier = Math.max(1, Number(armorMultiplier) || 1);

  if (heavyArmor) {
    // Juggernaut heavy plating never shatters in a single hit and resists bonus
    // armor-piercing multipliers (especially snipers and long-range shots).
    const heavyMultiplier = shattersArmor
      ? 0.65
      : baseMultiplier > 1
        ? 0.75
        : 0.85;
    const rawArmorDamage = Math.max(1, Math.round(remaining * heavyMultiplier));
    const brokenArmor = Math.min(before, rawArmorDamage);
    const damageConsumedByArmor = brokenArmor < before
      ? remaining
      : Math.min(remaining, Math.round(brokenArmor / heavyMultiplier));
    const armorAfter = Math.max(0, before - brokenArmor);
    return {
      brokenArmor,
      remainingDamage: Math.max(0, remaining - damageConsumedByArmor),
      armorAfter,
      armorBroke: before > 0 && armorAfter <= 0,
    };
  }

  if (baseMultiplier === 1 && !shattersArmor) {
    const absorbed = Math.min(before, remaining);
    const armorAfter = Math.max(0, before - absorbed);
    return {
      brokenArmor: absorbed,
      remainingDamage: Math.max(0, remaining - absorbed),
      armorAfter,
      armorBroke: before > 0 && armorAfter <= 0,
    };
  }

  const rawArmorDamage = Math.round(remaining * baseMultiplier);
  const effectiveShatter = Boolean(shattersArmor) && distFactor >= 0.65;
  const brokenArmor = effectiveShatter
    ? before
    : Math.min(before, rawArmorDamage);
  const damageConsumedByArmor = Math.min(
    remaining,
    Math.round(brokenArmor / baseMultiplier),
  );
  const armorAfter = Math.max(0, before - brokenArmor);
  return {
    brokenArmor,
    remainingDamage: Math.max(0, remaining - damageConsumedByArmor),
    armorAfter,
    armorBroke: before > 0 && armorAfter <= 0,
  };
}

export async function setup(ctx) {
  const entities = ctx.services.get("entities");
  const plating = new Map();
  const autoPlating = new Set();

  ctx.components.register("Armor");

  function armorState(entityId) {
    return ctx.components.get(entityId, "Armor") ?? null;
  }

  function describe(entityId) {
    const armor = armorState(entityId);
    if (!armor) return null;
    return {
      current: armor.current,
      maximum: armor.maximum,
      platesRemaining: plateCountForArmor(armor.current, armor.plateValue),
      maximumPlates: plateCountForArmor(armor.maximum, armor.plateValue),
      plateValue: armor.plateValue,
      reservePlates: armor.reserve,
      reserveCapacity: armor.reserveCapacity,
      hasSatchel: Boolean(armor.hasSatchel),
      plating: plating.has(entityId),
    };
  }

  function emitChanged(entityId) {
    const state = describe(entityId);
    if (!state) return;
    ctx.events.emit("armor:changed", { entityId, ...state });
  }

  function entityPosition(entityId) {
    const t = ctx.components.get(entityId, "Transform");
    return {
      x: Number(t?.x) || 0,
      y: Number(t?.y) || 0,
      z: Number(t?.z) || 0,
      radius: 34,
    };
  }

  function cancelPlating(entityId, reason = "cancelled") {
    const active = plating.get(entityId);
    if (!active) return false;
    plating.delete(entityId);
    autoPlating.delete(entityId);
    const pos = entityPosition(entityId);
    ctx.events.emit("armor:plating-cancelled", {
      entityId,
      reason,
      targetPlate: active.targetPlate,
      reservePlates: armorState(entityId)?.reserve ?? 0,
      ...pos,
    });
    return true;
  }

  function startPlating(entityId, now = Date.now()) {
    const entity = entities.get(entityId);
    const armor = armorState(entityId);
    if (!entity?.alive || !armor || armor.current >= armor.maximum || armor.reserve <= 0) return false;
    if (plating.has(entityId)) return false;

    const nextArmor = Math.min(armor.maximum, armor.current + armor.plateValue);
    const targetPlate = plateCountForArmor(nextArmor, armor.plateValue);
    const active = {
      startedAt: now,
      completesAt: now + PLATING_DURATION_MS,
      targetPlate,
    };
    plating.set(entityId, active);
    const pos = entityPosition(entityId);
    ctx.events.emit("armor:plating-started", {
      entityId,
      targetPlate,
      reservePlates: armor.reserve,
      startedAt: active.startedAt,
      completesAt: active.completesAt,
      ...pos,
    });
    ctx.events.emit("sound:spatial", {
      entityId,
      key: "armor.plate.start",
      ...pos,
    });
    return true;
  }

  function startFullPlating(entityId, now = Date.now()) {
    if (plating.has(entityId)) return true;
    if (!startPlating(entityId, now)) return false;
    autoPlating.add(entityId);
    return true;
  }

  function grantPlates(entityId, count = 1) {
    const entity = entities.get(entityId);
    const armor = armorState(entityId);
    if (!entity?.alive || !armor) return 0;
    const safeCount = Math.max(1, Math.floor(Number(count) || 1));
    const before = armor.reserve;
    armor.reserve = clampReserve(armor.reserve + safeCount, armor.reserveCapacity);
    const added = armor.reserve - before;
    if (added > 0) emitChanged(entityId);
    return added;
  }

  function takePlates(entityId, count = 1) {
    const entity = entities.get(entityId);
    const armor = armorState(entityId);
    if (!entity?.alive || !armor) return 0;
    const safeCount = Math.max(0, Math.floor(Number(count) || 0));
    if (!safeCount) return 0;
    const removed = Math.min(safeCount, Math.max(0, armor.reserve));
    if (removed > 0) {
      armor.reserve -= removed;
      emitChanged(entityId);
    }
    return removed;
  }

  function remainingReserveCapacity(entityId) {
    const armor = armorState(entityId);
    if (!armor) return 0;
    return Math.max(0, armor.reserveCapacity - armor.reserve);
  }

  function grantSatchel(entityId) {
    const entity = entities.get(entityId);
    const armor = armorState(entityId);
    if (!entity?.alive || !armor || armor.hasSatchel) return false;
    armor.hasSatchel = true;
    armor.reserveCapacity = SATCHEL_RESERVE_PLATE_CAPACITY;
    emitChanged(entityId);
    return true;
  }

  function grantJuggernautArmor(entityId) {
    const entity = entities.get(entityId);
    const armor = armorState(entityId);
    if (!entity?.alive || !armor) return false;
    armor.plateValue = 75;
    armor.maximum = 600;
    armor.current = 600;
    armor.hasSatchel = true;
    armor.reserveCapacity = 12;
    armor.reserve = 12;
    emitChanged(entityId);
    return true;
  }

  function grantElectroLukashenkoArmor(entityId) {
    const entity = entities.get(entityId);
    const armor = armorState(entityId);
    if (!entity?.alive || !armor) return false;
    armor.plateValue = 100;
    armor.maximum = 800;
    armor.current = 800;
    armor.hasSatchel = true;
    armor.reserveCapacity = 14;
    armor.reserve = 14;
    emitChanged(entityId);
    return true;
  }

  function tick(now = Date.now()) {
    for (const [entityId, active] of [...plating]) {
      if (now < active.completesAt) continue;
      plating.delete(entityId);

      const entity = entities.get(entityId);
      const armor = armorState(entityId);
      if (!entity?.alive || !armor || armor.current >= armor.maximum || armor.reserve <= 0) {
        autoPlating.delete(entityId);
        continue;
      }

      armor.reserve -= 1;
      armor.current = clampArmor(armor.current + armor.plateValue, armor.maximum);
      const state = describe(entityId);
      const pos = entityPosition(entityId);
      emitChanged(entityId);
      ctx.events.emit("armor:plating-completed", {
        entityId,
        plateNumber: state.platesRemaining,
        maximumPlates: state.maximumPlates,
        armor: state.current,
        maximum: state.maximum,
        reservePlates: state.reservePlates,
        reserveCapacity: state.reserveCapacity,
        ...pos,
      });
      ctx.events.emit("sound:spatial", {
        entityId,
        key: "armor.plate.complete",
        ...pos,
      });
      if (autoPlating.has(entityId) && !startPlating(entityId, now)) {
        autoPlating.delete(entityId);
      }
    }
  }

  ctx.events.on("entity:spawned", ({ entityId, spec }) => {
    const explicitPlates = Number(spec.armorPlates);
    const plateValue = Number(spec.armorPlateValue) > 0
      ? Number(spec.armorPlateValue)
      : ARMOR_PLATE_VALUE;
    const maximum = explicitPlates > 0
      ? explicitPlates * plateValue
      : Number(spec.armor) || 0;
    if (maximum <= 0) return;

    const current = spec.armorCurrent == null
      ? maximum
      : clampArmor(spec.armorCurrent, maximum);
    const hasSatchel = Boolean(spec.armorSatchel);
    const configuredCapacity = Number(spec.armorReserveCapacity);
    const reserveCapacity = configuredCapacity > 0
      ? Math.floor(configuredCapacity)
      : (hasSatchel ? SATCHEL_RESERVE_PLATE_CAPACITY : DEFAULT_RESERVE_PLATE_CAPACITY);
    const reserve = clampReserve(spec.armorReserve ?? 0, reserveCapacity);

    ctx.components.add(entityId, "Armor", {
      current,
      maximum,
      plateValue,
      reserve,
      reserveCapacity,
      spawnReserve: reserve,
      hasSatchel,
    });
  });

  ctx.events.on("entity:removed", ({ entityId }) => {
    cancelPlating(entityId, "removed");
    ctx.components.remove(entityId, "Armor");
  });

  ctx.events.on("entity:died", ({ entityId }) => {
    cancelPlating(entityId, "death");
  });

  ctx.events.on("combat:damage:before", (packet) => {
    const target = entities.get(packet.targetId);
    const armor = armorState(packet.targetId);
    if (!target?.alive || !armor || armor.current <= 0 || packet.remaining <= 0) return;

    const weaponDef = packet.weaponId && ctx.services.has("weapons")
      ? ctx.services.get("weapons")?.definitions?.[packet.weaponId]
      : null;
    const armorMultiplier = Math.max(
      1,
      Number(packet.armorDamageMultiplier ?? weaponDef?.armorDamageMultiplier) || 1,
    );
    const shattersArmor = Boolean(packet.shattersArmor ?? weaponDef?.shattersArmor);

    cancelPlating(packet.targetId, "damaged");
    const result = computeArmorAbsorption({
      armorCurrent: armor.current,
      armorMaximum: armor.maximum,
      incomingDamage: packet.remaining,
      armorMultiplier,
      shattersArmor,
      isJuggernaut: Boolean(target.juggernaut),
      distanceMultiplier: packet.distanceMultiplier ?? 1,
    });

    armor.current = result.armorAfter;
    packet.remaining = result.remainingDamage;
    packet.armorAbsorbed = result.brokenArmor;
    packet.armorBroke = result.armorBroke;
    emitChanged(packet.targetId);
    if (packet.armorBroke) {
      const pos = entityPosition(packet.targetId);
      ctx.events.emit("sound:spatial", {
        entityId: packet.targetId,
        key: "armor.break",
        ...pos,
      });
    }
  }, { priority: 100 });

  ctx.events.on("respawn:before", ({ entityId }) => {
    cancelPlating(entityId, "respawn");
    const armor = armorState(entityId);
    if (armor) {
      armor.current = armor.maximum;
      armor.reserve = clampReserve(armor.spawnReserve, armor.reserveCapacity);
      emitChanged(entityId);
    }
  });

  ctx.services.provide("armor", {
    startPlating,
    startFullPlating,
    cancelPlating,
    tick,
    describe,
    grantPlates,
    takePlates,
    remainingReserveCapacity,
    grantSatchel,
    grantJuggernautArmor,
    grantElectroLukashenkoArmor,
    isPlating(entityId) {
      return plating.has(entityId);
    },
  });
}
