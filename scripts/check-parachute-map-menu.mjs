import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEchoFrontGame } from '../src/server/game.js';
const PLAYER = '77777777-7777-4777-8777-777777777777';

async function scenario(run) {
  const game = await createEchoFrontGame({ mode: 'battle-royale' });
  try {
    game.api.connectHuman(PLAYER);
    await run(game, game.host.services);
  } finally { await game.host.stop(); }
}

function assertMenuMatchesCatalog(game, services) {
  // Exercise the actual per-player snapshot and JSON sent to the client menu.
  const snapshot = JSON.parse(JSON.stringify(game.api.snapshotFor(PLAYER)));
  const targets = services.get('navigation').availableTargets(PLAYER);
  assert(targets.length > 0, 'The server must have real map targets');
  assert.equal(snapshot.navigation.menuTitle, 'Карта');
  assert.deepEqual(snapshot.navigation.items?.map(item => item.id), targets.map(item => item.id),
    'Flight snapshots must preserve the map menu target list');
  for (let i = 0; i < targets.length; i++) {
    assert.equal(snapshot.navigation.items[i].name, targets[i].name);
    assert(Math.abs(snapshot.navigation.items[i].distance - targets[i].distance) < .001);
  }
  return snapshot;
}

test('map targets are available immediately during freefall with no selected route', () => scenario((game, s) => {
  assert.equal(s.get('parachute').stateFor(PLAYER).airborne, true);
  assert.equal(s.get('navigation').stateFor(PLAYER).active, false);
  assertMenuMatchesCatalog(game, s);
}));

test('deployed parachute preserves targets while selecting and switching active routes', () => scenario((game, s) => {
  const flight = game.host.components.get(PLAYER, 'Parachute');
  flight.phase = 'deployed';
  flight.airborne = true;
  const targets = s.get('navigation').availableTargets(PLAYER);
  for (const target of targets.filter(t => t.kind === 'building').slice(0, 2)) {
    game.api.handleInput(PLAYER, { navigationSelectTargetId: target.id, navigationActivateSelected: true });
    const snapshot = assertMenuMatchesCatalog(game, s);
    assert.equal(snapshot.navigation.target.id, target.id);
    assert.equal(snapshot.navigation.active, true);
    assert.equal(snapshot.navigation.route.mode, 'parachute');
    assert.equal(snapshot.navigation.checkpoint.kind, 'air-target');
  }
}));

test('landing retains the menu and restores a ground route', () => scenario((game, s) => {
  game.api.handleInput(PLAYER, { navigationSelectTargetId: 'warehouse', navigationActivateSelected: true });
  assertMenuMatchesCatalog(game, s);
  Object.assign(game.host.components.get(PLAYER, 'Parachute'), { phase: 'landed', airborne: false });
  s.get('movement').teleport(PLAYER, { x: 0, y: 0, z: 0 });
  game.host.events.emit('parachute:landed', { entityId: PLAYER, now: Date.now() });
  const snapshot = assertMenuMatchesCatalog(game, s);
  assert.equal(snapshot.navigation.route.mode, 'foot');
  assert.equal(snapshot.navigation.target.id, 'warehouse');
}));
