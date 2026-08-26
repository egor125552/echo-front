import test from "node:test";
import assert from "node:assert/strict";
import {
  BOT_RETREAT_COVER_FIRE_DISTANCE,
  shouldCoverRetreat,
} from "../src/plugins/battle-royale-bot-cover-fire/server.js";

test("a bot retreating from a close visible enemy covers the withdrawal with fire", () => {
  assert.equal(shouldCoverRetreat({
    goal: "evade",
    target: { entityId: "enemy", distance: 13.8 },
  }), true);
});

test("a bot can still disengage silently from a distant contact", () => {
  assert.equal(shouldCoverRetreat({
    goal: "evade",
    target: { entityId: "enemy", distance: BOT_RETREAT_COVER_FIRE_DISTANCE + 6 },
  }), false);
});

test("cover fire never changes a non-evade decision", () => {
  assert.equal(shouldCoverRetreat({
    goal: "investigate",
    target: { entityId: "enemy", distance: 4 },
  }), false);
});
