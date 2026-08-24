import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  distanceAirCutoff,
  distanceAttenuation,
} from "../client/plugins/spatial-audio.js";
import {
  SPATIAL_SOUND_PROFILES,
  spatialProfileForKey,
} from "../client/plugins/core-sound-pack.js";
import {
  FOOTSTEP_SPRINT_RADIUS,
  FOOTSTEP_WALK_RADIUS,
} from "../src/plugins/movement/server.js";
import { createEchoFrontGame } from "../src/server/game.js";

function attenuationAt(distance, radius, profile) {
  return distanceAttenuation(distance, {
    maxDistance: radius,
    referenceDistance: profile.referenceDistance,
    rolloffFactor: profile.rolloffFactor,
  });
}

test("distance attenuation is smooth, monotonic and reaches true silence at the edge", () => {
  const profile = SPATIAL_SOUND_PROFILES["weapon.pistol"];
  const distances = [0, 5, 10, 20, 40, 60, 75, 85, 89, 90];
  const gains = distances.map((distance) => attenuationAt(distance, 90, profile));

  assert.equal(gains[0], 1);
  for (let index = 1; index < gains.length; index += 1) {
    assert.ok(gains[index] <= gains[index - 1], `${distances[index]} m should not be louder than the previous point`);
  }
  assert.ok(gains[6] > 0.05, "a pistol shot at 75 m should remain faintly audible");
  assert.ok(gains[8] < 0.01, "the final metres should already be almost silent");
  assert.equal(gains[9], 0, "the acoustic edge should be true silence, not a hard minimum gain floor");
});

test("air absorption progressively removes high frequencies with distance", () => {
  const near = distanceAirCutoff(0, 90, 3200);
  const middle = distanceAirCutoff(45, 90, 3200);
  const far = distanceAirCutoff(89, 90, 3200);

  assert.equal(near, 18000);
  assert.ok(middle < near);
  assert.ok(far < middle);
  assert.ok(far >= 3200);
});

test("footsteps have a wider but still local acoustic radius", () => {
  assert.equal(FOOTSTEP_WALK_RADIUS, 32);
  assert.equal(FOOTSTEP_SPRINT_RADIUS, 44);
  assert.ok(FOOTSTEP_SPRINT_RADIUS > FOOTSTEP_WALK_RADIUS);

  const profile = spatialProfileForKey("footstep.forest.2");
  assert.equal(profile, SPATIAL_SOUND_PROFILES.footstep);
  assert.ok(attenuationAt(20, FOOTSTEP_WALK_RADIUS, profile) > 0.1);
  assert.ok(attenuationAt(31.5, FOOTSTEP_WALK_RADIUS, profile) < 0.01);
  assert.equal(attenuationAt(32, FOOTSTEP_WALK_RADIUS, profile), 0);
});

test("weapon acoustic range is independent from gameplay hit range", async () => {
  const game = await createEchoFrontGame();
  const definitions = game.host.services.get("weapons").definitions;

  assert.equal(definitions.pistol.range, 28);
  assert.equal(definitions.pistol.soundRadius, 90);
  assert.equal(definitions.rifle.range, 28);
  assert.equal(definitions.rifle.soundRadius, 110);
  assert.ok(definitions.pistol.soundRadius > definitions.pistol.range);
  assert.ok(definitions.rifle.soundRadius > definitions.rifle.range);

  await game.host.stop();
});

test("distance audio browser mirrors stay exact", async () => {
  const spatialSource = await readFile(new URL("../client/plugins/spatial-audio.js", import.meta.url), "utf8");
  const spatialPublic = await readFile(new URL("../public/client/plugins/spatial-audio.js", import.meta.url), "utf8");
  const soundSource = await readFile(new URL("../client/plugins/core-sound-pack.js", import.meta.url), "utf8");
  const soundPublic = await readFile(new URL("../public/client/plugins/core-sound-pack.js", import.meta.url), "utf8");

  assert.equal(spatialPublic, spatialSource);
  assert.equal(soundPublic, soundSource);
});
