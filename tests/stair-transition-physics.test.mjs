import test from "node:test";
import assert from "node:assert/strict";
import { PluginHost } from "../src/core/plugin-host.js";
import * as rapierPhysics from "../src/plugins/rapier-physics/server.js";
import * as entitiesPlugin from "../src/plugins/entities/server.js";
import * as movementPlugin from "../src/plugins/movement/server.js";
import * as battleRoyaleMapPlugin from "../src/plugins/battle-royale-map/server.js";
import { STAIR, UPPER_FLOOR_Y } from "../src/plugins/battle-royale-map/server.js";

test("a sub-sprint character clears the physical top lip from halfway up the warehouse stair", async () => {
  const host = await new PluginHost({
    plugins: [rapierPhysics, entitiesPlugin, battleRoyaleMapPlugin, movementPlugin],
  }).start();
  const entities = host.services.get("entities");
  const movement = host.services.get("movement");
  const id = entities.spawn({
    id: "stair-transition-probe",
    kind: "test",
    team: 1,
    position: { x: 68.25, y: 2.58, z: -1.2, angle: -Math.PI / 2 },
  });

  movement.setInput(id, { forward: 0.82, strafe: 0, turn: 0, sprint: false });
  for (let step = 0; step < 160; step += 1) movement.tick(0.05);

  const transform = host.components.get(id, "Transform");
  assert.ok(
    transform.x < STAIR.minX - 0.3 && transform.y >= UPPER_FLOOR_Y - 0.08,
    `physical stair seam blocked the character: x=${transform.x}, y=${transform.y}, z=${transform.z}`,
  );
  await host.stop();
});
