import assert from "node:assert/strict";
import { vehicleCrashMetrics } from "../src/plugins/battle-royale-vehicle/server.js";

const cases = [
  {
    name: "light 10.8 km/h head-on",
    force: 318640.09375,
    speed: 3,
    expectedTier: "light",
    severityRange: [3.5, 5.5],
  },
  {
    name: "moderate 21.6 km/h head-on",
    force: 691900.375,
    speed: 6,
    expectedTier: "moderate",
    severityRange: [8.5, 12.0],
  },
  {
    name: "severe 39.6 km/h head-on",
    force: 1301992.875,
    speed: 11,
    expectedTier: "severe",
    severityRange: [16.0, 21.0],
  },
  {
    name: "critical 64.8 km/h head-on",
    force: 2156869,
    speed: 18,
    expectedTier: "critical",
    severityRange: [27.5, 32.0],
  },
];

let previousSeverity = -Infinity;

for (const testCase of cases) {
  const metrics = vehicleCrashMetrics(testCase.force, {
    deltaSpeed: testCase.speed,
    speedBefore: testCase.speed,
  });

  const [minimum, maximum] = testCase.severityRange;
  assert.equal(metrics.tier, testCase.expectedTier, `${testCase.name}: tier`);
  assert.ok(
    metrics.severity >= minimum && metrics.severity <= maximum,
    `${testCase.name}: severity ${metrics.severity.toFixed(3)} outside ${minimum}..${maximum}`,
  );
  assert.ok(
    metrics.severity > previousSeverity,
    `${testCase.name}: severity must increase with measured crash energy`,
  );

  previousSeverity = metrics.severity;
  console.log(
    `${testCase.name}: ${Math.round(testCase.force)} N, severity=${metrics.severity.toFixed(2)}, tier=${metrics.tier}`,
  );
}

const noContact = vehicleCrashMetrics(0, { deltaSpeed: 0, speedBefore: 18 });
assert.equal(noContact.severity, 0, "no force contact must not create crash severity");
assert.equal(noContact.tier, "bump", "no force contact must remain a bump");

assert.ok(
  cases.length > 1 && previousSeverity < 35,
  "calibration must not collapse ordinary measured crashes into the severity ceiling",
);

console.log("Vehicle crash calibration regression check passed.");
