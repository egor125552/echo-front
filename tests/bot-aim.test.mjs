import test from "node:test";
import assert from "node:assert/strict";
import {
  BOT_FIRE_CONE_RADIANS,
  BOT_AIM_RESET_RADIANS,
  BOT_REACTION_BASE_MS,
} from "../src/plugins/bot-combat/server.js";

test("bots react quickly but still require a real aim window", () => {
  assert.ok(BOT_FIRE_CONE_RADIANS >= 0.07);
  assert.ok(BOT_FIRE_CONE_RADIANS <= 0.1);
  assert.ok(BOT_AIM_RESET_RADIANS > BOT_FIRE_CONE_RADIANS);
  assert.ok(BOT_AIM_RESET_RADIANS <= 0.16);
  assert.ok(BOT_REACTION_BASE_MS >= 400);
  assert.ok(BOT_REACTION_BASE_MS <= 650);
});
