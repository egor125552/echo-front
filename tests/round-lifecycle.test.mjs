import test from "node:test";
import assert from "node:assert/strict";
import { createEchoFrontGame } from "../src/server/game.js";

function forceRoundEnd(game, killerId, victimId) {
  for (let i = 0; i < 10; i += 1) {
    game.host.events.emit("entity:died", { entityId: victimId, killerId, weaponId: "pistol" });
  }
}

test("intermission freezes respawns and the next round starts everyone fresh", async () => {
  const game = await createEchoFrontGame();
  game.api.connectHuman("round-human");

  let snapshot = game.api.snapshot();
  const self = snapshot.entities.find((entity) => entity.id === "round-human");
  const enemy = snapshot.entities.find((entity) => entity.bot && entity.team !== self.team);
  assert.ok(enemy);

  const health = game.host.components.get(self.id, "Health");
  const armor = game.host.components.get(self.id, "Armor");
  const inventory = game.host.components.get(self.id, "Weapons");
  health.current = 23;
  armor.current = 7;
  inventory.items[0].ammo = 3;
  inventory.items[0].reserve = 11;
  game.api.handleInput(self.id, { fireHeld: true }, Date.now());

  forceRoundEnd(game, self.id, enemy.id);
  const intermission = game.api.snapshot().match;
  assert.equal(intermission.ended, true);

  const entities = game.host.services.get("entities");
  entities.setAlive(enemy.id, false);
  game.host.events.emit("entity:died", { entityId: enemy.id, killerId: self.id, weaponId: "pistol" });
  game.api.step(0.1, intermission.restartAt - 100);
  assert.equal(entities.get(enemy.id).alive, false, "dead fighters must not respawn during intermission");

  game.api.handleInput(self.id, { fireHeld: false }, intermission.restartAt - 50);
  game.drainEvents();
  game.api.step(0.1, intermission.restartAt + 1);

  snapshot = game.api.snapshot(intermission.restartAt + 1);
  const freshSelf = snapshot.entities.find((entity) => entity.id === self.id);
  const freshEnemy = snapshot.entities.find((entity) => entity.id === enemy.id);
  assert.equal(snapshot.match.roundNumber, 2);
  assert.equal(snapshot.match.ended, false);
  assert.equal(freshSelf.health, freshSelf.healthMax);
  assert.equal(freshSelf.armor, freshSelf.armorMax);
  assert.equal(freshSelf.ammo, 100);
  assert.equal(freshSelf.reserve, 400);
  assert.equal(freshEnemy.alive, true);
  assert.notDeepEqual(
    { x: freshSelf.x, z: freshSelf.z },
    { x: self.x, z: self.z },
    "new round should place the human on a fresh team spawn",
  );

  const protection = game.host.services.get("spawn-protection");
  assert.equal(protection.isProtected(self.id), true, "spawn protection should begin with the new round");

  const phantomShots = game.drainEvents().filter(
    (packet) => packet.event === "weapon:fired" && packet.payload.entityId === self.id,
  );
  assert.equal(phantomShots.length, 0, "a released fire key must not create a phantom opening shot");

  await game.host.stop();
});
