export const REGEN_DELAY_MS = 5000;
export const REGEN_RATE_PER_SECOND = 25;

export const manifest = {
  id: "health-regeneration",
  version: "1.0.0",
  requires: ["entities", "health"],
  capabilities: [
    "services.consume", "services.provide",
    "events.on",
  ],
};

export async function setup(ctx) {
  const entities = ctx.services.get("entities");
  const health = ctx.services.get("health");
  const lastHealthDamageAt = new Map();

  ctx.events.on("combat:damage", (payload = {}) => {
    if (Number(payload.healthApplied) <= 0) return;
    lastHealthDamageAt.set(payload.targetId, Number(payload.now) || Date.now());
  });

  ctx.events.on("entity:respawned", ({ entityId }) => {
    lastHealthDamageAt.delete(entityId);
  });

  ctx.events.on("entity:removed", ({ entityId }) => {
    lastHealthDamageAt.delete(entityId);
  });

  function tick(dt, now = Date.now()) {
    if (!(dt > 0)) return;

    for (const entity of entities.all()) {
      // Keep bot balance unchanged. This mechanic is the human player's
      // automatic recovery layer and can be removed independently.
      if (entity.bot || !entity.alive) continue;

      const damagedAt = lastHealthDamageAt.get(entity.id);
      if (!Number.isFinite(damagedAt) || now - damagedAt < REGEN_DELAY_MS) continue;

      health.heal(entity.id, REGEN_RATE_PER_SECOND * dt);
    }
  }

  ctx.services.provide("health-regeneration", {
    delayMs: REGEN_DELAY_MS,
    ratePerSecond: REGEN_RATE_PER_SECOND,
    tick,
  });
}
