export const STIM_CAPACITY = 2;
export const STARTING_STIMULANTS = 1;
export const HEAL_DURATION_MS = 2000;
export const REVIVE_DURATION_MS = 6000;

export function createStimulants(ctx) {
  const injury = ctx.services.get("injury");
  const entities = ctx.services.get("entities");
  const health = ctx.services.get("health");
  const armor = ctx.services.get("armor");
  const ragdoll = ctx.services.get("ragdoll");
  const vehicles = ctx.services.get("vehicles");
  const parachute = ctx.services.get("parachute");
  const stock = new Map();
  const active = new Map();
  const count = id => stock.get(id) ?? 0;
  const emit = (name, id, extra = {}) => injury.emit(name, id, { stimulants: count(id), ...extra });

  function cancel(id, reason = "action") {
    if (!active.delete(id)) return false;
    emit("stim-cancelled", id, { reason });
    return true;
  }

  function grant(id, quantity = 1) {
    const entity = entities.get(id);
    if (!entity?.alive || entity.bot) return 0;
    const added = Math.min(STIM_CAPACITY - count(id), Math.max(0, Math.floor(quantity)));
    stock.set(id, count(id) + added);
    emit("stim-picked", id, { quantity: added });
    return added;
  }

  function start(id, now) {
    const hp = ctx.components.get(id, "Health");
    if (!entities.get(id)?.alive || !hp || active.has(id)) return false;
    const downed = injury.isDowned(id);
    if (!count(id)) { emit("stim-unavailable", id, { reason: "empty" }); return false; }
    if (ragdoll.isActive(id) || vehicles.isDriving(id) || vehicles.isPassenger?.(id) || parachute.stateFor(id)?.airborne) {
      emit("stim-unavailable", id, { reason: "busy" }); return false;
    }
    if (!downed && hp.current >= hp.maximum) {
      emit("stim-unavailable", id, { reason: "healthy" }); return false;
    }
    armor.cancelPlating(id, "stimulant");
    const use = { downed, startedAt: now, completesAt: now + (downed ? REVIVE_DURATION_MS : HEAL_DURATION_MS) };
    active.set(id, use);
    emit("stim-started", id, { ...use, now });
    return true;
  }

  function tick(now) {
    for (const [id, use] of active) {
      if (!entities.get(id)?.alive || injury.isDowned(id) !== use.downed) { cancel(id, "state-changed"); continue; }
      if (now < use.completesAt) continue;
      if (use.downed && !injury.revive(id, now)) { cancel(id, "no-room-to-stand"); continue; }
      if (!use.downed) {
        const hp = ctx.components.get(id, "Health");
        health.heal(id, hp.maximum);
      }
      stock.set(id, Math.max(0, count(id) - 1));
      active.delete(id);
      emit("stim-completed", id, { revived: use.downed, now });
    }
  }

  ctx.events.on("entity:spawned", ({ entityId, spec }) => {
    if (spec?.bot || String(spec?.kind ?? "") !== "human") return;
    stock.set(entityId, STARTING_STIMULANTS);
  });
  ctx.events.on("health:damaged", ({ entityId, weaponId }) => {
    if (weaponId !== "bleed-out") cancel(entityId, "damaged");
  });
  ctx.events.on("vehicle:entered", ({ entityId }) => cancel(entityId, "vehicle-enter"));
  ctx.events.on("vehicle:passenger-entered", ({ entityId }) => cancel(entityId, "vehicle-enter"));
  ctx.events.on("combat:damage:before", packet => {
    if (packet.remaining > 0) cancel(packet.targetId, "damaged");
  }, { priority: 110 });
  ctx.events.on("loot:opened", payload => {
    if (payload.loot === "armor") grant(payload.entityId);
  });
  ctx.events.on("entity:died", ({ entityId }) => cancel(entityId, "death"));
  ctx.events.on("entity:removed", ({ entityId }) => { active.delete(entityId); stock.delete(entityId); });
  return { count, grant, start, tick, cancel, isUsing: id => active.has(id),
    describe(id) { return { stimulants: count(id), stimulantCapacity: STIM_CAPACITY, stimulantUse: active.get(id) ?? null }; } };
}
