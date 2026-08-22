import test from "node:test";
import assert from "node:assert/strict";
import { createEchoFrontGame } from "../src/server/game.js";

function wrapAngle(value) {
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
}

test("first round is deliberately easier for a human player", async () => {
  const game = await createEchoFrontGame();
  game.api.connectHuman("training-human");

  const training = game.host.services.get("training-round");
  const targeting = game.host.services.get("targeting");
  const profile = training.profile();

  assert.equal(profile.active, true);
  assert.ok(profile.humanAimBaseRadians >= 0.28);
  assert.ok(profile.botReactionBaseMs >= 900);
  assert.ok(profile.botRangeScale < 0.8);
  assert.ok(profile.botStrafeScale < 0.2);
  assert.equal(profile.botSprint, false);
  assert.ok(targeting.allowedAngle(10) >= 0.34);

  await game.host.stop();
});

test("training helper can face the human toward the nearest enemy", async () => {
  const game = await createEchoFrontGame();
  game.api.connectHuman("training-facing");
  const training = game.host.services.get("training-round");

  assert.equal(training.faceNearestEnemy("training-facing"), true);

  const snapshot = game.api.snapshot();
  const self = snapshot.entities.find((entity) => entity.id === "training-facing");
  const enemies = snapshot.entities.filter((entity) => entity.team !== self.team && entity.alive);
  const nearest = enemies
    .map((entity) => ({
      entity,
      distance: Math.hypot(entity.x - self.x, entity.z - self.z),
    }))
    .sort((a, b) => a.distance - b.distance)[0].entity;

  const desired = Math.atan2(nearest.x - self.x, -(nearest.z - self.z));
  assert.ok(Math.abs(wrapAngle(desired - self.angle)) < 0.001);

  await game.host.stop();
});
