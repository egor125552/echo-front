export const manifest = {
  id: "bot-fill",
  version: "1.0.0-tutorial",
  requires: ["bot-controller", "bot-loadouts", "entities", "teams", "rapier-physics", "map-test-arena"],
  capabilities: ["services.consume", "services.provide"],
};

const TARGET_PLAYERS = 2;

export async function setup(ctx) {
  const entities = ctx.services.get("entities");
  const bots = ctx.services.get("bots");
  const loadouts = ctx.services.get("bot-loadouts");
  const map = ctx.services.get("map");
  let serial = 0;

  function spawnBot() {
    serial += 1;
    const team = serial;
    const spec = loadouts.create(serial, team);
    const half = Math.max(300, Number(map.halfSize) || 1000);
    const sign = serial % 2 ? 1 : -1;
    entities.spawn({
      ...spec,
      position: {
        x: sign * (half - 120),
        y: 0,
        z: -sign * (half - 120),
        angle: 0,
      },
    });
    return spec.id;
  }

  function removeOneBot() {
    const bot = bots.all()[0];
    if (!bot) return false;
    entities.remove(bot.id);
    return true;
  }

  function ensure() {
    while (entities.all().length < TARGET_PLAYERS) spawnBot();
    while (entities.all().length > TARGET_PLAYERS && bots.all().length) removeOneBot();
  }

  function makeRoomForHuman() {
    if (entities.all().length < TARGET_PLAYERS) return false;
    return removeOneBot();
  }

  function distribution() {
    return {
      liveBots: bots.all().filter((bot) => bot.alive).length,
      worldHalfSize: Number(map.halfSize) || 0,
      tutorial: true,
    };
  }

  ctx.services.provide("bot-fill", {
    targetPlayers: TARGET_PLAYERS,
    maxStartRadius: Number(map.halfSize) || 1000,
    ensure,
    makeRoomForHuman,
    distribution,
    spawnPoints: [],
  });
}
