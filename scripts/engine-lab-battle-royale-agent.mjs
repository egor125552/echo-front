import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const base=process.argv[2]??'http://127.0.0.1:8793';
const tokenFile=process.argv[3];
if(!tokenFile)throw new Error('Usage: node scripts/engine-lab-battle-royale-agent.mjs <local-url> <private-token-file>');
const token=fs.readFileSync(tokenFile,'utf8').trim();
const room='autonomous-br-'+crypto.randomUUID().slice(0,12);
const url=new URL('/api/engine-lab?mode=battle-royale&room='+room,base);
async function call(action,params={}) {
 const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-Engine-Lab-Token':token},body:JSON.stringify({action,...params}),signal:AbortSignal.timeout(95000)});
 const j=await r.json();if(!r.ok||!j.ok)throw Error(action+' '+JSON.stringify(j).slice(0,700));return j.result??j;
}
const PID='human-agent',log=[],started=Date.now();
const playerEvents=[];
let playerEventCursor=0;
async function consumePlayerEvents() {
  for(let page=0;page<12;page++){
    const batch=await call('scenario.player-events',{
      playerId:PID,fromIndex:playerEventCursor,limit:200,
    });
    if(batch.truncated) {
      const warning={event:'engine-lab:event-gap',
        index:playerEventCursor,firstAvailableIndex:batch.firstAvailableIndex};
      playerEvents.push(warning);
      console.log('PLAYER_EVENT',JSON.stringify(warning));
    }
    for(const event of batch.events){
      playerEvents.push(event);
      if(['loot:picked','vehicle:entered','vehicle:exited','vehicle:impact',
        'entity:died','battle-royale:eliminated','combat:damage',
        'injury:downed'].includes(event.event)) {
        console.log('PLAYER_EVENT',JSON.stringify(event).slice(0,900));
      }
    }
    playerEventCursor=batch.nextIndex;
    if(!batch.hasMore)break;
    if(page===11)throw Error('Player event pagination exceeded maximum pages');
  }
}
const maxTurns=Math.max(1,Math.min(480,Number(process.argv[4])||240));
await call('scenario.create',{watch:[PID],objectives:[
 {type:'event-count',event:'parachute:landed',entityId:PID,minimumCount:1},
 {type:'event-count',event:'loot:picked',entityId:PID,minimumCount:1},
 {type:'event-count',event:'vehicle:entered',entityId:PID,minimumCount:1},
]});
await call('scenario.prepare',{commands:[{command:'service.call',args:{service:'match-api',method:'connectHuman',arguments:[PID]}}]});
await call('scenario.start');
let state=await call('scenario.view',{playerId:PID});
let phase='drop',target={x:76.1,z:0},lastPos=null,stuck=0;
let doorOpened=false,doorActions=0,lootBest=Infinity,lootStall=0,lootCollected=false;
function direction(self,goal) {
 const dx=goal.x-self.x,dz=goal.z-self.z,dist=Math.hypot(dx,dz);
 const ux=dx/Math.max(.01,dist),uz=dz/Math.max(.01,dist),angle=self.angle||0;
 return {forward:Math.sin(angle)*ux-Math.cos(angle)*uz,strafe:Math.cos(angle)*ux+Math.sin(angle)*uz,distance:dist};
}
function brief(s){const p=s.self??{};return {t:s.gameTime,phase:p.parachute?.phase,alive:p.alive,x:Math.round(p.x),y:Math.round(p.y),z:Math.round(p.z),health:p.health,armor:p.armor,ammo:p.ammo,weapon:p.weapon,driver:s.drivingVehicle?.id??null,nearbyDoors:s.nearbyDoors?.map(d=>({id:d.id,open:d.open,d:Math.round(d.distanceMeters)})),aliveInMatch:s.match?.alive,nearbyBots:s.visibleEntities?.filter(b=>b.bot&&b.alive).slice(0,2).map(b=>({id:b.id,d:Math.round(b.distanceMeters)})),crates:s.nearbyCrates?.slice(0,2).map(c=>({id:c.id,d:Math.round(c.distanceMeters)})),cars:s.nearbyVehicles?.slice(0,2).map(c=>({id:c.id,d:Math.round(c.distanceMeters),occupied:c.occupied}))};}
function record(action,details){const row={action,details,observed:brief(state)};log.push(row);console.log('PLAY',JSON.stringify(row));}
console.log('MATCH_RESUMED',JSON.stringify(brief(state)));
let carId=null,lootingAttempts=0,carAttempts=0,driveSeconds=0,combatSeconds=0,landedAt=null;
let triedDoor=0;
let lastPedestrianWarningCount=0, outsideWarehouseTarget={x:135,z:-60};
let approachStallAttempts=0, previousApproachDistance=Infinity;
let drivingRecoveryTurns=0, drivingStallCount=0, drivingStartPosition=null;
let requestedParking=false;
let previousDrivingVehicleId=null;
for(let turn=0;turn<maxTurns;turn++){
 const player=state.self;
 if(!player?.alive){record('eliminated','Player died during this actual battle royale');break;}
 if(state.match?.phase==='ended'){record('match-ended','Match ended');break;}
 const chute=player.parachute?.phase;
 let input={},step=60,action='observe',details='';
 if(state.drivingVehicle&&phase!=='driving'){
   phase='driving';
   previousDrivingVehicleId=state.drivingVehicle.id;
   drivingStartPosition={x:state.drivingVehicle.x,z:state.drivingVehicle.z};
   driveSeconds=0;requestedParking=false;
   record('already-driving',state.drivingVehicle.id);
 }
 if(chute!=='landed' && chute!=='grounded' && player.parachute?.airborne){
   phase='drop';let nav=direction(player,target);
   input={forward:Math.min(1,nav.distance>4?1:0)*nav.forward,strafe:Math.min(1,nav.distance>4?1:0)*nav.strafe,sprint:true};
   if(chute==='freefall'&&player.y<175){input.parachutePressed=true;action='open-parachute';}
   else action='steer-parachute';
   step=40;details='Target ground crate; altitude '+Math.round(player.y);
 } else if(phase==='drop'){
   phase='loot';landedAt=state.simulatedMs;action='landed';input={};step=20;
 } else if(phase==='loot'){
   const danger=state.visibleEntities?.find(e=>e.bot&&e.alive&&e.distanceMeters<25);
   const door=state.nearbyDoors?.find(d=>d.id==='warehouse-front-door');
   const carAtDoor=state.nearbyVehicles?.find(v=>!v.occupied&&v.distanceMeters<2.4);
   if(danger&&(player.armor<45||player.health<140)){
     if(carAtDoor){input={interactPressed:true};action='escape-into-car';step=5;phase='vehicle';}
     else{const nav=direction(player,{x:player.x+(player.x-danger.x)*.5,z:player.z+(player.z-danger.z)*.5});
       input={forward:nav.forward,strafe:nav.strafe,sprint:true,fireHeld:true};
       action='fight-or-retreat';step=20;details=danger.id+' '+danger.distanceMeters.toFixed(1)+'m';}
   }else if(door&&!door.open&&player.x>74.8){
     const nav=direction(player,{x:76,z:0});
     if(door.distanceMeters>1.45||Math.abs(player.z)>.75){
       input={forward:nav.forward,strafe:nav.strafe};
       action='approach-door';details='Entrance '+door.distanceMeters.toFixed(1)+'m';
       step=Math.max(4,Math.min(24,Math.floor(Math.max(0,nav.distance-0.8)/3.25*20)));
     }else{input={interactPressed:true};action='try-warehouse-door';details='Actual door open='+door.open;step=4;triedDoor++;}
     if(triedDoor>3){phase='vehicle';details+='; door inaccessible near vehicles, seek car';}
   }else{
     const crate=state.nearbyCrates?.find(c=>!c.opened&&Math.abs((c.y??0)-(player.y??0))<1.6)
       ??state.nearbyCrates?.find(c=>!c.opened);
     if(crate){
       target={x:crate.x,z:crate.z};
       const nav=direction(player,target);
       if(nav.distance>2){input={forward:nav.forward,strafe:nav.strafe,sprint:nav.distance>20};
         action='approach-crate';details=crate.id+' '+nav.distance.toFixed(1)+'m';
         step=Math.max(4,Math.min(30,Math.floor(Math.max(0,nav.distance-1.3)/3.25*20)));}
       else{input={interactPressed:true};action='take-loot';details=crate.id;lootingAttempts++;step=4;}
     }else{phase='vehicle';action='search-vehicle';details='No more reachable crates';}
     if(lootingAttempts>=3){phase='vehicle';details+='; leave loot area';}
   }
 } else if(phase==='vehicle' && player.y>1.6
     && player.x>=45 && player.x<=76 && Math.abs(player.z)<=12){
    const stepGoal=Math.abs(player.z)>1.2
      ? {x:69,z:0} : player.x>71?{x:68,z:0}:{x:74,z:0};
    const nav=direction(player,stepGoal);
    input={forward:nav.forward,strafe:nav.strafe,sprint:nav.distance>5};
    action='descend-warehouse-stairs';
    details='Upper floor '+player.y.toFixed(1)+'m: navigate to staircase '+nav.distance.toFixed(1)+'m';
    step=Math.max(4,Math.min(25,Math.floor(Math.max(.5,nav.distance-.8)/5.4*20)));
 } else if(phase==='vehicle' && player.x>=45 && player.x<76.6
     && player.y<=1.6 && Math.abs(player.z)<12.4){
    const door=state.nearbyDoors?.find(d=>d.id==='warehouse-front-door');
    const insideGoal=Math.abs(player.z)>1.0 ? {x:73.5,z:0}
      : player.x<74.1 ? {x:74.4,z:0} : {x:79,z:0};
    const nav=direction(player,insideGoal);
    if(door&&!door.open&&door.distanceMeters<=1.45&&Math.abs(player.z)<1){
      input={interactPressed:true};action='open-exit-door';step=4;
    }else {
      input={forward:nav.forward,strafe:nav.strafe};
      action='navigate-warehouse-exit';
      step=Math.max(4,Math.min(16,Math.floor(Math.max(.4,nav.distance-.5)/3.25*20)));
    }
    details='Walk through the real warehouse doorway before heading toward the car';
 } else if(phase==='vehicle'){
    const v=state.nearbyVehicles?.find(v=>!v.occupied
      && (v.heightDifferenceMeters??0)<2.2);
    if(v){carId=v.id;const nav=direction(player,{x:v.x,z:v.z});
      if(v.distanceMeters>3.7){
        const progress=v.distanceMeters<previousApproachDistance-.5;
        approachStallAttempts=progress?0:approachStallAttempts+1;
        previousApproachDistance=v.distanceMeters;
        const nearbyBuilding=player.x>=45&&player.x<80&&Math.abs(player.z)<13;
        if(approachStallAttempts>=2&&nearbyBuilding){
          const detour={x:Math.max(80,player.x+4),z:player.z>0?15:-15};
          const alternative=direction(player,detour);
          input={forward:alternative.forward,strafe:alternative.strafe,sprint:false};
          action='detour-around-warehouse';step=12;details=v.id+' cannot be reached directly, detour to '+JSON.stringify(detour);
          if(approachStallAttempts>6){phase='explore';details+='; abandon blocked vehicle';}
        }else{
          input={forward:nav.forward,strafe:nav.strafe,sprint:true};
          action='approach-car';details=v.id+' '+v.distanceMeters.toFixed(1)+'m';
          step=Math.max(6,Math.min(24,Math.floor(Math.max(.5,v.distanceMeters-3)/5.4*20)));
        }
      }
      else{input={interactPressed:true};action='enter-car';details=v.id;carAttempts++;previousApproachDistance=Infinity;approachStallAttempts=0;step=5;}
      if(carAttempts>6){action='cannot-enter-car';phase='explore';}
    }else{const nav=direction(player,outsideWarehouseTarget);input={forward:nav.forward,strafe:nav.strafe,sprint:true};action='searching-for-car';details='Search road outside warehouse';step=20;}
 } else if(phase==='driving'){
    const traveled=drivingStartPosition&&state.drivingVehicle
      ? Math.hypot(state.drivingVehicle.x-drivingStartPosition.x,
        state.drivingVehicle.z-drivingStartPosition.z) : 0;
    if(requestedParking){
      const speed=Number(state.drivingVehicle?.speed)||0;
      if(speed>1.2){
        // sprint is the HANDBRAKE while seated, not a running modifier.
        input={forward:0,strafe:0,sprint:true};action='brake-before-exit';
        details='Slow the actual car to under 1.2 m/s, current '+speed.toFixed(1);
        step=10;
      }else{
        input={interactPressed:true};phase='explore';action='exit-parked-car';
        details='The car is nearly stationary; exit without an unsafe jump-out';
        step=4;
      }
    }else if(drivingRecoveryTurns>0){
      input={forward:-.8,strafe:drivingStallCount%2?.6:-.6,sprint:false};
      drivingRecoveryTurns--;
      action='reverse-and-turn';step=20;
      details='Back out of an obstacle instead of holding forward throttle';
    }else{
      input={forward:1,strafe:(driveSeconds%18>11?.25:0),sprint:false};
      action='drive';step=20;driveSeconds+=1;
      details='Engine Control input, not teleportation; no handbrake';
    }
    if(traveled>120&&driveSeconds>=25&&drivingRecoveryTurns===0
        &&!requestedParking){
      requestedParking=true;
      details+='; next action brakes before exiting';
    }
 } else{
   const enemy=state.visibleEntities?.filter(e=>e.bot&&e.alive).sort((a,b)=>a.distanceMeters-b.distanceMeters)[0];
   if(enemy&&enemy.distanceMeters<35){
      if(player.ammo<8){input={forward:-.8,strafe:.4,reload:true,sprint:true};
        action='reload-and-retreat';details=enemy.id+' nearby, reload with cover';}
      else{input={forward:-.3,strafe:.65,fireHeld:true,sprint:false};
        action='combat';details=enemy.id+' '+enemy.distanceMeters.toFixed(1)+'m';combatSeconds+=3;}
      step=20;
   }else{
      // Don't return to the same upper warehouse room indefinitely after the
      // original crate was looted. Explore a different point along the map.
      const nav=direction(player,outsideWarehouseTarget);
      if(nav.distance<20){
         outsideWarehouseTarget={x:outsideWarehouseTarget.x>0?-150:170,z:outsideWarehouseTarget.z<0?110:-100};
      }
      input={forward:nav.forward,strafe:nav.strafe,sprint:true};
      action='explore';details='Explore outside the warehouse';
      step=30;
   }
 }
 const before=state;
 await call('scenario.input',{playerId:PID,input});
 const advanced=await call('scenario.advance',{steps:step,sampleEvery:20});
 state=await call('scenario.view',{playerId:PID});
 await consumePlayerEvents();
 if(state.drivingVehicle && phase!=='driving'){
    phase='driving';action='vehicle-entered';details='Real driver status confirmed: '+state.drivingVehicle.id;
    previousDrivingVehicleId=state.drivingVehicle.id;
    drivingStartPosition={x:state.drivingVehicle.x,z:state.drivingVehicle.z};
    driveSeconds=0;drivingRecoveryTurns=0;drivingStallCount=0;requestedParking=false;
 }
 if(phase==='driving'&&!state.drivingVehicle&&driveSeconds>0){
    phase='explore';action='vehicle-exited';details='Real driver status lost';
 }
 if(phase==='loot' && !lootCollected && playerEvents.some(e=>e.event==='loot:picked'
     && e.payload?.entityId===PID)){
   lootCollected=true;phase='vehicle';action='loot-confirmed';
   details='Actual loot:picked event '+JSON.stringify(playerEvents.filter(e=>
     e.event==='loot:picked'&&e.payload?.entityId===PID).at(-1).payload).slice(0,280);
 }
 if(advanced.newAnomalies?.length){
   details+='; anomalies '+JSON.stringify(advanced.newAnomalies).slice(0,500);
   const pedestrianStall=advanced.newAnomalies.some(x=>x.type==='possible-stalled-pedestrian'
     && x.entityId===PID);
   if(phase==='driving'&&advanced.newAnomalies.some(x=>
      x.type==='possible-stalled-human-driver'&&x.entityId===PID)){
      drivingRecoveryTurns=3;
      drivingStallCount++;
      action='stalled-driver-reverse-next';
      details+='; next three actions reverse and turn';
   }
   if(pedestrianStall){
     if(phase==='vehicle'&&state.self?.y>1.6){action='stalled-choose-stairs';}
     else if(phase==='vehicle'){
       approachStallAttempts+=3;
       action='stalled-choose-detour';
     }else if(phase==='explore'){
       outsideWarehouseTarget={x:player.x>0?-130:160,z:player.z>0?-120:120};
       action='stalled-replan-exploration';
     }else if(phase==='loot'){
       phase='vehicle';action='stalled-abandon-loot';
     }
   }
}
 if(turn%3===0||action==='open-parachute'||action==='landed'||action==='take-loot'||action==='approach-door'||action==='try-warehouse-door'||action==='descend-warehouse-stairs'||action==='open-exit-door'||action==='navigate-warehouse-exit'||action==='detour-around-warehouse'||action.startsWith('stalled-')||action==='loot-confirmed'||action==='escape-into-car'||action==='fight-or-retreat'||action==='enter-car'||action==='vehicle-entered'||action==='vehicle-exited'||action==='brake-before-exit'||action==='exit-parked-car'||action==='reverse-and-turn'||action==='combat'||before.self.alive!==state.self?.alive)record(action,details);
 if(turn%10===0){
   const report=await call('scenario.report');
   console.log('EVENTS',JSON.stringify({time:state.gameTime,counts:report.eventCounts,anomalies:report.anomalies.length,phase}));
 }
 fs.writeFileSync('/tmp/echo-br-play-progress.json',JSON.stringify({phase,target,turn,time:state.gameTime,events:log.slice(-5),lastView:brief(state)}));
}
await consumePlayerEvents();
const report=await call('scenario.finish');
const totals=playerEvents.reduce((m,e)=>(m[e.event]=(m[e.event]??0)+1,m),{});
console.log('FINAL',JSON.stringify({
 verdict:report.verdict,objectives:report.objectives??report.results,
 gameTime:report.gameTime,realTime:report.realTime,counts:report.eventCounts,
 playerEventCounts:totals,anomalies:report.anomalies,
 finalView:brief(state),phases:log.map(x=>x.action)
}).slice(0,9500));
const out=path.join(os.homedir(),'Downloads','Echo Front Engine Lab '+room+'.json');
fs.writeFileSync(out,JSON.stringify({observations:log,playerEvents,finalView:state,report,wallMs:Date.now()-started},null,2));
console.log('REPORT_FILE',out);
