import test from "node:test";
import assert from "node:assert/strict";
import { createEchoFrontGame } from "../src/server/game.js";

test("human survives fifteen full pistol hits and dies on the sixteenth", async () => {
  const game = await createEchoFrontGame();
  game.api.connectHuman("human-survivability");

  const combat = game.host.services.get("combat");
  const weapons = game.host.services.get("weapons");
  const protection = game.host.services.get("spawn-protection");
  const pistolDamage = weapons.definitions.pistol.damage;
  protection.clear("human-survivability");

  assert.equal(pistolDamage, 22);

  let self = game.api.snapshot().entities.find((entity) => entity.id === "human-survivability");
  assert.equal(self.health, 200);
  assert.equal(self.armor, 125);

  for (let hit = 1; hit <= 15; hit += 1) {
    combat.damage("human-survivability", pistolDamage, {
      attackerId: "bot-test",
      weaponId: "pistol",
      now: 1000 + hit * 200,
    });
  }

  self = game.api.snapshot().entities.find((entity) => entity.id === "human-survivability");
  assert.equal(self.alive, true);
  assert.equal(self.armor, 0);
  assert.equal(self.health, 2);

  combat.damage("human-survivability", pistolDamage, {
    attackerId: "bot-test",
    weaponId: "pistol",
    now: 4200,
  });

  self = game.api.snapshot().entities.find((entity) => entity.id === "human-survivability");
  assert.equal(self.alive, false);
  assert.equal(self.health, 0);

  await game.host.stop();
});
