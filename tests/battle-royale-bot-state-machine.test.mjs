import test from "node:test";
import assert from "node:assert/strict";
import { createActor } from "xstate";
import {
  BOT_BEHAVIOR_STATES,
  botBehaviorMachine,
} from "../src/plugins/battle-royale-bot-state-machine/server.js";
import { BOT_AI_ROLLOUT, usesXStateBotBrain } from "../src/config/bot-ai-rollout.js";

function send(actor, goal, now, holdUntil = now + 1000, force = false) {
  actor.send({
    type: `SELECT_${goal.toUpperCase()}`,
    now,
    force,
    decision: { goal, holdUntil, targetEntityId: `${goal}-target` },
  });
}

test("XState bot brain declares every top-level behavior explicitly", () => {
  assert.deepEqual(BOT_BEHAVIOR_STATES, [
    "roam", "investigate", "search", "hunt", "zone", "engage", "defend", "evade", "traverse",
  ]);
});

test("XState keeps a committed behavior until an interrupt is explicitly forced", () => {
  const actor = createActor(botBehaviorMachine);
  actor.start();
  send(actor, "investigate", 1000, 3000, true);
  assert.equal(actor.getSnapshot().value, "investigate");

  send(actor, "hunt", 1500, 3500, false);
  assert.equal(actor.getSnapshot().value, "investigate");

  send(actor, "engage", 1600, 2600, true);
  assert.equal(actor.getSnapshot().value, "engage");
  assert.equal(actor.getSnapshot().context.decision.targetEntityId, "engage-target");
  actor.stop();
});

test("traversal is a first-class state instead of a navigation monkey patch", () => {
  const actor = createActor(botBehaviorMachine);
  actor.start();
  send(actor, "traverse", 1000, 5000, true);
  assert.equal(actor.getSnapshot().value, "traverse");
  send(actor, "evade", 1200, 2200, false);
  assert.equal(actor.getSnapshot().value, "traverse");
  send(actor, "evade", 1300, 2300, true);
  assert.equal(actor.getSnapshot().value, "evade");
  actor.stop();
});

test("rollout starts with exactly one XState canary bot", () => {
  assert.equal(BOT_AI_ROLLOUT.mode, "canary");
  assert.equal(usesXStateBotBrain(BOT_AI_ROLLOUT.canaryBotId), true);
  assert.equal(usesXStateBotBrain("br-bot-94"), BOT_AI_ROLLOUT.canaryBotId === "br-bot-94");
});
