import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createEchoFrontGame } from "../src/server/game.js";
import {
  HEARTBEAT_URL,
  HEARTBEAT_START_RATIO,
  HEARTBEAT_STOP_RATIO,
  MAX_REVERB_MIX,
  lowHealthIntensity,
} from "../client/plugins/low-health-audio.js";

test("human health regenerates only after five seconds without health damage", async () => {
  const game = await createEchoFrontGame();
  game.api.connectHuman("human-regen");

  const combat = game.host.services.get("combat");
  const regen = game.host.services.get("health-regeneration");
  const protection = game.host.services.get("spawn-protection");
  const armor = game.host.components.get("human-regen", "Armor");
  const health = game.host.components.get("human-regen", "Health");

  protection.clear("human-regen");
  armor.current = 0;
  combat.damage("human-regen", 100, { attackerId: "test", weaponId: "pistol", now: 1000 });
  assert.equal(health.current, 100);

  regen.tick(1, 5999);
  assert.equal(health.current, 100, "regeneration must not start before the delay expires");

  regen.tick(1, 6000);
  assert.equal(health.current, 125, "one second of regeneration should restore 25 health");

  combat.damage("human-regen", 10, { attackerId: "test", weaponId: "pistol", now: 6500 });
  assert.equal(health.current, 115);

  regen.tick(1, 11499);
  assert.equal(health.current, 115, "new damage must restart the regeneration delay");

  regen.tick(1, 11500);
  assert.equal(health.current, 140);

  await game.host.stop();
});

test("health regeneration does not silently buff bots", async () => {
  const game = await createEchoFrontGame();
  const combat = game.host.services.get("combat");
  const regen = game.host.services.get("health-regeneration");
  const bot = game.api.snapshot().entities.find((entity) => entity.bot && entity.health > 50);
  assert.ok(bot);

  const armor = game.host.components.get(bot.id, "Armor");
  if (armor) armor.current = 0;
  const health = game.host.components.get(bot.id, "Health");
  const before = health.current;
  combat.damage(bot.id, 10, { attackerId: "test", weaponId: "pistol", now: 1000 });
  const damaged = health.current;
  assert.ok(damaged < before);

  regen.tick(10, 20000);
  assert.equal(health.current, damaged, "bot health should not regenerate in this player-only mechanic");

  await game.host.stop();
});

test("low health audio scales reverb smoothly and uses the selected heartbeat MP3", () => {
  assert.equal(HEARTBEAT_URL, "/assets/audio/core/heartbeat-fast.mp3");
  assert.ok(HEARTBEAT_START_RATIO < HEARTBEAT_STOP_RATIO, "heartbeat needs hysteresis");
  assert.equal(lowHealthIntensity(200, 200), 0);
  assert.equal(lowHealthIntensity(130, 200), 0);
  assert.ok(Math.abs(lowHealthIntensity(80, 200) - 0.5) < 1e-9);
  assert.equal(lowHealthIntensity(30, 200), 1);
  assert.ok(MAX_REVERB_MIX > 0.7 && MAX_REVERB_MIX < 1);
});

test("low health audio and master reverb stay mirrored in the public client", async () => {
  const sourceLowHealth = await readFile(new URL("../client/plugins/low-health-audio.js", import.meta.url), "utf8");
  const publicLowHealth = await readFile(new URL("../public/client/plugins/low-health-audio.js", import.meta.url), "utf8");
  const sourceSpatial = await readFile(new URL("../client/plugins/spatial-audio.js", import.meta.url), "utf8");
  const publicSpatial = await readFile(new URL("../public/client/plugins/spatial-audio.js", import.meta.url), "utf8");
  const sourcePreset = await readFile(new URL("../client/presets/echo-front.js", import.meta.url), "utf8");
  const publicPreset = await readFile(new URL("../public/client/presets/echo-front.js", import.meta.url), "utf8");

  assert.equal(publicLowHealth, sourceLowHealth);
  assert.equal(publicSpatial, sourceSpatial);
  assert.equal(publicPreset, sourcePreset);
  assert.match(sourceSpatial, /createConvolver\(\)/);
  assert.match(sourceSpatial, /setReverbMix/);
  assert.match(sourceLowHealth, /loop: true/);
  assert.match(sourcePreset, /lowHealthAudio/);
});
