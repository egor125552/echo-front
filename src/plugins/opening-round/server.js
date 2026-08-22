export const TRAINING_AIM_CONE_RADIANS = 0.60;

const TRAINING_LAYOUTS = {
  1: {
    player: { x: -11, z: 7, angle: Math.PI / 2 },
    enemies: [
      { x: 11, z: 7, angle: -Math.PI / 2 },
      { x: 10, z: 5.8, angle: -Math.PI / 2 },
      { x: 9, z: 7.8, angle: -Math.PI / 2 },
    ],
  },
  2: {
    player: { x: 11, z: -7, angle: -Math.PI / 2 },
    enemies: [
      { x: -11, z: -7, angle: Math.PI / 2 },
      { x: -10, z: -5.8, angle: Math.PI / 2 },
      { x: -9, z: -7.8, angle: Math.PI / 2 },
    ],
  },
};

export const manifest = {
  id: "opening-round",
  version: "1.2.0",
  requires: ["entities", "teams", "movement", "team-deathmatch"],
  capabilities: ["services.consume", "services.provide", "components.read"],
};

export async function setup(ctx) {
  const entities = ctx.services.get("entities");
  const teams = ctx.services.get("teams");
  const movement = ctx.services.get("movement");
  const tdm = ctx.services.get("tdm");
  let respawnCursor = 0;

  function isActive(now = Date.now()) {
    return Number(tdm.status(now).roundNumber) === 1;
  }

  function layoutFor(team) {
    return TRAINING_LAYOUTS[team] ?? TRAINING_LAYOUTS[1];
  }

  function arrangeForHuman(playerId, now = Date.now()) {
    if (!isActive(now)) return false;
    const player = entities.get(playerId);
    if (!player || player.bot) return false;
    const team = teams.teamOf(playerId) || 1;
    const layout = layoutFor(team);
    movement.teleport(playerId, layout.player);
    const enemies = teams.enemiesOf(playerId).filter((entity) => entity.bot);
    enemies.forEach((enemy, index) => {
      movement.teleport(enemy.id, layout.enemies[index % layout.enemies.length]);
    });
    return true;
  }

  function respawnFor(entityId, now = Date.now()) {
    if (!isActive(now)) return null;
    const entity = entities.get(entityId);
    if (!entity) return null;

    if (!entity.bot) {
      const team = teams.teamOf(entityId) || 1;
      return { ...layoutFor(team).player };
    }

    const humanEnemy = teams.enemiesOf(entityId).find((enemy) => !enemy.bot);
    if (!humanEnemy) return null;
    const humanTeam = teams.teamOf(humanEnemy.id) || 1;
    const layout = layoutFor(humanTeam);
    const point = layout.enemies[respawnCursor++ % layout.enemies.length];
    return { ...point };
  }

  ctx.services.provide("opening-round", {
    isActive,
    arrangeForHuman,
    respawnFor,
    aimCone(baseCone, now = Date.now()) {
      return isActive(now) ? Math.max(Number(baseCone) || 0, TRAINING_AIM_CONE_RADIANS) : baseCone;
    },
    steeringTuning(now = Date.now()) {
      if (!isActive(now)) return null;
      return {
        outerAngleRadians: 0.95,
        innerAngleRadians: 0.18,
        minimumTurnScale: 0.18,
      };
    },
    botTuning(now = Date.now()) {
      if (!isActive(now)) return null;
      return {
        reactionBaseMs: 1300,
        fireConeRadians: 0.045,
        aimResetRadians: 0.09,
        aimWobble: 0.075,
        approachForward: 0.62,
        approachStrafe: 0.05,
      };
    },
  });
}
