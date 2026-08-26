import test from "node:test";
import assert from "node:assert/strict";
import { createEchoFrontGame } from "../src/server/game.js";

async function activeBattleRoyale(playerId) {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  game.api.connectHuman(playerId);
  const deployment = game.api.snapshot().match;
  const now = deployment.deploymentEndsAt + 1;
  game.api.step(0.05, now);
  return { game, now };
}

function keepOneBot(game) {
  const entities = game.host.services.get("entities");
  const bots = entities.all().filter((entity) => entity.bot);
  const hunter = bots[0];
  assert.ok(hunter);
  for (const bot of bots.slice(1)) entities.remove(bot.id);
  return hunter;
}

test("a visible attacker cannot shoot a BR bot repeatedly without provoking return fire", async () => {
  const { game, now } = await activeBattleRoyale("tactical-return-fire-human");
  const hunter = keepOneBot(game);
  const movement = game.host.services.get("movement");
  const botCombat = game.host.services.get("bot-combat");

  movement.teleport(hunter.id, { x: 0, y: 0, z: 0, angle: 0 });
  movement.teleport("tactical-return-fire-human", { x: 0, y: 0, z: -9, angle: Math.PI });

  game.host.events.emit("combat:damage", {
    targetId: hunter.id,
    attackerId: "tactical-return-fire-human",
    now: now + 100,
  });

  const state = game.host.components.get(hunter.id, "Bot");
  const input = game.host.components.get(hunter.id, "Input");
  let fired = false;
  for (let offset = 150; offset <= 1_200; offset += 50) {
    state.nextThinkAt = 0;
    botCombat.tick(0.05, now + offset);
    if (input.fireHeld) {
      fired = true;
      break;
    }
  }

  assert.equal(fired, true, "bot stayed passive after being hit by a visible attacker");
  await game.host.stop();
});

test("after reaching the last heard footsteps a bot searches the area instead of instantly roaming away", async () => {
  const { game, now } = await activeBattleRoyale("tactical-search-human");
  const hunter = keepOneBot(game);
  const movement = game.host.services.get("movement");
  const interest = game.host.services.get("bot-interest");
  const grid = game.host.services.get("spatial-grid");

  movement.teleport(hunter.id, { x: 0, y: 0, z: 0, angle: 0 });
  movement.teleport("tactical-search-human", { x: 30, y: 0, z: 0, angle: Math.PI });
  grid.rebuild(Date.now() + 1_000);

  for (let i = 0; i < 4; i += 1) {
    game.host.events.emit("sound:spatial", {
      entityId: "tactical-search-human",
      key: `footstep.forest.${(i % 3) + 1}`,
      gait: "walk",
      x: 30,
      y: 0,
      z: 0,
      radius: 32,
    });
  }

  let transform = game.host.components.get(hunter.id, "Transform");
  const heard = interest.targetFor(hunter.id, transform, now + 100);
  assert.equal(heard?.kind, "sound-interest");
  assert.equal(heard?.x, 30);

  movement.teleport(hunter.id, { x: 30, y: 0, z: 0, angle: 0 });
  transform = game.host.components.get(hunter.id, "Transform");
  const search = interest.targetFor(hunter.id, transform, now + 200);
  assert.equal(search?.kind, "sound-interest");
  assert.equal(search?.phase, "search");
  assert.ok(Math.hypot(search.x - 30, search.z) >= 4, "search point never expanded beyond the heard coordinate");

  movement.teleport("tactical-search-human", { x: 120, y: 0, z: 80, angle: 0 });
  const stillSearching = interest.targetFor(hunter.id, transform, now + 400);
  assert.equal(stillSearching?.phase, "search");
  assert.ok(
    Math.hypot(stillSearching.x - 30, stillSearching.z) < 20,
    "bot magically tracked the silently moved source instead of searching the old sound area",
  );

  await game.host.stop();
});
