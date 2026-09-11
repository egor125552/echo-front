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
