import test from "node:test";
import assert from "node:assert/strict";

import {
  INITIAL_ZONE_RADIUS,
  ZONE_STEERING_BUFFER,
  shouldSteerForZone,
  zoneSteeringPoint,
  zoneDamageForElapsed,
} from "../src/plugins/battle-royale/server.js";

test("outer map positions are not pulled inward while the opening zone is safely outside the map", () => {
  const outerSpawnDistance = Math.hypot(958, 928);
  assert.equal(shouldSteerForZone(outerSpawnDistance, INITIAL_ZONE_RADIUS), false);
});

test("zone steering starts shortly before the real boundary reaches the bot", () => {
  const botDistance = Math.hypot(958, 928);
  assert.equal(shouldSteerForZone(botDistance, botDistance + ZONE_STEERING_BUFFER + 1), false);
  assert.equal(shouldSteerForZone(botDistance, botDistance + ZONE_STEERING_BUFFER), true);
  assert.equal(shouldSteerForZone(botDistance, 1379.25), true);
});

test("zone steering preserves the bot's sector instead of dragging it to map centre", () => {
  const target = zoneSteeringPoint(958, 928, 1379.25);
  assert.ok(target);
  assert.ok(target.x > 0 && target.z > 0);
  assert.ok(Math.hypot(target.x, target.z) < Math.hypot(958, 928));
  assert.ok(Math.hypot(target.x, target.z) > 1200);
  assert.notDeepEqual({ x: target.x, z: target.z }, { x: 0, z: 0 });
});


test("zone damage keeps the same DPS across a delayed server tick", () => {
  assert.equal(zoneDamageForElapsed(1000), 12);
  assert.equal(zoneDamageForElapsed(2500), 30);
  assert.equal(zoneDamageForElapsed(5000), 60);
});

test("late-game small zones release bots already inside the circle and never collapse targets to (0, 0)", () => {
  // Inside a 100m zone (at ~45m from center): bot is safely inside and free to patrol
  assert.equal(shouldSteerForZone(45, 100), false);
  assert.equal(zoneSteeringPoint(32, 30, 100), null);

  // Outside a 100m zone (at ~110m from center): bot steers into its sector (~62m), not (0, 0)
  const target100 = zoneSteeringPoint(80, 75, 100);
  assert.ok(target100);
  assert.ok(Math.hypot(target100.x, target100.z) >= 55, "Must steer into sector, not (0, 0)");

  // Inside the 35m final zone (at ~18m from center): bot is free to roam/fight, not locked to zone center
  assert.equal(shouldSteerForZone(18, 35), false);
  assert.equal(zoneSteeringPoint(12, 13, 35), null);

  // Outside the 35m final zone (at ~42m from center): steers to ~21.7m in its sector, not (0, 0)
  const target35 = zoneSteeringPoint(30, 30, 35);
  assert.ok(target35);
  assert.ok(Math.hypot(target35.x, target35.z) >= 18, "Final zone steering must preserve sector instead of (0, 0)");
});

