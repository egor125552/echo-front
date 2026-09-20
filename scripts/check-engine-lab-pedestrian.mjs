import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEchoFrontGame } from '../src/server/game.js';
import { EngineLab } from '../src/server/engine-lab.js';
test('Engine Lab identifies a player walking into a real wall', async()=>{
 const game=await createEchoFrontGame({mode:'tdm'});
 try{
  const lab=new EngineLab(game,{mode:'tdm',room:'ped-test',watch:['lab-ped']});
  let setup=await lab.prepare([
   {command:'service.call',args:{service:'match-api',method:'connectHuman',arguments:['lab-ped']}},
   {command:'service.call',args:{service:'movement',method:'teleport',arguments:['lab-ped',{x:0,y:0,z:0}]}},
   {command:'service.call',args:{service:'physics',method:'createWall',arguments:[{kind:'test-wall',x:0,y:0,z:2,hx:8,hz:.4,height:3}]}},
  ]);
  assert(setup.results.every(x=>x.ok),JSON.stringify(setup.results));
  lab.start();game.api.handleInput('lab-ped',{strafe:1,forward:0});
  await lab.advance({steps:100,sampleEvery:10});
  const found=lab.report().anomalies.filter(x=>x.type==='possible-stalled-pedestrian');
  console.log('PED_TEST',JSON.stringify({time:lab.status().gameTime,warningCount:found.length}));
  assert(found.length>0,'The real-wall obstacle must generate a pedestrian stall warning');
 }finally{await game.host.stop()}
});
