import { CHARACTER_HALF_HEIGHT, CHARACTER_RADIUS } from "../src/plugins/rapier-physics/server.js";
import assert from "node:assert/strict";
import {createEchoFrontGame} from "../src/server/game.js";
const game=await createEchoFrontGame({mode:"battle-royale"});
try{
 game.api.connectHuman("ray-prefilter-human");
 const physics=game.host.services.get("physics"),world=physics.world,RAPIER=physics.RAPIER;
 const actors=[];
 world.forEachCollider(collider=>{
   const info=physics.colliderInfo(collider.handle);
   if(info?.entityId)actors.push(collider);
 });
 assert(actors.length>=95,"The fixture must include the 95 bots and one human");
 const radius2=(CHARACTER_HALF_HEIGHT+CHARACTER_RADIUS+.02)**2;
 let comparisons=0,rejected=0,candidateHits=0;
 const seed=[13];const random=()=>{seed[0]=(Math.imul(seed[0],1664525)+1013904223)>>>0;return seed[0]/4294967296};
 for(let rayIndex=0;rayIndex<400;rayIndex++){
   const from=actors[Math.floor(random()*actors.length)]?.translation()??{x:0,y:0,z:0};
   const target=actors[Math.floor(random()*actors.length)]?.translation()??{x:100,y:1,z:100};
   const start=rayIndex%3===0
     ?{x:from.x,y:from.y,z:from.z}
     :{x:from.x+(random()-.5)*55,y:from.y+(random()-.5)*4,z:from.z+(random()-.5)*55};
   const end=rayIndex%3===0
     ?{x:target.x,y:target.y,z:target.z}
     :{x:target.x+(random()-.5)*75,y:target.y+(random()-.5)*6,z:target.z+(random()-.5)*75};
   const dx=end.x-start.x,dy=end.y-start.y,dz=end.z-start.z,length=Math.hypot(dx,dy,dz)||1;
   const ray=new RAPIER.Ray(start,{x:dx/length,y:dy/length,z:dz/length});
   for(const collider of actors){
     if(!collider.isEnabled())continue;
     const center=collider.translation(),cx=center.x-start.x,cy=center.y-start.y,cz=center.z-start.z;
     const proj=Math.max(0,Math.min(length,cx*ray.dir.x+cy*ray.dir.y+cz*ray.dir.z));
     const bx=cx-ray.dir.x*proj,by=cy-ray.dir.y*proj,bz=cz-ray.dir.z*proj;
     const within=bx*bx+by*by+bz*bz<=radius2;
     const hit=Number(collider.castRay(ray,length,true));
     const realHit=Number.isFinite(hit)&&hit>=0&&hit<=length;
     if(!within){rejected++;assert(!realHit,"Prefilter rejected genuine Rapier hit");}
     if(realHit)candidateHits++;
     comparisons++;
   }
 }
 assert(rejected>comparisons/2,"Character broad phase did not skip enough candidates");
 assert(candidateHits>0,"No actual capsule intersections tested");
 console.log("PASS ray-prefilter exact vs native Rapier",JSON.stringify({comparisons,rejected,candidateHits,characters:actors.length}));
}finally{await game.host.stop()}
