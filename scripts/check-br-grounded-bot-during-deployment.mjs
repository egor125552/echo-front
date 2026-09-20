import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createEchoFrontGame} from '../src/server/game.js';
import {EngineLab} from '../src/server/engine-lab.js';

test('a bot dismounting during shared deployment resumes real on-foot AI',async()=>{
  const game=await createEchoFrontGame({mode:'battle-royale'});
  const lab=new EngineLab(game,{mode:'battle-royale',room:'grounded-bot-deployment',
    watch:['runner','driver']});
  try{
    const cmd=(service,method,...args)=>({
      command:'service.call',args:{service,method,arguments:args},
    });
    const preparation=await lab.prepare([
      cmd('match-api','connectHuman','runner'),
      cmd('match-api','connectHuman','other-player'),
      cmd('movement','teleport','runner',{x:430,y:0,z:430}),
      cmd('movement','teleport','other-player',{x:450,y:0,z:450}),
      {command:'entity.spawn',args:{spec:{
        id:'driver',kind:'bot',bot:true,health:200,
        position:{x:-630,y:0,z:-836},
      }}},
      cmd('bot-vehicles','assign','driver','br-jeep-2',{x:-550,y:0,z:-840}),
      {command:'game.step',args:{steps:35,dt:.05}},
      cmd('movement','teleport','runner',{x:-600,y:0,z:-840}),
    ]);
    assert(preparation.results.every(entry=>entry.ok),JSON.stringify(preparation.results));
    assert.equal(preparation.results[5].result,true,'bot was actually assigned to the jeep');
    lab.start();
    const vehicle=game.host.services.get('vehicles');
    const parts=game.host.components;
    let releasedPosition=null;
    let releaseAt=null;
    let resumed=false;
    let moveDistance=0;
    let airborneBots=0;
    for(let second=1;second<=23;second++){
      game.api.handleInput('runner',{forward:0,strafe:-1,sprint:true});
      await lab.advance({steps:20,sampleEvery:5});
      const driver=game.host.services.get('entities').get('driver');
      const t=parts.get('driver','Transform');
      const p=parts.get('driver','Input');
      const decision=game.host.services.get('bot-brain').commitmentFor('driver');
      if(!vehicle.isDriving('driver')&&releaseAt===null){
        releaseAt=second;
        releasedPosition={x:t.x,z:t.z};
      }
      if(releasedPosition){
        moveDistance=Math.hypot(t.x-releasedPosition.x,t.z-releasedPosition.z);
        if(moveDistance>1&&decision&&Math.hypot(p.forward||0,p.strafe||0)>.1)resumed=true;
      }
      airborneBots=game.host.services.get('bots').all().filter(bot=>
        game.host.components.get(bot.id,'Parachute')?.airborne).length;
      assert(driver.alive,'driver should survive this controlled encounter');
      if(resumed)break;
    }
    const deployment=game.host.services.get('battle-royale').status().deployment;
    console.log('DEPLOYMENT_BOT_REPLAY',JSON.stringify({
      releaseAt,resumed,moveDistance,airborneBots,deploymentActive:deployment.active,
      brain:game.host.services.get('bot-brain').commitmentFor('driver')?.goal,
      elapsed:lab.status().gameTime,
    }));
    assert(releaseAt!==null,'driver must dismount in the reproduced real scenario');
    assert.equal(deployment.active,true,'shared landing is still under way');
    assert(airborneBots>0,'other participants are still parachuting');
    const airborneDecision=game.host.services.get('bots').all().filter(bot=>game.host.components.get(bot.id,'Parachute')?.airborne).find(bot=>game.host.services.get('bot-brain').commitmentFor(bot.id));
    assert.equal(airborneDecision,undefined,'airborne participants should not receive grounded combat decisions');
    assert(resumed,'grounded driver must resume autonomous foot movement during shared deployment');
  }finally{await game.host.stop()}
});
