import test from "node:test";
import assert from "node:assert/strict";
import { createEchoFrontGame } from "../src/server/game.js";

async function activeBattleRoyale(playerId) {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  game.api.connectHuman(playerId);
  const deployment = game.api.snapshot().match;
  const now = deployment.deploymentEndsAt + 1;
  game.api.step(0.05, now);
  return { game, now };
}

function keepTwoBots(game) {
  const entities = game.host.services.get("entities");
  const bots = entities.all().filter((entity) => entity.bot);
  assert.ok(bots.length >= 2);
  for (const bot of bots.slice(2)) entities.remove(bot.id);
  return bots.slice(0, 2);
}

test("fresh repeated player footsteps override stale unseen memory and trigger investigation", async () => {
  const { game, now: start } = await activeBattleRoyale("hearing-regression-human");
  const [listener, staleTarget] = keepTwoBots(game);
  const movement = game.host.services.get("movement");
  const grid = game.host.services.get("spatial-grid");
  const interest = game.host.services.get("bot-interest");
  const combat = game.host.services.get("bot-combat");
  const brain = game.host.services.get("bot-brain");

  movement.teleport(listener.id, { x: 0, y: 0, z: 0, angle: 0 });
  movement.teleport("hearing-regression-human", { x: 30, y: 0, z: 0, angle: 0 });
  movement.teleport(staleTarget.id, { x: -120, y: 0, z: 120, angle: 0 });

  const state = game.host.components.get(listener.id, "Bot");
  state.lastKnownTargetId = staleTarget.id;
  state.lastKnownX = -120;
  state.lastKnownY = 0;
  state.lastKnownZ = 120;
  state.lastKnownUntil = start + 20_000;
  state.nextThinkAt = 0;

  grid.rebuild(start + 100);
  for (let step = 0; step < 4; step += 1) {
    interest.recordSound({
      entityId: "hearing-regression-human",
      key: `footstep.forest.${(step % 3) + 1}`,
      gait: "walk",
      x: 30,
      y: 0,
      z: 0,
      radius: 32,
    }, start + 200 + step * 800);
  }

  combat.tick(0.05, start + 2_700);

  const heard = interest.heardFor(listener.id);
  const decision = brain.commitmentFor(listener.id);
  assert.equal(heard?.sourceId, "hearing-regression-human");
  assert.equal(heard?.confidence, 4);
  assert.equal(decision?.goal, "investigate", `expected fresh footstep investigation, got ${JSON.stringify(decision)}`);
  assert.equal(decision?.target?.sourceId, "hearing-regression-human");

  await game.host.stop();
});
