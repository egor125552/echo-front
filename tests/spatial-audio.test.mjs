import test from "node:test";
import assert from "node:assert/strict";
import { hybridSpatialMix } from "../client/plugins/spatial-audio.js";

function nearly(value, expected, tolerance = 0.02) {
  assert.ok(Math.abs(value - expected) <= tolerance, `${value} is not near ${expected}`);
}

test("front uses HRTF", () => {
  const mix = hybridSpatialMix(0);
  nearly(mix.hrtf, 1);
  nearly(mix.stereo, 0);
  nearly(mix.pan, 0);
});

test("rear uses HRTF", () => {
  const mix = hybridSpatialMix(Math.PI);
  nearly(mix.hrtf, 1);
  nearly(mix.stereo, 0);
});

test("exact sides use clean stereo", () => {
  const right = hybridSpatialMix(Math.PI / 2);
  const left = hybridSpatialMix(-Math.PI / 2);
  nearly(right.stereo, 1);
  nearly(right.hrtf, 0);
  nearly(right.pan, 1);
  nearly(left.stereo, 1);
  nearly(left.hrtf, 0);
  nearly(left.pan, -1);
});

test("diagonal transition keeps equal-power energy", () => {
  const mix = hybridSpatialMix(Math.PI / 4);
  assert.ok(mix.stereo > 0 && mix.hrtf > 0);
  nearly(mix.stereo ** 2 + mix.hrtf ** 2, 1, 0.001);
});
