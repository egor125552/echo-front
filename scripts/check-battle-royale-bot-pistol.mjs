import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEchoFrontGame } from '../src/server/game.js';

test('nearby BR pistol bot abandons car search, fires distinct bursts, and respects actual ammo', async () => {
  const game = await createEchoFrontGame({ mode: 'battle-royale' });
  const s = game.host.services, c = game.host.components;
  let now = Date.now() + 1000;
  try {
    game.api.connectHuman('pistol-target');
    game.api.connectHuman('distant-survivor');
    for (const entity of [...s.get('entities').all()]) {
      if (entity.bot) s.get('entities').remove(entity.id);
    }
    for (const id of ['pistol-target', 'distant-survivor']) {
      Object.assign(c.get(id, 'Parachute'), { phase: 'landed', airborne: false });
      game.host.events.emit('parachute:landed', { entityId: id, now });
    }
    s.get('movement').teleport('pistol-target', { x: 150, y: 0, z: 150, angle: 0 });
    s.get('movement').teleport('distant-survivor', { x: -400, y: 0, z: -400, angle: 0 });
    const id = 'br-pistol-test';
    s.get('entities').spawn({
      id, kind: 'bot', bot: true, team: 71, health: 200, weapons: ['pistol'],
      position: { x: 150, y: 0, z: 141, angle: Math.PI },
    });
    s.get('movement').teleport(id, { x: 150, y: 0, z: 141, angle: Math.PI });
    const shotTimes = [];
    for (let tick = 0; tick < 250; tick++) {
      now += 50;
      game.api.step(.05, now);
      for (const event of game.drainEvents()) {
        if (event.event === 'weapon:fired' && event.payload.entityId === id) shotTimes.push(now);
      }
    }
    assert.equal(s.get('battle-royale').status(now).phase, 'active');
    assert.equal(c.get(id, 'Bot').vehicleControl, false, 'bot ignored visible enemy to seek a car');
    assert(shotTimes.length >= 6, 'nearby pistol bot never engaged');
    const intervals = shotTimes.slice(1).map((t, i) => t - shotTimes[i]);
    assert(intervals.every(ms => ms >= 100), 'bot fired twice too fast');
    assert(intervals.some(ms => ms <= 250), 'bot has no rapid pistol taps');
    assert(intervals.some(ms => ms >= 400), 'bot has no pause between bursts');
    assert.equal(c.get(id, 'Weapons').items[0].ammo, 100 - shotTimes.length);
  } finally { await game.host.stop(); }
});

test('BR vehicle firearm guard preserves separate physical-style taps on foot', async () => {
  const game = await createEchoFrontGame({ mode: 'battle-royale' });
  try {
    game.api.connectHuman('quick-tap-test');
    const weapons = game.host.services.get('weapons');
    const c = game.host.components;
    const item = c.get('quick-tap-test', 'Weapons').items[0];
    const now = Date.now() + 1000;
    assert.equal(weapons.fire('quick-tap-test', now, { pressed: true }), true);
    assert.equal(weapons.fire('quick-tap-test', now + 25, { pressed: true }), true);
    assert.equal(item.ammo, 98);
  } finally { await game.host.stop(); }
});
