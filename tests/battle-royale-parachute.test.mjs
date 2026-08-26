import test from "node:test";
import assert from "node:assert/strict";
import { createEchoFrontGame } from "../src/server/game.js";
import {
  PARACHUTE_LAUNCH_ALTITUDE,
  PARACHUTE_AUTO_DEPLOY_ALTITUDE,
} from "../src/plugins/battle-royale-parachute/server.js";

async function activeParachuteGame(playerId) {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  game.api.connectHuman(playerId);
  const deployment = game.api.snapshot().match;
  game.api.step(0.05, deployment.deploymentEndsAt + 1);
  return { game, now: deployment.deploymentEndsAt + 1 };
}

function selfSnapshot(game, playerId, now = Date.now()) {
  return game.api.snapshotFor(playerId, now).entities.find((entity) => entity.id === playerId);
}

test("Battle Royale launches the human into a real Rapier freefall", async () => {
  const playerId = "parachute-freefall-human";
  const { game, now } = await activeParachuteGame(playerId);
  const physics = game.host.services.get("physics");
  const parachute = game.host.services.get("parachute");
  const first = selfSnapshot(game, playerId, now);

  assert.ok(first.parachute?.airborne);
  assert.equal(first.parachute.phase, "freefall");
  assert.ok(first.y > PARACHUTE_LAUNCH_ALTITUDE - 2);
  assert.deepEqual(
    physics.position(playerId),
    { x: first.x, y: first.y, z: first.z },
  );

  game.api.step(0.05, now + 50);
  const falling = selfSnapshot(game, playerId, now + 50);
  assert.ok(falling.y < first.y);
  assert.ok(falling.parachute.verticalVelocity < 0);
  assert.equal(parachute.stateFor(playerId).phase, "freefall");
  await game.host.stop();
});

test("deploying the parachute brakes descent and allows Rapier glide steering", async () => {
  const playerId = "parachute-glide-human";
  const { game, now } = await activeParachuteGame(playerId);

  for (let i = 1; i <= 35; i += 1) game.api.step(0.05, now + i * 50);
  const beforeDeploy = selfSnapshot(game, playerId, now + 1750);
  assert.ok(beforeDeploy.parachute.verticalVelocity < -8);

  game.api.handleInput(playerId, { parachutePressed: true, forward: 1 }, now + 1800);
  for (let i = 1; i <= 25; i += 1) game.api.step(0.05, now + 1800 + i * 50);
  const gliding = selfSnapshot(game, playerId, now + 3050);

  assert.equal(gliding.parachute.phase, "deployed");
  assert.ok(Math.abs(gliding.parachute.verticalVelocity) < Math.abs(beforeDeploy.parachute.verticalVelocity));
  assert.ok(Math.abs(gliding.parachute.verticalVelocity) < 6.5);
  assert.ok(Math.hypot(gliding.x - beforeDeploy.x, gliding.z - beforeDeploy.z) > 2.5);

  const transform = game.host.components.get(playerId, "Transform");
  assert.ok(transform.stepDistance < 0, "airborne movement must not emit ground footsteps");
  await game.host.stop();
});

test("the player can cut, accelerate, redeploy, and land", async () => {
  const playerId = "parachute-cycle-human";
  const { game, now } = await activeParachuteGame(playerId);
  const parachute = game.host.services.get("parachute");

  game.api.handleInput(playerId, { parachutePressed: true }, now + 100);
  for (let i = 1; i <= 24; i += 1) game.api.step(0.05, now + 100 + i * 50);
  const underCanopy = selfSnapshot(game, playerId, now + 1300);
  assert.equal(underCanopy.parachute.phase, "deployed");

  game.api.handleInput(playerId, { parachutePressed: true }, now + 1350);
  for (let i = 1; i <= 18; i += 1) game.api.step(0.05, now + 1350 + i * 50);
  const afterCut = selfSnapshot(game, playerId, now + 2250);
  assert.equal(afterCut.parachute.phase, "freefall");
  assert.ok(Math.abs(afterCut.parachute.verticalVelocity) > Math.abs(underCanopy.parachute.verticalVelocity) + 2);

  game.api.handleInput(playerId, { parachutePressed: true }, now + 2300);
  for (let i = 1; i <= 24; i += 1) game.api.step(0.05, now + 2300 + i * 50);
  const redeployed = selfSnapshot(game, playerId, now + 3500);
  assert.equal(redeployed.parachute.phase, "deployed");
  assert.equal(redeployed.parachute.deployCount, 2);
  assert.ok(Math.abs(redeployed.parachute.verticalVelocity) < Math.abs(afterCut.parachute.verticalVelocity));

  let clock = now + 3500;
  for (let i = 0; i < 500 && parachute.stateFor(playerId)?.airborne; i += 1) {
    clock += 50;
    game.api.step(0.05, clock);
  }
  const landed = selfSnapshot(game, playerId, clock);
  assert.equal(landed.parachute.phase, "landed");
  assert.ok(landed.y <= 0.01);
  assert.ok(landed.parachute.lastImpactSpeed > 0);
  await game.host.stop();
});

test("auto deployment protects the first descent near the ground", async () => {
  const playerId = "parachute-auto-human";
  const { game, now } = await activeParachuteGame(playerId);
  const movement = game.host.services.get("movement");
  const parachute = game.host.services.get("parachute");

  movement.teleport(playerId, { x: 0, y: PARACHUTE_AUTO_DEPLOY_ALTITUDE + 0.4, z: 0, angle: 0 });
  const transform = game.host.components.get(playerId, "Transform");
  transform.verticalVelocity = -12;

  let clock = now;
  for (let i = 0; i < 10 && parachute.stateFor(playerId).phase === "freefall"; i += 1) {
    clock += 50;
    game.api.step(0.05, clock);
  }
  assert.equal(parachute.stateFor(playerId).phase, "deployed");
  await game.host.stop();
});
