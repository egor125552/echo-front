import test from "node:test";
import assert from "node:assert/strict";
import { steeredTurn, NORMAL_STEERING } from "../src/plugins/aim-steering/server.js";
import { HUMAN_TURN_SPEED, BOT_TURN_SPEED } from "../src/plugins/movement/server.js";
import { createEchoFrontGame } from "../src/server/game.js";

test("human keyboard turning is slower than bot turning", () => {
  assert.ok(HUMAN_TURN_SPEED < BOT_TURN_SPEED);
  assert.ok(HUMAN_TURN_SPEED <= 1.7);
});

test("standalone aim steering progressively brakes while approaching the target", () => {
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

test("standalone aim steering never pulls against the key the player is holding", () => {
  assert.equal(steeredTurn(1, -0.2), 1);
  assert.equal(steeredTurn(-1, 0.2), -1);
});

test("main Echo Front preset no longer requires manual aim steering", async () => {
  const game = await createEchoFrontGame();
  const targeting = game.host.services.get("targeting");

  assert.equal(game.host.services.has("aim-steering"), false);
  assert.equal(targeting.mode, "assisted-target-selection");

  await game.host.stop();
});
