export const manifest = {
  id: "target-assist",
  version: "1.1.0",
  requires: ["entities", "teams", "rapier-physics", "movement"],
  capabilities: ["services.consume", "services.provide", "components.read"],
};

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

  function selectTarget(entityId, direction, maxDistance) {
    const shooter = entities.get(entityId);
    if (!shooter || shooter.bot) return null;

    const origin = ctx.components.get(entityId, "Transform");
    if (!origin) return null;

    const facing = normalize3(direction);
    let best = null;

    for (const enemy of teams.enemiesOf(entityId)) {
      if (!enemy?.alive) continue;
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

      // Distance is the main factor. Facing only biases selection so an enemy
      // already in front wins over a similarly distant enemy behind the player.
      // Vertical correction is automatic because Echo Front has no manual pitch
      // control and multi-floor combat must remain accessible.
      const score = distance + (1 - frontness) * 3.5;
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
