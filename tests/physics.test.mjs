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
