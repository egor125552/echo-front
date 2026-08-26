import test from "node:test";
import assert from "node:assert/strict";
import { createActor } from "xstate";
import {
  BOT_BEHAVIOR_STATES,
  botBehaviorMachine,
  preserveCommittedSoundWork,
} from "../src/plugins/battle-royale-bot-state-machine/server.js";
import {
  BOT_AI_ROLLOUT,
  usesXStateBotBrain,
} from "../src/plugins/battle-royale-bot-rollout/server.js";

function send(actor, goal, now, holdUntil = now + 1000, force = false) {
  actor.send({
    type: `SELECT_${goal.toUpperCase()}`,
    now,
    force,
    decision: { goal, holdUntil, targetEntityId: `${goal}-target` },
  });
}

const heardGunshot = Object.freeze({
  kind: "sound-interest",
  sourceId: "enemy",
  key: "weapon.pistol.fire",
  heardAt: 1000,
  x: 60,
  y: 3.2,
  z: 0,
});

const casualPoiTraversal = Object.freeze({
  goal: "traverse",
  target: {
    kind: "poi-interest",
    group: "warehouse",
    pointId: "warehouse-ground-east",
    x: 66,
    y: 0,
    z: 6.72,
  },
  route: { kind: "stair", x: 73.5, y: 0, z: 0 },
});

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

test("a casual warehouse POI cannot steal a traversing gunshot investigation", () => {
  const current = {
    goal: "traverse",
    target: heardGunshot,
    route: { kind: "stair", x: 66.5, y: 3.2, z: 0 },
    resumeGoal: "investigate",
    resumeTarget: heardGunshot,
    resumeHeardAt: heardGunshot.heardAt,
    holdUntil: 4000,
  };

  const protectedDecision = preserveCommittedSoundWork(
    "traverse",
    current,
    casualPoiTraversal,
    {},
    2500,
  );

  assert.equal(protectedDecision.goal, "investigate");
  assert.equal(protectedDecision.target, heardGunshot);
  assert.equal(protectedDecision.heardAt, heardGunshot.heardAt);
});

test("a casual traversal cannot interrupt an unfinished sound investigation", () => {
  const current = {
    goal: "investigate",
    target: heardGunshot,
    heardAt: heardGunshot.heardAt,
    holdUntil: 4000,
  };
  const protectedDecision = preserveCommittedSoundWork(
    "investigate",
    current,
    casualPoiTraversal,
    {},
    2500,
  );
  assert.deepEqual(protectedDecision, current);
});

test("warehouse floor changes cannot discard an active bounded sound search", () => {
  const current = {
    goal: "search",
    searchOrigin: heardGunshot,
    searchPoints: [
      { x: 60, y: 3.2, z: 5 },
      { x: 65, y: 0, z: -5 },
    ],
    searchIndex: 1,
    searchUntil: 20_000,
    target: { x: 65, y: 0, z: -5 },
    holdUntil: 20_000,
  };
  const navigationCandidate = {
    goal: "traverse",
    target: current.target,
    route: { kind: "stair", x: 73.5, y: 0, z: 0 },
  };
  const protectedDecision = preserveCommittedSoundWork(
    "search",
    current,
    navigationCandidate,
    {},
    6000,
  );
  assert.deepEqual(protectedDecision, current);
});

test("real danger still interrupts protected sound work", () => {
  const current = {
    goal: "search",
    searchOrigin: heardGunshot,
    searchPoints: [{ x: 60, y: 3.2, z: 5 }],
    searchIndex: 0,
    searchUntil: 20_000,
    target: { x: 60, y: 3.2, z: 5 },
    holdUntil: 20_000,
  };
  const urgentTraversal = {
    goal: "traverse",
    target: { x: 70, y: 0, z: 0 },
    route: { kind: "door", x: 73.7, y: 0, z: 0 },
  };
  assert.equal(
    preserveCommittedSoundWork("search", current, urgentTraversal, { visibleThreat: true }, 6000),
    urgentTraversal,
  );
});

test("XState orchestration is enabled for every BR bot", () => {
  assert.equal(BOT_AI_ROLLOUT.mode, "all");
  assert.equal(usesXStateBotBrain(BOT_AI_ROLLOUT.canaryBotId), true);
  assert.equal(usesXStateBotBrain("br-bot-94"), true);
  assert.equal(usesXStateBotBrain("br-bot-2"), true);
  assert.equal(usesXStateBotBrain("br-bot-57"), true);
});