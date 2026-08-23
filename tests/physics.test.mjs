import test from "node:test";
import assert from "node:assert/strict";
import { PluginHost } from "../src/core/plugin-host.js";
import { walkingTestPreset } from "../src/presets/walking-test.js";

test("Rapier walking preset creates and moves a character", async () => {
  const host = await new PluginHost({ plugins: walkingTestPreset }).start();
  const entities = host.services.get("entities");
  const movement = host.services.get("movement");

  const id = entities.spawn({
    id: "walker",
    kind: "test",
    team: 1,
    position: { x: -10, z: 10, angle: 0 },
  });
  const before = host.components.get(id, "Transform");
  assert.ok(before);
  const startZ = before.z;

  movement.setInput(id, { forward: 1, turn: 0, sprint: false });
  movement.tick(0.1);

  const after = host.components.get(id, "Transform");
  assert.ok(after.z < startZ, `expected forward motion, got ${startZ} -> ${after.z}`);
  await host.stop();
});

test("Rapier arena walls block character movement", async () => {
  const host = await new PluginHost({ plugins: walkingTestPreset }).start();
  const entities = host.services.get("entities");
  const movement = host.services.get("movement");

  const id = entities.spawn({
    id: "wall-test",
    kind: "test",
    team: 1,
    position: { x: 0, z: -13.8, angle: 0 },
  });
  movement.setInput(id, { forward: 1, turn: 0, sprint: true });
  for (let i = 0; i < 30; i += 1) movement.tick(0.05);

  const after = host.components.get(id, "Transform");
  assert.ok(after.z > -15, `character escaped arena boundary: ${after.z}`);
  await host.stop();
});

test("Rapier raycasts hit characters and line of sight is blocked by arena walls", async () => {
  const host = await new PluginHost({ plugins: walkingTestPreset }).start();
  const entities = host.services.get("entities");
  const physics = host.services.get("physics");

  entities.spawn({
    id: "ray-source",
    kind: "test",
    team: 1,
    position: { x: -12, z: 0, angle: 0 },
  });
  entities.spawn({
    id: "ray-target",
    kind: "test",
    team: 2,
    position: { x: -10, z: 0, angle: 0 },
  });

  const hit = physics.raycast(
    { x: -12, y: 1, z: 0 },
    { x: 1, y: 0, z: 0 },
    5,
    "ray-source",
  );
  assert.equal(hit?.entityId, "ray-target");
  assert.ok(hit.distance > 0 && hit.distance < 5);

  assert.equal(
    physics.lineOfSight(
      { x: -12, z: 0 },
      { x: -10, z: 0 },
      "ray-source",
      "ray-target",
    ),
    true,
  );

  assert.equal(
    physics.lineOfSight(
      { x: -9, z: 0 },
      { x: -6, z: 0 },
    ),
    false,
    "vertical arena wall at x=-7.5 must block line of sight",
  );

  await host.stop();
});
