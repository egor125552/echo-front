import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { AMBIENT_BED } from "../client/plugins/environment-audio.js";
import { echoFrontClientPreset } from "../client/presets/echo-front.js";

test("Echo Front client preset enables environment audio after spatial audio", () => {
  const ids = echoFrontClientPreset.map((plugin) => plugin.manifest.id);
  const spatialIndex = ids.indexOf("spatial-audio-web");
  const environmentIndex = ids.indexOf("environment-audio");
  assert.ok(spatialIndex >= 0);
  assert.ok(environmentIndex > spatialIndex);
});

test("environment uses one continuous published forest ambience bed", () => {
  assert.equal(AMBIENT_BED, "/audio/environment/arena-ambient.mp3");
});

test("environment bed loops and public client mirrors source client", async () => {
  const spatial = await readFile(new URL("../client/plugins/spatial-audio.js", import.meta.url), "utf8");
  assert.match(spatial, /source\.loop = Boolean\(loop\)/);

  const sourceEnvironment = await readFile(new URL("../client/plugins/environment-audio.js", import.meta.url), "utf8");
  const publicEnvironment = await readFile(new URL("../public/client/plugins/environment-audio.js", import.meta.url), "utf8");
  const sourcePreset = await readFile(new URL("../client/presets/echo-front.js", import.meta.url), "utf8");
  const publicPreset = await readFile(new URL("../public/client/presets/echo-front.js", import.meta.url), "utf8");
  const publicSpatial = await readFile(new URL("../public/client/plugins/spatial-audio.js", import.meta.url), "utf8");

  assert.match(sourceEnvironment, /playCentered\(AMBIENT_BED/);
  assert.match(sourceEnvironment, /loop: true/);
  assert.doesNotMatch(sourceEnvironment, /scheduleCue|environment-fire|environment-metal|environment-wood/);
  assert.equal(publicEnvironment, sourceEnvironment);
  assert.equal(publicPreset, sourcePreset);
  assert.equal(publicSpatial, spatial);
});
