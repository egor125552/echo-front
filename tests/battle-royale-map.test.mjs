import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  BUILDING,
  DEFAULT_GROUND_SURFACE,
  STAIR,
  UPPER_FLOOR_Y,
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

test("warehouse stairs provide continuous physical elevation between floors", () => {
  const bottom = { x: 80, z: STAIR.maxZ, currentY: 0 };
  const middle = { x: 80, z: (STAIR.minZ + STAIR.maxZ) / 2, currentY: 1.6 };
  const top = { x: 80, z: STAIR.minZ, currentY: UPPER_FLOOR_Y };
  assert.equal(stairHeightAt(bottom), 0);
  assert.ok(Math.abs(stairHeightAt(middle) - 1.6) < 0.001);
  assert.ok(Math.abs(stairHeightAt(top) - UPPER_FLOOR_Y) < 0.001);
  assert.equal(heightAt({ x: 60, z: -50, currentY: 0 }), 0);
  assert.equal(heightAt({ x: 60, z: -50, currentY: UPPER_FLOOR_Y }), UPPER_FLOOR_Y);
});

test("map exposes surfaces, locations and indoor acoustic zones", () => {
  assert.equal(surfaceAt({ x: 0, y: 0, z: 0 }), "forest");
  assert.equal(surfaceAt({ x: 70, y: 0, z: -50 }), "concrete");
  assert.equal(surfaceAt({ x: 80, y: 1.6, z: -50 }), "metal");
  assert.equal(surfaceAt({ x: 50, y: 0, z: -50 }), "stone");
  assert.equal(surfaceAt({ x: -180, y: 0, z: 130 }), "sand");
  assert.equal(acousticZoneAt({ x: 70, y: 0, z: -50 }), "warehouse-ground");
  assert.equal(acousticZoneAt({ x: 70, y: UPPER_FLOOR_Y, z: -50 }), "warehouse-upper");
  assert.equal(acousticZoneAt({ x: 0, y: 0, z: 0 }), "outdoor");
  assert.equal(locationAt({ x: 60, y: UPPER_FLOOR_Y, z: -50 }), "Склад, второй этаж");
});

test("warehouse declares a physical second-floor slab around the stair opening", async () => {
  const source = await readFile(new URL("../src/plugins/battle-royale-map/server.js", import.meta.url), "utf8");
  assert.match(source, /kind: "building-floor"/);
  assert.match(source, /floorBottomY/);
});

test("upper room separator leaves exactly the physical door opening", async () => {
  const source = await readFile(new URL("../src/plugins/battle-royale-map/server.js", import.meta.url), "utf8");
  assert.match(source, /z: -43\.4, hx: 0\.25, hz: 5\.4/);
  assert.match(source, /z: -56\.6, hx: 0\.25, hz: 5\.4/);
  assert.match(source, /z: -50, hx: 0\.25, hz: 1\.2/);
});
