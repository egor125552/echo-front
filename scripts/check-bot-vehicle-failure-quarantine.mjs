import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEchoFrontGame } from '../src/server/game.js';
import { BOT_VEHICLE_FAILURE_COOLDOWN_MS,
  BOT_VEHICLE_STATIONARY_FAILURE_QUARANTINE_MS } from '../src/plugins/battle-royale-bot-vehicles/server.js';

test('a physically trapped car is not assigned again until it moves or quarantine expires', async () => {
  const game = await createEchoFrontGame({ mode: 'battle-royale' });
  const s = game.host.services, c = game.host.components;
  const vehicles = s.get('vehicles'), physics = s.get('physics'), ai = s.get('bot-vehicles');
  let now = Date.now();
  try {
    for (const id of ['quarantine-human-1', 'quarantine-human-2']) game.api.connectHuman(id);
    for (const entity of [...s.get('entities').all()]) if (entity.bot) s.get('entities').remove(entity.id);
    for (const [i, id] of ['quarantine-human-1', 'quarantine-human-2'].entries()) {
      Object.assign(c.get(id, 'Parachute'), { phase:'landed', airborne:false });
      s.get('movement').teleport(id, {x:300 + i * 20, y:0, z:300});
      game.host.events.emit('parachute:landed', {entityId:id, now});
    }
    const id = 'br-jeep-2', body = physics.dynamicBody(id);
    body.setRotation({x:0,y:0,z:0,w:1}, true);
    physics.setDynamicBodyTranslation(id, {x:0,y:1,z:0});
    physics.setDynamicBodyLinearVelocity(id, {x:0,y:0,z:0});
    body.setAngvel({x:0,y:0,z:0}, true);
    for(let i=0;i<30;i++)game.api.step(.05,now+=50);
    s.get('entities').spawn({id:'quarantine-driver',kind:'bot',bot:true,
      health:200,position:{x:0,y:0,z:4}});
    assert(ai.assign('quarantine-driver',id,{x:-300,y:0,z:0},now));
    game.api.step(.05,now+=50);
    assert.equal(vehicles.driverId(id),'quarantine-driver');

    // A real Rapier cage keeps this exact car at the failed position, rather
    // than artificially setting a failure status or teleported bot outcome.
    for(const x of [-4.2,4.2])
      physics.createWall({kind:'quarantine-block',x,y:0,z:0,hx:.35,hz:7,height:3});
    for(const z of [-4.4,4.4])
      physics.createWall({kind:'quarantine-block',x:0,y:0,z,hx:7,hz:.35,height:3});
    let failure=null;
    for(let i=0;i<1300;i++){
      game.api.step(.05,now+=50);
      failure=ai.summary().stationaryVehicleFailures.find(v=>v.vehicleId===id)??null;
      if(failure)break;
    }
    assert(failure, 'The real AI never abandoned the physically trapped car');
    assert.equal(failure.reason,'stuck');
    assert.equal(vehicles.driverId(id),null);
    assert.equal(ai.vehicleCooldownFor(id) - (failure.until -
      BOT_VEHICLE_STATIONARY_FAILURE_QUARANTINE_MS),
      BOT_VEHICLE_FAILURE_COOLDOWN_MS);

    s.get('entities').spawn({id:'quarantine-driver-2',kind:'bot',bot:true,
      health:200,position:{x:0,y:0,z:4}});
    now += BOT_VEHICLE_FAILURE_COOLDOWN_MS + 1;
    assert.equal(ai.assign('quarantine-driver-2',id,{x:-300,y:0,z:0},now),false,
      'The second bot entered the same trapped car just after the short cooldown');
    assert(ai.summary().stationaryVehicleFailures.some(v=>v.vehicleId===id));

    // The quarantine is BOT assignment policy, not a ban on a real player
    // entering an otherwise intact abandoned vehicle.
    const quarantinedCar=vehicles.stateFor(id);
    s.get('movement').teleport('quarantine-human-1', {
      x:quarantinedCar.x, y:quarantinedCar.y, z:quarantinedCar.z+1.5,
    });
    assert(vehicles.enter('quarantine-human-1',now,id),
      'A human must remain able to enter a car quarantined for bots');
    assert.equal(vehicles.driverId(id),'quarantine-human-1');
    assert(vehicles.exit('quarantine-human-1',now+50,'test'));
    assert(ai.summary().stationaryVehicleFailures.some(v=>v.vehicleId===id),
      'Human entry alone must not invalidate the physical failure position');

    now = failure.until - 1;
    assert.equal(ai.assign('quarantine-driver-2',id,{x:-300,y:0,z:0},now),false,
      'The same trapped car must stay unavailable up to the quarantine deadline');

    // A human or a physical impact moving the chassis out of the jam makes
    // the old parking position irrelevant without requiring a timer expiry.
    physics.setDynamicBodyTranslation(id, {x:0,y:1,z:20});
    assert(ai.assign('quarantine-driver-2',id,{x:-300,y:0,z:0},now),
      'A physically relocated car should be available to a new bot');
    assert(!ai.summary().stationaryVehicleFailures.some(v=>v.vehicleId===id));
  } finally { await game.host.stop(); }
});
