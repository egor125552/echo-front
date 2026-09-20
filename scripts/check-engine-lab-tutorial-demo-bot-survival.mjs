import assert from 'node:assert/strict';
import {createEchoFrontGame} from '../src/server/game.js';
import {EngineLab} from '../src/server/engine-lab.js';

for(const order of ['rifle']) {
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
  if(order==='rifle') {
    const entities=services.get('entities');
    const assigned=entities.all().find(bot=>bot.bot&&tutorial.botDirective(bot.id).mode==='break-armor');
    assert(assigned,'tutorial must initially assign a demo bot');
    const health=services.get('health');
    const botHp=game.host.components.get(assigned.id,'Health');
    const before=botHp.current;
    const attempted=health.applyDamage(assigned.id,before+1000,{attackerId:id,weaponId:'rifle',now});
    assert.equal(attempted.killed,false,'tutorial target must survive before mandatory combat');
    assert.equal(attempted.applied,0);
    assert.equal(botHp.current,before);
    assert.equal(assigned.alive,true);
    assert.equal(services.get('battle-royale').status().phase,'active');
    assert.equal(tutorial.botDirective(assigned.id).mode,'break-armor');
    console.log('DEMO_BOT_SURVIVAL_OK',JSON.stringify({botId:assigned.id,hp:botHp.current}));
    for(let tick=0;tick<120 && state().phase==='armor-break';tick++) await lab.advance({steps:20,sampleEvery:20});
    assert.equal(state().phase,'apply-armor','tutorial bot must break armor');
    game.api.handleInput(id,{platePressed:true},Date.now());
    for(let tick=0;tick<140 && state().phase==='apply-armor';tick++) await lab.advance({steps:20,sampleEvery:20});
    assert.equal(state().phase,'injury-demo','armor plates must advance tutorial');
    for(let tick=0;tick<160 && state().phase==='injury-demo';tick++) await lab.advance({steps:20,sampleEvery:20});
    const downed=game.api.snapshotFor(id).entities.find(e=>e.id===id);
    assert.equal(state().phase,'use-stimulant','bot must down player');
    assert(downed.downed && downed.alive,'player must be alive but downed');
    const stimulusEvents=[];
    game.host.events.on('*',packet=>{if(packet.event.startsWith('injury:'))stimulusEvents.push({event:packet.event,payload:packet.payload})});
    game.api.handleInput(id,{stimulantPressed:true},Date.now());
    for(let tick=0;tick<10 && state().phase==='use-stimulant';tick++) await lab.advance({steps:20,sampleEvery:20});
    const recovered=game.api.snapshotFor(id).entities.find(e=>e.id===id);
    assert.equal(state().phase,'use-stimulant','blocked standing must keep tutorial in revival stage');
    assert(stimulusEvents.some(row=>row.event==='injury:stim-cancelled'&&row.payload.reason==='no-room-to-stand'));
    assert.equal(recovered.stimulants,downed.stimulants,'blocked revival must not consume stimulant');
    services.get('movement').teleport(id,{x:110,y:0,z:40});
    game.api.handleInput(id,{stimulantPressed:true},Date.now());
    for(let tick=0;tick<10 && state().phase==='use-stimulant';tick++) await lab.advance({steps:20,sampleEvery:20});
    assert.equal(state().phase,'complete','real stimulant on clear ground must finish the tutorial');
    const afterTutorial=health.applyDamage(assigned.id,before+1000,{attackerId:id,weaponId:'rifle',now:Date.now()});
    assert.equal(afterTutorial.killed,true,'completed tutorial must not leave immortal enemies');
    assert.equal(assigned.alive,false);
    const standing=game.api.snapshotFor(id).entities.find(e=>e.id===id);
    assert(standing.alive&&!standing.downed);
    assert.equal(standing.stimulants,downed.stimulants-1);
    console.log('TUTORIAL_RECOVERY_OBSERVED',JSON.stringify({phase:state().phase,health:standing.health,downed:standing.downed,stim:standing.stimulants,gameTime:lab.status().gameTime}));
  }
  const report=lab.finish();
  console.log('ENGINE_LAB_TUTORIAL_LOOT_OK',JSON.stringify({order,phase:state().phase,seconds:report.simulatedMs/1000}));
 }finally{await game.host.stop()}
}
