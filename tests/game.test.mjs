import test from "node:test";
import assert from "node:assert/strict";
import { createEchoFrontGame } from "../src/server/game.js";

test("full Echo Front preset starts with four varied bots", async () => {
  const game = await createEchoFrontGame();
  const initial = game.api.snapshot();
  assert.equal(initial.entities.length, 4);
  assert.ok(initial.entities.every((entity) => entity.bot));
  assert.ok(initial.entities.some((entity) => entity.armor == null));
  assert.ok(initial.entities.some((entity) => Number(entity.armor) > 0));
  assert.ok(new Set(initial.entities.map((entity) => entity.healthMax)).size > 1);
  await game.host.stop();
});

test("human starts with pistol 50 plus 150 and unlocks rifle after first round", async () => {
  const game = await createEchoFrontGame();
  game.api.connectHuman("human-progression");
  const weapons = game.host.services.get("weapons");

  let self = game.api.snapshot().entities.find((entity) => entity.id === "human-progression");
  assert.equal(self.weapon, "pistol");
  assert.deepEqual(self.weapons, ["pistol"]);
  assert.equal(self.ammo, 50);
  assert.equal(self.reserve, 150);
  assert.equal(weapons.has("human-progression", "rifle"), false);

  game.host.events.emit("match:ended", { winner: 1, score: { 1: 10, 2: 3 }, roundNumber: 1 });
  assert.equal(weapons.has("human-progression", "rifle"), true);
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

test("strafe input moves the human sideways independently of turning", async () => {
  const game = await createEchoFrontGame();
  game.api.connectHuman("human-strafe");
  const before = game.api.snapshot().entities.find((entity) => entity.id === "human-strafe");
  game.api.handleInput("human-strafe", { strafe: 1, forward: 0, turn: 0 });
  game.api.step(0.1, Date.now());
  const after = game.api.snapshot().entities.find((entity) => entity.id === "human-strafe");
  assert.notEqual(`${after.x.toFixed(3)},${after.z.toFixed(3)}`, `${before.x.toFixed(3)},${before.z.toFixed(3)}`);
  assert.equal(after.angle, before.angle);
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
