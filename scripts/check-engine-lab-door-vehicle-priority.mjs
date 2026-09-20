import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEchoFrontGame } from '../src/server/game.js';

test('an E press next to a warehouse door operates the door before a nearby car', async () => {
  const game = await createEchoFrontGame({ mode: 'battle-royale' });
  try {
    const services = game.host.services, components = game.host.components;
    const vehicles = services.get('vehicles');
    const map = services.get('map');
    const movement = services.get('movement');
    const physics = services.get('physics');
    const id = 'door-priority-human';
    const carId = 'br-supercar-11';
    const door = map.doors.find(entry => entry.id === 'warehouse-front-door');
    assert(door);
    game.api.connectHuman(id);
    // Preparation of a real world: make the character a grounded human,
    // then park a real Rapier car within reach of the real entrance.
    Object.assign(components.get(id, 'Parachute'), { phase: 'landed', airborne: false });
    movement.teleport(id, { x: 76, y: 0, z: 0 });
    game.host.events.emit('parachute:landed', { entityId: id, now: Date.now() });
    physics.setDynamicBodyTranslation(carId, { x: 76, y: 1.1, z: -2.5 });
    assert.equal(door.open, false);
    game.api.handleInput(id, { interactPressed: true });
    assert.equal(door.open, true, 'E at the entrance should open its door');
    assert.equal(vehicles.isDriving(id), false, 'The nearby car should not steal E');
    movement.teleport(id, { x: 76, y: 0, z: -3.7 });
    game.api.handleInput(id, { interactPressed: true });
    assert.equal(vehicles.isDriving(id), true, 'E away from the entrance still enters the car');
    assert.equal(vehicles.vehicleForDriver(id)?.id, carId);
  } finally {
    await game.host.stop();
  }
});
