import test from "node:test";
import assert from "node:assert/strict";
import {
  BOT_FIRE_CONE_RADIANS,
  BOT_AIM_RESET_RADIANS,
  BOT_REACTION_BASE_MS,
} from "../src/plugins/bot-combat/server.js";

test("bots must hold a narrow aim cone and react slower than a human", () => {
  assert.ok(BOT_FIRE_CONE_RADIANS <= 0.07);
  assert.ok(BOT_AIM_RESET_RADIANS > BOT_FIRE_CONE_RADIANS);
  assert.ok(BOT_AIM_RESET_RADIANS <= 0.14);
  assert.ok(BOT_REACTION_BASE_MS >= 800);
});
