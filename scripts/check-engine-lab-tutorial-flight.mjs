import assert from 'node:assert/strict';
import {createEchoFrontGame} from '../src/server/game.js';
import {EngineLab} from '../src/server/engine-lab.js';
const id='tutorial-flight-player';
const game=await createEchoFrontGame({mode:'battle-royale',tutorial:true});
const lab=new EngineLab(game,{mode:'battle-royale',room:'tutorial-flight',watch:[id]});
try {
 const prepared=await lab.prepare([{command:'service.call',args:{service:'match-api',method:'connectHuman',arguments:[id]}}]);
 assert(prepared.results.every(row=>row.ok));
 const phase=()=>game.api.snapshotFor(id).tutorial?.phase;
 assert.equal(phase(),'deploy-parachute');
 lab.start();
 game.api.handleInput(id,{parachutePressed:true},Date.now());
 assert.equal(phase(),'steer-parachute','manual opening must advance the tutorial');
 game.api.handleInput(id,{strafe:1},Date.now());
 assert.equal(phase(),'land','steering must advance the tutorial');
 let iterations=0;
 while(phase()==='land'&&iterations++<360)await lab.advance({steps:20,sampleEvery:20});
 assert.equal(phase(),'ground-run','real canopy must land');
 iterations=0;
 while(phase()==='ground-run'&&iterations++<80){
   game.api.handleInput(id,{forward:1,sprint:true},Date.now());
   await lab.advance({steps:10,sampleEvery:10});
 }
 assert.equal(phase(),'automatic-parachute','real running footsteps must advance the tutorial');
 const before=game.api.snapshotFor(id).entities.find(e=>e.id===id);
 assert.equal(before.parachute.airborne,false,'automatic launch must wait for voice narration');
 assert.equal(game.api.tutorialAcknowledge(id,'automatic-parachute',Date.now()),true);
 assert.equal(phase(),'automatic-parachute','automatic demo must wait for its own deployment');
 iterations=0;
 while(phase()==='automatic-parachute'&&iterations++<130)await lab.advance({steps:20,sampleEvery:20});
 assert.equal(phase(),'automatic-parachute-land','automatic parachute must deploy');
 iterations=0;
 while(phase()==='automatic-parachute-land'&&iterations++<360)await lab.advance({steps:20,sampleEvery:20});
 assert.equal(phase(),'select-navigation','real automatic parachute must land');
 const report=lab.finish();
 console.log('ENGINE_LAB_TUTORIAL_FLIGHT_OK',JSON.stringify({gameSeconds:report.simulatedMs/1000,observations:report.observations,anomalies:report.anomalies.slice(0,3)}));
}finally{await game.host.stop()}
