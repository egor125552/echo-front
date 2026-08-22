export const manifest = {
  id: "aim-assist",
  version: "1.2.0",
  requires: ["entities", "teams", "rapier-physics", "movement", "training-round"],
  capabilities: ["services.consume", "services.provide", "components.read"],
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export async function setup(ctx) {
  const entities = ctx.services.get("entities");
  const teams = ctx.services.get("teams");
  const physics = ctx.services.get("physics");
  const training = ctx.services.get("training-round");
  const defaultMaxAngle = Math.max(0.02, Number(ctx.config.maxAngle) || 0.11);

  function allowedAngle(distance, now = Date.now()) {
    const trainingProfile = training.profile(now);
    const base = trainingProfile.active
      ? Math.max(defaultMaxAngle, trainingProfile.humanAimBaseRadians)
      : defaultMaxAngle;
    const distanceBonus = trainingProfile.active
      ? distance < 7 ? 0.08 : distance < 14 ? 0.05 : 0.025
      : distance < 7 ? 0.05 : distance < 14 ? 0.025 : 0.01;
    return base + distanceBonus;
  }

  function adjustDirection(entityId, direction, maxDistance) {
    const shooter = entities.get(entityId);
    if (!shooter || shooter.bot) return direction;

    const origin = ctx.components.get(entityId, "Transform");
    if (!origin) return direction;

    const baseLength = Math.hypot(direction.x, direction.z) || 1;
    const base = { x: direction.x / baseLength, z: direction.z / baseLength };
    let best = null;

    for (const enemy of teams.enemiesOf(entityId)) {
      const target = ctx.components.get(enemy.id, "Transform");
      if (!target) continue;

      const dx = target.x - origin.x;
      const dz = target.z - origin.z;
      const distance = Math.hypot(dx, dz);
      if (distance <= 0.001 || distance > maxDistance) continue;
      if (!physics.lineOfSight(origin, target, entityId, enemy.id)) continue;

      const tx = dx / distance;
      const tz = dz / distance;
      const dot = clamp(base.x * tx + base.z * tz, -1, 1);
      const angle = Math.acos(dot);
      const allowed = allowedAngle(distance);
      if (angle > allowed || (best && angle >= best.angle)) continue;

      best = { angle, x: tx, z: tz, targetId: enemy.id };
    }

    if (!best) return direction;
    return { x: best.x, y: direction.y ?? 0, z: best.z };
  }

  ctx.services.provide("targeting", {
    adjustDirection,
    allowedAngle,
    mode: "mini-aim",
    baseConeRadians: defaultMaxAngle,
  });
}
