import test from "node:test";
import assert from "node:assert/strict";
import { createEchoFrontGame } from "../src/server/game.js";

test("human survives twelve full pistol hits and dies on the thirteenth", async () => {
  const game = await createEchoFrontGame();
  game.api.connectHuman("human-survivability");

  const combat = game.host.services.get("combat");
  const protection = game.host.services.get("spawn-protection");
  protection.clear("human-survivability");

  let self = game.api.snapshot().entities.find((entity) => entity.id === "human-survivability");
  assert.equal(self.health, 200);
  assert.equal(self.armor, 125);

  for (let hit = 1; hit <= 12; hit += 1) {
    combat.damage("human-survivability", 28, {
      attackerId: "bot-test",
      weaponId: "pistol",
      now: 1000 + hit * 200,
    });
  }

  self = game.api.snapshot().entities.find((entity) => entity.id === "human-survivability");
  assert.equal(self.alive, true);
  assert.equal(self.armor, 0);
  assert.equal(self.health, 4);

  combat.damage("human-survivability", 28, {
    attackerId: "bot-test",
    weaponId: "pistol",
    now: 3600,
  });

  self = game.api.snapshot().entities.find((entity) => entity.id === "human-survivability");
  assert.equal(self.alive, false);
  assert.equal(self.health, 0);

  await game.host.stop();
});
