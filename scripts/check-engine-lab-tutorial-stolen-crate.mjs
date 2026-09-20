import assert from 'node:assert/strict';
import {createEchoFrontGame} from '../src/server/game.js';
import {EngineLab} from '../src/server/engine-lab.js';
const playerId='stolen-crate-trainee';
const game=await createEchoFrontGame({mode:'battle-royale',tutorial:true});
const lab=new EngineLab(game,{mode:'battle-royale',room:'stolen-crate-tutorial',watch:[playerId]});
try {
 const prepared=await lab.prepare([{command:'service.call',args:{service:'match-api',method:'connectHuman',arguments:[playerId]}}]);
 assert(prepared.results.every(row=>row.ok));
 const s=game.host.services,events=game.host.events,tutorial=s.get('battle-royale-tutorial');
 const phase=()=>tutorial.describe(playerId).phase;
 const now=Date.now(),parachute=s.get('parachute');
 parachute.launch(playerId,{altitude:80},now);
 parachute.deploy(playerId,now+1);
 tutorial.handleInput(playerId,{strafe:1},now+2);
 events.emit('parachute:landed',{entityId:playerId,now:now+3});
 for(let i=0;i<6;i++)events.emit('sound:spatial',{entityId:playerId,gait:'run',now:now+4+i});
 events.emit('parachute:deployed',{entityId:playerId,automatic:true,now:now+10});
 events.emit('parachute:landed',{entityId:playerId,now:now+11});
 assert.equal(phase(),'select-navigation');
 lab.start();
 // A genuine warehouse navigation followed by real selection of a ground crate.
 const navigation=s.get('navigation');
 navigation.selectTarget(playerId,'warehouse',now+12);
 navigation.toggle(playerId,now+13);
 events.emit('navigation:reached',{entityId:playerId,targetKind:'building',now:now+14});
 assert.equal(phase(),'select-crate');
 navigation.selectTarget(playerId,'crate:crate-ground-armor',now+15);
 navigation.toggle(playerId,now+16);
 assert.equal(phase(),'follow-crate');
 const opened=s.get('map').interact({entityId:'other-player',x:71,y:0,z:3,now:now+17});
 assert.equal(opened?.type,'crate');
 assert.equal(opened.loot,'armor');
 await lab.advance({steps:2,sampleEvery:1});
 console.log('STOLEN_CRATE_TUTORIAL',JSON.stringify({phase:phase(),navigation:navigation.stateFor(playerId),availableArmor:navigation.availableTargets(playerId).filter(t=>t.metadata?.loot==='armor').map(t=>t.id)}).slice(0,1100));
 assert.equal(phase(),'select-crate','unavailable first crate must return to target selection');
 assert.equal(tutorial.describe(playerId).routeLost,true);
 assert.equal(navigation.availableTargets(playerId).some(t=>t.id==='crate:crate-ground-armor'),false);
 // Recover by choosing another real target, without resetting the tutorial.
 navigation.selectTarget(playerId,'crate:crate-ground-rifle',now+30);
 navigation.toggle(playerId,now+31);
 assert.equal(phase(),'follow-crate','player must be able to resume on another crate');
 assert.equal(tutorial.describe(playerId).routeLost,false);
 // Another player opens that replacement after the trainee reaches it.
 events.emit('navigation:reached',{entityId:playerId,targetKind:'crate',targetLoot:'rifle',now:now+32});
 assert.equal(phase(),'interact-first-crate');
 const stolenAgain=s.get('map').interact({entityId:'other-player',x:51.5,y:0,z:-2,now:now+33});
 assert.equal(stolenAgain?.type,'crate');
 assert.equal(phase(),'select-crate','crate stolen after arrival must not trap interaction step');
 lab.finish();
}finally{await game.host.stop()}
