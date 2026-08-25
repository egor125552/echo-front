import test from "node:test";
import assert from "node:assert/strict";
import { createEchoFrontGame } from "../src/server/game.js";
import { PLATING_DURATION_MS } from "../src/plugins/armor/server.js";

async function activeGame(playerId) {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  game.api.connectHuman(playerId);
  const deployment = game.api.snapshot().match;
  const activeAt = deployment.deploymentEndsAt + 1;
  game.api.step(0.05, activeAt);
  return { game, activeAt };
}

test("battle royale armor crate adds a carried plate instead of repairing equipped armor", async () => {
  const playerId = "br-armor-loot";
  const { game, activeAt } = await activeGame(playerId);
  const movement = game.host.services.get("movement");
  const map = game.host.services.get("map");
  const armorService = game.host.services.get("armor");
  const crate = map.crates.find((item) => item.id === "crate-ground-armor");
  assert.ok(crate);

  let self = game.api.snapshotFor(playerId, activeAt).entities.find((entity) => entity.id === playerId);
  assert.equal(self.armor, 100);
  assert.equal(self.armorMax, 150);
  assert.equal(self.armorPlates, 2);
  assert.equal(self.armorPlateMax, 3);
  assert.equal(self.armorReserve, 0);
  assert.equal(self.armorReserveMax, 5);

  movement.teleport(playerId, {
    x: crate.x,
    y: crate.y,
    z: crate.z,
    angle: 0,
  });
  game.api.handleInput(playerId, { interactPressed: true }, activeAt + 10);

  self = game.api.snapshotFor(playerId, activeAt + 11).entities.find((entity) => entity.id === playerId);
  assert.equal(crate.opened, true);
  assert.equal(self.armor, 100, "picking up a plate must not repair worn armor automatically");
  assert.equal(self.armorReserve, 1);

  const armor = game.host.components.get(playerId, "Armor");
  armor.current = 50;
  assert.equal(armorService.startPlating(playerId, activeAt + 20), true);
  armorService.tick(activeAt + 20 + PLATING_DURATION_MS);

  self = game.api.snapshotFor(playerId, activeAt + 20 + PLATING_DURATION_MS).entities.find((entity) => entity.id === playerId);
  assert.equal(self.armor, 100);
  assert.equal(self.armorPlates, 2);
  assert.equal(self.armorReserve, 0);
  assert.equal(armorService.startPlating(playerId, activeAt + 2000), false, "no carried plates means no further plating");

  await game.host.stop();
});
