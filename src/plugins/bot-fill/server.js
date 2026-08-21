export const manifest = {
  id: "bot-fill",
  version: "1.0.0",
  requires: ["bot-controller", "bot-loadouts", "entities", "teams"],
  capabilities: ["services.consume", "services.provide"],
};

export async function setup(ctx) {
  const entities = ctx.services.get("entities");
  const bots = ctx.services.get("bots");
  const teams = ctx.services.get("teams");
  const loadouts = ctx.services.get("bot-loadouts");
  const targetPlayers = 4;
  let serial = 0;

  function spawnBot() {
    const team = teams.pickBalancedTeam();
    const spec = loadouts.create(++serial, team);
    entities.spawn(spec);
    return spec.id;
  }

  function removeOneBot() {
    const bot = bots.all().find((entry) => entry.alive) ?? bots.all()[0];
    if (bot) entities.remove(bot.id);
    return Boolean(bot);
  }

  const api = {
    ensure() {
      while (entities.all().length < targetPlayers) spawnBot();
      while (entities.all().length > targetPlayers && bots.all().length) removeOneBot();
    },
    makeRoomForHuman() {
      if (entities.all().length >= targetPlayers) removeOneBot();
    },
  };

  ctx.services.provide("bot-fill", api);
}
