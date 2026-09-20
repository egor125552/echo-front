import {ABANDONED_VEHICLE_UNUSED_MS} from '../src/plugins/battle-royale-vehicle-fleet/server.js';

import assert from 'node:assert/strict';
import {createEchoFrontGame} from '../src/server/game.js';
const game=await createEchoFrontGame({mode:'battle-royale'});
const s=game.host.services;
const physics=s.get('physics'),vehicles=s.get('vehicles'),entities=s.get('entities'),movement=s.get('movement');
const id='fleet-cleanup-human';
let now=Date.now()+1000;
try{
  game.api.connectHuman(id);
  for(const entity of [...entities.all()])if(entity.bot)entities.remove(entity.id);
  const vehicleId='br-jeep-2',car=vehicles.stateFor(vehicleId);
  assert(car);
  const startTotal=vehicles.snapshot().length;
  vehicles.tickPhysics(.05,now);

  movement.teleport(id,{x:car.x,y:0,z:car.z+2.1});
  assert(vehicles.enter(id,now+50,vehicleId),'human enters real jeep');
  const occupied=vehicles.stateFor(vehicleId);
  assert.equal(occupied.driverId,id);
  // Neither occupied vehicle nor a newly exited vehicle can disappear.
  now+=70_000;
  vehicles.tickPhysics(.05,now);
  assert(vehicles.stateFor(vehicleId),'occupied car never disappears after expiration');
  assert(vehicles.exit(id,now+50,'test'));
  movement.teleport(id,{x:0,y:0,z:0});
  now+=ABANDONED_VEHICLE_UNUSED_MS-10_000;
  vehicles.tickPhysics(.05,now);
  assert(vehicles.stateFor(vehicleId),'recently vacated jeep retained');
  now+=16_000;
  vehicles.tickPhysics(.05,now);
  assert.equal(vehicles.stateFor(vehicleId),null,'unused old jeep removed');
  assert.equal(physics.dynamicBodyState(vehicleId),null,'physical chassis removed');
  assert.equal(vehicles.snapshot().length,startTotal-1,'one car removed from fleet');
  vehicles.assertFleet(); // Default fleet assertions account for deliberate cleanup.
  const clientView=game.api.snapshotFor(id,now);
  assert(!(clientView.vehicles??[]).some(vehicle=>vehicle.id===vehicleId),
    'despawned car must not remain in the network snapshot');
  assert(game.drainEvents().some(packet=>packet.event==='vehicle:despawned'
    && packet.payload.vehicleId===vehicleId),
    'client receives the vehicle:despawned event');
  assert(vehicles.stateFor('br-jeep-1'),'primary jeep never removed');
  assert(vehicles.stateFor('br-jeep-3'),'untouched isolated spawn remains available');
  console.log('ABANDONED_FLEET_OK',startTotal,vehicles.snapshot().length,vehicleId);
}finally{await game.host.stop()}
