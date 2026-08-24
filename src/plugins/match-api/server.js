export const manifest = {
  id: "match-api",
  version: "1.7.0",
  requires: [
    "entities", "movement", "weapons", "teams",
    "respawn", "team-deathmatch", "bot-fill", "bot-combat",
  ],
  optional: [
    "armor", "weapon-progression", "opening-round", "aim-steering",
    "health-regeneration",
  ],
  capabilities: [
    "services.consume", "services.provide",
    "components.read", "events.on",
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
  const armorService = ctx.services.has("armor") ? ctx.services.get("armor") : null;
  const opening = ctx.services.has("opening-round") ? ctx.services.get("opening-round") : null;
  const aimSteering = ctx.services.has("aim-steering") ? ctx.services.get("aim-steering") : null;
  const healthRegeneration = ctx.services.has("health-regeneration")
    ? ctx.services.get("health-regeneration")
    : null;

  botFill.ensure();

  ctx.events.on("match:ended", () => {
    for (const entity of entities.all()) {
      movement.setInput(entity.id, {});
      armorService?.cancelPlating(entity.id, "match-ended");
    }
  });

  function connectHuman(playerId) {
    const existing = entities.get(playerId);
    if (existing) {
      if (existing.kind !== "human" || existing.bot) {
        throw new Error(`Session id already belongs to a non-human entity: ${playerId}`);
      }
      movement.setInput(playerId, {});
      return {
        playerId,
        team: teams.teamOf(playerId),
        resumed: true,
      };
    }

    botFill.makeRoomForHuman();
    const team = teams.pickBalancedTeam({ humansOnly: true });
    entities.spawn({
      id: playerId,
      kind: "human",
      name: "Игрок",
      bot: false,
      team,
      health: 200,
      ...(ctx.hasPlugin("armor") ? { armorPlates: 4 } : {}),
      weapons: ["pistol"],
    });
    botFill.ensure();
    opening?.arrangeForHuman(playerId);
    return { playerId, team, resumed: false };
  }

  function suspendHuman(playerId) {
    const entity = entities.get(playerId);
    if (!entity || entity.kind !== "human" || entity.bot) return false;
    movement.setInput(playerId, {});
    armorService?.cancelPlating(playerId, "disconnect");
    return true;
  }

  function disconnectHuman(playerId) {
    armorService?.cancelPlating(playerId, "disconnect");
    entities.remove(playerId);
    botFill.ensure();
  }

  function hasInterruptingAction(input) {
    return Boolean(
      Math.abs(Number(input.forward) || 0) > 0 ||
      Math.abs(Number(input.strafe) || 0) > 0 ||
      Math.abs(Number(input.turn) || 0) > 0 ||
      input.sprint || input.firePressed || input.fireHeld ||
      input.reload || input.selectDelta
    );
  }

  function handleInput(playerId, input = {}, now = Date.now()) {
    const entity = entities.get(playerId);
    if (!entity?.alive) return;
    const ended = tdm.status(now).ended;

    if (!ended && input.platePressed && armorService?.startPlating(playerId, now)) {
      movement.setInput(playerId, {});
      return;
    }

    if (armorService?.isPlating(playerId)) {
      if (hasInterruptingAction(input)) {
        armorService.cancelPlating(playerId, "action");
      } else {
        movement.setInput(playerId, {});
        return;
      }
    }

    const movementInput = ended
      ? input
      : (aimSteering?.adjustInput(playerId, input, now) ?? input);
    movement.setInput(playerId, movementInput);
    if (ended) return;
    if (input.firePressed) weapons.fire(playerId, now);
    if (input.reload) weapons.reload(playerId, now);
    if (input.selectDelta) weapons.select(playerId, input.selectDelta);
  }

  function step(dt, now = Date.now()) {
    tdm.tick(now);
    armorService?.tick(now);
    if (!tdm.status(now).ended) {
      botCombat.tick(dt, now);
      movement.tick(dt, now);
      weapons.tickAutomatic(now);
      healthRegeneration?.tick(dt, now);
    }
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
        const armorDescription = armorService?.describe(entity.id) ?? null;
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
          armorPlates: armorDescription?.platesRemaining ?? null,
          armorPlateMax: armorDescription?.maximumPlates ?? null,
          plating: armorDescription?.plating ?? false,
          weapon: selected?.id ?? null,
          weapons: inventory?.items?.map((item) => item.id) ?? [],
          ammo: selected?.ammo ?? null,
          reserve: selected?.reserve ?? null,
        };
      }),
    };
  }

  ctx.services.provide("match-api", {
    connectHuman,
    suspendHuman,
    disconnectHuman,
    handleInput,
    step,
    snapshot,
  });
}
