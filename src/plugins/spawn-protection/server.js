export const manifest = {
  id: "spawn-protection",
  version: "1.0.0",
  requires: ["entities"],
  capabilities: ["services.consume", "services.provide", "events.on"],
};

export async function setup(ctx) {
  const entities = ctx.services.get("entities");
  const protectedUntil = new Map();
  const defaultDurationMs = Math.max(0, Number(ctx.config.durationMs) || 2200);

  function protect(entityId, durationMs = defaultDurationMs) {
    if (!entityId || durationMs <= 0) return;
    protectedUntil.set(entityId, Date.now() + durationMs);
  }

  function protectHuman(entityId) {
    const entity = entities.get(entityId);
    if (entity && !entity.bot) protect(entityId);
  }

  ctx.events.on("entity:spawned", ({ entityId, spec }) => {
    if (spec?.bot) return;
    const durationMs = Number(spec?.spawnProtectionMs) || defaultDurationMs;
    protect(entityId, durationMs);
  });

  ctx.events.on("respawn:before", ({ entityId }) => {
    protectHuman(entityId);
  });

  ctx.events.on("entity:removed", ({ entityId }) => {
    protectedUntil.delete(entityId);
  });

  ctx.events.on("combat:damage:before", (packet) => {
    const until = protectedUntil.get(packet.targetId) ?? 0;
    if (until <= Date.now()) {
      if (until) protectedUntil.delete(packet.targetId);
      return;
    }
    packet.remaining = 0;
    packet.spawnProtected = true;
  }, { priority: 200 });

  ctx.services.provide("spawn-protection", {
    isProtected(entityId, now = Date.now()) {
      const until = protectedUntil.get(entityId) ?? 0;
      return until > now;
    },
    clear(entityId) {
      protectedUntil.delete(entityId);
    },
  });
}
