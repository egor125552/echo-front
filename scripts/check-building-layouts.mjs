import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { PluginHost } from "../src/core/plugin-host.js";
import * as rapier from "../src/plugins/rapier-physics/server.js";
import * as factory from "../src/plugins/battle-royale-building-factory/server.js";
import * as validator from "../src/plugins/battle-royale-building-design-validator/server.js";
import { BATTLE_ROYALE_BUILDINGS } from "../src/config/battle-royale-buildings.js";

// Real building colliders on a flat, isolated map: no bots, vehicles, or match clock.
const mapPlugin = {
  manifest: {
    id: "map-test-arena",
    requires: ["rapier-physics"],
    capabilities: ["services.provide", "services.consume"],
  },
  setup(ctx) {
    ctx.services.get("physics").createFloor({
      kind: "ground", x: 0, y: 0, z: 0, hx: 500, hz: 500,
    });
    ctx.services.provide("map", { walls: [], doors: [], crates: [] });
  },
};

let host;
let physics;
let map;
before(async () => {
  host = await new PluginHost({ plugins: [rapier, mapPlugin, factory] }).start();
  physics = host.services.get("physics");
  map = host.services.get("map");
});
after(async () => host?.stop());

function walk(from, to, id) {
  physics.createCharacter(id, from);
  try {
    const distance = Math.hypot(to.x - from.x, to.z - from.z);
    const steps = Math.ceil(distance / 0.05);
    for (let step = 0; step < steps; step += 1) {
      physics.move(id, (to.x - from.x) / steps, (to.z - from.z) / steps, -0.01);
    }
    return physics.position(id);
  } finally {
    physics.removeCharacter(id);
  }
}

function assertReached(actual, expected, label) {
  assert.ok(Math.hypot(actual.x - expected.x, actual.z - expected.z) < 0.08,
    `${label}: stopped at (${actual.x.toFixed(2)}, ${actual.z.toFixed(2)})`);
  assert.ok(Math.abs(actual.y - expected.y) < 0.12, `${label}: feet at unexpected height ${actual.y}`);
}

test("every entrance blocks when closed and allows walking both ways when open", () => {
  for (const building of map.navigationBuildings) {
    for (const transition of building.transitions.filter((entry) => entry.kind === "door")) {
      const door = map.doors.find((entry) => entry.id === transition.doorId);
      const outside = transition.fromPoint;
      const inside = transition.toPoint;
      physics.setWallEnabled(door.collider, true);
      const blocked = walk(outside, inside, `closed:${door.id}`);
      assert.ok(Math.hypot(blocked.x - inside.x, blocked.z - inside.z) > 0.5,
        `${door.id}: closed door did not stop the player`);
      physics.setWallEnabled(door.collider, false);
      try {
        assertReached(walk(outside, inside, `enter:${door.id}`), inside, `${door.id}: enter`);
        assertReached(walk(inside, outside, `exit:${door.id}`), outside, `${door.id}: exit`);
      } finally {
        physics.setWallEnabled(door.collider, true);
      }
    }
  }
});

test("the supply house has a walkable passage connecting both rooms", () => {
  const building = BATTLE_ROYALE_BUILDINGS.find((entry) => entry.id === "loot-house");
  const west = { x: building.x - 7, y: 0, z: building.z };
  const east = { x: building.x + 7, y: 0, z: building.z };
  assertReached(walk(west, east, "room:east"), east, "west to east room");
  assertReached(walk(east, west, "room:west"), west, "east to west room");
});

for (const building of BATTLE_ROYALE_BUILDINGS) {
  for (const stair of building.stairs ?? []) {
    test(`${stair.id}: upper landing has continuous physical support across the usable stair width`, () => {
      const ramp = map.walls.find((entry) => entry.stairId === stair.id);
      assert.ok(ramp, `${stair.id}: physical ramp missing`);
      const axis = stair.risesToward === "north" || stair.risesToward === "south" ? "z" : "x";
      const across = axis === "x" ? "z" : "x";
      const sign = stair.risesToward === "north" || stair.risesToward === "west" ? -1 : 1;
      const top = ramp[axis] + sign * ramp.run / 2;
      const highY = ramp.y + ramp.rise;
      // A wide staircase must deliver the player's feet onto the floor even
      // when they are walking off-centre. Rays expose gaps a capsule may bridge.
      for (const lateral of [0, -ramp.width / 2 + 0.35, ramp.width / 2 - 0.35]) {
        for (let sample = 1; sample <= 23; sample += 1) {
          const point = {
            x: ramp.x, y: highY + 0.1, z: ramp.z,
            [axis]: top + sign * sample * 0.05,
            [across]: ramp[across] + lateral,
          };
          const hit = physics.raycastWorld(point, { x: 0, y: -1, z: 0 }, 0.18);
          assert.ok(hit && Math.abs(hit.distance - 0.1) < 0.02,
            `${stair.id}: unsupported upper landing at x=${point.x.toFixed(2)}, z=${point.z.toFixed(2)}`);
        }
      }
    });
  }
}

test("the design validator rejects an upper landing separated from the stairs by a half-metre gap", async () => {
  await validator.setup(host.contextFor(validator.manifest));
  const broken = structuredClone(BATTLE_ROYALE_BUILDINGS.find((entry) => entry.id === "two-storey-house"));
  // Original reported layout: the ramp ends at local x=-0.5, the landing
  // begins at x=0. This fixture remains broken after the production fix.
  Object.assign(broken.stairs[0], { x: -3.5, z: 0, run: 6, width: 4, risesToward: "east" });
  broken.floors.find((floor) => floor.id === "upper").slabs = [
    { x: 4.5, z: 0, width: 9, depth: 14 },
    { x: -8, z: 0, width: 2, depth: 14 },
    { x: -3.5, z: 4.6, width: 7, depth: 4.8 },
    { x: -3.5, z: -4.6, width: 7, depth: 4.8 },
  ];
  const report = host.services.get("building-design-validator").validate(broken);
  assert.equal(report.ok, false, "a disconnected landing must not be accepted as a safe building");
});
