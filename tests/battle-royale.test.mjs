import test from "node:test";
import assert from "node:assert/strict";
import { createEchoFrontGame } from "../src/server/game.js";
import { TARGET_PLAYERS } from "../src/plugins/battle-royale-bot-fill/server.js";
import {
  PLAYER_SPAWN_CLEARANCE,
  UPPER_FLOOR_Y,
} from "../src/plugins/battle-royale-map/server.js";

async function activeGame(playerId = "br-human") {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  game.api.connectHuman(playerId);
  const deploying = game.api.snapshot().match;
  game.api.step(0.05, deploying.deploymentEndsAt + 1);
  return game;
}

test("battle royale keeps 96 participants when a human replaces one bot", async () => {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  assert.equal(game.mode, "battle-royale");
  assert.equal(game.api.snapshot().entities.length, TARGET_PLAYERS);
  const joined = game.api.connectHuman("br-human-count");
  assert.equal(joined.mode, "battle-royale");
  const snapshot = game.api.snapshot();
  assert.equal(snapshot.entities.length, TARGET_PLAYERS);
  assert.equal(snapshot.entities.filter((entity) => entity.bot).length, TARGET_PLAYERS - 1);
  assert.equal(new Set(snapshot.entities.map((entity) => entity.team)).size, TARGET_PLAYERS);
  assert.equal(snapshot.match.phase, "deploying");
  await game.host.stop();
});

test("opening spawn does not place an enemy beside the human", async () => {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  const playerId = "br-human-clearance";
  game.api.connectHuman(playerId);
  const snapshot = game.api.snapshot();
  const self = snapshot.entities.find((entity) => entity.id === playerId);
  const nearestBot = Math.min(...snapshot.entities
    .filter((entity) => entity.bot && entity.alive)
    .map((entity) => Math.hypot(entity.x - self.x, entity.z - self.z)));
  assert.ok(nearestBot >= PLAYER_SPAWN_CLEARANCE);
  await game.host.stop();
});

test("deployment freezes play, then transitions to one-life active combat", async () => {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  game.api.connectHuman("br-human-life");
  const deployment = game.api.snapshot().match;
  assert.ok(deployment.deploymentEndsAt > 0);
  game.api.step(0.05, deployment.deploymentEndsAt + 1);
  assert.equal(game.api.snapshot(deployment.deploymentEndsAt + 1).match.phase, "active");

  const health = game.host.services.get("health");
  health.applyDamage("br-human-life", 9999, { now: deployment.deploymentEndsAt + 2 });
  assert.equal(game.api.snapshot().entities.find((entity) => entity.id === "br-human-life").alive, false);
  game.api.step(0.05, deployment.deploymentEndsAt + 6000);
  assert.equal(game.api.snapshot().entities.find((entity) => entity.id === "br-human-life").alive, false);
  const ids = game.host.plugins.map((plugin) => plugin.manifest.id);
  assert.ok(!ids.includes("respawn"));
  assert.ok(!ids.includes("team-deathmatch"));
  await game.host.stop();
});

test("per-player snapshots use interest management instead of sending all 96 entities", async () => {
  const game = await activeGame("br-human-interest");
  const full = game.api.snapshot();
  const personal = game.api.snapshotFor("br-human-interest");
  assert.equal(full.entities.length, TARGET_PLAYERS);
  assert.ok(personal.entities.some((entity) => entity.id === "br-human-interest"));
  assert.ok(personal.entities.length < full.entities.length);
  assert.equal(game.api.snapshotIntervalMs, 125);
  await game.host.stop();
});

test("warehouse front door toggles and a crate can grant the rifle", async () => {
  const game = await activeGame("br-human-loot");
  const movement = game.host.services.get("movement");
  const map = game.host.services.get("map");
  const frontDoor = map.doors.find((door) => door.id === "warehouse-front-door");
  const rifleCrate = map.crates.find((crate) => crate.id === "crate-ground-rifle");

  movement.teleport("br-human-loot", {
    x: frontDoor.x + 1.4,
    y: frontDoor.y,
    z: frontDoor.z,
    angle: -Math.PI / 2,
  });
  game.api.handleInput("br-human-loot", { interactPressed: true }, Date.now());
  assert.equal(frontDoor.open, true);

  movement.teleport("br-human-loot", {
    x: rifleCrate.x,
    y: rifleCrate.y,
    z: rifleCrate.z,
    angle: 0,
  });
  game.api.handleInput("br-human-loot", { interactPressed: true }, Date.now() + 1);
  const self = game.api.snapshot().entities.find((entity) => entity.id === "br-human-loot");
  assert.ok(self.weapons.includes("rifle"));

  movement.teleport("br-human-loot", {
    x: map.building.minX + 5,
    y: UPPER_FLOOR_Y,
    z: (map.building.minZ + map.building.maxZ) / 2,
    angle: 0,
  });
  assert.equal(game.api.snapshot().entities.find((entity) => entity.id === "br-human-loot").y, UPPER_FLOOR_Y);
  await game.host.stop();
});

test("eliminated human gets a placement and spectator target without respawn", async () => {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  const playerId = "spectator-human";
  game.api.connectHuman(playerId);
  const deployment = game.api.snapshot().match;
  game.api.step(0.05, deployment.deploymentEndsAt + 1);
  const health = game.host.services.get("health");
  health.applyDamage(playerId, 9999, { attackerId: null, weaponId: "test" });
  const snapshot = game.api.snapshotFor(playerId, deployment.deploymentEndsAt + 2);
  const self = snapshot.entities.find((entity) => entity.id === playerId);
  assert.equal(self?.alive, false);
  assert.ok(snapshot.spectator?.active);
  assert.ok(snapshot.spectator?.targetId);
  assert.equal(snapshot.playerPlacement, snapshot.match.alive + 1);
  assert.ok(snapshot.entities.some((entity) => entity.id === snapshot.spectator.targetId));
  await game.host.stop();
});
