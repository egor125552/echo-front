import test from "node:test";
import assert from "node:assert/strict";
import { createEchoFrontGame } from "../src/server/game.js";

test("dead character colliders stop blocking movement and raycasts until respawn", async () => {
  const game = await createEchoFrontGame();
  game.api.connectHuman("human-dead-collider");

  const movement = game.host.services.get("movement");
  const physics = game.host.services.get("physics");
  const combat = game.host.services.get("combat");
  const snapshot = game.api.snapshot();
  const human = snapshot.entities.find((entity) => entity.id === "human-dead-collider");
  const enemy = snapshot.entities.find((entity) => entity.bot && entity.team !== human.team);
  assert.ok(enemy);

  movement.teleport(human.id, { x: -2, z: 0, angle: Math.PI / 2 });
  movement.teleport(enemy.id, { x: 0, z: 0, angle: 0 });

  const before = physics.raycast({ x: -2, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }, 3, human.id);
  assert.equal(before?.entityId, enemy.id, "living enemy should physically block the ray");

  combat.damage(enemy.id, 999, { attackerId: human.id, weaponId: "pistol" });
  assert.equal(game.api.snapshot().entities.find((entity) => entity.id === enemy.id)?.alive, false);

  const after = physics.raycast({ x: -2, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }, 3, human.id);
  assert.notEqual(after?.entityId, enemy.id, "dead enemy should no longer be a physical blocker");

  movement.setInput(human.id, { forward: 1, strafe: 0, turn: 0, sprint: false });
  for (let step = 0; step < 9; step += 1) movement.tick(0.1);
  const movedHuman = game.api.snapshot().entities.find((entity) => entity.id === human.id);
  assert.ok(movedHuman.x > 0.2, `human should pass through the dead enemy position, x=${movedHuman.x}`);

  await game.host.stop();
});
