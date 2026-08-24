export const TARGET_PLAYERS = 96;

export const manifest = {
  id: "bot-fill",
  version: "2.0.0",
  requires: ["bot-controller", "bot-loadouts", "entities", "teams", "rapier-physics"],
  capabilities: ["services.consume", "services.provide"],
};

export async function setup(ctx) {
  const entities = ctx.services.get("entities");
  const bots = ctx.services.get("bots");
  const loadouts = ctx.services.get("bot-loadouts");
  const physics = ctx.services.get("physics");
  let serial = 0;

  function spawnBot() {
    serial += 1;
    const team = serial;
    const spec = loadouts.create(serial, team);
    entities.spawn(spec);
    return spec.id;
  }

  function removeOneBot() {
    const all = bots.all();
    const bot = all.find((entry) => entry.alive) ?? all[0];
    if (!bot) return false;
    entities.remove(bot.id);
    return true;
  }

  function ensure() {
    physics.beginBatch?.();
    try {
      while (entities.all().length < TARGET_PLAYERS) spawnBot();
      while (entities.all().length > TARGET_PLAYERS && bots.all().length) removeOneBot();
    } finally {
      physics.endBatch?.();
    }
  }

  ctx.services.provide("bot-fill", {
    targetPlayers: TARGET_PLAYERS,
    ensure,
    makeRoomForHuman() {
      if (entities.all().length >= TARGET_PLAYERS) return removeOneBot();
      return false;
    },
  });
}
