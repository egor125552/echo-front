export const manifest = {
  id: "target-assist",
  version: "1.4.0",
  requires: ["entities", "teams", "rapier-physics", "movement"],
  optional: ["social"],
  capabilities: ["services.consume", "services.provide", "components.read"],
};

const BOT_ASSIST_MIN_FRONTNESS = Math.cos(0.28);

function normalize3(direction) {
  const length = Math.hypot(direction.x, direction.y ?? 0, direction.z) || 1;
  return {
    x: direction.x / length,
    y: (direction.y ?? 0) / length,
    z: direction.z / length,
  };
}

export async function setup(ctx) {
  const entities = ctx.services.get("entities");
  const teams = ctx.services.get("teams");
  const physics = ctx.services.get("physics");
  const social = ctx.services.has("social") ? ctx.services.get("social") : null;

  function selectTarget(entityId, direction, maxDistance) {
    const shooter = entities.get(entityId);
    if (!shooter) return null;

    const origin = ctx.components.get(entityId, "Transform");
    if (!origin) return null;

    const facing = normalize3(direction);
    const bot = Boolean(shooter.bot);
    let best = null;

    for (const enemy of teams.enemiesOf(entityId)) {
      if (!enemy?.alive) continue;
      if (!bot && social?.protectsFriendlyFire?.(entityId, enemy.id)) continue;
      const target = ctx.components.get(enemy.id, "Transform");
      if (!target) continue;

      const dx = target.x - origin.x;
      const dy = (target.y ?? 0) - (origin.y ?? 0);
      const dz = target.z - origin.z;
      const distance = Math.hypot(dx, dy, dz);
      if (distance <= 0.001 || distance > maxDistance) continue;
      if (!physics.lineOfSight(origin, target, entityId, enemy.id)) continue;

      const tx = dx / distance;
      const ty = dy / distance;
      const tz = dz / distance;
      const frontness = Math.max(-1, Math.min(1, facing.x * tx + facing.y * ty + facing.z * tz));

      if (bot && frontness < BOT_ASSIST_MIN_FRONTNESS) continue;

      const score = bot
        ? distance + (1 - frontness) * 12
        : distance + (1 - frontness) * 3.5;
      if (best && score >= best.score) continue;

      best = {
        targetId: enemy.id,
        distance,
        frontness,
        score,
        direction: { x: tx, y: ty, z: tz },
      };
    }

    return best;
  }

  function resolveShot(entityId, direction, maxDistance) {
    const selected = selectTarget(entityId, direction, maxDistance);
    if (!selected) return { direction, targetId: null };
    return { direction: selected.direction, targetId: selected.targetId };
  }

  ctx.services.provide("targeting", {
    mode: "assisted-target-selection",
    selection: "visible-nearby-with-front-priority",
    selectTarget,
    resolveShot,
    adjustDirection(entityId, direction, maxDistance) {
      return resolveShot(entityId, direction, maxDistance).direction;
    },
  });
}
