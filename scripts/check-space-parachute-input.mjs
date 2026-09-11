import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createEchoFrontGame } from '../src/server/game.js';

const PLAYER = '44444444-4444-4444-8444-444444444444';

async function scenario(run) {
  const game = await createEchoFrontGame({ mode: 'battle-royale' });
  try {
    game.api.connectHuman(PLAYER);
    await run(game, game.host.services);
  } finally {
    await game.host.stop();
  }
}

test('Space has one keyboard owner and produces parachutePressed in the shared input layer', async () => {
  const [inputSource, parachuteSource] = await Promise.all([
    readFile(new URL('../client/plugins/input.js', import.meta.url), 'utf8'),
    readFile(new URL('../client/plugins/parachute-input.js', import.meta.url), 'utf8'),
  ]);

  assert.match(inputSource, /"Space"/);
  assert.match(inputSource, /event\.code === "Space"\) parachutePressed = true/);
  assert.doesNotMatch(parachuteSource, /event\.code === "Space"/,
    'parachute-input must not register a second keyboard Space handler');
});

test('Space in freefall deploys exactly once', () => scenario((game, services) => {
  const parachute = services.get('parachute');
  assert.equal(parachute.stateFor(PLAYER).phase, 'freefall');

  game.api.handleInput(PLAYER, { parachutePressed: true }, Date.now());
  const state = parachute.stateFor(PLAYER);
  assert.equal(state.phase, 'deployed');
  assert.equal(state.deployed, true);
  assert.equal(state.deployCount, 1);
}));

test('Space while ragdolled hands the player to a deployed parachute', () => scenario((game, services) => {
  const parachute = services.get('parachute');
  const ragdoll = services.get('ragdoll');
  const transform = game.host.components.get(PLAYER, 'Transform');

  transform.y = 120;
  transform.grounded = false;
  transform.verticalVelocity = -18;
  assert.equal(ragdoll.activate(PLAYER, {
    reason: 'space-regression-test',
    position: { x: transform.x, y: 120, z: transform.z },
    velocity: { x: 0, y: -18, z: 0 },
  }, Date.now()), true);

  game.api.handleInput(PLAYER, { parachutePressed: true }, Date.now() + 10);
  assert.equal(ragdoll.isActive(PLAYER), false);
  assert.equal(parachute.stateFor(PLAYER)?.phase, 'deployed');
  assert.equal(parachute.stateFor(PLAYER)?.deployed, true);
}));

test('Space on the ground remains a jump and does not deploy the parachute', () => scenario((game, services) => {
  const movement = services.get('movement');
  const parachute = services.get('parachute');
  const transform = game.host.components.get(PLAYER, 'Transform');
  const flight = game.host.components.get(PLAYER, 'Parachute');

  movement.teleport(PLAYER, { x: 0, y: 0, z: 0 });
  Object.assign(flight, { phase: 'landed', airborne: false, deployed: false });
  transform.grounded = true;
  transform.verticalVelocity = 0;

  const now = Date.now();
  game.api.handleInput(PLAYER, { parachutePressed: true }, now);
  game.api.step(0.05, now + 50);

  assert(transform.y > 0 || transform.verticalVelocity > 0, 'Space must still jump on supported ground');
  assert.equal(parachute.stateFor(PLAYER)?.deployed, false);
  assert.equal(parachute.stateFor(PLAYER)?.phase, 'landed');
}));
