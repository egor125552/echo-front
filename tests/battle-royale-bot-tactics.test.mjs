import test from "node:test";
import assert from "node:assert/strict";
import { createEchoFrontGame } from "../src/server/game.js";
import { BOT_AI_ROLLOUT } from "../src/plugins/battle-royale-bot-rollout/server.js";

async function activeBattleRoyale(playerId) {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  game.api.connectHuman(playerId);
  const deployment = game.api.snapshot().match;
  const now = deployment.deploymentEndsAt + 1;
  game.api.step(0.05, now);
  return { game, now };
}

function keepBot(game, botId) {
  const entities = game.host.services.get("entities");
  const hunter = entities.get(botId);
  assert.ok(hunter?.bot, `missing BR bot ${botId}`);
  for (const bot of entities.all().filter((entity) => entity.bot)) {
    if (bot.id !== hunter.id) entities.remove(bot.id);
  }
  return hunter;
}

function keepCanaryBot(game) {
  return keepBot(game, BOT_AI_ROLLOUT.canaryBotId);
}

test("a visible attacker cannot shoot the XState BR bot repeatedly without provoking return fire", async () => {
  const { game, now } = await activeBattleRoyale("tactical-return-fire-human");
  const hunter = keepCanaryBot(game);
  const movement = game.host.services.get("movement");
  const botCombat = game.host.services.get("bot-combat");
  const brain = game.host.services.get("bot-brain");

  movement.teleport(hunter.id, { x: 0, y: 0, z: 0, angle: 0 });
  movement.teleport("tactical-return-fire-human", { x: 0, y: 0, z: -9, angle: Math.PI });

  game.host.events.emit("combat:damage", {
    targetId: hunter.id,
    attackerId: "tactical-return-fire-human",
    now: now + 100,
  });

  const state = game.host.components.get(hunter.id, "Bot");
  const input = game.host.components.get(hunter.id, "Input");
  let fired = false;
  let sawDefend = false;
  for (let offset = 150; offset <= 1_200; offset += 50) {
    state.nextThinkAt = 0;
    botCombat.tick(0.05, now + offset);
    sawDefend ||= brain.stateFor(hunter.id).machineState === "defend";
    if (input.fireHeld) {
      fired = true;
      break;
    }
  }

  assert.equal(sawDefend, true, "damage never interrupted the state machine into defend");
  assert.equal(fired, true, "XState bot stayed passive after being hit by a visible attacker");
  await game.host.stop();
});

test("after reaching heard footsteps the XState bot enters a bounded search instead of instantly roaming", async () => {
  const { game, now } = await activeBattleRoyale("tactical-search-human");
  const hunter = keepCanaryBot(game);
  const movement = game.host.services.get("movement");
  const brain = game.host.services.get("bot-brain");

  movement.teleport(hunter.id, { x: 0, y: 0, z: 0, angle: 0 });
  const sound = {
    kind: "sound-interest",
    sourceId: "tactical-search-human",
    key: "footstep.forest.1",
    gait: "walk",
    priority: 1,
    confidence: 4,
    heardAt: now + 100,
    expiresAt: now + 7_000,
    x: 30,
    y: 0,
    z: 0,
  };

  const investigate = brain.decide(hunter.id, {
    visibleEnemies: [],
    memory: null,
    zoneTarget: null,
    interestTarget: sound,
  }, now + 150);
  assert.equal(investigate.orchestration, "xstate");
  assert.equal(investigate.goal, "investigate");

  movement.teleport(hunter.id, { x: 30, y: 0, z: 0, angle: 0 });
  const search = brain.decide(hunter.id, {
    visibleEnemies: [],
    memory: null,
    zoneTarget: null,
    interestTarget: null,
    investigationReached: true,
  }, now + 400);

  assert.equal(search.goal, "search");
  assert.equal(brain.stateFor(hunter.id).machineState, "search");
  assert.ok(search.searchPoints.length >= 5);
  assert.ok(
    Math.hypot(search.target.x - 30, search.target.z) >= 4,
    "search never expanded beyond the last heard coordinate",
  );

  const continued = brain.decide(hunter.id, {
    visibleEnemies: [],
    memory: null,
    zoneTarget: null,
    interestTarget: null,
  }, now + 1_000);
  assert.equal(continued.goal, "search");
  assert.equal(continued.searchOrigin.sourceId, "tactical-search-human");

  await game.host.stop();
});

test("a slow warehouse traversal carries the heard gunshot into investigate and search after hearing TTL expires", async () => {
  const { game, now } = await activeBattleRoyale("tactical-traverse-human");
  const hunter = keepCanaryBot(game);
  const movement = game.host.services.get("movement");
  const brain = game.host.services.get("bot-brain");

  movement.teleport(hunter.id, { x: 80, y: 0, z: 0, angle: -Math.PI / 2 });
  const sound = {
    kind: "sound-interest",
    sourceId: "tactical-traverse-human",
    key: "weapon.pistol.fire",
    priority: 3,
    confidence: 1,
    heardAt: now + 100,
    expiresAt: now + 8_100,
    x: 60,
    y: 3.2,
    z: 0,
  };

  const traverse = brain.decide(hunter.id, {
    visibleEnemies: [],
    memory: null,
    zoneTarget: null,
    interestTarget: sound,
    traversal: {
      active: true,
      route: { x: 73.7, y: 0, z: 0, kind: "door", doorId: "warehouse-front-door" },
      target: sound,
    },
  }, now + 150);
  assert.equal(traverse.goal, "traverse");
  assert.equal(traverse.resumeGoal, "investigate");
  assert.equal(traverse.resumeTarget.sourceId, "tactical-traverse-human");

  movement.teleport(hunter.id, { x: 66, y: 3.2, z: 0, angle: Math.PI / 2 });
  const resumed = brain.decide(hunter.id, {
    visibleEnemies: [],
    memory: null,
    zoneTarget: null,
    interestTarget: null,
    traversal: null,
  }, now + 9_500);
  assert.equal(resumed.goal, "investigate");
  assert.equal(resumed.target.sourceId, "tactical-traverse-human");

  movement.teleport(hunter.id, { x: 60, y: 3.2, z: 0, angle: Math.PI / 2 });
  const searched = brain.decide(hunter.id, {
    visibleEnemies: [],
    memory: null,
    zoneTarget: null,
    interestTarget: null,
    traversal: null,
    investigationReached: true,
  }, now + 9_800);
  assert.equal(searched.goal, "search");
  assert.ok(searched.searchPoints.some((point) => point.y === 3.2));
  assert.ok(searched.searchPoints.some((point) => point.y === 0));

  await game.host.stop();
});

test("an ordinary non-canary BR bot now keeps XState investigate and search state", async () => {
  const { game, now } = await activeBattleRoyale("ordinary-xstate-human");
  const hunter = keepBot(game, "br-bot-2");
  const movement = game.host.services.get("movement");
  const brain = game.host.services.get("bot-brain");

  movement.teleport(hunter.id, { x: 0, y: 0, z: 0, angle: 0 });
  const sound = {
    kind: "sound-interest",
    sourceId: "ordinary-xstate-human",
    key: "footstep.forest.2",
    gait: "run",
    priority: 1.35,
    confidence: 3,
    heardAt: now + 100,
    expiresAt: now + 7_000,
    x: 20,
    y: 0,
    z: 0,
  };

  const investigate = brain.decide(hunter.id, {
    visibleEnemies: [],
    memory: null,
    zoneTarget: null,
    interestTarget: sound,
  }, now + 150);
  assert.equal(investigate.orchestration, "xstate");
  assert.equal(investigate.goal, "investigate");

  movement.teleport(hunter.id, { x: 20, y: 0, z: 0, angle: 0 });
  const search = brain.decide(hunter.id, {
    visibleEnemies: [],
    memory: null,
    zoneTarget: null,
    interestTarget: null,
    investigationReached: true,
  }, now + 450);

  assert.equal(search.goal, "search");
  assert.equal(brain.stateFor(hunter.id).orchestration, "xstate");
  assert.equal(brain.stateFor(hunter.id).machineState, "search");
  assert.ok(search.searchPoints.length >= 5);

  await game.host.stop();
});

test("an ordinary BR bot physically enters the warehouse and searches after the gunshot source leaves", async () => {
  const { game, now } = await activeBattleRoyale("warehouse-search-runtime-human");
  const hunter = keepBot(game, "br-bot-2");
  const movement = game.host.services.get("movement");
  const grid = game.host.services.get("spatial-grid");
  const brain = game.host.services.get("bot-brain");

  movement.teleport(hunter.id, { x: 80, y: 0, z: 0, angle: -Math.PI / 2 });
  movement.teleport("warehouse-search-runtime-human", { x: 60, y: 3.2, z: 0, angle: Math.PI / 2 });
  grid.rebuild(now + 100);
  game.host.events.emit("sound:spatial", {
    entityId: "warehouse-search-runtime-human",
    key: "weapon.pistol.fire",
    radius: 110,
    x: 60,
    y: 3.2,
    z: 0,
    now: now + 100,
  });
  movement.teleport("warehouse-search-runtime-human", { x: -300, y: 0, z: -300, angle: 0 });

  let sawTraverse = false;
  let sawInvestigate = false;
  let sawSearch = false;
  let reachedUpper = false;
  for (let step = 1; step <= 320; step += 1) {
    const simulationNow = now + 100 + step * 50;
    game.api.step(0.05, simulationNow);
    const machineState = brain.stateFor(hunter.id).machineState;
    sawTraverse ||= machineState === "traverse";
    sawInvestigate ||= machineState === "investigate";
    sawSearch ||= machineState === "search";
    const transform = game.host.components.get(hunter.id, "Transform");
    reachedUpper ||= Number(transform?.y) > 2.8;
    if (sawSearch && reachedUpper) break;
  }

  const finalState = brain.stateFor(hunter.id);
  const transform = game.host.components.get(hunter.id, "Transform");
  assert.equal(sawTraverse, true, "bot never committed to entering the warehouse");
  assert.equal(reachedUpper, true, `bot never physically reached the upper floor: ${JSON.stringify(transform)}`);
  assert.equal(sawInvestigate, true, "bot never resumed the heard gunshot investigation after traversal");
  assert.equal(sawSearch, true, `bot abandoned the empty warehouse instead of searching: ${JSON.stringify(finalState)}`);

  await game.host.stop();
});