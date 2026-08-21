import test from "node:test";
import assert from "node:assert/strict";
import { createEchoFrontGame } from "../src/server/game.js";

test("full Echo Front preset starts with four bots and mixed armor", async () => {
  const game = await createEchoFrontGame();
  const initial = game.api.snapshot();
  assert.equal(initial.entities.length, 4);
  assert.ok(initial.entities.every((entity) => entity.bot));
  assert.ok(initial.entities.some((entity) => entity.armor == null));
  assert.ok(initial.entities.some((entity) => entity.armor === 50));
  await game.host.stop();
});

test("human replaces a bot and disconnect restores bot fill", async () => {
  const game = await createEchoFrontGame();
  game.api.connectHuman("human-test");
  let snapshot = game.api.snapshot();
  assert.equal(snapshot.entities.length, 4);
  assert.equal(snapshot.entities.filter((entity) => !entity.bot).length, 1);
  assert.ok(snapshot.entities.some((entity) => entity.id === "human-test"));

  game.api.disconnectHuman("human-test");
  snapshot = game.api.snapshot();
  assert.equal(snapshot.entities.length, 4);
  assert.equal(snapshot.entities.filter((entity) => !entity.bot).length, 0);
  await game.host.stop();
});

test("weapon selection is independent from movement", async () => {
  const game = await createEchoFrontGame();
  game.api.connectHuman("human-weapons");
  let self = game.api.snapshot().entities.find((entity) => entity.id === "human-weapons");
  assert.equal(self.weapon, "pistol");

  game.api.handleInput("human-weapons", { selectDelta: 1 });
  self = game.api.snapshot().entities.find((entity) => entity.id === "human-weapons");
  assert.equal(self.weapon, "rifle");
  await game.host.stop();
});
