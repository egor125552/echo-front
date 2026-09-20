import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createEchoFrontGame} from '../src/server/game.js';
import {EngineLab} from '../src/server/engine-lab.js';
test('a player holding gas against the warehouse wall is reported as stalled',async()=>{
 const game=await createEchoFrontGame({mode:'battle-royale'});
 const id='human-driver-lab',carId='br-supercar-11';
 try{
  game.api.connectHuman(id);
  const svc=game.host.services,parts=game.host.components;
  const physics=svc.get('physics'),vehicles=svc.get('vehicles');
  Object.assign(parts.get(id,'Parachute'),{phase:'landed',airborne:false});
  svc.get('movement').teleport(id,{x:76,y:0,z:0});
  game.host.events.emit('parachute:landed',{entityId:id,now:Date.now()});
  physics.setDynamicBodyTranslation(carId,{x:76,y:1.1,z:-2.5});
  physics.createWall({kind:'test-vehicle-barrier',x:76,y:0,z:-8,hx:12,hz:.6,height:4});
  assert(vehicles.enter(id,Date.now(),carId),'real vehicle must accept player');
  const lab=new EngineLab(game,{mode:'battle-royale',room:'human-driver-wall',watch:[id]});
  lab.start();
  game.api.handleInput(id,{forward:1,sprint:false});
  await lab.advance({steps:100,sampleEvery:10});
  const warnings=lab.report().anomalies.filter(x=>x.type==='possible-stalled-human-driver');
  console.log('HUMAN_DRIVER_TEST',JSON.stringify({
    warningCount:warnings.length,
    finalVehicle:lab.samples.at(-1).entities[0].vehicle,
  }).slice(0,1200));
  assert(warnings.length>0,'wall-blocked human car must warn after 3 seconds of gas');
 }finally{await game.host.stop()}
});
