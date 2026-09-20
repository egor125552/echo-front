import assert from 'node:assert/strict';
import {createEchoFrontGame} from '../src/server/game.js';
import {EngineLab} from '../src/server/engine-lab.js';

for(const order of ['rifle','armor','rifle-preselected']) {
 const id='tutorial-loot-'+order;
 const game=await createEchoFrontGame({mode:'battle-royale',tutorial:true});
 const lab=new EngineLab(game,{mode:'battle-royale',room:'tutorial-loot-'+order,watch:[id]});
 try {
  const setup=await lab.prepare([{command:'service.call',args:{service:'match-api',method:'connectHuman',arguments:[id]}}]);
  assert(setup.results.every(row=>row.ok));
  const services=game.host.services,events=game.host.events;
  const tutorial=services.get('battle-royale-tutorial');
  const state=()=>tutorial.describe(id);
  const inventory=()=>game.host.components.get(id,'Weapons');
  const now=Date.now();
  // Navigation setup is synthesized here; crate opening and weapon selection use the real match API.
  const earlyPhases=['steer-parachute','land','ground-run','automatic-parachute','automatic-parachute-land'];
  for(const phase of earlyPhases) {
   const current=state().phase;
   if(phase==='steer-parachute') { services.get('parachute').launch(id,{altitude:80},now); services.get('parachute').deploy(id,now+1); }
   else if(phase==='land') tutorial.handleInput(id,{strafe:1},now);
   else if(phase==='ground-run') events.emit('parachute:landed',{entityId:id,now});
   else if(phase==='automatic-parachute') for(let i=0;i<6;i++)events.emit('sound:spatial',{entityId:id,gait:'run',now});
   else events.emit('parachute:deployed',{entityId:id,automatic:true,now});
   assert.equal(state().phase,phase,`setup ${current} to ${phase}`);
  }
  events.emit('parachute:landed',{entityId:id,now});
  assert.equal(state().phase,'select-navigation');
  lab.start();
  const targets={rifle:{x:51.5,y:0,z:-2},armor:{x:71,y:0,z:3}};
  const first=order.startsWith('rifle')?'rifle':'armor',second=first==='rifle'?'armor':'rifle';
  const open=(loot)=>{
   events.emit('navigation:started',{entityId:id,targetKind:'crate',targetLoot:loot,now});
   events.emit('navigation:reached',{entityId:id,targetKind:'crate',targetLoot:loot,now});
   assert.equal(state().phase,loot===first?'interact-first-crate':'interact-second-crate');
   services.get('movement').teleport(id,targets[loot]);
   game.api.handleInput(id,{interactPressed:true},now);
  };
  open(first);
  assert.equal(state().phase,'select-second-crate');
  assert.equal(state().neededLoot,second);
  if(order==='rifle-preselected') {
    game.api.handleInput(id,{selectDelta:1},now);
    assert.equal(inventory().items[inventory().selected].id,'rifle');
  }
  open(second);
  assert.equal(state().phase,order==='rifle-preselected'?'armor-break':'select-rifle');
  assert(state().rifleCollected&&state().armorCollected);
  assert(inventory().items.some(item=>item.id==='rifle'));
  if(order!=='rifle-preselected') game.api.handleInput(id,{selectDelta:1},now);
  assert.equal(state().phase,'armor-break','real rifle selection must start the armor tutorial');
  const report=lab.finish();
  console.log('ENGINE_LAB_TUTORIAL_LOOT_OK',JSON.stringify({order,phase:state().phase,seconds:report.simulatedMs/1000}));
 }finally{await game.host.stop()}
}
