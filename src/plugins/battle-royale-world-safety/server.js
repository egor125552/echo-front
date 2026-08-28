export const manifest = {
  id: "battle-royale-world-safety",
  version: "1.0.0",
  requires: [
    "battle-royale-world-expansion",
    "battle-royale-parachute",
    "rapier-physics",
    "movement",
    "entities",
  ],
  capabilities: ["services.consume", "services.provide", "components.read", "events.emit"],
};

const SAFE_MARGIN = 4;
const RESCUE_MIN_Y = 1.2;
const RESCUE_MAX_DOWNWARD_SPEED = 5;

export async function setup(ctx) {
  const worldExpansion = ctx.services.get("world-expansion");
  const parachute = ctx.services.get("parachute");
  const physics = ctx.services.get("physics");
  const movement = ctx.services.get("movement");
  const entities = ctx.services.get("entities");

  const originalLaunch = parachute.launch.bind(parachute);
  const originalFinishMovement = parachute.finishMovement.bind(parachute);
  let launchCorrections = 0;
  let inFlightRecoveries = 0;

  function safeXZ(x, z) {
    return worldExpansion.clampInside(x, z, SAFE_MARGIN);
  }

  parachute.launch = (entityId, options = {}, now = Date.now()) => {
    const requestedX = Number.isFinite(Number(options.x)) ? Number(options.x) : null;
    const requestedZ = Number.isFinite(Number(options.z)) ? Number(options.z) : null;
    if (requestedX == null || requestedZ == null) return originalLaunch(entityId, options, now);

    const safe = safeXZ(requestedX, requestedZ);
    const corrected = safe.x !== requestedX || safe.z !== requestedZ;
    if (corrected) launchCorrections += 1;
    const result = originalLaunch(entityId, { ...options, x: safe.x, z: safe.z }, now);
    if (corrected) {
      ctx.events.emit("parachute:world-recovered", {
        entityId,
        phase: "launch",
        fromX: requestedX,
        fromZ: requestedZ,
        x: safe.x,
        z: safe.z,
        now,
      });
    }
    return result;
  };

  parachute.finishMovement = (dt, now = Date.now()) => {
    const result = originalFinishMovement(dt, now);

    for (const entity of entities.all()) {
      if (!entity?.alive || entity.bot || entity.kind !== "human") continue;
      const state = ctx.components.get(entity.id, "Parachute");
      const transform = ctx.components.get(entity.id, "Transform");
      if (!state?.airborne || !transform) continue;
      if (worldExpansion.contains(transform.x, transform.z, SAFE_MARGIN)) continue;

      const fromX = Number(transform.x) || 0;
      const fromY = Number(transform.y) || 0;
      const fromZ = Number(transform.z) || 0;
      const safe = safeXZ(fromX, fromZ);
      const rescueY = Math.max(RESCUE_MIN_Y, fromY);
      const angle = Number(transform.angle) || 0;
      movement.teleport(entity.id, { x: safe.x, y: rescueY, z: safe.z, angle });
      physics.teleport(entity.id, { x: safe.x, y: rescueY, z: safe.z });
      transform.x = safe.x;
      transform.y = rescueY;
      transform.z = safe.z;
      transform.grounded = false;

      const currentVertical = Number(state.simulatedVerticalVelocity ?? transform.verticalVelocity) || 0;
      const rescuedVertical = Math.max(-RESCUE_MAX_DOWNWARD_SPEED, Math.min(0, currentVertical));
      state.simulatedVerticalVelocity = rescuedVertical;
      transform.verticalVelocity = rescuedVertical;
      inFlightRecoveries += 1;

      ctx.events.emit("parachute:world-recovered", {
        entityId: entity.id,
        phase: "flight",
        fromX,
        fromY,
        fromZ,
        x: safe.x,
        y: rescueY,
        z: safe.z,
        verticalVelocity: rescuedVertical,
        now,
      });
    }

    return result;
  };

  ctx.services.provide("world-safety", {
    summary() {
      return {
        launchCorrections,
        inFlightRecoveries,
        safeMargin: SAFE_MARGIN,
      };
    },
  });
}
