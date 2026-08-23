export const manifest = {
  id: "bot-perception",
  version: "1.1.0",
  requires: ["bot-controller", "teams", "rapier-physics", "movement"],
  capabilities: [
    "services.consume", "services.provide",
    "components.read",
  ],
};

export async function setup(ctx) {
  const teams = ctx.services.get("teams");
  const physics = ctx.services.get("physics");

  function rankEnemy(enemy, distance, humanPriority = 1) {
    const priority = enemy.bot ? 1 : Math.max(0.5, Math.min(1, Number(humanPriority) || 1));
    return distance * priority;
  }

  function nearestEnemy(botId, maxDistance = Infinity, { humanPriority = 1 } = {}) {
    const transform = ctx.components.get(botId, "Transform");
    if (!transform) return null;
    let best = null;
    for (const enemy of teams.enemiesOf(botId)) {
      const target = ctx.components.get(enemy.id, "Transform");
      if (!target) continue;
      const distance = Math.hypot(target.x - transform.x, target.z - transform.z);
      if (distance > maxDistance) continue;
      const score = rankEnemy(enemy, distance, humanPriority);
      if (best && score >= best.score) continue;
      best = { entityId: enemy.id, entity: enemy, transform: target, distance, score };
    }
    return best;
  }

  function nearestVisibleEnemy(botId, maxDistance = 22, { humanPriority = 1 } = {}) {
    const transform = ctx.components.get(botId, "Transform");
    if (!transform) return null;
    let best = null;
    for (const enemy of teams.enemiesOf(botId)) {
      const target = ctx.components.get(enemy.id, "Transform");
      if (!target) continue;
      const distance = Math.hypot(target.x - transform.x, target.z - transform.z);
      if (distance > maxDistance) continue;
      if (!physics.lineOfSight(transform, target, botId, enemy.id)) continue;
      const score = rankEnemy(enemy, distance, humanPriority);
      if (best && score >= best.score) continue;
      best = { entityId: enemy.id, entity: enemy, transform: target, distance, score };
    }
    return best;
  }

  ctx.services.provide("bot-perception", {
    nearestEnemy,
    nearestVisibleEnemy,
  });
}
