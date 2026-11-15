export const manifest = {
  id: "bot-perception",
  version: "2.2.0",
  requires: ["bot-controller", "teams", "rapier-physics", "movement", "spatial-grid"],
  capabilities: ["services.consume", "services.provide", "components.read"],
};

export const BOT_VISIBLE_VERTICAL_REACH = 5.2;

export function squadPartnerId(botId) {
  const match = /^br-bot-(\d+)$/.exec(String(botId ?? ""));
  if (!match) return null;
  const index = Number(match[1]);
  if (!Number.isFinite(index) || index < 1) return null;
  const partnerIndex = index % 2 === 1 ? index + 1 : index - 1;
  return `br-bot-${partnerIndex}`;
}

export function squadRoleFor(botId) {
  const match = /^br-bot-(\d+)$/.exec(String(botId ?? ""));
  if (!match) return "solo";
  return Number(match[1]) % 2 === 1 ? "breacher" : "flanker";
}

export async function setup(ctx) {
  const teams = ctx.services.get("teams");
  const physics = ctx.services.get("physics");
  const grid = ctx.services.get("spatial-grid");
  const entities = ctx.services.has?.("entities") ? ctx.services.get("entities") : null;

  function areSquadmates(botId, otherId) {
    if (!botId || !otherId || botId === otherId) return false;
    const selfEntity = entities?.get?.(botId) ?? null;
    const otherEntity = entities?.get?.(otherId) ?? null;
    const sameExplicitSquad = Boolean(selfEntity?.squadId && selfEntity.squadId === otherEntity?.squadId);
    const sameTeam = teams.teamOf(botId) > 0 && teams.teamOf(botId) === teams.teamOf(otherId);
    if (!sameExplicitSquad && !sameTeam) return false;
    if (!entities?.all) return sameTeam || sameExplicitSquad;
    let livingOutsideSquad = 0;
    for (const entry of entities.all()) {
      if (!entry?.alive) continue;
      if (entry.id !== botId && entry.id !== otherId) {
        livingOutsideSquad += 1;
      }
    }
    return livingOutsideSquad >= 1;
  }

  function nearestEnemy(botId, maxDistance = Infinity, { humanPriority = 1, now = Date.now() } = {}) {
    const transform = ctx.components.get(botId, "Transform");
    if (!transform) return null;
    const searchDistance = Number.isFinite(maxDistance) ? maxDistance : 160;
    const ownTeam = teams.teamOf(botId);
    let best = null;
    for (const entry of grid.query(transform, searchDistance, now)) {
      const enemy = entry.entity;
      if (enemy.id === botId || !enemy.alive) continue;
      if (teams.teamOf(enemy.id) === ownTeam || areSquadmates(botId, enemy.id)) continue;
      const vertical = Math.abs((entry.transform.y ?? 0) - (transform.y ?? 0));
      if (vertical > BOT_VISIBLE_VERTICAL_REACH) continue;
      const distance = Math.hypot(entry.transform.x - transform.x, entry.transform.z - transform.z);
      if (distance > maxDistance) continue;
      const priority = enemy.bot ? 1 : Math.max(0.55, Math.min(1, Number(humanPriority) || 1));
      const score = distance * priority;
      if (best && score >= best.score) continue;
      best = { entityId: enemy.id, entity: enemy, transform: entry.transform, distance, score };
    }
    return best;
  }

  function visibleEnemies(botId, maxDistance = 28, options = {}) {
    const transform = ctx.components.get(botId, "Transform");
    if (!transform) return [];
    const candidates = [];
    const ownTeam = teams.teamOf(botId);
    const now = options.now ?? Date.now();
    const limit = Math.max(1, Math.min(12, Number(options.limit) || 8));

    for (const entry of grid.query(transform, maxDistance, now)) {
      const enemy = entry.entity;
      if (enemy.id === botId || !enemy.alive || teams.teamOf(enemy.id) === ownTeam) continue;
      if (areSquadmates(botId, enemy.id)) continue;
      const vertical = Math.abs((entry.transform.y ?? 0) - (transform.y ?? 0));
      if (vertical > BOT_VISIBLE_VERTICAL_REACH) continue;
      const distance = Math.hypot(entry.transform.x - transform.x, entry.transform.z - transform.z);
      if (distance > maxDistance) continue;
      candidates.push({ entry, distance });
    }

    candidates.sort((a, b) => a.distance - b.distance);
    const result = [];
    for (const candidate of candidates.slice(0, limit + 4)) {
      // Elevation is deliberately resolved by the real Rapier line of sight.
      // A concrete floor or wall still blocks vision, but an exposed enemy on
      // the warehouse stairs is no longer discarded just because Y differs.
      if (!physics.lineOfSight(transform, candidate.entry.transform, botId, candidate.entry.entity.id)) continue;
      result.push({
        entityId: candidate.entry.entity.id,
        entity: candidate.entry.entity,
        transform: candidate.entry.transform,
        distance: candidate.distance,
        score: candidate.distance,
      });
      if (result.length >= limit) break;
    }
    return result;
  }

  function nearestVisibleEnemy(botId, maxDistance = 28, options = {}) {
    return visibleEnemies(botId, maxDistance, { ...options, limit: 1 })[0] ?? null;
  }

  ctx.services.provide("bot-perception", {
    nearestEnemy,
    nearestVisibleEnemy,
    visibleEnemies,
    squadPartnerId,
    squadRoleFor,
    areSquadmates,
  });
}
