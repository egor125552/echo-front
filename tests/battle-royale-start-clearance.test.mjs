import test from "node:test";
import assert from "node:assert/strict";
import { createEchoFrontGame } from "../src/server/game.js";
import {
  HUMAN_START_CLEARANCE,
  TARGET_PLAYERS,
} from "../src/plugins/battle-royale-bot-fill/server.js";

test("battle royale does not place a fighter immediately beside a joining human", async () => {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  const playerId = "safe-start-human";
  game.api.connectHuman(playerId);

  const snapshot = game.api.snapshot();
  const self = snapshot.entities.find((entity) => entity.id === playerId);
  const bots = snapshot.entities.filter((entity) => entity.bot && entity.alive);

  assert.ok(self);
  assert.equal(snapshot.entities.length, TARGET_PLAYERS);
  assert.equal(bots.length, TARGET_PLAYERS - 1);

  const nearest = Math.min(...bots.map((bot) => Math.hypot(bot.x - self.x, bot.z - self.z)));
  assert.ok(
    nearest >= HUMAN_START_CLEARANCE - 0.001,
    `nearest bot started only ${nearest.toFixed(2)} metres away`,
  );

  await game.host.stop();
});
