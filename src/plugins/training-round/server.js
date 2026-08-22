export const manifest = {
  id: "training-round",
  version: "1.0.0",
  requires: ["team-deathmatch", "entities", "teams", "movement"],
  capabilities: [
    "services.consume", "services.provide",
    "components.read",
    "events.on",
  ],
};

export async function setup(ctx) {
  const tdm = ctx.services.get("tdm");
  const entities = ctx.services.get("entities");
  const teams = ctx.services.get("teams");
  const movement = ctx.services.get("movement");

  function isActive(now = Date.now()) {
    return Number(tdm.status(now).roundNumber) === 1;
  }

  function profile(now = Date.now()) {
    if (!isActive(now)) {
      return {
        active: false,
        humanAimBaseRadians: 0.11,
        botFireConeRadians: 0.065,
        botAimResetRadians: 0.11,
        botReactionBaseMs: 520,
        botRangeScale: 1,
        botStrafeScale: 1,
        botSprint: true,
      };
    }

    return {
      active: true,
      humanAimBaseRadians: 0.30,
      botFireConeRadians: 0.05,
      botAimResetRadians: 0.085,
      botReactionBaseMs: 950,
      botRangeScale: 0.72,
      botStrafeScale: 0.08,
      botSprint: false,
    };
  }

  function faceNearestEnemy(entityId, now = Date.now()) {
    if (!isActive(now)) return false;
    const entity = entities.get(entityId);
    if (!entity || entity.bot || !entity.alive) return false;
    const transform = ctx.components.get(entityId, "Transform");
    if (!transform) return false;

    let nearest = null;
    for (const enemy of teams.enemiesOf(entityId)) {
      if (!enemy?.alive) continue;
      const target = ctx.components.get(enemy.id, "Transform");
      if (!target) continue;
      const dx = target.x - transform.x;
      const dz = target.z - transform.z;
      const distance = Math.hypot(dx, dz);
      if (!nearest || distance < nearest.distance) nearest = { dx, dz, distance };
    }
    if (!nearest || nearest.distance < 0.001) return false;

    movement.teleport(entityId, {
      x: transform.x,
      z: transform.z,
      angle: Math.atan2(nearest.dx, -nearest.dz),
    });
    return true;
  }

  ctx.events.on("entity:spawned", ({ entityId }) => {
    faceNearestEnemy(entityId);
  });

  ctx.events.on("entity:respawned", ({ entityId }) => {
    faceNearestEnemy(entityId);
  });

  ctx.services.provide("training-round", {
    isActive,
    profile,
    faceNearestEnemy,
  });
}
