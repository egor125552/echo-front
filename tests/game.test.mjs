import test from "node:test";
import assert from "node:assert/strict";
import { createEchoFrontGame } from "../src/server/game.js";

test("full Echo Front preset starts with four varied bots and at most one rifle bot", async () => {
  const game = await createEchoFrontGame();
  const initial = game.api.snapshot();
  assert.equal(initial.entities.length, 4);
  assert.ok(initial.entities.every((entity) => entity.bot));
  assert.ok(initial.entities.some((entity) => entity.armor == null));
  assert.ok(initial.entities.some((entity) => Number(entity.armor) > 0));
  assert.ok(new Set(initial.entities.map((entity) => entity.healthMax)).size > 1);
  const rifleBots = initial.entities.filter((entity) => entity.weapon === "rifle");
  assert.ok(rifleBots.length <= 1);
  assert.ok(initial.entities.filter((entity) => entity.weapon === "pistol").length >= 3);
  await game.host.stop();
});

test("pistol and rifle use the same effective range for humans and bots", async () => {
  const game = await createEchoFrontGame();
  const weapons = game.host.services.get("weapons");
  assert.equal(weapons.definitions.pistol.range, 28);
  assert.equal(weapons.definitions.rifle.range, weapons.definitions.pistol.range);
  await game.host.stop();
});

test("human starts with pistol and 400 total rounds, then unlocks rifle after first round", async () => {
  const game = await createEchoFrontGame();
  game.api.connectHuman("human-progression");
  const weapons = game.host.services.get("weapons");

  let self = game.api.snapshot().entities.find((entity) => entity.id === "human-progression");
  assert.equal(self.weapon, "pistol");
  assert.deepEqual(self.weapons, ["pistol"]);
  assert.equal(self.ammo, 50);
  assert.equal(self.reserve, 350);
  assert.equal(self.ammo + self.reserve, 400);
  assert.equal(weapons.has("human-progression", "rifle"), false);

  game.host.events.emit("match:ended", { winner: 1, score: { 1: 10, 2: 3 }, roundNumber: 1 });
  assert.equal(weapons.has("human-progression", "rifle"), true);
  await game.host.stop();
});

test("human replaces a bot and disconnect restores bot fill without creating a second rifle bot", async () => {
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
  assert.ok(snapshot.entities.filter((entity) => entity.weapon === "rifle").length <= 1);
  await game.host.stop();
});

test("human strafe is deliberately smaller than forward movement", async () => {
  const strafeGame = await createEchoFrontGame();
  strafeGame.api.connectHuman("human-strafe");
  const strafeBefore = strafeGame.api.snapshot().entities.find((entity) => entity.id === "human-strafe");
  strafeGame.api.handleInput("human-strafe", { strafe: 1, forward: 0, turn: 0 });
  strafeGame.api.step(0.1, Date.now());
  const strafeAfter = strafeGame.api.snapshot().entities.find((entity) => entity.id === "human-strafe");
  const strafeDistance = Math.hypot(strafeAfter.x - strafeBefore.x, strafeAfter.z - strafeBefore.z);
  await strafeGame.host.stop();

  const forwardGame = await createEchoFrontGame();
  forwardGame.api.connectHuman("human-forward");
  const forwardBefore = forwardGame.api.snapshot().entities.find((entity) => entity.id === "human-forward");
  forwardGame.api.handleInput("human-forward", { strafe: 0, forward: 1, turn: 0 });
  forwardGame.api.step(0.1, Date.now());
  const forwardAfter = forwardGame.api.snapshot().entities.find((entity) => entity.id === "human-forward");
  const forwardDistance = Math.hypot(forwardAfter.x - forwardBefore.x, forwardAfter.z - forwardBefore.z);
  assert.ok(strafeDistance > 0);
  assert.ok(strafeDistance < forwardDistance * 0.6);
  assert.equal(strafeAfter.angle, strafeBefore.angle);
  await forwardGame.host.stop();
});

test("mini aim uses a narrow assist cone", async () => {
  const game = await createEchoFrontGame();
  const targeting = game.host.services.get("targeting");
  assert.equal(targeting.mode, "mini-aim");
  assert.ok(targeting.baseConeRadians > 0.05);
  assert.ok(targeting.baseConeRadians < 0.15);
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
