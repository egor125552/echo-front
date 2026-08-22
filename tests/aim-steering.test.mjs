import test from "node:test";
import assert from "node:assert/strict";
import { steeredTurn, NORMAL_STEERING } from "../src/plugins/aim-steering/server.js";
import { HUMAN_TURN_SPEED, BOT_TURN_SPEED } from "../src/plugins/movement/server.js";
import { createEchoFrontGame } from "../src/server/game.js";

test("human keyboard turning is slower than bot turning", () => {
  assert.ok(HUMAN_TURN_SPEED < BOT_TURN_SPEED);
  assert.ok(HUMAN_TURN_SPEED <= 1.7);
});

test("aim steering progressively brakes while approaching the target", () => {
  const far = steeredTurn(1, NORMAL_STEERING.outerAngleRadians + 0.1);
  const medium = steeredTurn(1, 0.3);
  const near = steeredTurn(1, 0.04);
  const centered = steeredTurn(1, 0);

  assert.equal(far, 1);
  assert.ok(medium > near);
  assert.ok(medium < 1);
  assert.ok(near > 0);
  assert.equal(centered, 0);
});

test("aim steering never pulls against the key the player is holding", () => {
  assert.equal(steeredTurn(1, -0.2), 1);
  assert.equal(steeredTurn(-1, 0.2), -1);
});

test("opening round provides wider aim and stronger steering help", async () => {
  const game = await createEchoFrontGame();
  const opening = game.host.services.get("opening-round");
  const targeting = game.host.services.get("targeting");
  const steering = game.host.services.get("aim-steering");

  assert.ok(targeting.currentConeRadians() >= 0.40);
  const training = opening.steeringTuning();
  assert.ok(training.outerAngleRadians > steering.normalTuning.outerAngleRadians);
  assert.ok(training.minimumTurnScale < steering.normalTuning.minimumTurnScale);

  await game.host.stop();
});
