// Independent audio layer mixer, consumes authoritative game state.
export const manifest={id:"building-destruction-audio",requires:["spatial-audio-web","cloudflare-session"]};
const ROOT="/assets/audio/destruction/";
const assets={
 glass:{hit:["glass-hit-1","glass-hit-2","glass-hit-3"],fall:["glass-rain-1","glass-rain-2","glass-rain-3"]},
 wood:{hit:["wood-crack-1","wood-crack-2"],fall:["wood-fall-1","wood-fall-2"]},
 stone:{hit:["stone-hit-1","stone-hit-2","stone-hit-3"],fall:["stone-fall-1","stone-fall-2","stone-fall-3"]},
 metal:{hit:["metal-hit-1","metal-hit-2","metal-hit-3"],fall:["metal-rattle-1","metal-rattle-2","metal-rattle-3"],strain:["metal-bend-1","metal-bend-2"]},
 tile:{hit:["tile-break-1","tile-break-2"],fall:["tile-fall-1","tile-fall-2"]},
};
const dust=["dust-1","dust-2","dust-3"];
const loopKeys=["fire-low","fire-crackle","crate-mass","crate-scrape","crate-grit"];
const limit=(x,a,b)=>Math.max(a,Math.min(b,Number(x)||0));
function choose(a,n){return a[Math.abs(Math.floor(n))%a.length];}
export async function setup(ctx){
 const audio=ctx.services.get("audio"),network=ctx.services.get("network");
 const cache=new Map(),pending=new Map(),fires=new Map(),voices=new Set();
 let generation=0;
 const all=[...new Set([...Object.values(assets).flatMap(x=>Object.values(x).flat()),...dust,...loopKeys,"fire-pop","crate-start","crate-stop"])];
 function load(k){
   if(cache.has(k))return Promise.resolve(cache.get(k));
   if(pending.has(k))return pending.get(k);
   const p=Promise.resolve().then(()=>audio.load(ROOT+k+(loopKeys.includes(k)?".wav":".mp3"))).then(b=>{if(!b)throw Error(k);cache.set(k,b);return b;}).finally(()=>pending.delete(k));
   pending.set(k,p);return p;
 }
 const warm=()=>Promise.allSettled(all.map(load));
 void warm();
 function play(k,p,g,extra={}){
   const b=cache.get(k);
   if(!b){void load(k).catch(()=>{});return null;}
   const h=audio.playSpatialBuffer(b,p,{radius:150,gain:g,referenceDistance:5,rolloffFactor:.30,airAbsorptionMinHz:2200,occlusion:limit(p.occlusion,0,1),...extra});
   if(h&&!extra.loop){voices.add(h);h.source?.addEventListener("ended",()=>voices.delete(h),{once:true});}
   return h;
 }
 function one(k,p,g,extra={}){
   if(voices.size>=56)return;
   return play(k,p,g,extra);
 }
 function impact(p){
   const a=assets[p.material]??assets.stone,n=Number(p.variant)||0,g=.28+.46*limit(p.intensity,0,1);
   const rate=.94+(n%3)*.06;
   if(p.stage==="strain"){
     if(voices.size>=20)return;
     one(choose(a.strain??a.hit,n),p,g*.40,{playbackRate:rate});
   }else if(p.stage==="debris"){
     if(voices.size>=28)return;
     one(choose(a.fall,n),p,g*.30,{playbackRate:1.08});
   }else if(p.stage==="break"){
     one(choose(a.hit,n),p,g,{playbackRate:rate});
     one(choose(a.fall,n+1),p,g*.81,{playbackRate:rate});
     // Each material has a distinct recorded secondary texture.
     if(p.element==="building-floor"||p.element==="building-wall"||p.element==="building-parapet")
       one(choose(dust,n),p,g*.65);
     if((p.style==="industrial"||p.style==="underground")&&p.material!=="metal")one(choose(assets.metal.fall,n),p,g*.36);
     if((p.style==="timber"||p.style==="multi-level")&&p.material!=="wood"&&p.material!=="glass")one(choose(assets.wood.fall,n),p,g*.36);
     if(p.style==="interior"&&p.material==="stone"&&p.element!=="building-floor")one(choose(assets.tile.fall,n),p,g*.32);
     if(p.element==="building-stair")one(choose(assets.metal.fall,n),p,g*.52);
     if(p.element==="building-door"&&p.material==="wood")one(choose(assets.wood.hit,n+1),p,g*.55);
     if(p.element==="building-window"||p.material==="glass")one(choose(assets.glass.fall,n+2),p,g*.72);

   }
 }
 function stopGroup(group,fade=.45){
   for(const h of group?.handles??[])try{h.fadeOut?.(fade);if(!h.fadeOut)h.source?.stop?.();}catch{}
 }
 function updateFire(snapshot){
   const items=snapshot?.destruction?.fires??[], ids=new Set(items.map(f=>f.id));
   for(const [id,g] of fires)if(!ids.has(id)){stopGroup(g);fires.delete(id);}
   for(const p of items){
     let g=fires.get(p.id);
     if(!g){g={handles:[],p,nextPop:performance.now()+1800};fires.set(p.id,g);}
     g.p=p;
     if(performance.now()>=g.nextPop){
       g.nextPop=performance.now()+3000+Math.random()*3000;
       if(voices.size<20)one("fire-pop",p,.48*limit(p.intensity,.2,1),{radius:45});
     }
     // Reattempt missing / out-of-range tracks on subsequent snapshots.
     for(const [i,k] of ["fire-low","fire-crackle"].entries()){
       const gain=(i===0?.56:.75)*limit(p.intensity,.2,1);
       if(!g.handles[i])g.handles[i]=play(k,p,gain,{radius:85,referenceDistance:3,rolloffFactor:.27,loop:true,channel:"fire:"+p.id+":"+i,replace:true});
       const h=g.handles[i];h?.update?.(p);h?.setGain?.(gain,.18);h?.updateOcclusion?.(limit(p.occlusion,0,1));
     }
   }
 }
 // Crate audio is delegated to the existing interaction plugin, so its
 // generation counters and stop/fade handling remain authoritative.
 async function crateLoop(p,options){
   const token=generation;
   const buffers=await Promise.all(loopKeys.slice(2).map(load));
   if(token!==generation)return null;
   const hs=buffers.map((b,i)=>audio.playSpatialBuffer(b,p,{...options,gain:options.gain*[.57,.70,.36][i],channel:options.channel,replace:i===0})).filter(Boolean);
   if(!hs.length)return null;
   const apply=(fn,...a)=>{for(const h of hs)h[fn]?.(...a);};
   return {source:{stop:()=>apply("stop")},update:p=>apply("update",p),updateOcclusion:o=>apply("updateOcclusion",o),
     setGain:(g,s)=>hs.forEach((h,i)=>h.setGain?.(g*[.57,.70,.36][i],s)),fadeOut:s=>apply("fadeOut",s),stop:()=>apply("stop")};
 }
 function reset(){
   generation++;for(const g of fires.values())stopGroup(g,.15);fires.clear();
   for(const h of voices)try{h.stop?.();}catch{}voices.clear();
 }
 ctx.events.on("game:event",packet=>{if(packet?.event==="building:material")impact(packet.payload??{});});
 ctx.events.on("game:snapshot",s=>{
   if(s?.mode!=="battle-royale"){if(fires.size)reset();return;}updateFire(s);
 });
 ctx.events.on("network:disconnected",reset);
 ctx.services.provide("destruction-audio",{warm,crateLoop,crateReady:()=>loopKeys.slice(2).every(k=>cache.has(k)),crateStart:(p,options)=>play("crate-start",p,options.gain,options),crateStop:(p,options)=>play("crate-stop",p,options.gain,options)});
}
