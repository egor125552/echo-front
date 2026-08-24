import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createEchoFrontGame } from "../src/server/game.js";
import {
  RECONNECT_DELAYS_MS,
  isPlayerSessionId,
  reconnectDelayForAttempt,
} from "../client/plugins/network.js";

test("same player session resumes without resetting match state", async () => {
  const game = await createEchoFrontGame();
  const playerId = "123e4567-e89b-42d3-a456-426614174000";

  const firstJoin = game.api.connectHuman(playerId);
  assert.equal(firstJoin.resumed, false);

  const movement = game.host.services.get("movement");
  const weapons = game.host.services.get("weapons");
  movement.teleport(playerId, { x: 12, z: -8, angle: 0.75 });
  movement.setInput(playerId, { forward: 1, strafe: 1, turn: 1, sprint: true, fireHeld: true });

  game.host.components.get(playerId, "Health").current = 73;
  game.host.components.get(playerId, "Armor").current = 44;
  weapons.grant(playerId, "rifle");
  const inventory = game.host.components.get(playerId, "Weapons");
  inventory.selected = inventory.items.findIndex((item) => item.id === "rifle");
  inventory.items[inventory.selected].ammo = 7;
  inventory.items[inventory.selected].reserve = 19;

  assert.equal(game.api.suspendHuman(playerId), true);
  assert.deepEqual(game.host.components.get(playerId, "Input"), {
    forward: 0,
    strafe: 0,
    turn: 0,
    sprint: false,
    fireHeld: false,
  });

  const resumed = game.api.connectHuman(playerId);
  assert.equal(resumed.resumed, true);
  assert.equal(resumed.team, firstJoin.team);

  const self = game.api.snapshot().entities.find((entity) => entity.id === playerId);
  assert.ok(self);
  assert.equal(self.team, firstJoin.team);
  assert.equal(self.x, 12);
  assert.equal(self.z, -8);
  assert.equal(self.angle, 0.75);
  assert.equal(self.health, 73);
  assert.equal(self.armor, 44);
  assert.equal(self.weapon, "rifle");
  assert.deepEqual(self.weapons, ["pistol", "rifle"]);
  assert.equal(self.ammo, 7);
  assert.equal(self.reserve, 19);

  game.api.disconnectHuman(playerId);
  assert.equal(game.api.snapshot().entities.some((entity) => entity.id === playerId), false);

  await game.host.stop();
});

test("client reconnect keeps one tab session and bounded backoff", async () => {
  const sessionId = "123e4567-e89b-42d3-a456-426614174000";
  assert.equal(isPlayerSessionId(sessionId), true);
  assert.equal(isPlayerSessionId("garbage"), false);
  assert.deepEqual(RECONNECT_DELAYS_MS, [500, 1000, 2000, 3000, 5000]);
  assert.equal(reconnectDelayForAttempt(1), 500);
  assert.equal(reconnectDelayForAttempt(3), 2000);
  assert.equal(reconnectDelayForAttempt(99), 5000);

  const sourceNetwork = await readFile(new URL("../client/plugins/network.js", import.meta.url), "utf8");
  const publicNetwork = await readFile(new URL("../public/client/plugins/network.js", import.meta.url), "utf8");
  const matchRoom = await readFile(new URL("../src/server/match-room.js", import.meta.url), "utf8");
  const lowHealth = await readFile(new URL("../client/plugins/low-health-audio.js", import.meta.url), "utf8");

  assert.equal(publicNetwork, sourceNetwork);
  assert.match(sourceNetwork, /sessionStorage\.getItem\(SESSION_STORAGE_KEY\)/);
  assert.match(sourceNetwork, /&player=\$\{encodeURIComponent\(sessionId\)\}/);
  assert.match(sourceNetwork, /network:reconnecting/);
  assert.match(sourceNetwork, /scheduleReconnect\(\)/);
  assert.match(matchRoom, /normalizePlayerSessionId/);
  assert.match(matchRoom, /this\.game\.api\.suspendHuman\(playerId\)/);
  assert.match(matchRoom, /resumed: Boolean\(joined\.resumed\)/);
  assert.match(lowHealth, /network:disconnected", suspendEffectsForReconnect/);
  assert.doesNotMatch(lowHealth, /network:disconnected", resetEffects/);
});
