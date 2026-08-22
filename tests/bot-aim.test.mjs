import test from "node:test";
import assert from "node:assert/strict";
import {
  BOT_FIRE_CONE_RADIANS,
  BOT_AIM_RESET_RADIANS,
} from "../src/plugins/bot-combat/server.js";

test("bots must hold a narrow aim cone before firing", () => {
  assert.ok(BOT_FIRE_CONE_RADIANS <= 0.08);
  assert.ok(BOT_AIM_RESET_RADIANS > BOT_FIRE_CONE_RADIANS);
  assert.ok(BOT_AIM_RESET_RADIANS <= 0.14);
});
