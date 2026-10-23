import {createEchoFrontGame} from "../src/server/game.js";
import {performance} from "node:perf_hooks";
const game=await createEchoFrontGame({mode:"battle-royale"}), S=game.host.services,C=game.host.components;
const human="pileup-test-human", now0=Date.now();game.api.connectHuman(human);
const entities=S.get("entities"),phys=S.get("physics"),cars=S.get("vehicles"),drivers=S.get("bot-vehicles"),move=S.get("movement");
const bots=entities.all().filter(e=>e.bot), fleet=cars.snapshot();
if (process.env.CPU_BASELINE_TRAFFIC === "1") {
  delete cars.trafficSnapshot;
  delete cars.fleetCount;
}
const place={x:-25,z:-15};
const tracked=fleet.slice(0,35);
let attempt=0,assigned=0;
for(const [i,car] of tracked.slice(0,28).entries()){
 const bot=bots[i],id=bot?.id;if(!id)continue;
 const p={x:car.x+2.1,y:0,z:car.z+1.5};
 Object.assign(C.get(id,"Parachute")??{},{phase:"landed",airborne:false});
 move.teleport(id,p);
 const accepted=drivers.assign(id,car.id,{x:320,y:0,z:320},now0,{maxDistance:125});
 attempt++;if(accepted)assigned++;
}
for(const bot of bots.slice(28)){const p=C.get(bot.id,"Parachute");if(p)Object.assign(p,{phase:"landed",airborne:false});}
const hp=C.get(human,"Parachute");if(hp)Object.assign(hp,{phase:"landed",airborne:false});
move.teleport(human,{x:160,y:0,z:160});game.host.events.emit("parachute:landed",{entityId:human,now:now0});
// Let bots enter physical vehicles in their original, spaced-out spawn positions.
let now=now0;
game.api.step(.05,now+=50);
console.log("ENTERED_BEFORE_PILE",JSON.stringify({driving:drivers.summary().driving,approaching:drivers.summary().approaching,reasons:drivers.summary().releaseReasons}));
for(const [i,car] of tracked.entries()){
 const pos={x:place.x+(i%7)*3.55,y:1.45,z:place.z+Math.floor(i/7)*5.3};
 phys.setDynamicBodyTranslation(car.id,pos);
 phys.setDynamicBodyLinearVelocity(car.id,{x:0,y:0,z:0});
}
const world=phys.world,origWorldStep=world.step,origShape=world.castShape,origRay=world.castRay,origMove=phys.move,origSnapshot=cars.snapshot;
const measured={};const wrap=(obj,key,name)=>{const original=obj[key];obj[key]=function(...args){const t=performance.now();try{return original.apply(this,args)}finally{const m=measured[name]??={calls:0,ms:0};m.calls++;m.ms+=performance.now()-t;}};return ()=>{obj[key]=original}};
const restores=[wrap(world,"step","world.step"),wrap(world,"castShape","world.castShape"),wrap(world,"castRay","world.castRay"),wrap(phys,"move","physics.move"),wrap(cars,"snapshot","vehicles.snapshot")];
let ticks=[];
try{
 for(let i=0;i<Math.max(12,Number(process.env.CPU_STRESS_STEPS)||38);i++){
  const before=performance.now();game.api.step(.05,now+=50);ticks.push(performance.now()-before);
  if(i<3)console.log("DRIVER_TICK",i,JSON.stringify({driving:drivers.summary().driving,approaching:drivers.summary().approaching,reasons:drivers.summary().releaseReasons}));if(i===9){for(const k of Object.keys(measured))delete measured[k];ticks=[];}
 }
 const vehicleSummary=drivers.summary();
 const lat=[...ticks].sort((a,b)=>a-b), metrics=Object.entries(measured).map(([name,m])=>({name,calls:m.calls,ms:+m.ms.toFixed(1)})).sort((a,b)=>b.ms-a.ms);
 const body=fleet.slice(0,35).map(c=>cars.stateFor(c.id)).filter(Boolean);
 
 console.log("FLEET_PROFILE",JSON.stringify({bots:bots.length,all:entities.all().length,fleet:fleet.length,placed:tracked.length,attempt,assigned,driving:vehicleSummary.driving,approaching:vehicleSummary.approaching,metrics,avgStepMs:+(ticks.reduce((a,b)=>a+b,0)/ticks.length).toFixed(1),medianStepMs:+lat[Math.floor(lat.length/2)].toFixed(1),p95StepMs:+lat[Math.floor(lat.length*.95)].toFixed(1),carsNear:body.filter(c=>Math.hypot(c.x-place.x-10,c.z-place.z-10)<45).length,releaseReasons:vehicleSummary.releaseReasons,unavailableReasons:vehicleSummary.unavailableReasons,crashes:vehicleSummary.crashEjections,trafficYields:vehicleSummary.trafficYields,controlUpdates:vehicleSummary.controlUpdates}));
}finally{for(const restore of restores)restore();await game.host.stop();}
