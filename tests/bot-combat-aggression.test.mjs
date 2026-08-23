import test from "node:test";
import assert from "node:assert/strict";
import { createEchoFrontGame } from "../src/server/game.js";

function keepOpposingPair(game) {
  const entities = game.host.services.get("entities");
  const bots = entities.all().filter((entity) => entity.bot);
  const first = bots[0];
  const teams = game.host.services.get("teams");
  const second = bots.find((bot) => teams.teamOf(bot.id) !== teams.teamOf(first.id));
  assert.ok(first && second);
  for (const bot of bots) {
    if (bot.id !== first.id && bot.id !== second.id) entities.remove(bot.id);
  }
  return [first, second];
}

test("bots actively damage opposing bots when they see each other", async () => {
  const game = await createEchoFrontGame();
  const [a, b] = keepOpposingPair(game);
  const movement = game.host.services.get("movement");
  movement.teleport(a.id, { x: 0, z: -10, angle: Math.PI });
  movement.teleport(b.id, { x: 0, z: -6, angle: 0 });

  const hits = [];
  const off = game.host.events.on("combat:damage", (packet) => {
    if ((packet.attackerId === a.id && packet.targetId === b.id) ||
        (packet.attackerId === b.id && packet.targetId === a.id)) {
      hits.push(packet);
    }
  });

  const start = Date.now();
  for (let i = 0; i < 24 && hits.length === 0; i += 1) {
    game.api.step(0.1, start + i * 100);
  }

  assert.ok(hits.length > 0, "opposing bots should engage each other instead of only running around");
  assert.ok(hits[0].now - start <= 1600, "a visible enemy should provoke a prompt attack");

  off();
  await game.host.stop();
});

test("a bot hunts a nearby enemy even when a wall temporarily blocks line of sight", async () => {
  const game = await createEchoFrontGame();
  const [hunter, enemy] = keepOpposingPair(game);
  const movement = game.host.services.get("movement");
  const perception = game.host.services.get("bot-perception");
  const botCombat = game.host.services.get("bot-combat");

  movement.teleport(hunter.id, { x: 0, z: -4.25, angle: 0 });
  movement.teleport(enemy.id, { x: 0, z: -2.75, angle: Math.PI });

  assert.equal(perception.nearestVisibleEnemy(hunter.id, 28), null);
  assert.equal(perception.nearestEnemy(hunter.id, 60)?.entityId, enemy.id);

  botCombat.tick(0.1, Date.now());
  const input = game.host.components.get(hunter.id, "Input");
  assert.ok(Math.hypot(input.forward, input.strafe) > 0.5, "hidden enemies should be hunted, not forgotten");

  await game.host.stop();
});
