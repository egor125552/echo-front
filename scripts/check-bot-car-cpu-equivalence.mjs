import assert from "node:assert/strict";
import { createEchoFrontGame } from "../src/server/game.js";
import {
  BOT_LONG_SIGHT_DISTANCE, BOT_HUMAN_DISTANCE_BIAS,
  BOT_VERTICAL_SIGHT_TOLERANCE,
} from "../src/plugins/battle-royale-bot-awareness/server.js";

const game = await createEchoFrontGame({mode:"battle-royale"});
const s=game.host.services,c=game.host.components,player="cpu-equivalence-human";
try {
  game.api.connectHuman(player);
  const vehicles=s.get("vehicles"), physics=s.get("physics"), perception=s.get("bot-perception");
  const bots=s.get("entities").all().filter(e=>e.bot);
  const teams=s.get("teams"),grid=s.get("spatial-grid"),movement=s.get("movement");
  let now=Date.now();
  assert.equal(bots.length,95,"The real game must spawn exactly 95 bots alongside one human");

  function compareFleet() {
    const full=vehicles.snapshot(),traffic=vehicles.trafficSnapshot();
    assert.equal(vehicles.fleetCount(),full.length);
    assert.equal(traffic.length,full.length);
    for (let i=0;i<full.length;i++){
      assert.equal(traffic[i].id,full[i].id);
      for(const key of ["kind","x","y","z","angle","speed","forwardSpeed","driverId","occupied"]) {
        assert.deepStrictEqual(traffic[i][key],full[i][key],full[i].id+"."+key);
      }
      assert.deepStrictEqual(traffic[i].linvel,full[i].linvel,full[i].id+".linvel");
    }
  }
  compareFleet();

  // A native Rapier sight-line scan, like the previous implementation:
  // first raycast every candidate, then sort and select the requested limit.
  function fullScan(botId,requestedDistance=BOT_LONG_SIGHT_DISTANCE,limit=8) {
    const transform=c.get(botId,"Transform");
    const radius=Math.max(BOT_LONG_SIGHT_DISTANCE,Number(requestedDistance)||0);
    const ownTeam=teams.teamOf(botId),seen=[];
    for(const entry of grid.query(transform,radius,now)){
      const enemy=entry.entity;
      if(!enemy?.alive||enemy.id===botId||teams.teamOf(enemy.id)===ownTeam)continue;
      if(Math.abs((Number(entry.transform.y)||0)-(Number(transform.y)||0))>BOT_VERTICAL_SIGHT_TOLERANCE)continue;
      const distance=Math.hypot((Number(entry.transform.x)||0)-(Number(transform.x)||0),
                                 (Number(entry.transform.z)||0)-(Number(transform.z)||0));
      if(distance>radius)continue;
      const origin={x:Number(transform.x)||0,y:(Number(transform.y)||0)+1,z:Number(transform.z)||0};
      const target={x:Number(entry.transform.x)||0,y:(Number(entry.transform.y)||0)+1,z:Number(entry.transform.z)||0};
      const dx=target.x-origin.x,dy=target.y-origin.y,dz=target.z-origin.z;
      const length=Math.hypot(dx,dy,dz);
      const visible=length<=.35||!physics.raycastWorld(origin,{x:dx,y:dy,z:dz},Math.max(.05,length-.28));
      if(!visible)continue;
      let score=Math.max(.1,Number(distance)||.1);
      if(!enemy.bot)score*=BOT_HUMAN_DISTANCE_BIAS;
      seen.push({entityId:enemy.id,distance,score});
    }
    seen.sort((a,b)=>a.score-b.score||a.distance-b.distance);
    return seen.slice(0,Math.max(1,Math.min(12,Number(limit)||0)));
  }
  function compareAwareness() {
    for (const bot of bots.slice(0,18)) for(const limit of [1,4,8,12]){
      const a=perception.visibleEnemies(bot.id,105,{now,limit})
        .map(v=>({entityId:v.entityId,distance:v.distance,score:v.score}));
      const b=fullScan(bot.id,105,limit);
      assert.deepStrictEqual(a,b,"Rapier line-of-sight/ranking changed for "+bot.id+" limit="+limit);
    }
  }
  // Concentrate actors while retaining original team/physics rules.
  for(let i=0;i<25;i++){
    const bot=bots[i],p=c.get(bot.id,"Parachute");
    if(p)Object.assign(p,{phase:"landed",airborne:false});
    movement.teleport(bot.id,{x:-90+(i%5)*5,y:0,z:-70+Math.floor(i/5)*5});
  }
  compareAwareness();
  for(let step=0;step<3;step++){game.api.step(.05,now+=50);compareFleet();compareAwareness();}
  console.log("PASS car AI traffic fields and full Rapier sight-line ranking match original logic, 95 bots, 76 cars");
}finally{await game.host.stop();}
