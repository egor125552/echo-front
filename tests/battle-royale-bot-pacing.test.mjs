import test from "node:test";
import assert from "node:assert/strict";
import { createEchoFrontGame } from "../src/server/game.js";
import {
  BOT_REACTION_MIN_MS,
  BOT_REACTION_SPREAD_MS,
} from "../src/plugins/battle-royale-bot-combat/server.js";
import { BOT_MAX_START_RADIUS } from "../src/plugins/battle-royale-bot-fill/server.js";
import {
  BUILDING_CENTER_X,
  BUILDING_CENTER_Z,
  STAIR,
  UPPER_FLOOR_Y,
} from "../src/plugins/battle-royale-map/server.js";

async function activeBattleRoyale(playerId) {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  game.api.connectHuman(playerId);
  const deployment = game.api.snapshot().match;
  const now = deployment.deploymentEndsAt + 1;
  game.api.step(0.05, now);
  return { game, now };
}

function keepOneBot(game) {
  const entities = game.host.services.get("entities");
  const bots = entities.all().filter((entity) => entity.bot);
  const hunter = bots[0];
  assert.ok(hunter);
  for (const bot of bots.slice(1)) entities.remove(bot.id);
  return hunter;
}

test("a bot must react to a newly seen enemy before opening fire", async () => {
  const { game, now } = await activeBattleRoyale("pacing-human");
  const hunter = keepOneBot(game);
  const movement = game.host.services.get("movement");
  const botCombat = game.host.services.get("bot-combat");

  movement.teleport(hunter.id, { x: 0, y: 0, z: 0, angle: 0 });
  movement.teleport("pacing-human", { x: 0, y: 0, z: -6, angle: Math.PI });

  const state = game.host.components.get(hunter.id, "Bot");
  state.nextThinkAt = 0;
  botCombat.tick(0.05, now + 100);

  const input = game.host.components.get(hunter.id, "Input");
  assert.equal(input.fireHeld, false, "bot fired on the same think cycle that first saw the target");
  assert.ok(state.reactionUntil >= now + 100 + BOT_REACTION_MIN_MS);
  assert.ok(state.reactionUntil <= now + 100 + BOT_REACTION_MIN_MS + BOT_REACTION_SPREAD_MS);

  state.nextThinkAt = 0;
  botCombat.tick(0.05, state.reactionUntil + 1);
  assert.equal(input.fireHeld, true, "bot never opened fire after its reaction time elapsed");

  await game.host.stop();
});

test("taking damage during a firefight cannot cancel the mandatory pause between bot bursts", async () => {
  const { game, now } = await activeBattleRoyale("burst-pause-human");
  const hunter = keepOneBot(game);
  const movement = game.host.services.get("movement");
  const botCombat = game.host.services.get("bot-combat");

  movement.teleport(hunter.id, { x: 0, y: 0, z: 0, angle: 0 });
  movement.teleport("burst-pause-human", { x: 0, y: 0, z: -6, angle: Math.PI });

  const state = game.host.components.get(hunter.id, "Bot");
  const input = game.host.components.get(hunter.id, "Input");
  state.nextThinkAt = 0;
  botCombat.tick(0.05, now + 100);
  state.nextThinkAt = 0;
  botCombat.tick(0.05, state.reactionUntil + 1);
  assert.equal(input.fireHeld, true);

  const scheduledPauseEnd = state.nextBurstAt;
  const duringPause = state.burstUntil + 1;
  assert.ok(scheduledPauseEnd > duringPause, "test did not create a real burst pause");

  game.host.events.emit("combat:damage", {
    targetId: hunter.id,
    attackerId: "burst-pause-human",
    now: state.burstUntil - 5,
  });
  assert.equal(state.nextBurstAt, scheduledPauseEnd, "taking damage shortened the burst cooldown");

  state.nextThinkAt = 0;
  botCombat.tick(0.05, duringPause);
  assert.equal(input.fireHeld, false, "bot fired during its mandatory burst pause after taking damage");

  await game.host.stop();
});

test("an off-center bot aligns before entering the warehouse stair and reaches the upper floor without repeated ramp resets", async () => {
  const { game, now: start } = await activeBattleRoyale("stair-pacing-human");
  const hunter = keepOneBot(game);
  const movement = game.host.services.get("movement");

  movement.teleport(hunter.id, {
    x: STAIR.maxX + 1.2,
    y: 0,
    z: BUILDING_CENTER_Z + 1.45,
    angle: -Math.PI / 2,
  });
  movement.teleport("stair-pacing-human", {
    x: BUILDING_CENTER_X - 5,
    y: UPPER_FLOOR_Y,
    z: BUILDING_CENTER_Z + 4,
    angle: 0,
  });

  const state = game.host.components.get(hunter.id, "Bot");
  state.lastKnownTargetId = "stair-pacing-human";
  state.lastKnownX = BUILDING_CENTER_X - 5;
  state.lastKnownY = UPPER_FLOOR_Y;
  state.lastKnownZ = BUILDING_CENTER_Z + 4;
  state.lastKnownUntil = start + 20_000;
  state.nextThinkAt = 0;

  let reachedUpper = false;
  let wasOnRamp = false;
  let rampResets = 0;
  for (let step = 1; step <= 160; step += 1) {
    game.api.step(0.05, start + step * 50);
    const transform = game.host.components.get(hunter.id, "Transform");
    if (!transform) break;
    if (transform.y > 0.18) wasOnRamp = true;
    if (wasOnRamp && transform.y < 0.06 && transform.x > STAIR.minX && transform.x < STAIR.maxX + 0.5) {
      rampResets += 1;
      wasOnRamp = false;
    }
    if (transform.y > UPPER_FLOOR_Y - 0.35) {
      reachedUpper = true;
      break;
    }
  }

  const transform = game.host.components.get(hunter.id, "Transform");
  assert.equal(reachedUpper, true, `bot did not reach upper floor: x=${transform?.x}, y=${transform?.y}, z=${transform?.z}`);
  assert.ok(rampResets <= 1, `bot repeatedly fell/reset at the lower stair edge: ${rampResets}`);

  await game.host.stop();
});

test("all initial battle royale bots start inside the compact 325 meter play radius", async () => {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  const entities = game.host.services.get("entities");
  const positions = entities.all()
    .filter((entity) => entity.bot)
    .map((entity) => game.host.components.get(entity.id, "Transform"))
    .filter(Boolean);

  assert.equal(positions.length, 96);
  const radii = positions.map((position) => Math.hypot(position.x, position.z));
  assert.ok(Math.max(...radii) <= BOT_MAX_START_RADIUS + 0.01, `bot started too far away: ${Math.max(...radii)}`);

  let minimumSeparation = Infinity;
  for (let i = 0; i < positions.length; i += 1) {
    for (let j = i + 1; j < positions.length; j += 1) {
      minimumSeparation = Math.min(
        minimumSeparation,
        Math.hypot(positions[i].x - positions[j].x, positions[i].z - positions[j].z),
      );
    }
  }
  assert.ok(minimumSeparation >= 38, `compact starts overlap: ${minimumSeparation}`);

  await game.host.stop();
});

test("the opening 30 seconds no longer erase half of the 96-player lobby", async () => {
  const { game, now: start } = await activeBattleRoyale("opening-pacing-human");

  for (let step = 1; step <= 600; step += 1) {
    game.api.step(0.05, start + step * 50);
  }

  const alive = game.api.snapshot().match.alive;
  assert.ok(alive >= 60, `opening combat is still too lethal: only ${alive} players alive after 30 seconds`);

  await game.host.stop();
});
