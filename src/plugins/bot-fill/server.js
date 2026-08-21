export const manifest = {
  id: "bot-fill",
  version: "1.0.0",
  requires: ["bot-controller", "entities", "teams"],
  capabilities: ["services.consume", "services.provide"],
};

export async function setup(ctx) {
  const entities = ctx.services.get("entities");
  const bots = ctx.services.get("bots");
  const teams = ctx.services.get("teams");
  const targetPlayers = 4;
  let serial = 0;

  function spawnBot() {
    const team = teams.pickBalancedTeam();
    const armored = serial % 2 === 1;
    const id = `bot-${++serial}`;
    entities.spawn({
      id,
      kind: "bot",
      name: armored ? `Бот ${serial} в броне` : `Бот ${serial}`,
      bot: true,
      team,
      health: 100,
      armor: armored ? 50 : 0,
      weapons: armored ? ["rifle", "pistol"] : ["pistol", "rifle"],
    });
    return id;
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
