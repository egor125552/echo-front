import assert from "node:assert/strict";
import { test } from "node:test";
import { summarizePerformanceSamples } from "../src/server/performance-samples.js";

test("performance summary reports scheduling and traffic without fake Worker CPU timings", () => {
  const now = 10_000;
  const samples = [
    { at: 100, gapMs: 999, droppedMs: 999, steps: 20, snapshotsSent: 900 },
    { at: 8_000, gapMs: 50, simulatedMs: 50, droppedMs: 0, steps: 2, snapshotsSent: 1,
      snapshotCharacters: 250, eventsSent: 2, eventCharacters: 55 },
    { at: 9_950, gapMs: 450, simulatedMs: 325, droppedMs: 125, steps: 7, snapshotsSent: 2,
      snapshotCharacters: 1050, eventsSent: 1, eventCharacters: 80 },
  ];
  const summary = summarizePerformanceSamples(samples, now);
  assert.equal(summary.tickCount, 2);
  assert.equal(summary.expectedTickMs, 50);
  assert.equal(summary.maxTickGapMs, 450);
  assert.equal(summary.delayedTicks, 1);
  assert.equal(summary.catchUpTicks, 1);
  assert.equal(summary.maxSimulationSteps, 7);
  assert.equal(summary.droppedSimulationMs, 125);
  assert.equal(summary.snapshotsSent, 3);
  assert.equal(summary.snapshotCharacters, 1300);
  assert.equal(summary.eventsSent, 3);
  assert.equal(summary.eventCharacters, 135);
  assert.equal("maxSimulationWallMs" in summary, false);
  assert.equal("cpuPercent" in summary, false);
});
