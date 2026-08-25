import test from "node:test";
import assert from "node:assert/strict";
import { PluginHost } from "../src/core/plugin-host.js";
import { walkingTestPreset } from "../src/presets/walking-test.js";

test("Rapier walking preset creates and moves a grounded character", async () => {
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
  assert.ok(Math.abs(after.y) < 0.05, `physical ground should keep y near zero, got ${after.y}`);
  assert.equal(after.grounded, true);
  await host.stop();
});

test("Rapier gravity settles a character onto the physical map floor", async () => {
  const host = await new PluginHost({ plugins: walkingTestPreset }).start();
  const entities = host.services.get("entities");
  const movement = host.services.get("movement");

  const id = entities.spawn({
    id: "fall-test",
    kind: "test",
    team: 1,
    position: { x: 0, y: 2.5, z: 0, angle: 0 },
  });
  movement.setInput(id, {});
  for (let i = 0; i < 40; i += 1) movement.tick(0.05);

  const after = host.components.get(id, "Transform");
  assert.ok(Math.abs(after.y) < 0.06, `character should land on Rapier floor, got y=${after.y}`);
  assert.equal(after.grounded, true);
  await host.stop();
});

test("Rapier forest world boundary blocks character movement", async () => {
  const host = await new PluginHost({ plugins: walkingTestPreset }).start();
  const entities = host.services.get("entities");
  const movement = host.services.get("movement");

  const id = entities.spawn({
    id: "wall-test",
    kind: "test",
    team: 1,
    position: { x: 0, z: -48.8, angle: 0 },
  });
  movement.setInput(id, { forward: 1, turn: 0, sprint: true });
  for (let i = 0; i < 30; i += 1) movement.tick(0.05);

  const after = host.components.get(id, "Transform");
  assert.ok(after.z > -50, `character escaped forest world boundary: ${after.z}`);
  await host.stop();
});

test("Rapier raycasts hit characters and static-world rays expose collider metadata", async () => {
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

  physics.createWall({ kind: "test-concrete-wall", material: "concrete", x: -7.5, z: 0, hx: 0.35, hz: 4 });
  assert.equal(
    physics.lineOfSight(
      { x: -9, z: 0 },
      { x: -6, z: 0 },
    ),
    false,
    "physical wall at x=-7.5 must block line of sight",
  );

  const staticHit = physics.raycastWorld(
    { x: -9, y: 1, z: 0 },
    { x: 1, y: 0, z: 0 },
    3,
  );
  assert.equal(staticHit?.entityId, null);
  assert.equal(staticHit?.worldObject?.kind, "test-concrete-wall");
  assert.equal(staticHit?.worldObject?.material, "concrete");

  await host.stop();
});
