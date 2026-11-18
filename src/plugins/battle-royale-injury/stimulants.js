export const STIM_CAPACITY = 2;
export const FAST_STIM_CAPACITY = 3;
export const TURBO_STIM_CAPACITY = 3;
export const TURBO_PURCHASE_LIMIT = 3;
export const TURBO_HEALTH_TARGET = 600;
export const STARTING_STIMULANTS = 1;
export const HEAL_DURATION_MS = 2000;
export const REVIVE_DURATION_MS = 6000;
export const FAST_STIM_DURATION_MS = 1000;
export const TURBO_STIM_DURATION_MS = 1000;

export function createStimulants(ctx) {
  const injury = ctx.services.get("injury");
  const entities = ctx.services.get("entities");
  const health = ctx.services.get("health");
  const armor = ctx.services.get("armor");
  const ragdoll = ctx.services.get("ragdoll");
  const vehicles = ctx.services.get("vehicles");
  const parachute = ctx.services.get("parachute");

  const stock = new Map();
  const fastStock = new Map();
  const turboStock = new Map();
  const turboPurchased = new Map();
  const active = new Map();

  const count = (id) => stock.get(id) ?? 0;
  const fastCount = (id) => fastStock.get(id) ?? 0;
  const turboCount = (id) => turboStock.get(id) ?? 0;
  const turboPurchasedCount = (id) => turboPurchased.get(id) ?? 0;
  const totalCount = (id) => count(id) + fastCount(id) + turboCount(id);

  const emit = (name, id, extra = {}) => injury.emit(name, id, {
    stimulants: count(id),
    fastStimulants: fastCount(id),
    turboStimulants: turboCount(id),
    turboPurchasedCount: turboPurchasedCount(id),
    turboPurchaseLimit: TURBO_PURCHASE_LIMIT,
    ...extra,
  });

  function cancel(id, reason = "action") {
    const use = active.get(id);
    if (!use) return false;
    active.delete(id);
    emit("stim-cancelled", id, { reason, stimKind: use.kind });
    return true;
  }

  function isCharacterEntity(entity, spec = null) {
    const kind = String(spec?.kind ?? entity?.kind ?? "");
    return Boolean(entity?.bot || spec?.bot || kind === "human" || kind === "bot");
  }

  function grant(id, quantity = 1) {
    const entity = entities.get(id);
    if (!entity?.alive || !isCharacterEntity(entity)) return 0;
    const added = Math.min(STIM_CAPACITY - count(id), Math.max(0, Math.floor(quantity)));
    stock.set(id, count(id) + added);
    emit("stim-picked", id, { quantity: added, stimKind: "standard" });
    return added;
  }

  function setCount(id, nextCount = 1) {
    stock.set(id, Math.max(0, Math.floor(Number(nextCount) || 0)));
    fastStock.set(id, 0);
  }

  function grantFast(id, quantity = 1) {
    const entity = entities.get(id);
    if (!entity?.alive || !isCharacterEntity(entity)) return 0;
    const added = Math.min(FAST_STIM_CAPACITY - fastCount(id), Math.max(0, Math.floor(quantity)));
    if (added > 0) fastStock.set(id, fastCount(id) + added);
    return added;
  }

  function grantTurbo(id, quantity = 1) {
    const entity = entities.get(id);
    if (!entity?.alive || !isCharacterEntity(entity)) return 0;
    const purchased = turboPurchasedCount(id);
    const remainingLimit = Math.max(0, TURBO_PURCHASE_LIMIT - purchased);
    const remainingCarry = Math.max(0, TURBO_STIM_CAPACITY - turboCount(id));
    const added = Math.min(remainingLimit, remainingCarry, Math.max(0, Math.floor(quantity)));
    if (added > 0) {
      turboStock.set(id, turboCount(id) + added);
      turboPurchased.set(id, purchased + added);
    }
    return added;
  }

  function grantJuggernautStims(id) {
    const entity = entities.get(id);
    if (!entity?.alive || !isCharacterEntity(entity)) return false;
    stock.set(id, Math.max(count(id), 6));
    fastStock.set(id, Math.max(fastCount(id), 5));
    turboStock.set(id, Math.max(turboCount(id), 4));
    emit("stim-picked", id, { quantity: 6, stimKind: "juggernaut" });
    return true;
  }

  function resolveKind(id, requestedKind = "auto", downed = false) {
    if (requestedKind === "turbo") return "turbo";
    if (requestedKind === "fast") return "fast";
    if (requestedKind === "standard") return "standard";
    if (downed) {
      if (fastCount(id) > 0) return "fast";
      if (count(id) > 0) return "standard";
      if (turboCount(id) > 0) return "turbo";
      return "standard";
    }
    if (count(id) > 0) return "standard";
    if (fastCount(id) > 0) return "fast";
    return "standard";
  }

  function start(id, now = Date.now(), requestedKind = "auto") {
    const hp = ctx.components.get(id, "Health");
    if (!entities.get(id)?.alive || !hp || active.has(id)) return false;
    const downed = injury.isDowned(id);
    const kind = resolveKind(id, requestedKind, downed);

    const available = kind === "turbo"
      ? turboCount(id)
      : (kind === "fast" ? fastCount(id) : count(id));

    if (!available) {
      emit("stim-unavailable", id, { reason: "empty", stimKind: kind });
      return false;
    }
    if (ragdoll.isActive(id) || vehicles.isDriving(id) || vehicles.isPassenger?.(id) || parachute.stateFor(id)?.airborne) {
      emit("stim-unavailable", id, { reason: "busy", stimKind: kind });
      return false;
    }
    if (!downed) {
      const targetMax = kind === "turbo" ? Math.max(hp.maximum, TURBO_HEALTH_TARGET) : hp.maximum;
      if (hp.current >= targetMax) {
        emit("stim-unavailable", id, { reason: "healthy", stimKind: kind });
        return false;
      }
    }

    armor.cancelPlating(id, "stimulant");
    if (downed) {
      const input = ctx.components.get(id, "Input");
      if (input) {
        input.forward = 0;
        input.strafe = 0;
        input.turn = 0;
      }
    }
    const durationMs = kind === "turbo"
      ? TURBO_STIM_DURATION_MS
      : (kind === "fast"
        ? FAST_STIM_DURATION_MS
        : (downed ? REVIVE_DURATION_MS : HEAL_DURATION_MS));
    const use = {
      kind,
      downed,
      startedAt: now,
      completesAt: now + durationMs,
      durationMs,
    };
    active.set(id, use);
    emit("stim-started", id, { ...use, stimKind: kind, now });
    const t = ctx.components.get(id, "Transform");
    if (t) {
      ctx.events.emit("sound:spatial", {
        entityId: id,
        key: downed ? "injury.revive.start" : "injury.stim.start",
        x: Number(t.x) || 0,
        y: Number(t.y) || 0,
        z: Number(t.z) || 0,
        radius: 34,
      });
    }
    return true;
  }

  function tick(now) {
    for (const [id, use] of active) {
      if (!entities.get(id)?.alive || injury.isDowned(id) !== use.downed) {
        cancel(id, "state-changed");
        continue;
      }
      if (now < use.completesAt) continue;

      if (use.downed) {
        const revived = use.kind === "turbo"
          ? injury.revive(id, now, null, { targetHealth: TURBO_HEALTH_TARGET })
          : injury.revive(id, now);
        if (!revived) {
          cancel(id, "no-room-to-stand");
          continue;
        }
      } else {
        const hp = ctx.components.get(id, "Health");
        if (use.kind === "turbo") {
          hp.maximum = Math.max(hp.maximum, TURBO_HEALTH_TARGET);
          hp.current = TURBO_HEALTH_TARGET;
          ctx.events.emit("health:changed", {
            entityId: id,
            health: hp.current,
            maximum: hp.maximum,
            turbo: true,
          });
        } else {
          health.heal(id, hp.maximum);
        }
      }

      if (use.kind === "turbo") {
        turboStock.set(id, Math.max(0, turboCount(id) - 1));
      } else if (use.kind === "fast") {
        fastStock.set(id, Math.max(0, fastCount(id) - 1));
      } else {
        stock.set(id, Math.max(0, count(id) - 1));
      }
      active.delete(id);
      emit("stim-completed", id, {
        revived: use.downed,
        stimKind: use.kind,
        health: ctx.components.get(id, "Health")?.current ?? null,
        maximum: ctx.components.get(id, "Health")?.maximum ?? null,
        now,
      });
    }
  }

  for (const entity of entities.all()) {
    if (!entity?.alive || !isCharacterEntity(entity)) continue;
    stock.set(entity.id, entity.bot && !entity.humanSquad ? 2 : STARTING_STIMULANTS);
    fastStock.set(entity.id, 0);
  }

  ctx.events.on("entity:spawned", ({ entityId, spec }) => {
    const entity = entities.get(entityId);
    if (!isCharacterEntity(entity, spec)) return;
    const isEnemyBot = Boolean((entity?.bot || spec?.bot || spec?.kind === "bot") && !entity?.humanSquad);
    stock.set(entityId, isEnemyBot ? 2 : STARTING_STIMULANTS);
    fastStock.set(entityId, 0);
    turboStock.set(entityId, 0);
    turboPurchased.set(entityId, 0);
  });
  ctx.events.on("entity:respawned", ({ entityId }) => {
    cancel(entityId, "respawn");
    if (count(entityId) < STARTING_STIMULANTS) stock.set(entityId, STARTING_STIMULANTS);
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
  ctx.events.on("entity:removed", ({ entityId }) => {
    active.delete(entityId);
    stock.delete(entityId);
    fastStock.delete(entityId);
    turboStock.delete(entityId);
    turboPurchased.delete(entityId);
  });

  return {
    count,
    fastCount,
    turboCount,
    turboPurchasedCount,
    totalCount,
    grant,
    setCount,
    grantFast,
    grantTurbo,
    grantJuggernautStims,
    start,
    tick,
    cancel,
    isUsing: id => active.has(id),
    describe(id) {
      return {
        stimulants: count(id),
        stimulantCapacity: Math.max(STIM_CAPACITY, count(id)),
        fastStimulants: fastCount(id),
        fastStimulantCapacity: Math.max(FAST_STIM_CAPACITY, fastCount(id)),
        turboStimulants: turboCount(id),
        turboStimulantCapacity: Math.max(TURBO_STIM_CAPACITY, turboCount(id)),
        turboPurchasedCount: turboPurchasedCount(id),
        turboPurchaseLimit: TURBO_PURCHASE_LIMIT,
        stimulantUse: active.get(id) ?? null,
      };
    },
  };
}
