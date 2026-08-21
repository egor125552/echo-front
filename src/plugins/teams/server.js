export const manifest = {
  id: "teams",
  version: "1.0.0",
  requires: ["entities"],
  capabilities: [
    "services.consume", "services.provide",
    "components.register", "components.read", "components.write",
    "events.on",
  ],
};

export async function setup(ctx) {
  const entities = ctx.services.get("entities");
  ctx.components.register("Team");

  ctx.events.on("entity:spawned", ({ entityId, spec }) => {
    if (spec.team) ctx.components.add(entityId, "Team", { id: spec.team });
  });

  ctx.events.on("entity:removed", ({ entityId }) => {
    ctx.components.remove(entityId, "Team");
  });

  ctx.services.provide("teams", {
    teamOf(entityId) {
      return ctx.components.get(entityId, "Team")?.id ?? 0;
    },
    enemiesOf(entityId) {
      const team = ctx.components.get(entityId, "Team")?.id;
      return entities.all().filter((entity) => {
        if (!entity.alive || entity.id === entityId) return false;
        const otherTeam = ctx.components.get(entity.id, "Team")?.id;
        return team && otherTeam && otherTeam !== team;
      });
    },
    pickBalancedTeam({ humansOnly = false } = {}) {
      const counts = { 1: 0, 2: 0 };
      for (const entity of entities.all()) {
        if (humansOnly && entity.bot) continue;
        const team = ctx.components.get(entity.id, "Team")?.id;
        if (team === 1 || team === 2) counts[team] += 1;
      }
      return counts[1] <= counts[2] ? 1 : 2;
    },
  });
}
