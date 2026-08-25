import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  BASE_SPAWN_RADIUS,
  BUILDING,
  BUILDING_CENTER_X,
  BUILDING_CENTER_Z,
  DEFAULT_GROUND_SURFACE,
  STAIR,
  UPPER_FLOOR_Y,
  WAREHOUSE_FRONT_DOOR,
  WORLD_HALF_SIZE,
  acousticZoneAt,
  heightAt,
  locationAt,
  stairHeightAt,
  surfaceAt,
} from "../src/plugins/battle-royale-map/server.js";

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

test("warehouse stairs provide continuous physical elevation between floors", () => {
  const stairX = (STAIR.minX + STAIR.maxX) / 2;
  const bottom = { x: stairX, z: STAIR.maxZ, currentY: 0 };
  const middle = { x: stairX, z: (STAIR.minZ + STAIR.maxZ) / 2, currentY: 1.6 };
  const top = { x: stairX, z: STAIR.minZ, currentY: UPPER_FLOOR_Y };
  assert.equal(stairHeightAt(bottom), 0);
  assert.ok(Math.abs(stairHeightAt(middle) - 1.6) < 0.001);
  assert.ok(Math.abs(stairHeightAt(top) - UPPER_FLOOR_Y) < 0.001);
  assert.equal(heightAt({ x: BUILDING_CENTER_X - 10, z: BUILDING_CENTER_Z, currentY: 0 }), 0);
  assert.equal(heightAt({ x: BUILDING_CENTER_X - 10, z: BUILDING_CENTER_Z, currentY: UPPER_FLOOR_Y }), UPPER_FLOOR_Y);
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

test("warehouse declares a physical second-floor slab around the stair opening", async () => {
  const source = await readFile(new URL("../src/plugins/battle-royale-map/server.js", import.meta.url), "utf8");
  assert.match(source, /kind: "building-floor"/);
  assert.match(source, /floorBottomY/);
});

test("upper room separator leaves exactly the physical door opening", async () => {
  const source = await readFile(new URL("../src/plugins/battle-royale-map/server.js", import.meta.url), "utf8");
  assert.match(source, /BUILDING_CENTER_Z \+ 6\.6, hx: 0\.25, hz: 5\.4/);
  assert.match(source, /BUILDING_CENTER_Z - 6\.6, hx: 0\.25, hz: 5\.4/);
  assert.match(source, /z: BUILDING_CENTER_Z, hx: 0\.25, hz: 1\.2/);
});
