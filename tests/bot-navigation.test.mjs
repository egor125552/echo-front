import test from "node:test";
import assert from "node:assert/strict";
import { createEchoFrontGame } from "../src/server/game.js";
import { applyBotObstacleAvoidance } from "../src/plugins/bot-combat/server.js";

test("bot avoidance steers away instead of repeatedly pushing into an arena wall", async () => {
  const game = await createEchoFrontGame();
  const physics = game.host.services.get("physics");
  const movement = game.host.services.get("movement");
  const bot = game.api.snapshot().entities.find((entity) => entity.bot);
  assert.ok(bot);

  movement.teleport(bot.id, { x: 9, z: 7.8, angle: Math.PI });
  const transform = game.host.components.get(bot.id, "Transform");
  const botState = game.host.components.get(bot.id, "Bot");
  const start = { x: transform.x, z: transform.z };

  let now = 1000;
  for (let step = 0; step < 10; step += 1) {
    const input = applyBotObstacleAvoidance(
      physics,
      bot.id,
      transform,
      botState,
      { forward: 0.5, strafe: 0, turn: 0, sprint: false, fireHeld: false },
      now,
    );
    movement.setInput(bot.id, input);
    movement.tick(0.1);
    now += 100;
  }

  const travelled = Math.hypot(transform.x - start.x, transform.z - start.z);
  assert.ok(travelled > 0.45, `bot should escape along the wall, travelled ${travelled}`);
  assert.ok(Math.abs(transform.x - start.x) > 0.35, "bot should take a lateral detour around the obstacle");
  assert.ok(transform.z < 8.0, "bot should not keep hammering into the wall in front of it");

  await game.host.stop();
});
