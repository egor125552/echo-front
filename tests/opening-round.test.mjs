import test from "node:test";
import assert from "node:assert/strict";
import { createEchoFrontGame } from "../src/server/game.js";

test("first round places enemy bots in front without making them passive", async () => {
  const game = await createEchoFrontGame();
  game.api.connectHuman("training-human");

  const snapshot = game.api.snapshot();
  const self = snapshot.entities.find((entity) => entity.id === "training-human");
  const enemies = snapshot.entities.filter((entity) => entity.bot && entity.team !== self.team);
  assert.ok(enemies.length > 0);

  const forwardX = Math.sin(self.angle);
  const forwardZ = -Math.cos(self.angle);
  for (const enemy of enemies) {
    const dx = enemy.x - self.x;
    const dz = enemy.z - self.z;
    const length = Math.hypot(dx, dz) || 1;
    const forwardDot = (dx / length) * forwardX + (dz / length) * forwardZ;
    assert.ok(forwardDot > 0.8, `enemy ${enemy.id} should start clearly in front`);
  }

  const opening = game.host.services.get("opening-round");
  const targeting = game.host.services.get("targeting");
  assert.equal(opening.isActive(), true);
  assert.equal(targeting.mode, "assisted-target-selection");
  assert.ok(opening.botTuning().reactionBaseMs >= 600);
  assert.ok(opening.botTuning().reactionBaseMs <= 800);

  game.api.step(0.05, Date.now());
  const sprintingEnemies = enemies.filter((enemy) => {
    const input = game.host.components.get(enemy.id, "Input");
    return Boolean(input?.sprint);
  });
  assert.ok(sprintingEnemies.length > 0, "opening-round bots should actively sprint instead of only walking");

  await game.host.stop();
});
