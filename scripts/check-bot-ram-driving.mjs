import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEchoFrontGame } from '../src/server/game.js';

async function scenario(feint) {
  const game = await createEchoFrontGame({ mode: 'battle-royale' });
  const s = game.host.services, c = game.host.components;
  const vehicles = s.get('vehicles'), physics = s.get('physics'), movement = s.get('movement');
  const drivers = s.get('bot-vehicles');
  let now = Date.now(), dodgeAt = null;
  const ground = (id, position) => {
    const flight = c.get(id, 'Parachute');
    if (flight) Object.assign(flight, { phase: 'landed', airborne: false });
    movement.teleport(id, position);
    game.host.events.emit("parachute:landed", { entityId: id, now });
  };
  try {
    for (const id of ['ram-human', 'distant-human']) game.api.connectHuman(id);
    for (const e of [...s.get('entities').all()]) if (e.bot) s.get('entities').remove(e.id);
    ground('ram-human', { x: -75, y: 0, z: 0, angle: 0 });
    ground('distant-human', { x: 300, y: 0, z: 300 });
    const body = physics.dynamicBody('br-jeep-2');
    body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    physics.setDynamicBodyTranslation('br-jeep-2', { x: 0, y: 1, z: 0 });
    physics.setDynamicBodyLinearVelocity('br-jeep-2', { x: 0, y: 0, z: 0 });
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    for (let i = 0; i < 30; i++) game.api.step(.05, now += 50);
    s.get('entities').spawn({ id: 'ram-driver', kind: 'bot', bot: true, health: 200, weapons: ['rifle'], position: { x: 0, y: 0, z: 4 } });
    ground('ram-driver', { x: 0, y: 0, z: 4, angle: 0 });
    assert(drivers.assign('ram-driver', 'br-jeep-2', { x: -300, y: 0, z: 0 }, now));
    game.drainEvents();
    let turnSeen = false, maxAttempts = 0, nitroSeen = false, exitSeen = false, shotAfterExit = false;
    let exitAt = null;
    for (let tick = 0; tick < 1200; tick++) {
      const car = vehicles.stateFor('br-jeep-2'), human = c.get('ram-human', 'Transform');
      if (feint && dodgeAt == null && Math.hypot(car.x - human.x, car.z - human.z) < 28) dodgeAt = now;
      const elapsed = dodgeAt == null ? Infinity : now - dodgeAt;
      // A real human-input feint makes the first pass miss. Never teleport
      // actors or inject collision events after the fixture has begun.
      game.api.handleInput('ram-human', elapsed < 2400 ? { forward: elapsed < 800 ? 1 : -1, sprint: true } : {}, now);
      game.api.step(.05, now += 50);
      const state = drivers.stateFor('ram-driver');
      turnSeen ||= state?.phase === 'ram-turnaround';
      maxAttempts = Math.max(maxAttempts, state?.attempts ?? 0);
      nitroSeen ||= vehicles.stateFor('br-jeep-2').nitro.active;
      for (const packet of game.drainEvents()) {
        const p = packet.payload;
        if (packet.event === 'vehicle:exited' && p.entityId === 'ram-driver') {
          assert.equal(p.reason, 'bot-dismount', 'Driver should stop and exit, not be thrown by a crash');
          assert(vehicles.stateFor('br-jeep-2').speed < 1, 'Dismount must happen after braking');
          exitSeen = true; exitAt = now;
        }
        if (packet.event === 'weapon:fired' && p.entityId === 'ram-driver') {
          assert(exitSeen, 'Bot fired from inside the car');
          shotAfterExit = true;
        }
      }
      if (exitAt && now - exitAt > 8000) break;
    }
    assert(drivers.summary().hits > 0, 'Real vehicle physics must confirm the ram');
    assert(nitroSeen, 'Bot should use nitro on the clear approach');
    assert(exitSeen, 'Bot must brake and leave the vehicle after impact');
    assert.equal(c.get('ram-driver', 'Bot').vehicleControl, false);
    assert(s.get('bot-brain').commitmentFor('ram-driver'), 'Infantry AI must resume after dismount');
    // A high-speed hit can throw the opponent outside firearm range. Infantry
    // may hunt or evade first; the weapon must be usable once outside the car.
    assert(shotAfterExit || s.get('weapons').fire('ram-driver', now + 1000), 'The bot cannot fire after leaving');
    if (feint) {
      assert(turnSeen, 'Missed first pass never entered turnaround');
      assert.equal(maxAttempts, 2, 'Second approach must be bounded and explicit');
    }
  } finally { await game.host.stop(); }
}

test('a bot rams the human, brakes, gets out and resumes infantry combat', () => scenario(false));
test('after a real input dodge, the bot turns for a second pass and then dismounts', () => scenario(true));
