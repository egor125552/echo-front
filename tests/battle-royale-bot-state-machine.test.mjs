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
  priority: 3,
  confidence: 1,
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

test("equal-priority gunfire from another source cannot steal committed sound work", async () => {
  const { shouldReplaceCommittedSound } = await import("../src/plugins/battle-royale-bot-state-machine/server.js");
  const current = {
    goal: "investigate",
    target: heardGunshot,
    heardAt: heardGunshot.heardAt,
    investigateUntil: 30_000,
    holdUntil: 30_000,
  };
  const otherGunshot = {
    kind: "sound-interest",
    sourceId: "other-enemy",
    key: "weapon.rifle.fire",
    priority: 3,
    confidence: 1,
    heardAt: 2000,
    x: 90,
    y: 0,
    z: 20,
  };
  const candidate = {
    goal: "investigate",
    target: otherGunshot,
    heardAt: otherGunshot.heardAt,
    investigateUntil: 31_000,
    holdUntil: 31_000,
  };

  assert.equal(shouldReplaceCommittedSound(current, candidate), false);
  assert.deepEqual(
    preserveCommittedSoundWork("investigate", current, candidate, { freshSound: true }, 2100),
    current,
  );
});

test("new sound from the same moving source refreshes its investigation", async () => {
  const { shouldReplaceCommittedSound } = await import("../src/plugins/battle-royale-bot-state-machine/server.js");
  const current = {
    goal: "investigate",
    target: heardGunshot,
    heardAt: heardGunshot.heardAt,
    investigateUntil: 30_000,
    holdUntil: 30_000,
  };
  const moved = {
    ...heardGunshot,
    heardAt: 2500,
    x: 64,
    z: 2,
  };
  const candidate = {
    goal: "investigate",
    target: moved,
    heardAt: moved.heardAt,
    investigateUntil: 32_000,
    holdUntil: 32_000,
  };

  assert.equal(shouldReplaceCommittedSound(current, candidate), true);
  assert.deepEqual(
    preserveCommittedSoundWork("investigate", current, candidate, { freshSound: true }, 2600),
    candidate,
  );
});

test("combat interruption suspends a gunshot investigation and resumes it after danger", async () => {
  const [{ PluginHost }, entitiesPlugin, botControllerPlugin, rolloutPlugin, stateMachinePlugin] = await Promise.all([
    import("../src/core/plugin-host.js"),
    import("../src/plugins/entities/server.js"),
    import("../src/plugins/bot-controller/server.js"),
    import("../src/plugins/battle-royale-bot-rollout/server.js"),
    import("../src/plugins/battle-royale-bot-state-machine/server.js"),
  ]);
  const host = await new PluginHost({
    plugins: [entitiesPlugin, botControllerPlugin, rolloutPlugin, stateMachinePlugin],
  }).start();
  const machine = host.services.get("bot-state-machine");
  const botId = "br-bot-resume-test";

  const investigation = machine.resolve(botId, {
    goal: "investigate",
    target: heardGunshot,
    heardAt: heardGunshot.heardAt,
    investigateUntil: 30_000,
    holdUntil: 30_000,
  }, { now: 1500, force: true, freshSound: true });
  assert.equal(investigation.goal, "investigate");

  const combat = machine.resolve(botId, {
    goal: "engage",
    targetEntityId: "attacker",
    holdUntil: 4000,
  }, { now: 2000, visibleThreat: true });
  assert.equal(combat.goal, "engage");
  assert.equal(machine.suspendedSoundFor(botId, 2100)?.target?.sourceId, "enemy");

  const resumed = machine.resolve(botId, {
    goal: "investigate",
    target: {
      kind: "poi-interest",
      group: "warehouse",
      x: 66,
      y: 0,
      z: 6,
    },
    holdUntil: 5000,
  }, { now: 2600 });

  assert.equal(resumed.goal, "investigate");
  assert.equal(resumed.target?.kind, "sound-interest");
  assert.equal(resumed.target?.sourceId, "enemy");
  assert.equal(machine.suspendedSoundFor(botId, 2700), null);
  await host.stop();
});

test("XState orchestration is enabled for every BR bot", () => {
  assert.equal(BOT_AI_ROLLOUT.mode, "all");
  assert.equal(usesXStateBotBrain(BOT_AI_ROLLOUT.canaryBotId), true);
  assert.equal(usesXStateBotBrain("br-bot-94"), true);
  assert.equal(usesXStateBotBrain("br-bot-2"), true);
  assert.equal(usesXStateBotBrain("br-bot-57"), true);
});
