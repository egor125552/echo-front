export const manifest = {
  id: "bot-perception",
  version: "1.0.0",
  requires: ["bot-controller", "teams", "rapier-physics", "movement"],
  capabilities: [
    "services.consume", "services.provide",
    "components.read",
  ],
};

export async function setup(ctx) {
  const teams = ctx.services.get("teams");
  const physics = ctx.services.get("physics");

  ctx.services.provide("bot-perception", {
    nearestVisibleEnemy(botId, maxDistance = 22) {
      const transform = ctx.components.get(botId, "Transform");
      if (!transform) return null;
      let best = null;
      for (const enemy of teams.enemiesOf(botId)) {
        const target = ctx.components.get(enemy.id, "Transform");
        if (!target) continue;
        const distance = Math.hypot(target.x - transform.x, target.z - transform.z);
        if (distance > maxDistance || (best && distance >= best.distance)) continue;
        if (!physics.lineOfSight(transform, target, botId, enemy.id)) continue;
        best = { entityId: enemy.id, transform: target, distance };
      }
      return best;
    },
  });
}
