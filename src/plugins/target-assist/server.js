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

  function targetVelocity(enemyId, targetTransform) {
    if (ctx.services.has("vehicles")) {
      const vehicles = ctx.services.get("vehicles");
      const v = vehicles.vehicleForDriver?.(enemyId) ?? vehicles.vehicleForPassenger?.(enemyId) ?? null;
      if (v) {
        const speed = Number(v.speed) || 0;
        const heading = Number(v.heading ?? v.angle ?? 0);
        return { vx: Math.sin(heading) * speed, vz: -Math.cos(heading) * speed };
      }
    }
    const input = ctx.components.get(enemyId, "Input");
    if (!input) return { vx: 0, vz: 0 };
    const forward = Number(input.forward) || 0;
    const strafe = Number(input.strafe) || 0;
    const mag = Math.hypot(forward, strafe);
    if (mag < 0.05) return { vx: 0, vz: 0 };
    const scale = mag > 1 ? 1 / mag : 1;
    const speed = Number.isFinite(targetTransform.movementSpeed)
      ? Math.max(0, targetTransform.movementSpeed)
      : (input.sprint ? 5.4 : 3.25);
    const angle = Number(targetTransform.angle) || 0;
    return {
      vx: (Math.sin(angle) * forward * scale + Math.cos(angle) * strafe * scale) * speed,
      vz: (-Math.cos(angle) * forward * scale + Math.sin(angle) * strafe * scale) * speed,
    };
  }

  function selectTarget(entityId, direction, maxDistance, options = {}) {
    const shooter = entities.get(entityId);
    if (!shooter) return null;

    const origin = ctx.components.get(entityId, "Transform");
    if (!origin) return null;

    const facing = normalize3(direction);
    const bot = Boolean(shooter.bot);
    const muzzleVelocity = Number(options?.muzzleVelocity) || 0;
    let best = null;

    for (const enemy of teams.enemiesOf(entityId)) {
      if (!enemy?.alive) continue;
      if (!bot && social?.protectsFriendlyFire?.(entityId, enemy.id)) continue;
      const target = ctx.components.get(enemy.id, "Transform");
      if (!target) continue;

      const rawDx = target.x - origin.x;
      const rawDy = (target.y ?? 0) + (physics.characterAimHeight?.(enemy.id) ?? 1)
        - (origin.y ?? 0) - (physics.characterAimHeight?.(entityId) ?? 1);
      const rawDz = target.z - origin.z;
      const rawDistance = Math.hypot(rawDx, rawDy, rawDz);
      if (rawDistance <= 0.001 || rawDistance > maxDistance) continue;
      if (!physics.lineOfSight(origin, target, entityId, enemy.id)) continue;

      let aimX = target.x;
      let aimZ = target.z;
      if (muzzleVelocity > 0) {
        const vel = targetVelocity(enemy.id, target);
        const speed = Math.hypot(vel.vx, vel.vz);
        if (speed > 0.4) {
          const leadSec = Math.min(0.28, (rawDistance / muzzleVelocity) * (bot ? 0.96 : 0.85));
          const candX = target.x + vel.vx * leadSec;
          const candZ = target.z + vel.vz * leadSec;
          if (physics.lineOfSight(origin, { x: candX, y: target.y ?? 0, z: candZ }, entityId, enemy.id)) {
            aimX = candX;
            aimZ = candZ;
          }
        }
      }

      const dx = aimX - origin.x;
      const dy = rawDy;
      const dz = aimZ - origin.z;
      const distance = Math.hypot(dx, dy, dz);
      if (distance <= 0.001) continue;

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
        distance: rawDistance,
        frontness,
        score,
        direction: { x: tx, y: ty, z: tz },
      };
    }

    return best;
  }

  function resolveShot(entityId, direction, maxDistance, options = {}) {
    const selected = selectTarget(entityId, direction, maxDistance, options);
    if (!selected) return { direction, targetId: null };
    return { direction: selected.direction, targetId: selected.targetId };
  }

  ctx.services.provide("targeting", {
    mode: "assisted-target-selection",
    selection: "visible-nearby-with-front-priority",
    selectTarget,
    resolveShot,
    adjustDirection(entityId, direction, maxDistance, options = {}) {
      return resolveShot(entityId, direction, maxDistance, options).direction;
    },
  });
}
