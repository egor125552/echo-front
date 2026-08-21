export const manifest = {
  id: "match-api",
  version: "1.0.0",
  requires: [
    "entities", "movement", "weapons", "teams",
    "respawn", "team-deathmatch", "bot-fill", "bot-combat",
  ],
  optional: ["armor"],
  capabilities: [
    "services.consume", "services.provide",
    "components.read",
  ],
};

export async function setup(ctx) {
  const entities = ctx.services.get("entities");
  const movement = ctx.services.get("movement");
  const weapons = ctx.services.get("weapons");
  const teams = ctx.services.get("teams");
  const respawn = ctx.services.get("respawn");
  const tdm = ctx.services.get("tdm");
  const botFill = ctx.services.get("bot-fill");
  const botCombat = ctx.services.get("bot-combat");

  botFill.ensure();

  function connectHuman(playerId) {
    botFill.makeRoomForHuman();
    const team = teams.pickBalancedTeam({ humansOnly: true });
    entities.spawn({
      id: playerId,
      kind: "human",
      name: "Игрок",
      bot: false,
      team,
      health: 100,
      ...(ctx.hasPlugin("armor") ? { armor: 50 } : {}),
      weapons: ["pistol", "rifle"],
    });
    botFill.ensure();
    return { playerId, team };
  }

  function disconnectHuman(playerId) {
    entities.remove(playerId);
    botFill.ensure();
  }

  function handleInput(playerId, input = {}, now = Date.now()) {
    const entity = entities.get(playerId);
    if (!entity?.alive) return;
    movement.setInput(playerId, input);
    if (input.firePressed) weapons.fire(playerId, now);
    if (input.reload) weapons.reload(playerId, now);
    if (input.selectDelta) weapons.select(playerId, input.selectDelta);
  }

  function step(dt, now = Date.now()) {
    botCombat.tick(dt, now);
    movement.tick(dt);
    weapons.tickAutomatic(now);
    respawn.tick(now);
  }

  function snapshot(now = Date.now()) {
    return {
      now,
      match: tdm.status(now),
      entities: entities.all().map((entity) => {
        const components = ctx.components.snapshot(entity.id);
        const transform = components.Transform ?? null;
        const health = components.Health ?? null;
        const armor = components.Armor ?? null;
        const team = components.Team?.id ?? 0;
        const inventory = components.Weapons ?? null;
        const selected = inventory?.items?.[inventory.selected] ?? null;
        return {
          id: entity.id,
          name: entity.name,
          bot: entity.bot,
          alive: entity.alive,
          team,
          x: transform?.x ?? 0,
          z: transform?.z ?? 0,
          angle: transform?.angle ?? 0,
          health: health?.current ?? null,
          healthMax: health?.maximum ?? null,
          armor: armor?.current ?? null,
          armorMax: armor?.maximum ?? null,
          weapon: selected?.id ?? null,
          ammo: selected?.ammo ?? null,
          reserve: selected?.reserve ?? null,
        };
      }),
    };
  }

  ctx.services.provide("match-api", {
    connectHuman,
    disconnectHuman,
    handleInput,
    step,
    snapshot,
  });
}
