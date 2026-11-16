import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createEchoFrontGame } from '../src/server/game.js';
import { mergeParachutePressed } from '../public/client/plugins/parachute-input.js';

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
    readFile(new URL('../public/client/plugins/input.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/client/plugins/parachute-input.js', import.meta.url), 'utf8'),
  ]);

  assert.match(inputSource, /"Space"/);
  assert.match(inputSource, /event\.code === "Space"\) parachutePressed = true/);
  assert.doesNotMatch(parachuteSource, /event\.code === "Space"/,
    'parachute-input must not register a second keyboard Space handler');
});

test('parachute input wrapper preserves physical Space and touch impulses', () => {
  assert.equal(mergeParachutePressed({ parachutePressed: true }, false), true,
    'physical Space from keyboard-input must survive the parachute wrapper');
  assert.equal(mergeParachutePressed({ parachutePressed: false }, true), true,
    'touch parachute action must still produce an impulse');
  assert.equal(mergeParachutePressed({ parachutePressed: false }, false), false);
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

test('Space after ejecting from a moving vehicle deploys the parachute mid-air even below 8m', () => scenario((game, services) => {
  const movement = services.get('movement');
  const parachute = services.get('parachute');
  const ragdoll = services.get('ragdoll');
  const vehicles = services.get('vehicles');
  const physics = services.get('physics');
  const flight = game.host.components.get(PLAYER, 'Parachute');

  Object.assign(flight, { phase: 'landed', airborne: false, deployed: false });
  const car = vehicles.snapshot()[0];
  assert.ok(car, 'Expected a Battle Royale vehicle');
  movement.teleport(PLAYER, { x: car.x, y: 0, z: car.z + 2.2 });

  const now = Date.now();
  assert.equal(vehicles.enter(PLAYER, now, car.id), true);
  physics.setDynamicBodyLinearVelocity(car.id, { x: 22, y: 0, z: 0 });
  game.api.step(0.05, now + 50);

  // Jump out of the speeding car
  game.api.handleInput(PLAYER, { interactPressed: true }, now + 60);
  assert.equal(ragdoll.stateFor(PLAYER)?.reason, 'vehicle-eject');

  // Step 150ms into the ejection arc (altitude is ~1.5-2.5m, well below old 8m limit)
  game.api.step(0.05, now + 110);
  game.api.step(0.05, now + 160);
  game.api.step(0.05, now + 210);

  // Press Space to deploy parachute while flying out of the car
  game.api.handleInput(PLAYER, { parachutePressed: true }, now + 220);
  assert.equal(ragdoll.isActive(PLAYER), false, 'Ragdoll must hand off to parachute on vehicle-eject Space press');
  const chute = parachute.stateFor(PLAYER);
  assert.equal(chute?.phase, 'deployed');
  assert.equal(chute?.deployed, true);
  assert.ok(chute?.glideSpeed > 1.5, 'Emergency vehicle-eject parachute must preserve forward glide momentum');
}));

test('Double-tap / duplicate parachutePressed within cooldown does not immediately close a newly opened parachute', () => scenario((game, services) => {
  const parachute = services.get('parachute');
  const now = Date.now();
  assert.equal(parachute.stateFor(PLAYER).phase, 'freefall');

  // First impulse opens the parachute
  game.api.handleInput(PLAYER, { parachutePressed: true }, now);
  assert.equal(parachute.stateFor(PLAYER).phase, 'deployed');

  // Immediate duplicate impulse (e.g. double-tap or bounce within < 450ms) must NOT cut the canopy
  game.api.handleInput(PLAYER, { parachutePressed: true }, now + 10);
  assert.equal(parachute.stateFor(PLAYER).phase, 'deployed');
  assert.equal(parachute.stateFor(PLAYER).deployed, true);

  // Deliberate second double-tap after cooldown (>= 450ms) cuts the canopy as intended
  game.api.handleInput(PLAYER, { parachutePressed: true }, now + 500);
  assert.equal(parachute.stateFor(PLAYER).phase, 'freefall');
  assert.equal(parachute.stateFor(PLAYER).deployed, false);
}));


