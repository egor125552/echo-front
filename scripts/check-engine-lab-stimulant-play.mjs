import assert from 'node:assert/strict';
import { createEchoFrontGame } from '../src/server/game.js';
import { EngineLab } from '../src/server/engine-lab.js';

const playerId = 'engine-lab-injury-player';
const game = await createEchoFrontGame({mode:'battle-royale'});
const lab = new EngineLab(game,{mode:'battle-royale',room:'injury-live-play',watch:[playerId],
 objectives:[{type:'event-count',event:'injury:stim-completed',entityId:playerId,minimumCount:1}]});
try {
  const prepared = await lab.prepare([{command:'service.call',args:{service:'match-api',method:'connectHuman',arguments:[playerId]}}]);
  assert(prepared.results.every(r=>r.ok));
  const s=game.host.services;
  // Keep the battle-royale participants: removing every bot ends the actual match.
  Object.assign(game.host.components.get(playerId,'Parachute'),{phase:'landed',airborne:false});
  s.get('movement').teleport(playerId,{x:-400,y:0,z:0});
  s.get('health').applyDamage(playerId,100,{now:Date.now()});
  lab.start();
  const snap=()=>game.api.snapshotFor(playerId).entities.find(e=>e.id===playerId);
  const starting=snap();
  game.api.handleInput(playerId,{stimulantPressed:true,firePressed:true,fireHeld:true},Date.now());
  await lab.advance({steps:1,sampleEvery:1});
  assert.equal(snap().stimulantUse,null,'simultaneous shot and stimulant must not start treatment');
  assert(snap().ammo<starting.ammo,'simultaneous shot must fire');
  game.api.handleInput(playerId,{stimulantPressed:true,forward:1,sprint:true},Date.now());
  const pos=snap();
  for(let turn=0;turn<9;turn++){
    game.api.handleInput(playerId,{forward:1,sprint:true,turn:.1},Date.now());
    await lab.advance({steps:5,sampleEvery:5});
  }
  const result=snap();
  assert(Math.hypot(result.x-pos.x,result.z-pos.z)>2,'player must move while healing');
  assert.equal(result.health,200,'healing must complete');
  assert.equal(result.stimulants,0,'healing must consume exactly one stimulant');
  const report=lab.finish();
  assert.equal(report.verdict,'passed');
  console.log('ENGINE_LAB_STIMULANT_PLAY_OK',JSON.stringify({seconds:report.simulatedMs/1000,shotsBeforeTreatment:starting.ammo-result.ammo,movedMeters:Math.round(Math.hypot(result.x-pos.x,result.z-pos.z)*10)/10,anomalies:report.anomalies.slice(0,5).map(a=>a.type??a.reason)}));
}finally{await game.host.stop()}
