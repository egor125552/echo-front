import test from "node:test";
import assert from "node:assert/strict";
import {
  BOT_GROUND_RAMP_ESCAPE_Y,
  normalizeRouteForTarget,
} from "../src/plugins/battle-royale-bot-combat/server.js";

test("a ground-floor goal is not turned into a stair descent by a tiny lower-ramp contact", () => {
  const transform = { x: 72.6, y: 0.21, z: 1.2 };
  const target = { x: 66, y: 0, z: 6.72 };
  const accidentalStairRoute = { x: 73.5, y: 0, z: 0, kind: "stair" };

  assert.ok(transform.y < BOT_GROUND_RAMP_ESCAPE_Y);
  assert.equal(normalizeRouteForTarget(transform, target, accidentalStairRoute, 3.2), null);
});

test("a real upper-floor goal still keeps the stair route from the same lower-ramp position", () => {
  const transform = { x: 72.6, y: 0.21, z: 1.2 };
  const target = { x: 66, y: 3.2, z: 6.72 };
  const stairRoute = { x: 66.5, y: 3.2, z: 0, kind: "stair" };

  assert.deepEqual(normalizeRouteForTarget(transform, target, stairRoute, 3.2), stairRoute);
});
