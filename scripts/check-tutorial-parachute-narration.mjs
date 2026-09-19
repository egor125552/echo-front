import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEchoFrontGame } from '../src/server/game.js';

test('automatic parachute tutorial waits for its spoken instruction, without relaunching twice', async () => {
  const game = await createEchoFrontGame({ mode: 'battle-royale', tutorial: true });
  const s = game.host.services, c = game.host.components;
  const events = game.host.events;
  const parachute = s.get('parachute');
  const tutorial = s.get('battle-royale-tutorial');
  const id = 'narration-tutorial-human';
  let now = Date.now() + 1000;
  try {
    game.api.connectHuman(id);
    assert.equal(tutorial.describe(id).phase, 'deploy-parachute');
    parachute.launch(id, { altitude: 80 }, ++now);
    parachute.deploy(id, ++now);
    tutorial.handleInput(id, { strafe: 1 }, ++now);
    assert.equal(tutorial.describe(id).phase, 'land');
    Object.assign(c.get(id, 'Parachute'), { phase: 'landed', airborne: false });
    s.get('movement').teleport(id, { x: 150, y: 0, z: 150, angle: 0 });
    events.emit('parachute:landed', { entityId: id, now: ++now });
    assert.equal(tutorial.describe(id).phase, 'ground-run');
    for (let i = 0; i < 6; i++) {
      events.emit('sound:spatial', { entityId: id, gait: 'run', now: ++now });
    }
    assert.equal(tutorial.describe(id).phase, 'automatic-parachute');
    assert.equal(parachute.stateFor(id).airborne, false, 'tutorial relaunched during speech');
    assert.equal(game.api.tutorialAcknowledge(id, 'other-phase', ++now), false);
    assert.equal(game.api.tutorialAcknowledge('not-a-connected-player', 'automatic-parachute', ++now), false);
    assert.equal(parachute.stateFor(id).airborne, false);
    assert.equal(game.api.tutorialAcknowledge(id, 'automatic-parachute', ++now), true);
    assert.equal(parachute.stateFor(id).phase, 'freefall');
    const launchHeight = c.get(id, 'Transform').y;
    assert(launchHeight > 80);
    assert.equal(game.api.tutorialAcknowledge(id, 'automatic-parachute', ++now), false);
    assert.equal(c.get(id, 'Transform').y, launchHeight, 'duplicate speech callback relaunched player');
    assert.equal(game.api.tutorialAcknowledge(id, 'automatic-parachute', ++now), false);
  } finally { await game.host.stop(); }
});
