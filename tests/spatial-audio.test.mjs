import test from "node:test";
import assert from "node:assert/strict";
import {
  HRTF_START_ANGLE,
  HRTF_FULL_ANGLE,
  hybridSpatialMix,
  localizeForListener,
} from "../client/plugins/spatial-audio.js";

function nearly(value, expected, tolerance = 0.02) {
  assert.ok(Math.abs(value - expected) <= tolerance, `${value} is not near ${expected}`);
}

test("exact front is clean centered stereo", () => {
  const mix = hybridSpatialMix(0);
  nearly(mix.stereo, 1);
  nearly(mix.hrtf, 0);
  nearly(mix.pan, 0);
});

test("moderate side remains plain stereo before HRTF starts", () => {
  assert.ok(HRTF_START_ANGLE > Math.PI / 4);
  const mix = hybridSpatialMix(Math.PI / 4);
  nearly(mix.stereo, 1);
  nearly(mix.hrtf, 0);
  assert.ok(mix.pan > 0);
});

test("steep side crossfades smoothly into HRTF", () => {
  const angle = (HRTF_START_ANGLE + HRTF_FULL_ANGLE) / 2;
  const mix = hybridSpatialMix(angle);
  assert.ok(mix.stereo > 0 && mix.hrtf > 0);
  nearly(mix.stereo ** 2 + mix.hrtf ** 2, 1, 0.001);
});

test("exact sides and rear use HRTF", () => {
  const right = hybridSpatialMix(Math.PI / 2);
  const left = hybridSpatialMix(-Math.PI / 2);
  const rear = hybridSpatialMix(Math.PI);
  nearly(right.hrtf, 1);
  nearly(left.hrtf, 1);
  nearly(rear.hrtf, 1);
  nearly(right.stereo, 0);
  nearly(left.stereo, 0);
  nearly(rear.stereo, 0);
});

test("world-right source always maps to the right ear axis", () => {
  const listener = { x: 0, z: 0, angle: 0 };
  const right = localizeForListener(listener, { x: 3, z: -4 });
  const left = localizeForListener(listener, { x: -3, z: -4 });
  assert.ok(right.localRight > 0);
  assert.ok(right.azimuth > 0);
  assert.ok(left.localRight < 0);
  assert.ok(left.azimuth < 0);
});

test("strafing right makes a fixed centered source move left relative to the listener", () => {
  const source = { x: 0, z: -5 };
  const before = localizeForListener({ x: 0, z: 0, angle: 0 }, source);
  const after = localizeForListener({ x: 1, z: 0, angle: 0 }, source);
  nearly(before.azimuth, 0);
  assert.ok(after.azimuth < 0);
});
