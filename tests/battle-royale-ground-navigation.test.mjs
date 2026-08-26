import test from "node:test";
import assert from "node:assert/strict";
import {
  GROUND_BYPASS_END_CLEARANCE,
  GROUND_BYPASS_SIDE_CLEARANCE,
  groundFloorBypassWaypoint,
} from "../src/plugins/battle-royale-ground-navigation/server.js";

const building = { minX: 45, maxX: 75, minZ: -12, maxZ: 12, upperY: 3.2 };
const stair = { minX: 67, maxX: 73, minZ: -2, maxZ: 2, centerX: 70, centerZ: 0 };

test("ground-floor route from warehouse entrance goes around the stair instead of into the ramp", () => {
  const target = { x: 60, y: 0, z: 0 };
  const first = groundFloorBypassWaypoint(
    { x: 73.1, y: 0, z: 0 },
    target,
    { building, stair },
  );

  assert.equal(first?.kind, "ground-bypass");
  assert.equal(first?.stage, "clear-side");
  assert.equal(first?.x, stair.maxX + GROUND_BYPASS_END_CLEARANCE);
  assert.ok(
    Math.abs(first.z) >= stair.maxZ + GROUND_BYPASS_SIDE_CLEARANCE - 0.001,
    `bypass does not clear ramp width: z=${first.z}`,
  );

  const second = groundFloorBypassWaypoint(
    { x: first.x, y: 0, z: first.z },
    target,
    { building, stair },
  );
  assert.equal(second?.stage, "cross");
  assert.equal(second?.x, stair.minX - GROUND_BYPASS_END_CLEARANCE);
  assert.equal(second?.z, first.z);

  const done = groundFloorBypassWaypoint(
    { x: stair.minX - GROUND_BYPASS_END_CLEARANCE - 0.7, y: 0, z: first.z },
    target,
    { building, stair },
  );
  assert.equal(done, null);
});

test("ground-floor bypass leaves clear same-side paths alone", () => {
  const route = groundFloorBypassWaypoint(
    { x: 73.4, y: 0, z: 6 },
    { x: 69, y: 0, z: 7 },
    { building, stair },
  );
  assert.equal(route, null);
});

test("ground-floor bypass never hijacks an upper-floor route", () => {
  const route = groundFloorBypassWaypoint(
    { x: 73.1, y: 3.2, z: 0 },
    { x: 60, y: 3.2, z: 0 },
    { building, stair },
  );
  assert.equal(route, null);
});
