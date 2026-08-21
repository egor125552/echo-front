export const manifest = {
  id: "health",
  version: "1.0.0",
  requires: ["entities"],
  capabilities: [
    "services.consume", "services.provide",
    "components.register", "components.read", "components.write",
    "events.on", "events.emit",
  ],
};

export async function setup(ctx) {
  const entities = ctx.services.get("entities");
  ctx.components.register("Health");

  ctx.events.on("entity:spawned", ({ entityId, spec }) => {
    if (spec.health === false) return;
    const maximum = Number(spec.health) || 100;
    ctx.components.add(entityId, "Health", { current: maximum, maximum });
  });

  ctx.events.on("entity:removed", ({ entityId }) => {
    ctx.components.remove(entityId, "Health");
  });

  ctx.services.provide("health", {
    applyDamage(targetId, amount, source = {}) {
      const health = ctx.components.get(targetId, "Health");
      const target = entities.get(targetId);
      if (!health || !target?.alive || amount <= 0) return { applied: 0, killed: false };
      const before = health.current;
      health.current = Math.max(0, health.current - amount);
      const applied = before - health.current;
      ctx.events.emit("health:changed", { entityId: targetId, health: health.current, maximum: health.maximum });
      if (health.current <= 0) {
        entities.setAlive(targetId, false);
        ctx.events.emit("entity:died", {
          entityId: targetId,
          killerId: source.attackerId ?? null,
          weaponId: source.weaponId ?? null,
        });
        return { applied, killed: true };
      }
      return { applied, killed: false };
    },
    reset(entityId) {
      const health = ctx.components.get(entityId, "Health");
      if (!health) return;
      health.current = health.maximum;
      ctx.events.emit("health:changed", { entityId, health: health.current, maximum: health.maximum });
    },
  });
}
