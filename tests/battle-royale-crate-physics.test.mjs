import test from "node:test";
import assert from "node:assert/strict";
import { PluginHost } from "../src/core/plugin-host.js";
import * as rapierPhysics from "../src/plugins/rapier-physics/server.js";
import * as entitiesPlugin from "../src/plugins/entities/server.js";
import * as battleRoyaleMapPlugin from "../src/plugins/battle-royale-map/server.js";
import * as cratePhysicsPlugin from "../src/plugins/battle-royale-crate-physics/server.js";
import * as movementPlugin from "../src/plugins/movement/server.js";
import {
  CRATE_HALF_X,
  CRATE_HEIGHT,
} from "../src/plugins/battle-royale-crate-physics/server.js";

test("loot crates are real Rapier obstacles, announce themselves, and stay solid after opening", async () => {
  const host = await new PluginHost({
    plugins: [
      rapierPhysics,
      entitiesPlugin,
      battleRoyaleMapPlugin,
      cratePhysicsPlugin,
      movementPlugin,
    ],
  }).start();

  const entities = host.services.get("entities");
  const movement = host.services.get("movement");
  const physics = host.services.get("physics");
  const map = host.services.get("map");
  const crate = map.crates.find((item) => item.id === "crate-ground-rifle");
  assert.ok(crate, "ground rifle crate must exist");

  const rayHit = physics.raycastWorld(
    { x: crate.x + 3, y: CRATE_HEIGHT / 2, z: crate.z },
    { x: -1, y: 0, z: 0 },
    5,
  );
  assert.equal(rayHit?.worldObject?.kind, "loot-crate");
  assert.equal(rayHit?.worldObject?.crateId, crate.id);
  assert.equal(rayHit?.worldObject?.accessibleName, "ящик");

  const blockedEvents = [];
  host.events.on("movement:blocked", (payload) => blockedEvents.push(payload));

  const id = entities.spawn({
    id: "crate-walker",
    kind: "test",
    team: 1,
    position: {
      x: crate.x + 3,
      y: crate.y ?? 0,
      z: crate.z,
      angle: -Math.PI / 2,
    },
  });

  movement.setInput(id, { forward: 1, sprint: false });
  for (let i = 0; i < 80; i += 1) movement.tick(0.05);
  let transform = host.components.get(id, "Transform");
  assert.ok(
    transform.x > crate.x + CRATE_HALF_X,
    `walker passed through the closed crate: player x=${transform.x}, crate x=${crate.x}`,
  );
  assert.ok(
    transform.x < crate.x + 1.6,
    `walker did not actually reach the crate collider: player x=${transform.x}, crate x=${crate.x}`,
  );

  const crateBlock = blockedEvents.find((event) => event.objectId === crate.id);
  assert.ok(crateBlock, `crate collision was not exposed to accessibility: ${JSON.stringify(blockedEvents)}`);
  assert.equal(crateBlock.kind, "loot-crate");
  assert.equal(crateBlock.objectName, "ящик");
  assert.equal(crateBlock.speech, "Здесь ящик");

  const opened = map.interact({ entityId: id, ...transform });
  assert.equal(opened?.type, "crate");
  assert.equal(opened?.crateId, crate.id);
  assert.equal(crate.opened, true);

  const stoppedAt = transform.x;
  for (let i = 0; i < 40; i += 1) movement.tick(0.05);
  transform = host.components.get(id, "Transform");
  assert.ok(
    transform.x >= stoppedAt - 0.05,
    `opened crate stopped blocking movement: before=${stoppedAt}, after=${transform.x}`,
  );
  assert.ok(transform.x > crate.x + CRATE_HALF_X, "opened crate must remain a solid obstacle");

  await host.stop();
});
