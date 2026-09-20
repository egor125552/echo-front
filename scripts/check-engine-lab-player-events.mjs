import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createEchoFrontGame} from '../src/server/game.js';
import {EngineLab, handleEngineLabRequest} from '../src/server/engine-lab.js';

test('important player events survive audio noise and support incremental retrieval',async()=>{
 const game=await createEchoFrontGame({mode:'tdm'});
 try{
  const id='event-reader',lab=new EngineLab(game,{mode:'tdm',room:'event-test',watch:[id]});
  const prepared=await lab.prepare([{command:'service.call',
    args:{service:'match-api',method:'connectHuman',arguments:[id]}}]);
  assert(prepared.results[0].ok);
  lab.start();
  const request=async(fromIndex)=> {
   const r=await handleEngineLabRequest({lab,game},{
    method:'POST',url:'http://localhost/api/engine-lab',
    json:async()=>({action:'scenario.player-events',playerId:id,fromIndex,limit:200}),
   });
   assert.equal(r.status,200);
   return r.json();
  };
  for(let i=0;i<400;i++)game.host.events.emit('sound:spatial',{entityId:id,x:0,z:0});
  game.host.events.emit('loot:picked',{entityId:id,crateId:'found-crate',loot:'armor'});
  for(let i=0;i<400;i++)game.host.events.emit('sound:spatial',{entityId:id,x:0,z:0});
  lab.sample();
  const first=await request(0);
  assert.equal(first.result?.events?.length??first.events?.length,1);
  const list=first.result?.events??first.events;
  assert.equal(list[0].event,'loot:picked');
  assert.equal(list[0].payload.crateId,'found-crate');
  const second=await request(first.result?.nextIndex??first.nextIndex);
  assert.equal((second.result?.events??second.events).length,0,'polling must not repeat old events');
  game.host.events.emit('vehicle:exited',{entityId:id,vehicleId:'car-one',reason:'impact'});
  lab.sample();
  const third=await request(first.result?.nextIndex??first.nextIndex);
  assert.equal((third.result?.events??third.events)[0].event,'vehicle:exited');
  assert.equal((third.result?.events??third.events)[0].payload.reason,'impact');
 }finally{await game.host.stop()}
});
