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

test("human spawn protection blocks immediate damage", async () => {
  const game = await createEchoFrontGame();
  game.api.connectHuman("human-protected");
  const protection = game.host.services.get("spawn-protection");
  const combat = game.host.services.get("combat");

  assert.equal(protection.isProtected("human-protected"), true);
  combat.damage("human-protected", 999);

  let self = game.api.snapshot().entities.find((entity) => entity.id === "human-protected");
  assert.equal(self.health, 100);
  assert.equal(self.armor, 50);

  protection.clear("human-protected");
  combat.damage("human-protected", 60);
  self = game.api.snapshot().entities.find((entity) => entity.id === "human-protected");
  assert.equal(self.armor, 0);
  assert.equal(self.health, 90);
  await game.host.stop();
});

test("armor break and kill produce distinct attacker feedback", async () => {
  const game = await createEchoFrontGame();
  game.api.connectHuman("human-feedback");
  const combat = game.host.services.get("combat");
  const armored = game.api.snapshot().entities.find((entity) => entity.bot && entity.armor != null);
  assert.ok(armored);

  const feedback = [];
  const off = game.host.events.on("feedback:sound", (payload) => {
    if (payload.recipientId === "human-feedback") feedback.push(payload.key);
  });

  const armor = game.host.components.get(armored.id, "Armor");
  armor.current = 10;
  combat.damage(armored.id, 20, { attackerId: "human-feedback", weaponId: "pistol" });
  assert.ok(feedback.some((key) => key.startsWith("armor.hit")));
  assert.ok(feedback.includes("armor.break"));

  feedback.length = 0;
  armor.current = 0;
  const health = game.host.components.get(armored.id, "Health");
  health.current = 10;
  combat.damage(armored.id, 20, { attackerId: "human-feedback", weaponId: "pistol" });
  assert.ok(feedback.includes("hit.enemy"));
  assert.ok(feedback.includes("enemy.killed"));

  off();
  await game.host.stop();
});
