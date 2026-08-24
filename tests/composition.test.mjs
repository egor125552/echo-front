import test from "node:test";
import assert from "node:assert/strict";
import { PluginHost } from "../src/core/plugin-host.js";
import { emptyPreset } from "../src/presets/empty.js";
import { walkingTestPreset } from "../src/presets/walking-test.js";
import { combatTestPreset } from "../src/presets/combat-test.js";
import { echoFrontPreset } from "../src/presets/echo-front.js";
import { battleRoyalePreset } from "../src/presets/battle-royale.js";

function ids(preset) {
  return new PluginHost({ plugins: preset }).plugins.map((plugin) => plugin.manifest.id);
}

test("empty preset contains no gameplay plugins", () => {
  assert.deepEqual(ids(emptyPreset), []);
});

test("walking preset has no combat mechanics", () => {
  const loaded = ids(walkingTestPreset);
  assert.ok(loaded.includes("rapier-physics"));
  assert.ok(loaded.includes("movement"));
  assert.ok(!loaded.includes("weapons"));
  assert.ok(!loaded.includes("health"));
  assert.ok(!loaded.includes("armor"));
});

test("combat preset works without armor plugin", () => {
  const loaded = ids(combatTestPreset);
  assert.ok(loaded.includes("weapons"));
  assert.ok(loaded.includes("health"));
  assert.ok(!loaded.includes("armor"));
});

test("Echo Front preset composes full prototype with assisted target selection", () => {
  const loaded = ids(echoFrontPreset);
  for (const required of [
    "rapier-physics", "movement", "weapons", "weapon-progression", "health", "armor",
    "spawn-protection", "target-assist", "opening-round", "bot-controller", "bot-perception",
    "bot-combat", "bot-fill", "team-deathmatch", "match-api",
  ]) assert.ok(loaded.includes(required), `missing ${required}`);
  assert.ok(!loaded.includes("aim-assist"));
  assert.ok(!loaded.includes("aim-steering"));
  assert.ok(!loaded.includes("battle-royale"));
});

test("battle royale preset is isolated from TDM and respawn mechanics", () => {
  const loaded = ids(battleRoyalePreset);
  for (const required of [
    "rapier-physics", "movement", "weapons", "health", "armor", "target-assist",
    "bot-controller", "spatial-grid", "bot-perception", "battle-royale", "bot-combat",
    "bot-fill", "match-api",
  ]) assert.ok(loaded.includes(required), `missing BR plugin ${required}`);
  assert.ok(!loaded.includes("team-deathmatch"));
  assert.ok(!loaded.includes("respawn"));
  assert.ok(!loaded.includes("opening-round"));
  assert.ok(!loaded.includes("weapon-progression"));
});
