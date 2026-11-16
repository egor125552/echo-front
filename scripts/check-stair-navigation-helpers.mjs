import assert from "node:assert/strict";
import { test } from "node:test";
import { nextMidStairRoute, stagedStairRoute } from "../src/plugins/battle-royale-bot-combat/server.js";
import { stairEntryDesiredTarget } from "../src/plugins/battle-royale-bot-building-stairs/server.js";
import { dedupeWaypoints } from "../src/plugins/battle-royale-building-navigation/server.js";

test("stagedStairRoute never pulls an aligned bot backwards once inside the stair entry corridor", () => {
  const route = {
    x: 73.5,
    y: 0,
    z: 0,
    kind: "stair",
    transitionSide: "approach",
    buildingId: "warehouse",
  };

  // Off-axis lateral position must still align at the east approach point.
  const lateralStart = stagedStairRoute({ x: 73.53, y: 0, z: -3.42 }, route);
  assert.equal(lateralStart.stairStage, "align");
  assert.ok(lateralStart.x > 73.5);

  // Anywhere along the centered corridor between approach and route.x must advance straight onto route.
  for (const x of [74.5, 74.31, 73.9, 73.6, 73.5]) {
    const step = stagedStairRoute({ x, y: 0, z: -0.05 }, route);
    assert.equal(step.x, 73.5, `Expected centered bot at x=${x} to advance to stair route 73.5, got ${step.x}`);
    assert.notEqual(step.stairStage, "align");
  }

  // Once dedupeWaypoints switches to the cross waypoint inside the stair mouth, never regress east.
  const crossRoute = { x: 71.95, y: 0, z: 0, kind: "stair", transitionSide: "cross" };
  assert.deepEqual(stagedStairRoute({ x: 73.0, y: 0, z: -0.1 }, crossRoute), crossRoute);
});

test("stairEntryDesiredTarget advances cleanly through the entry corridor in all four directions", () => {
  const cases = [
    {
      direction: "east",
      bounds: { minX: 10, maxX: 16, minZ: -2, maxZ: 2 },
      approach: { x: 8.85, y: 0, z: 0 },
      bottom: { x: 9.5, y: 0, z: 0 },
      insideCorridor: { x: 9.2, y: 0, z: 0.05 },
      offAxis: { x: 9.2, y: 0, z: 1.5 },
    },
    {
      direction: "west",
      bounds: { minX: 10, maxX: 16, minZ: -2, maxZ: 2 },
      approach: { x: 17.15, y: 0, z: 0 },
      bottom: { x: 16.5, y: 0, z: 0 },
      insideCorridor: { x: 16.8, y: 0, z: -0.05 },
      offAxis: { x: 16.8, y: 0, z: -1.5 },
    },
    {
      direction: "north",
      bounds: { minX: -2, maxX: 2, minZ: 10, maxZ: 16 },
      approach: { x: 0, y: 0, z: 17.15 },
      bottom: { x: 0, y: 0, z: 16.5 },
      insideCorridor: { x: 0.05, y: 0, z: 16.8 },
      offAxis: { x: 1.5, y: 0, z: 16.8 },
    },
    {
      direction: "south",
      bounds: { minX: -2, maxX: 2, minZ: 10, maxZ: 16 },
      approach: { x: 0, y: 0, z: 8.85 },
      bottom: { x: 0, y: 0, z: 9.5 },
      insideCorridor: { x: -0.05, y: 0, z: 9.2 },
      offAxis: { x: -1.5, y: 0, z: 9.2 },
    },
  ];

  for (const spec of cases) {
    const geometry = {
      direction: spec.direction,
      lowY: 0,
      highY: 3.2,
      bounds: spec.bounds,
      bottom: spec.bottom,
      approach: spec.approach,
    };
    assert.deepEqual(
      stairEntryDesiredTarget(spec.offAxis, geometry, { y: 0, transitionSide: "approach" }),
      spec.approach,
      `${spec.direction}: off-axis bot must align at approach first`,
    );
    assert.deepEqual(
      stairEntryDesiredTarget(spec.insideCorridor, geometry, { y: 0, transitionSide: "approach" }),
      spec.bottom,
      `${spec.direction}: aligned bot inside entry corridor must keep advancing to bottom`,
    );
    assert.equal(
      stairEntryDesiredTarget(spec.insideCorridor, geometry, { y: 0, transitionSide: "cross" }),
      null,
      `${spec.direction}: cross transition must hand off to stair ascent`,
    );
  }
});

test("dedupeWaypoints skips already-passed door and stair approach waypoints without reversing", () => {
  const doorPair = [
    { x: 73.55, y: 0, z: 0, kind: "door", transitionId: "warehouse-front-door:outside", transitionSide: "approach" },
    { x: 76.45, y: 0, z: 0, kind: "door", transitionId: "warehouse-front-door:outside", transitionSide: "cross" },
  ];
  const doorOut = dedupeWaypoints({ x: 74.1, y: 0, z: 0.1 }, doorPair);
  assert.equal(doorOut.length, 1);
  assert.equal(doorOut[0].transitionSide, "cross");

  const stairPair = [
    { x: 73.5, y: 0, z: 0, kind: "stair", transitionId: "warehouse:stair-bottom", transitionSide: "approach" },
    { x: 71.95, y: 0, z: 0, kind: "stair", transitionId: "warehouse:stair-bottom", transitionSide: "cross" },
  ];
  const stairOut = dedupeWaypoints({ x: 73.1, y: 0, z: -0.1 }, stairPair);
  assert.equal(stairOut.length, 1);
  assert.equal(stairOut[0].transitionSide, "cross");

  // Exiting the top of the staircase slightly off-center (e.g. squadmates climbing side-by-side)
  // must immediately advance from topInside [approach] to top [cross] without pulling backward.
  const stairExitPair = [
    { x: 68.05, y: 3.2, z: 0, kind: "stair", transitionId: "warehouse:stair-top", transitionSide: "approach", exitingStair: true },
    { x: 66.5, y: 3.2, z: 0, kind: "stair", transitionId: "warehouse:stair-top", transitionSide: "cross", exitingStair: true },
  ];
  const exitOut = dedupeWaypoints({ x: 68.04, y: 2.65, z: -0.55 }, stairExitPair);
  assert.equal(exitOut.length, 1);
  assert.equal(exitOut[0].transitionSide, "cross");
  assert.equal(exitOut[0].x, 66.5);
});

test("nextMidStairRoute advances stale stair approach waypoints instead of trapping bots at topInside", () => {
  const target = { x: 64, y: 3.2, z: 3 };
  const topInside = { x: 68.05, y: 3.2, z: 0, kind: "stair", transitionSide: "approach" };
  const topExit = { x: 66.5, y: 3.2, z: 0, kind: "stair", transitionSide: "cross" };

  // When fresh navigationWaypoint advances from topInside to topExit mid-ramp (y=2.64 < 3.08),
  // nextMidStairRoute must switch to topExit rather than retaining topInside.
  const advanced = nextMidStairRoute({ x: 68.0, y: 2.64, z: 0 }, target, topInside, topExit, 3.2);
  assert.deepEqual(advanced, topExit);

  // Near the very top landing (y=2.95), retain topExit [cross] so the bot clears the ramp safely.
  const retainedCross = nextMidStairRoute({ x: 67.3, y: 2.95, z: 0 }, target, topExit, null, 3.2);
  assert.deepEqual(retainedCross, topExit);
});
