import test from "node:test";
import assert from "node:assert/strict";
import {
  SNAPSHOT_SMOOTHING_MS,
  interpolateSnapshot,
} from "../client/plugins/snapshot-smoothing.js";

test("snapshot smoothing interpolates position and preserves target gameplay state", () => {
  const from = {
    now: 1,
    match: { score: { 1: 0, 2: 0 } },
    entities: [{ id: "p", x: 0, z: 0, angle: 0, health: 100 }],
  };
  const to = {
    now: 2,
    match: { score: { 1: 1, 2: 0 } },
    entities: [{ id: "p", x: 4, z: 2, angle: Math.PI / 2, health: 80 }],
  };
  const middle = interpolateSnapshot(from, to, 0.5);
  assert.equal(middle.entities[0].x, 2);
  assert.equal(middle.entities[0].z, 1);
  assert.equal(middle.entities[0].health, 80);
  assert.deepEqual(middle.match.score, { 1: 1, 2: 0 });
});

test("network smoothing is intentionally strong", () => {
  assert.ok(SNAPSHOT_SMOOTHING_MS >= 180);
});

test("large respawn jumps are not smeared across the map", () => {
  const from = { entities: [{ id: "p", x: 0, z: 0, angle: 0 }] };
  const to = { entities: [{ id: "p", x: 10, z: 0, angle: 0 }] };
  const middle = interpolateSnapshot(from, to, 0.2);
  assert.equal(middle.entities[0].x, 10);
});
