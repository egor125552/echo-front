import assert from 'node:assert/strict';
import {createEchoFrontGame} from '../src/server/game.js';
import {EngineLab} from '../src/server/engine-lab.js';

const id='tutorial-navigation-human';
const game=await createEchoFrontGame({mode:'battle-royale',tutorial:true});
const lab=new EngineLab(game,{mode:'battle-royale',room:'tutorial-navigation-walk',watch:[id]});
try {
 const prepared=await lab.prepare([{command:'service.call',args:{service:'match-api',method:'connectHuman',arguments:[id]}}]);
 assert(prepared.results.every(row=>row.ok));
 const s=game.host.services,c=game.host.components,events=game.host.events;
 const tutorial=s.get('battle-royale-tutorial');
 const phase=()=>tutorial.describe(id).phase;
 const parachute=s.get('parachute');
 const now=Date.now();
 parachute.launch(id,{altitude:80},now);
 parachute.deploy(id,now+1);
 tutorial.handleInput(id,{strafe:1},now+2);
 Object.assign(c.get(id,'Parachute'),{phase:'landed',airborne:false});
 events.emit('parachute:landed',{entityId:id,now:now+3});
 for(let i=0;i<6;i++)events.emit('sound:spatial',{entityId:id,gait:'run',now:now+4+i});
 events.emit('parachute:deployed',{entityId:id,automatic:true,now:now+10});
 events.emit('parachute:landed',{entityId:id,now:now+11});
 assert.equal(phase(),'select-navigation');
 s.get('movement').teleport(id,{x:100,y:0,z:0,angle:-Math.PI/2});
 lab.start();
 const nav=s.get('navigation');
 const first=nav.availableTargets(id).find(target=>target.id==='warehouse');
 assert(first);
 // Select the warehouse by the exact input exposed by keyboard and touch clients.
 for(let i=0;i<30&&nav.stateFor(id).selectedTargetId!=='warehouse';i++) {
  game.api.handleInput(id,{navigationNextPressed:true},now+i*50);
 }
 assert.equal(nav.stateFor(id).selectedTargetId,'warehouse','warehouse must be selectable by real input');
 game.api.handleInput(id,{navigationTogglePressed:true},now+2000);
 assert.equal(phase(),'follow-navigation');
 let reached=false,closest=Infinity;
 for(let i=0;i<150;i++) {
  const t=c.get(id,'Transform');
  const dest=first.position;
  const dx=dest.x-t.x,dz=dest.z-t.z,dist=Math.hypot(dx,dz);
  closest=Math.min(closest,dist);
  if(phase()!=='follow-navigation'){reached=true;break;}
  const ux=dx/Math.max(.01,dist),uz=dz/Math.max(.01,dist),angle=t.angle||0;
  game.api.handleInput(id,{forward:Math.sin(angle)*ux-Math.cos(angle)*uz,strafe:Math.cos(angle)*ux+Math.sin(angle)*uz,sprint:true},now+2500+i*500);
  await lab.advance({steps:10,sampleEvery:10});
 }
 console.log('ENGINE_LAB_NAVIGATION_WALK',JSON.stringify({phase:phase(),reached,closest,position:c.get(id,'Transform'),navigation:nav.stateFor(id).target?.id,anomalies:lab.report().anomalies.slice(0,3)}).slice(0,1100));
 assert(reached,'walking to warehouse must complete route');
 assert.equal(phase(),'select-crate','warehouse arrival should prompt a crate target');
 game.api.handleInput(id,{interactPressed:true},now+20000);
 assert.equal(s.get('map').doors.find(door=>door.id==='warehouse-front-door').open,true,'front door must open using actual interact input');
 const crateId='crate:crate-ground-armor';
 for(let i=0;i<30&&nav.stateFor(id).selectedTargetId!==crateId;i++)game.api.handleInput(id,{navigationNextPressed:true},now+20100+i*50);
 assert.equal(nav.stateFor(id).selectedTargetId,crateId,'real navigation must select armor crate');
 game.api.handleInput(id,{navigationTogglePressed:true},now+23000);
 assert.equal(phase(),'follow-crate');
 let crateClosest=Infinity;
 for(let i=0;i<260&&phase()==='follow-crate';i++) {
   const t=c.get(id,'Transform'),checkpoint=nav.stateFor(id).checkpoint;
   const dest=checkpoint??{x:71,z:3};
   const dx=dest.x-t.x,dz=dest.z-t.z,dist=Math.hypot(dx,dz);
   crateClosest=Math.min(crateClosest,Math.hypot(t.x-71,t.z-3));
   const ux=dx/Math.max(.01,dist),uz=dz/Math.max(.01,dist),angle=t.angle||0;
   game.api.handleInput(id,{forward:Math.sin(angle)*ux-Math.cos(angle)*uz,strafe:Math.cos(angle)*ux+Math.sin(angle)*uz,sprint:dist>2},now+24000+i*500);
   await lab.advance({steps:10,sampleEvery:10});
 }
 console.log('ENGINE_LAB_CRATE_ROUTE',JSON.stringify({phase:phase(),closest:crateClosest,position:c.get(id,'Transform'),checkpoint:nav.stateFor(id).checkpoint,anomalies:lab.report().anomalies.slice(-3)}).slice(0,1300));
 assert.equal(phase(),'interact-first-crate','real route must reach ground-floor armor crate');
 game.api.handleInput(id,{interactPressed:true},now+160000);
 assert.equal(phase(),'select-second-crate','real interaction must advance after first loot');
 assert.equal(nav.availableTargets(id).some(target=>target.id===crateId),false,'opened crate must vanish from navigation');
 const rifleId='crate:crate-ground-rifle';
 for(let i=0;i<30&&nav.stateFor(id).selectedTargetId!==rifleId;i++)game.api.handleInput(id,{navigationNextPressed:true},now+160100+i*50);
 assert.equal(nav.stateFor(id).selectedTargetId,rifleId,'real navigation must select the remaining rifle crate');
 game.api.handleInput(id,{navigationTogglePressed:true},now+162000);
 assert.equal(phase(),'follow-second-crate');
 let rifleClosest=Infinity;
 for(let i=0;i<240&&phase()==='follow-second-crate';i++) {
   const t=c.get(id,'Transform'),dest=nav.stateFor(id).checkpoint??{x:51.5,z:-2};
   const dx=dest.x-t.x,dz=dest.z-t.z,dist=Math.hypot(dx,dz);
   rifleClosest=Math.min(rifleClosest,Math.hypot(t.x-51.5,t.z+2));
   const ux=dx/Math.max(.01,dist),uz=dz/Math.max(.01,dist),angle=t.angle||0;
   game.api.handleInput(id,{forward:Math.sin(angle)*ux-Math.cos(angle)*uz,strafe:Math.cos(angle)*ux+Math.sin(angle)*uz,sprint:dist>2},now+163000+i*500);
   await lab.advance({steps:10,sampleEvery:10});
 }
 console.log('ENGINE_LAB_SECOND_CRATE_ROUTE',JSON.stringify({phase:phase(),closest:rifleClosest,position:c.get(id,'Transform'),checkpoint:nav.stateFor(id).checkpoint,anomalies:lab.report().anomalies.slice(-3)}).slice(0,1200));
 assert.equal(phase(),'interact-second-crate','real route must reach rifle crate');
 game.api.handleInput(id,{interactPressed:true},now+290000);
 assert.equal(phase(),'select-rifle','real second crate interaction must advance tutorial');
 const report=lab.finish();
 assert.equal(report.anomalies.filter(row=>row.type==='possible-stalled-pedestrian'&&row.entityId===id).length,0,'crate route must not leave the player stalled');
 console.log('ENGINE_LAB_TUTORIAL_NAVIGATION_OK',JSON.stringify({gameSeconds:report.simulatedMs/1000,anomalies:report.anomalies.length}));
}finally{await game.host.stop()}
