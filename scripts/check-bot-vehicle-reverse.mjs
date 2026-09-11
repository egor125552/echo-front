import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEchoFrontGame } from '../src/server/game.js';

test('a blocked bot reverses and steers before abandoning its car', async () => {
  const game = await createEchoFrontGame({ mode: 'battle-royale' });
  const s = game.host.services, c = game.host.components;
  const vehicles = s.get('vehicles'), physics = s.get('physics'), ai = s.get('bot-vehicles');
  let now = Date.now();
  try {
    for (const id of ['reverse-human-1', 'reverse-human-2']) game.api.connectHuman(id);
    for (const e of [...s.get('entities').all()]) if (e.bot) s.get('entities').remove(e.id);
    for (const [index, id] of ['reverse-human-1', 'reverse-human-2'].entries()) {
      Object.assign(c.get(id, 'Parachute'), { phase: 'landed', airborne: false });
      s.get('movement').teleport(id, { x: 300 + index * 20, y: 0, z: 300 });
      game.host.events.emit('parachute:landed', { entityId: id, now });
    }
    const body = physics.dynamicBody('br-jeep-2');
    body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    physics.setDynamicBodyTranslation('br-jeep-2', { x: 0, y: 1, z: 0 });
    physics.setDynamicBodyLinearVelocity('br-jeep-2', { x: 0, y: 0, z: 0 });
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    for (let i = 0; i < 30; i++) game.api.step(.05, now += 50);
    s.get('entities').spawn({ id: 'reverse-bot', kind: 'bot', bot: true, health: 200, position: { x: 0, y: 0, z: 4 } });
    assert(ai.assign('reverse-bot', 'br-jeep-2', { x: -300, y: 0, z: 0 }, now));
    game.api.step(.05, now += 50);
    assert.equal(vehicles.driverId('br-jeep-2'), 'reverse-bot');
    // The passage closes after route planning. The rear remains clear.
    physics.createWall({ kind: 'test-barrier', x: -4.2, y: 0, z: 0, hx: .35, hz: 6, height: 3 });
    let reversed = false, turned = false, reverseAngle = null;
    for (let i = 0; i < 220; i++) {
      game.api.step(.05, now += 50);
      const car = vehicles.stateFor('br-jeep-2'), state = ai.stateFor('reverse-bot');
      if (state?.phase === 'reverse') {
        reverseAngle ??= car.angle;
        reversed ||= car.forwardSpeed < -.3;
        turned ||= Math.abs(Math.atan2(Math.sin(car.angle - reverseAngle), Math.cos(car.angle - reverseAngle))) > .05;
      }
      if (reversed && turned) break;
    }
    assert(ai.summary().recoveries >= 1, 'Driver never attempted recovery');
    assert(reversed, 'Reverse throttle did not produce real backward motion');
    assert(turned, 'The reverse maneuver never changed the heading');
    assert.equal(vehicles.driverId('br-jeep-2'), 'reverse-bot', 'Driver abandoned the car without trying to back out');
  } finally { await game.host.stop(); }
});
