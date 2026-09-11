export const DOWNED_HEALTH = 100;
export const BLEED_OUT_MS = 60_000;
export const CRAWL_SPEED = 0.85;

export const manifest = {
  id: "battle-royale-injury",
  requires: ["health", "armor", "movement", "rapier-physics", "entities", "match-api", "battle-royale-ragdoll"],
  capabilities: ["services.consume", "services.provide", "components.read", "events.on", "events.emit"],
};

export async function setup(ctx) {
  const health = ctx.services.get("health");
  const armor = ctx.services.get("armor");
  const movement = ctx.services.get("movement");
  const entities = ctx.services.get("entities");
  const match = ctx.services.get("match-api");
  const physics = ctx.services.get("physics");
  const states = new Map();
  const isDowned = id => Boolean(states.get(id)?.downed);
  const stateFor = id => states.get(id) ?? null;
  const emit = (name, entityId, extra = {}) => ctx.events.emit(`injury:${name}`, { entityId, ...extra });

  ctx.events.on("health:depleted", packet => {
    const entity = entities.get(packet.entityId);
    if (!entity?.alive || entity.bot || entity.kind !== "human" || isDowned(entity.id)) return;
    const hp = ctx.components.get(entity.id, "Health");
    const transform = ctx.components.get(entity.id, "Transform");
    const state = {
      downed: true, normalMaximum: hp.maximum, lastBleedAt: packet.now,
      attackerId: packet.source.attackerId ?? null, weaponId: packet.source.weaponId ?? null,
    };
    states.set(entity.id, state);
    hp.maximum = DOWNED_HEALTH;
    hp.current = DOWNED_HEALTH;
    packet.downed = true;
    transform.downed = true;
    transform.movementSpeed = CRAWL_SPEED;
    physics.setCharacterDowned(entity.id, true);
    armor.cancelPlating(entity.id, "downed");
    const plates = ctx.components.get(entity.id, "Armor");
    if (plates) plates.current = 0;
    movement.setInput(entity.id, {});
    emit("downed", entity.id, {
      health: DOWNED_HEALTH,
      maximum: DOWNED_HEALTH,
      attackerId: packet.source.attackerId ?? null,
      weaponId: packet.source.weaponId ?? null,
      now: packet.now,
    });
  });

  const originalHeal = health.heal.bind(health);
  health.heal = (id, amount) => isDowned(id) ? 0 : originalHeal(id, amount);

  function tick(now) {
    for (const [id, state] of states) {
      if (!state.downed || !entities.get(id)?.alive) continue;
      const elapsed = Math.max(0, now - state.lastBleedAt);
      state.lastBleedAt = Math.max(state.lastBleedAt, now);
      health.applyDamage(id, DOWNED_HEALTH * elapsed / BLEED_OUT_MS, {
        attackerId: state.attackerId, weaponId: "bleed-out", now,
      });
    }
  }

  function describe(id) {
    const state = stateFor(id);
    const hp = ctx.components.get(id, "Health");
    return {
      downed: Boolean(state?.downed && entities.get(id)?.alive),
      bleedOutSeconds: state?.downed ? Math.ceil((hp?.current ?? 0) / DOWNED_HEALTH * BLEED_OUT_MS / 1000) : 0,
      normalHealthMax: state?.downed ? state.normalMaximum : null,
    };
  }

  function revive(id, now) {
    const state = stateFor(id);
    if (!state?.downed || !entities.get(id)?.alive) return false;
    if (!physics.setCharacterDowned(id, false)) return false;
    const hp = ctx.components.get(id, "Health");
    hp.maximum = state.normalMaximum;
    hp.current = Math.min(hp.maximum, 100);
    state.downed = false;
    const transform = ctx.components.get(id, "Transform");
    transform.downed = false;
    delete transform.movementSpeed;
    const feet = physics.position(id);
    Object.assign(transform, feet, { verticalVelocity: 0, grounded: false });
    ctx.events.emit("health:changed", { entityId: id, health: hp.current, maximum: hp.maximum });
    emit("revived", id, { health: hp.current, now });
    return true;
  }

  for (const method of ["snapshot", "snapshotFor"]) {
    const original = match[method].bind(match);
    match[method] = (...args) => {
      const snapshot = original(...args);
      return { ...snapshot, entities: snapshot.entities.map(entity => ({ ...entity, ...describe(entity.id) })) };
    };
  }
  ctx.events.on("entity:removed", ({ entityId }) => states.delete(entityId));
  ctx.services.provide("injury", { isDowned, stateFor, describe, tick, revive, emit });
}
