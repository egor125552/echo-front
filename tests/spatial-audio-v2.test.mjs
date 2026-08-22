import test from "node:test";
import assert from "node:assert/strict";
import { hybridSpatialMix } from "../client/plugins/spatial-audio.js";

function nearly(value, expected, tolerance = 0.02) {
  assert.ok(Math.abs(value - expected) <= tolerance, `${value} is not near ${expected}`);
}

test("exact front is clean centered stereo", () => {
  const mix = hybridSpatialMix(0);
  nearly(mix.stereo, 1);
  nearly(mix.hrtf, 0);
  nearly(mix.pan, 0);
});

test("sides and rear are HRTF", () => {
  const side = hybridSpatialMix(Math.PI / 2);
  const rear = hybridSpatialMix(Math.PI);
  nearly(side.hrtf, 1);
  nearly(side.stereo, 0);
  nearly(rear.hrtf, 1);
  nearly(rear.stereo, 0);
});

test("front diagonal blends smoothly with equal power", () => {
  const mix = hybridSpatialMix(Math.PI / 4);
  assert.ok(mix.stereo > 0 && mix.hrtf > 0);
  nearly(mix.stereo ** 2 + mix.hrtf ** 2, 1, 0.001);
});
