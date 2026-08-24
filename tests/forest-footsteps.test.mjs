import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { createEchoFrontGame } from "../src/server/game.js";
import { DEFAULT_GROUND_SURFACE } from "../src/plugins/map-test-arena/server.js";
import {
  FOOTSTEP_VARIANT_COUNT,
  footstepKey,
  normalizeFootstepSurface,
} from "../src/plugins/movement/server.js";

async function collectEntityFootsteps(game, movement, entityId, count = 3) {
  game.drainEvents();
  movement.setInput(entityId, { forward: 1 });
  const found = [];

  for (let tick = 0; tick < 80 && found.length < count; tick += 1) {
    movement.tick(0.1, 1000 + tick * 100);
    for (const packet of game.drainEvents()) {
      if (packet.event !== "sound:spatial") continue;
      if (packet.payload.entityId !== entityId) continue;
      if (!String(packet.payload.key).startsWith("footstep.")) continue;
      found.push(packet.payload);
    }
  }

  movement.setInput(entityId, {});
  return found;
}

test("forest training ground exposes forest as its walking surface", async () => {
  const game = await createEchoFrontGame();
  const map = game.host.services.get("map");

  assert.equal(DEFAULT_GROUND_SURFACE, "forest");
  assert.equal(map.defaultSurface, "forest");
  assert.equal(map.surfaceAt({ x: 0, z: 0 }), "forest");
  assert.equal(map.surfaceAt({ x: 30, z: -20 }), "forest");

  await game.host.stop();
});

test("footstep keys use exactly three safe surface variants", () => {
  assert.equal(FOOTSTEP_VARIANT_COUNT, 3);
  assert.equal(normalizeFootstepSurface("FOREST"), "forest");
  assert.equal(normalizeFootstepSurface("bad surface"), "default");
  assert.equal(footstepKey("forest", 1), "footstep.forest.1");
  assert.equal(footstepKey("forest", 2), "footstep.forest.2");
  assert.equal(footstepKey("forest", 3), "footstep.forest.3");
});

test("human and bot movement emit the same forest footstep family", async () => {
  const game = await createEchoFrontGame();
  game.api.connectHuman("forest-footstep-human");
  const movement = game.host.services.get("movement");

  movement.teleport("forest-footstep-human", { x: -10, z: 0, angle: 0 });
  const humanSteps = await collectEntityFootsteps(game, movement, "forest-footstep-human");
  assert.deepEqual(
    humanSteps.map((step) => step.key),
    ["footstep.forest.1", "footstep.forest.2", "footstep.forest.3"],
  );
  assert.ok(humanSteps.every((step) => step.surface === "forest"));

  const bot = game.api.snapshot().entities.find((entity) => entity.bot);
  assert.ok(bot, "the match should contain a bot for the bot-footstep regression test");
  movement.teleport(bot.id, { x: 10, z: 0, angle: 0 });
  const botSteps = await collectEntityFootsteps(game, movement, bot.id);
  assert.deepEqual(
    botSteps.map((step) => step.key),
    ["footstep.forest.1", "footstep.forest.2", "footstep.forest.3"],
  );
  assert.ok(botSteps.every((step) => step.surface === "forest"));

  await game.host.stop();
});

test("browser sound pack maps forest footsteps to the three uploaded MP3 files", async () => {
  const source = await readFile(new URL("../client/plugins/core-sound-pack.js", import.meta.url), "utf8");
  const browser = await readFile(new URL("../public/client/plugins/core-sound-pack.js", import.meta.url), "utf8");

  assert.equal(browser, source);
  for (let index = 1; index <= 3; index += 1) {
    assert.match(
      source,
      new RegExp(`"footstep\\.forest\\.${index}": "\\/assets\\/audio\\/footsteps\\/forest\\/forest-step-${index}\\.mp3"`),
    );
    await access(new URL(`../public/assets/audio/footsteps/forest/forest-step-${index}.mp3`, import.meta.url));
  }
  assert.doesNotMatch(source, /"step\.4"/);
  assert.match(source, /payload\.key\.startsWith\("footstep\."\)/);
});
