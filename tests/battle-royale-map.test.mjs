import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PluginHost } from "../src/core/plugin-host.js";
import * as rapierPhysics from "../src/plugins/rapier-physics/server.js";
import * as entitiesPlugin from "../src/plugins/entities/server.js";
import * as movementPlugin from "../src/plugins/movement/server.js";
import * as battleRoyaleMapPlugin from "../src/plugins/battle-royale-map/server.js";
import {
  BASE_SPAWN_RADIUS,
  BUILDING,
  BUILDING_CENTER_X,
  BUILDING_CENTER_Z,
  DEFAULT_GROUND_SURFACE,
  STAIR,
  STAIR_STEP_COUNT,
  STAIR_STEP_HEIGHT,
  UPPER_FLOOR_Y,
  WAREHOUSE_FRONT_DOOR,
  WORLD_HALF_SIZE,
  acousticZoneAt,
  locationAt,
  setup as setupBattleRoyaleMap,
  stairHeightAt,
  surfaceAt,
} from "../src/plugins/battle-royale-map/server.js";

async function physicalMapHost() {
  return new PluginHost({
    plugins: [rapierPhysics, entitiesPlugin, battleRoyaleMapPlugin, movementPlugin],
  }).start();
}

test("battle royale map is an 800 metre wilderness with a two-floor warehouse", () => {
  assert.equal(WORLD_HALF_SIZE, 400);
  assert.equal(DEFAULT_GROUND_SURFACE, "forest");
  assert.equal(BUILDING.maxX - BUILDING.minX, 30);
  assert.equal(BUILDING.maxZ - BUILDING.minZ, 24);
  assert.equal(UPPER_FLOOR_Y, 3.2);
});

test("walking straight from the first spawn reaches the warehouse entrance after about 50 metres", () => {
  assert.equal(WAREHOUSE_FRONT_DOOR.x, BUILDING.maxX);
  assert.equal(WAREHOUSE_FRONT_DOOR.z, 0);
  assert.equal(BASE_SPAWN_RADIUS - WAREHOUSE_FRONT_DOOR.x, 50);
  assert.equal(BUILDING_CENTER_Z, 0);
});

test("warehouse stair helper matches the real 16-step Rapier staircase", () => {
  assert.equal(STAIR_STEP_COUNT, 16);
  assert.ok(Math.abs(STAIR_STEP_HEIGHT - 0.2) < 0.0001);
  const stairX = (STAIR.minX + STAIR.maxX) / 2;
  assert.ok(Math.abs(stairHeightAt({ x: stairX, z: 7.5 }) - 0.2) < 0.0001);
  assert.ok(Math.abs(stairHeightAt({ x: stairX, z: 0.5 }) - 1.6) < 0.0001);
  assert.ok(Math.abs(stairHeightAt({ x: stairX, z: -7.5 }) - UPPER_FLOOR_Y) < 0.0001);
});

test("a real Rapier character walks up and back down the warehouse stairs", async () => {
  const host = await physicalMapHost();
  const entities = host.services.get("entities");
  const movement = host.services.get("movement");
  const stairX = (STAIR.minX + STAIR.maxX) / 2;
  const id = entities.spawn({
    id: "physical-stair-walker",
    kind: "test",
    team: 1,
    position: { x: stairX, y: 0, z: STAIR.maxZ + 1, angle: 0 },
  });

  movement.setInput(id, { forward: 1, sprint: false });
  for (let i = 0; i < 115; i += 1) movement.tick(0.05);
  let transform = host.components.get(id, "Transform");
  assert.ok(transform.z < STAIR.minZ - 0.2, `walker did not leave the top of the stair: z=${transform.z}`);
  assert.ok(Math.abs(transform.y - UPPER_FLOOR_Y) < 0.08, `Rapier did not place walker on upper floor: y=${transform.y}`);
  assert.equal(transform.grounded, true);

  movement.setInput(id, { forward: -1, sprint: false });
  for (let i = 0; i < 115; i += 1) movement.tick(0.05);
  transform = host.components.get(id, "Transform");
  assert.ok(transform.z > STAIR.maxZ + 0.2, `walker did not leave the bottom of the stair: z=${transform.z}`);
  assert.ok(Math.abs(transform.y) < 0.08, `Rapier did not return walker to ground: y=${transform.y}`);
  assert.equal(transform.grounded, true);

  await host.stop();
});

test("map exposes surfaces, locations and indoor acoustic zones", () => {
  assert.equal(surfaceAt({ x: 0, y: 0, z: 0 }), "forest");
  assert.equal(surfaceAt({ x: BUILDING_CENTER_X, y: 0, z: BUILDING_CENTER_Z }), "concrete");
  assert.equal(surfaceAt({ x: BUILDING_CENTER_X + 10, y: 1.6, z: BUILDING_CENTER_Z }), "metal");
  assert.equal(surfaceAt({ x: BUILDING.minX - 5, y: 0, z: BUILDING_CENTER_Z }), "stone");
  assert.equal(surfaceAt({ x: -180, y: 0, z: 130 }), "sand");
  assert.equal(acousticZoneAt({ x: BUILDING_CENTER_X, y: 0, z: BUILDING_CENTER_Z }), "warehouse-ground");
  assert.equal(acousticZoneAt({ x: BUILDING_CENTER_X, y: UPPER_FLOOR_Y, z: BUILDING_CENTER_Z }), "warehouse-upper");
  assert.equal(acousticZoneAt({ x: 0, y: 0, z: 0 }), "outdoor");
  assert.equal(locationAt({ x: BUILDING_CENTER_X - 10, y: UPPER_FLOOR_Y, z: BUILDING_CENTER_Z }), "Склад, второй этаж");
});

test("closed warehouse door is announced as a door instead of a wall", async () => {
  let map = null;
  const physics = {
    beginBatch() {},
    endBatch() {},
    createFloor(spec) { return { spec }; },
    createWall(spec) { return { spec }; },
    setWallEnabled() {},
    raycastWorld() { return null; },
  };
  await setupBattleRoyaleMap({
    services: {
      get(name) {
        assert.equal(name, "physics");
        return physics;
      },
      provide(name, value) {
        assert.equal(name, "map");
        map = value;
      },
    },
    events: { emit() {} },
  });

  const blockage = map.describeBlockedMove(
    { x: WAREHOUSE_FRONT_DOOR.x + 0.6, y: 0, z: WAREHOUSE_FRONT_DOOR.z },
    { x: -0.2, y: 0, z: 0 },
    { x: 0, y: 0, z: 0 },
  );
  assert.equal(blockage.kind, "door");
  assert.match(blockage.speech, /Здесь дверь/i);
});

test("physical acoustic ray hears concrete and reacts to an opening door", async () => {
  const host = await physicalMapHost();
  const map = host.services.get("map");
  const west = { x: BUILDING_CENTER_X - 5, y: UPPER_FLOOR_Y, z: 0 };
  const east = { x: BUILDING_CENTER_X + 5, y: UPPER_FLOOR_Y, z: 0 };

  const closedDoorOcclusion = map.acousticOcclusionBetween(west, east);
  assert.ok(closedDoorOcclusion >= 0.9, `closed door should strongly muffle sound, got ${closedDoorOcclusion}`);

  const opened = map.interact({
    entityId: "acoustic-test",
    x: BUILDING_CENTER_X - 1.2,
    y: UPPER_FLOOR_Y,
    z: 0,
  });
  assert.equal(opened?.type, "door");
  assert.equal(opened?.open, true);
  const openDoorOcclusion = map.acousticOcclusionBetween(west, east);
  assert.ok(openDoorOcclusion < 0.1, `open doorway should clear the direct sound path, got ${openDoorOcclusion}`);

  const throughWall = map.acousticOcclusionBetween(
    { x: BUILDING_CENTER_X - 5, y: UPPER_FLOOR_Y, z: 4 },
    { x: BUILDING_CENTER_X + 5, y: UPPER_FLOOR_Y, z: 4 },
  );
  assert.ok(throughWall >= 0.8, `concrete separator should muffle sound, got ${throughWall}`);

  await host.stop();
});

test("warehouse declares a physical second-floor slab and physical stair blocks", async () => {
  const source = await readFile(new URL("../src/plugins/battle-royale-map/server.js", import.meta.url), "utf8");
  assert.match(source, /kind: "building-floor"/);
  assert.match(source, /kind: "building-stair"/);
  assert.match(source, /physics\.createFloor/);
});

test("upper room separator leaves exactly the physical door opening", async () => {
  const source = await readFile(new URL("../src/plugins/battle-royale-map/server.js", import.meta.url), "utf8");
  assert.match(source, /BUILDING_CENTER_Z \+ 6\.6, hx: 0\.25, hz: 5\.4/);
  assert.match(source, /BUILDING_CENTER_Z - 6\.6, hx: 0\.25, hz: 5\.4/);
  assert.match(source, /z: BUILDING_CENTER_Z,[\s\S]*hx: 0\.25,[\s\S]*hz: 1\.2/);
});
