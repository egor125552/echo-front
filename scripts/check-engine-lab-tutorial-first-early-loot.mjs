import assert from 'node:assert/strict';
import {createEchoFrontGame} from '../src/server/game.js';
import {EngineLab} from '../src/server/engine-lab.js';
const playerId='second-stolen-trainee';
const game=await createEchoFrontGame({mode:'battle-royale',tutorial:true});
const lab=new EngineLab(game,{mode:'battle-royale',room:'second-stolen-crate',watch:[playerId]});
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
 const navigation=s.get('navigation');
 lab.start();
 navigation.selectTarget(playerId,'crate:crate-ground-rifle',now+12);
 navigation.toggle(playerId,now+13);
 assert.equal(phase(),'follow-navigation');
 s.get('movement').teleport(playerId,{x:53.3,y:0,z:-2});
 assert.equal(phase(),'follow-navigation');
 game.api.handleInput(playerId,{interactPressed:true},Date.now());
 const afterOpen=tutorial.describe(playerId);
 console.log('ENGINE_LAB_FIRST_EARLY_LOOT',JSON.stringify({phase:afterOpen.phase,neededLoot:afterOpen.neededLoot,rifleCollected:afterOpen.rifleCollected}));
 assert.equal(afterOpen.phase,'select-second-crate','first crate must be credited even before navigation announces arrival');
 assert.equal(afterOpen.neededLoot,'armor');
 // Repeated interaction and a late arrival from the now-opened crate must not
 // consume the next objective or make the trainee search for the same loot.
 game.api.handleInput(playerId,{interactPressed:true},Date.now());
 await lab.advance({steps:2,sampleEvery:1});
 assert.equal(phase(),'select-second-crate');
 assert.equal(tutorial.describe(playerId).neededLoot,'armor');
 lab.finish();
}finally{await game.host.stop()}
