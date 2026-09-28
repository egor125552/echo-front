import assert from "node:assert/strict";
import { createEchoFrontGame } from "../src/server/game.js";

const game = await createEchoFrontGame({ mode: "battle-royale" });
const playerId = "developer-settings-snapshot-delta";
game.api.connectHuman(playerId);

const first = game.api.snapshotFor(playerId, Date.now());
assert.equal(first.developerSettings?.enabled, true);
assert.ok(first.developerSettings?.catalog, "initial host snapshot must include developer catalog");

const second = game.api.snapshotFor(playerId, Date.now() + 1);
assert.equal(second.developerSettings?.enabled, true);
assert.equal(second.developerSettings?.catalog, undefined,
  "unchanged developer catalog must not be repeated in every snapshot");

game.api.handleInput(playerId, {
  developerSettings: { action: "reset-parachute" },
}, Date.now() + 2);
const changed = game.api.snapshotFor(playerId, Date.now() + 3);
assert.ok(changed.developerSettings?.catalog,
  "catalog must be resent after developer settings revision changes");

console.log("developer settings snapshot delta: ok");
