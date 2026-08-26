import test from "node:test";
import assert from "node:assert/strict";
import { createEchoFrontGame } from "../src/server/game.js";
import { BOT_AI_ROLLOUT } from "../src/config/bot-ai-rollout.js";

async function activeBattleRoyale(playerId) {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  game.api.connectHuman(playerId);
  const deployment = game.api.snapshot().match;
  const now = deployment.deploymentEndsAt + 1;
  game.api.step(0.05, now);
  return { game, now };
}

function keepCanaryBot(game) {
  const entities = game.host.services.get("entities");
  const hunter = entities.get(BOT_AI_ROLLOUT.canaryBotId);
  assert.ok(hunter?.bot, `missing XState canary ${BOT_AI_ROLLOUT.canaryBotId}`);
  for (const bot of entities.all().filter((entity) => entity.bot)) {
    if (bot.id !== hunter.id) entities.remove(bot.id);
  }
  return hunter;
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
