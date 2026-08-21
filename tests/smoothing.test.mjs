import test from "node:test";
import assert from "node:assert/strict";
import { interpolateSnapshot } from "../client/plugins/snapshot-smoothing.js";

test("snapshot smoothing interpolates position and preserves target gameplay state", () => {
  const from = {
    now: 1,
    match: { score: { 1: 0, 2: 0 } },
    entities: [{ id: "p", x: 0, z: 0, angle: 0, health: 100 }],
  };
  const to = {
    now: 2,
    match: { score: { 1: 1, 2: 0 } },
    entities: [{ id: "p", x: 10, z: 4, angle: Math.PI / 2, health: 80 }],
  };
  const middle = interpolateSnapshot(from, to, 0.5);
  assert.equal(middle.entities[0].x, 5);
  assert.equal(middle.entities[0].z, 2);
  assert.equal(middle.entities[0].health, 80);
  assert.deepEqual(middle.match.score, { 1: 1, 2: 0 });
});
