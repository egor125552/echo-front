import test from "node:test";
import assert from "node:assert/strict";
import { PluginHost } from "../src/core/plugin-host.js";
import * as rapierPhysics from "../src/plugins/rapier-physics/server.js";
import * as entitiesPlugin from "../src/plugins/entities/server.js";
import * as movementPlugin from "../src/plugins/movement/server.js";
import * as battleRoyaleMapPlugin from "../src/plugins/battle-royale-map/server.js";
import {
  BASE_SPAWN_RADIUS,
  BUILDING_CENTER_Z,
  STAIR,
  UPPER_FLOOR_Y,
} from "../src/plugins/battle-royale-map/server.js";

async function physicalMapHost() {
  return new PluginHost({
    plugins: [rapierPhysics, entitiesPlugin, battleRoyaleMapPlugin, movementPlugin],
  }).start();
}

test("a human sprinting straight from the first spawn stays grounded and climbs the entrance stair", async () => {
  const host = await physicalMapHost();
  const entities = host.services.get("entities");
  const movement = host.services.get("movement");
  const map = host.services.get("map");

  map.setDoorOpen("warehouse-front-door", true, "stair-entry-human", 0);
  const id = entities.spawn({
    id: "stair-entry-human",
    kind: "human",
    bot: false,
    team: 1,
    position: {
      x: BASE_SPAWN_RADIUS,
      y: 0,
      z: BUILDING_CENTER_Z,
      angle: -Math.PI / 2,
    },
  });

  movement.setInput(id, { forward: 1, sprint: true });
  let minGroundY = Infinity;
  let reachedUpper = false;
  for (let step = 0; step < 260; step += 1) {
    movement.tick(0.05, step * 50);
    const transform = host.components.get(id, "Transform");
    if (transform.x > STAIR.maxX + 0.4) minGroundY = Math.min(minGroundY, transform.y);
    if (transform.x < STAIR.minX - 0.4 && transform.y >= UPPER_FLOOR_Y - 0.1) {
      reachedUpper = true;
      break;
    }
  }

  const transform = host.components.get(id, "Transform");
  assert.ok(minGroundY > -0.08, `character sank below the flat ground before the stair: minY=${minGroundY}`);
  assert.equal(reachedUpper, true, `straight sprint still stuck at the stair lip: x=${transform.x}, y=${transform.y}, z=${transform.z}, grounded=${transform.grounded}`);
  assert.ok(Math.abs(transform.z - BUILDING_CENTER_Z) < 0.15, `straight sprint drifted sideways: z=${transform.z}`);

  await host.stop();
});
