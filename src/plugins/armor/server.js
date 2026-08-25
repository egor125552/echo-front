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

export async function setup(ctx) {
  const entities = ctx.services.get("entities");
  const plating = new Map();

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

  function cancelPlating(entityId, reason = "cancelled") {
    const active = plating.get(entityId);
    if (!active) return false;
    plating.delete(entityId);
    ctx.events.emit("armor:plating-cancelled", {
      entityId,
      reason,
      targetPlate: active.targetPlate,
      reservePlates: armorState(entityId)?.reserve ?? 0,
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
    ctx.events.emit("armor:plating-started", {
      entityId,
      targetPlate,
      reservePlates: armor.reserve,
      startedAt: active.startedAt,
      completesAt: active.completesAt,
    });
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

  function grantSatchel(entityId) {
    const entity = entities.get(entityId);
    const armor = armorState(entityId);
    if (!entity?.alive || !armor || armor.hasSatchel) return false;
    armor.hasSatchel = true;
    armor.reserveCapacity = SATCHEL_RESERVE_PLATE_CAPACITY;
    emitChanged(entityId);
    return true;
  }

  function tick(now = Date.now()) {
    for (const [entityId, active] of [...plating]) {
      if (now < active.completesAt) continue;
      plating.delete(entityId);

      const entity = entities.get(entityId);
      const armor = armorState(entityId);
      if (!entity?.alive || !armor || armor.current >= armor.maximum || armor.reserve <= 0) continue;

      armor.reserve -= 1;
      armor.current = clampArmor(armor.current + armor.plateValue, armor.maximum);
      const state = describe(entityId);
      emitChanged(entityId);
      ctx.events.emit("armor:plating-completed", {
        entityId,
        plateNumber: state.platesRemaining,
        maximumPlates: state.maximumPlates,
        armor: state.current,
        maximum: state.maximum,
        reservePlates: state.reservePlates,
        reserveCapacity: state.reserveCapacity,
      });
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
    const armor = armorState(packet.targetId);
    if (!armor || armor.current <= 0 || packet.remaining <= 0) return;

    cancelPlating(packet.targetId, "damaged");
    const before = armor.current;
    const absorbed = Math.min(armor.current, packet.remaining);
    armor.current -= absorbed;
    packet.remaining = Math.max(0, packet.remaining - absorbed);
    packet.armorAbsorbed = absorbed;
    packet.armorBroke = before > 0 && armor.current <= 0;
    emitChanged(packet.targetId);
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
    cancelPlating,
    tick,
    describe,
    grantPlates,
    grantSatchel,
    isPlating(entityId) {
      return plating.has(entityId);
    },
  });
}
