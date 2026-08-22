export const manifest = {
  id: "respawn",
  version: "1.1.0",
  requires: ["entities", "health", "movement", "map-test-arena", "teams"],
  optional: ["opening-round"],
  capabilities: [
    "services.consume", "services.provide",
    "events.on", "events.emit",
  ],
};

export async function setup(ctx) {
  const entities = ctx.services.get("entities");
  const health = ctx.services.get("health");
  const movement = ctx.services.get("movement");
  const map = ctx.services.get("map");
  const teams = ctx.services.get("teams");
  const opening = ctx.services.has("opening-round") ? ctx.services.get("opening-round") : null;
  const pending = new Map();

  ctx.events.on("entity:died", ({ entityId }) => {
    pending.set(entityId, Date.now() + 3000);
  });

  ctx.events.on("entity:removed", ({ entityId }) => pending.delete(entityId));

  ctx.services.provide("respawn", {
    tick(now = Date.now()) {
      for (const [entityId, at] of [...pending]) {
        if (now < at || !entities.get(entityId)) continue;
        pending.delete(entityId);
        const team = teams.teamOf(entityId) || 1;
        const spawn = opening?.respawnFor(entityId, now) ?? map.nextSpawn(team);
        ctx.events.emit("respawn:before", { entityId });
        health.reset(entityId);
        movement.teleport(entityId, spawn);
        entities.setAlive(entityId, true);
        ctx.events.emit("entity:respawned", { entityId });
      }
    },
  });
}
