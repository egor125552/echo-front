import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  ENVIRONMENT_SOUNDS,
  ENVIRONMENT_SOURCES,
} from "../client/plugins/environment-audio.js";
import { echoFrontClientPreset } from "../client/presets/echo-front.js";

test("Echo Front client preset enables environment audio after spatial audio", () => {
  const ids = echoFrontClientPreset.map((plugin) => plugin.manifest.id);
  const spatialIndex = ids.indexOf("spatial-audio-web");
  const environmentIndex = ids.indexOf("environment-audio");
  assert.ok(spatialIndex >= 0);
  assert.ok(environmentIndex > spatialIndex);
});

test("environment pack uses the published MP3 files and fixed arena landmarks", () => {
  assert.deepEqual(Object.keys(ENVIRONMENT_SOUNDS).sort(), [
    "electric", "fire", "metal", "wind", "wood",
  ]);
  for (const url of Object.values(ENVIRONMENT_SOUNDS)) {
    assert.match(url, /^\/audio\/environment\/.+\.mp3$/);
  }

  assert.deepEqual(ENVIRONMENT_SOURCES.electric, { x: -12, z: -6 });
  assert.deepEqual(ENVIRONMENT_SOURCES.fire, { x: 12, z: 6 });
  assert.ok(Object.values(ENVIRONMENT_SOURCES).every(({ x, z }) => Math.abs(x) < 15 && Math.abs(z) < 15));
});

test("spatial audio supports looped ambience and public client mirrors source client", async () => {
  const spatial = await readFile(new URL("../client/plugins/spatial-audio.js", import.meta.url), "utf8");
  assert.match(spatial, /source\.loop = Boolean\(loop\)/);

  const sourceEnvironment = await readFile(new URL("../client/plugins/environment-audio.js", import.meta.url), "utf8");
  const publicEnvironment = await readFile(new URL("../public/client/plugins/environment-audio.js", import.meta.url), "utf8");
  const sourcePreset = await readFile(new URL("../client/presets/echo-front.js", import.meta.url), "utf8");
  const publicPreset = await readFile(new URL("../public/client/presets/echo-front.js", import.meta.url), "utf8");
  const publicSpatial = await readFile(new URL("../public/client/plugins/spatial-audio.js", import.meta.url), "utf8");

  assert.equal(publicEnvironment, sourceEnvironment);
  assert.equal(publicPreset, sourcePreset);
  assert.equal(publicSpatial, spatial);
});
