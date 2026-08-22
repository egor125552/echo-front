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

test("human starts with pistol and 500 total rounds, then unlocks rifle after first round", async () => {
  const game = await createEchoFrontGame();
  game.api.connectHuman("human-progression");
  const weapons = game.host.services.get("weapons");

  let self = game.api.snapshot().entities.find((entity) => entity.id === "human-progression");
  assert.equal(self.weapon, "pistol");
  assert.deepEqual(self.weapons, ["pistol"]);
  assert.equal(self.ammo, 100);
  assert.equal(self.reserve, 400);
  assert.equal(self.ammo + self.reserve, 500);
  assert.equal(weapons.has("human-progression", "rifle"), false);

  game.host.events.emit("match:ended", { winner: 1, score: { 1: 10, 2: 3 }, roundNumber: 1 });
  assert.equal(weapons.has("human-progression", "rifle"), true);
  await game.host.stop();
});

test("holding X repeats pistol fire at the weapon cadence", async () => {
  const game = await createEchoFrontGame();
  game.api.connectHuman("human-held-pistol");
  const weapons = game.host.services.get("weapons");
  assert.equal(weapons.definitions.pistol.automatic, false);
  assert.equal(weapons.definitions.pistol.holdRepeat, true);

  game.api.handleInput("human-held-pistol", { fireHeld: true }, 1000);
  game.api.step(0.01, 1000);
  game.api.step(0.10, 1100);
  game.api.step(0.10, 1200);

  const self = game.api.snapshot(1200).entities.find((entity) => entity.id === "human-held-pistol");
  assert.equal(self.ammo, 98);
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

test("main combat selects a visible target without requiring a manual aim cone", async () => {
  const game = await createEchoFrontGame();
  game.api.connectHuman("human-targeting");
  const targeting = game.host.services.get("targeting");
  const weapons = game.host.services.get("weapons");
  const snapshot = game.api.snapshot();
  const self = snapshot.entities.find((entity) => entity.id === "human-targeting");
  const enemy = snapshot.entities.find((entity) => entity.bot && entity.team !== self.team);
  assert.ok(enemy);

  const dx = enemy.x - self.x;
  const dz = enemy.z - self.z;
  const length = Math.hypot(dx, dz) || 1;
  const deliberatelyAway = { x: -dx / length, y: 0, z: -dz / length };
  const resolved = targeting.resolveShot("human-targeting", deliberatelyAway, weapons.definitions.pistol.range);

  assert.equal(targeting.mode, "assisted-target-selection");
  assert.equal(targeting.selection, "visible-nearby-with-front-priority");
  assert.ok(resolved.targetId, "a visible in-range enemy should be selected even when facing away");
  assert.notDeepEqual(resolved.direction, deliberatelyAway);

  game.drainEvents();
  const transform = game.host.components.get("human-targeting", "Transform");
  transform.angle += Math.PI;
  weapons.fire("human-targeting", 1000);
  const fired = game.drainEvents().find((packet) => packet.event === "weapon:fired" && packet.payload.entityId === "human-targeting");
  assert.ok(fired?.payload.targetId, "actual weapon fire should report the assisted target");
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

test("combat emits authoritative damage telemetry", async () => {
  const game = await createEchoFrontGame();
  game.api.connectHuman("human-telemetry");
  const combat = game.host.services.get("combat");
  const target = game.api.snapshot().entities.find((entity) => entity.bot);
  assert.ok(target);

  let telemetry = null;
  const off = game.host.events.on("combat:damage", (payload) => {
    telemetry = payload;
  });
  combat.damage(target.id, 12, { attackerId: "human-telemetry", weaponId: "pistol", now: 1234 });
  assert.equal(telemetry?.targetId, target.id);
  assert.equal(telemetry?.attackerId, "human-telemetry");
  assert.equal(telemetry?.weaponId, "pistol");
  assert.equal(telemetry?.now, 1234);
  off();
  await game.host.stop();
});
