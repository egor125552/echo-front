export const manifest = {
  id: "respawn",
  version: "1.2.1",
  requires: ["entities", "health", "movement", "map-test-arena", "teams"],
  optional: ["opening-round", "team-deathmatch"],
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
  const tdm = ctx.services.has("tdm") ? ctx.services.get("tdm") : null;
  const opening = ctx.services.has("opening-round") ? ctx.services.get("opening-round") : null;
  const pending = new Map();

  function chooseSpawn(entityId, now) {
    const team = teams.teamOf(entityId) || 1;
    return opening?.respawnFor(entityId, now) ?? map.nextSpawn(team);
  }

  function respawnEntity(entityId, now = Date.now(), reason = "death") {
    const entity = entities.get(entityId);
    if (!entity) return false;
    pending.delete(entityId);
    const spawn = chooseSpawn(entityId, now);
    ctx.events.emit("respawn:before", { entityId, now, reason });
    health.reset(entityId);
    movement.teleport(entityId, spawn);
    entities.setAlive(entityId, true);
    ctx.events.emit("entity:respawned", { entityId, now, reason });
    return true;
  }

  ctx.events.on("entity:died", ({ entityId }) => {
    pending.set(entityId, Date.now() + 3000);
  });

  ctx.events.on("entity:removed", ({ entityId }) => pending.delete(entityId));

  ctx.events.on("match:started", ({ startedAt, roundNumber }) => {
    if (Number(roundNumber) <= 1) return;
    pending.clear();
    const now = Number(startedAt) || Date.now();
    for (const entity of entities.all()) {
      respawnEntity(entity.id, now, "round-start");
    }
  });

  ctx.services.provide("respawn", {
    tick(now = Date.now()) {
      if (tdm?.status(now).ended) return;
      for (const [entityId, at] of [...pending]) {
        if (now < at || !entities.get(entityId)) continue;
        respawnEntity(entityId, now, "death");
      }
    },
    respawnNow(entityId, now = Date.now(), reason = "manual") {
      return respawnEntity(entityId, now, reason);
    },
  });
}
