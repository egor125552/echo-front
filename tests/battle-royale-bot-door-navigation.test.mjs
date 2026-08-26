import test from "node:test";
import assert from "node:assert/strict";
import { createEchoFrontGame } from "../src/server/game.js";

test("a Battle Royale bot opens a closed door instead of obstacle-avoiding beside it", async () => {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  const navigation = game.host.services.get("bot-navigation");
  const movement = game.host.services.get("movement");
  const map = game.host.services.get("map");
  const bot = game.api.snapshot().entities.find((entity) => entity.bot);
  assert.ok(bot);

  const door = map.doors.find((entry) => entry.id === "warehouse-front-door");
  assert.ok(door);
  assert.equal(door.open, false);

  movement.teleport(bot.id, { x: 76.9, y: 0, z: 0, angle: -Math.PI / 2 });
  const transform = game.host.components.get(bot.id, "Transform");
  const botState = game.host.components.get(bot.id, "Bot");

  navigation.avoid(
    bot.id,
    transform,
    botState,
    { forward: 1, strafe: 0, turn: 0, sprint: false, fireHeld: false },
    1000,
  );

  assert.equal(door.open, true, "bot should open the door when its movement path reaches it");
  await game.host.stop();
});
