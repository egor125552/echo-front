import test from "node:test";
import assert from "node:assert/strict";
import {
  WAREHOUSE_NEAR_PRIORITY_CAP,
  WAREHOUSE_NEAR_PRIORITY_RADIUS,
  distanceToBuilding,
  setup,
} from "../src/plugins/battle-royale-bot-warehouse-priority/server.js";

const building = { id: "warehouse", minX: 45, maxX: 75, minZ: -12, maxZ: 12, upperY: 3.2 };

test("distanceToBuilding reports a bot five metres from the warehouse as nearby", () => {
  assert.equal(distanceToBuilding({ x: 80, y: 0, z: 0 }, building), 5);
  assert.ok(distanceToBuilding({ x: 80, y: 0, z: 0 }, building) < WAREHOUSE_NEAR_PRIORITY_RADIUS);
});

test("two nearby bots get reserved warehouse checks when ordinary interest says explore", async () => {
  const points = [
    { id: "warehouse-ground-east", group: "warehouse", x: 66, y: 0, z: 6.72 },
    { id: "warehouse-ground-west", group: "warehouse", x: 52.5, y: 0, z: -6.72 },
  ];
  const interest = {
    points,
    targetFor(botId, transform, now) {
      return { kind: "explore-interest", x: transform.x + 8, y: 0, z: transform.z, expiresAt: now + 10_000 };
    },
  };
  const map = { building };
  const listeners = new Map();
  const services = new Map([["bot-interest", interest], ["map", map]]);
  const provided = new Map();
  await setup({
    services: {
      get(name) { return services.get(name); },
      provide(name, value) { provided.set(name, value); },
    },
    events: {
      on(name, fn) { listeners.set(name, fn); },
    },
  });

  const now = 100_000;
  const a = interest.targetFor("near-a", { x: 80, y: 0, z: 0 }, now);
  const b = interest.targetFor("near-b", { x: 81, y: 0, z: 1 }, now);
  const c = interest.targetFor("near-c", { x: 82, y: 0, z: -1 }, now);

  assert.equal(a?.kind, "poi-interest");
  assert.equal(a?.priorityVisit, true);
  assert.equal(b?.kind, "poi-interest");
  assert.equal(b?.priorityVisit, true);
  assert.equal(c?.kind, "explore-interest");
  assert.equal(provided.get("warehouse-priority").activeCount(now), WAREHOUSE_NEAR_PRIORITY_CAP);
});

test("a real sound always overrides a reserved casual warehouse visit", async () => {
  let soundMode = false;
  const interest = {
    points: [
      { id: "warehouse-ground-east", group: "warehouse", x: 66, y: 0, z: 6.72 },
      { id: "warehouse-ground-west", group: "warehouse", x: 52.5, y: 0, z: -6.72 },
    ],
    targetFor(botId, transform, now) {
      if (soundMode) return { kind: "sound-interest", x: 60, y: 0, z: 0, heardAt: now };
      return { kind: "explore-interest", x: 90, y: 0, z: 0 };
    },
  };
  const services = new Map([["bot-interest", interest], ["map", { building }]]);
  const provided = new Map();
  await setup({
    services: {
      get(name) { return services.get(name); },
      provide(name, value) { provided.set(name, value); },
    },
    events: { on() {} },
  });

  const now = 200_000;
  assert.equal(interest.targetFor("near-sound", { x: 80, y: 0, z: 0 }, now)?.priorityVisit, true);
  soundMode = true;
  assert.equal(interest.targetFor("near-sound", { x: 80, y: 0, z: 0 }, now + 100)?.kind, "sound-interest");
  assert.equal(provided.get("warehouse-priority").visitFor("near-sound"), null);
});
