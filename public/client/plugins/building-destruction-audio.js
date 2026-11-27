// Independent audio layer mixer, consumes authoritative game state.
export const manifest={id:"building-destruction-audio",requires:["spatial-audio-web","cloudflare-session"]};
const ROOT="/assets/audio/destruction/";
const variants=(prefix,count)=>Array.from({length:count},(_,i)=>prefix+"-"+(i+1));
const assets={
 glass:{hit:variants("glass-hit",7),fall:variants("glass-rain",7),detail:variants("glass-detail",3)},
 wood:{hit:variants("wood-crack",5),fall:variants("wood-fall",5),detail:variants("wood-detail",3)},
 stone:{hit:variants("stone-hit",6),fall:variants("stone-fall",6),detail:variants("stone-detail",3)},
 metal:{hit:variants("metal-hit",6),fall:variants("metal-rattle",7),strain:variants("metal-bend",6),detail:variants("metal-detail",4)},
 tile:{hit:variants("tile-break",4),fall:variants("tile-fall",4)},
};
const elementAssets={
 window:{frame:variants("window-frame",5)},
 door:{impact:variants("door-impact",5),hinge:variants("door-hinge",5)},
 floor:{creak:variants("floor-creak",5),break:variants("floor-break",5)},
 beam:{strain:variants("beam-strain",5),fall:variants("beam-fall",5)},
 stair:{hit:variants("stair-hit",5),rattle:variants("stair-rattle",5)},
 roof:{break:variants("roof-break",5),fall:variants("roof-fall",5)},
 wall:{heavy:variants("wall-heavy",5),rubble:variants("wall-rubble",5),detail:variants("wall-detail",5)},
 chain:variants("chain",5),
 metalStructure:variants("metal-structure",5),
};
const dust=variants("dust",6);
const fireLow=["fire-low","fire-low-2"],fireCrackle=["fire-crackle","fire-crackle-2"];
const firePops=["fire-pop","fire-pop-2","fire-pop-3"];
const crateKeys=["crate-mass","crate-scrape","crate-grit"];
const loopKeys=[...fireLow,...fireCrackle,...crateKeys];
const hash=s=>{let h=2166136261;for(const c of String(s??""))h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;};
const limit=(x,a,b)=>Math.max(a,Math.min(b,Number(x)||0));
function choose(a,n){return a[Math.abs(Math.floor(n))%a.length];}
export async function setup(ctx){
 const audio=ctx.services.get("audio"),network=ctx.services.get("network");
 const cache=new Map(),pending=new Map(),fires=new Map(),voices=new Set();
 let generation=0;
 const elementList=[
   ...Object.values(elementAssets.window).flat(),...Object.values(elementAssets.door).flat(),
   ...Object.values(elementAssets.floor).flat(),...Object.values(elementAssets.beam).flat(),
   ...Object.values(elementAssets.stair).flat(),...Object.values(elementAssets.roof).flat(),
   ...Object.values(elementAssets.wall).flat(),...elementAssets.chain,...elementAssets.metalStructure,
 ];
 const all=[...new Set([...Object.values(assets).flatMap(x=>Object.values(x).flat()),...elementList,...dust,...loopKeys,...firePops,"crate-start","crate-stop"])];
 function load(k){
   if(cache.has(k))return Promise.resolve(cache.get(k));
   if(pending.has(k))return pending.get(k);
   const p=Promise.resolve().then(()=>audio.load(ROOT+k+(loopKeys.includes(k)?".wav":".mp3"))).then(b=>{if(!b)throw Error(k);cache.set(k,b);return b;}).finally(()=>pending.delete(k));
   pending.set(k,p);return p;
 }
 let warming=null;
 const warm=()=>{
   if(warming)return warming;
   // Limit parallel requests and audio decoding, particularly on mobile.
   const ordered=[...new Set([...crateKeys,...fireLow,...fireCrackle,
     ...Object.values(assets).flatMap(a=>[a.hit[0],a.fall[0]]),
     elementAssets.window.frame[0],elementAssets.door.impact[0],elementAssets.door.hinge[0],
     elementAssets.floor.creak[0],elementAssets.floor.break[0],
     elementAssets.beam.strain[0],elementAssets.beam.fall[0],
     elementAssets.stair.hit[0],elementAssets.stair.rattle[0],
     elementAssets.roof.break[0],elementAssets.roof.fall[0],
     elementAssets.wall.heavy[0],elementAssets.wall.rubble[0],elementAssets.wall.detail[0],
     elementAssets.chain[0],elementAssets.metalStructure[0],...dust.slice(0,2),...firePops.slice(0,1)])];
   const results=new Array(ordered.length);let cursor=0;
   warming=Promise.all(Array.from({length:6},async()=>{
     while(cursor<ordered.length){const i=cursor++;try{results[i]={status:"fulfilled",value:await load(ordered[i])};}catch(reason){results[i]={status:"rejected",reason};}}
   })).then(()=>results).finally(()=>{warming=null;});
   return warming;
 };
 const warmAll=()=>Promise.allSettled(all.map(load));
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
 function select(keys,n){
   const wanted=choose(keys,n);
   if(cache.has(wanted))return wanted;
   void load(wanted).catch(()=>{});
   const loaded=keys.filter(k=>cache.has(k));
   return loaded.length?choose(loaded,n):wanted;
 }
 function elementLayers(p,n,g,stage){
   const element=p.element;
   const style=p.style;
   if(stage==="strain"){
     if(element==="building-door")one(select(elementAssets.door.hinge,n),p,g*.28);
     if(element==="building-floor")one(select(elementAssets.floor.creak,n),p,g*.31);
     if(element==="building-stair")one(select(elementAssets.stair.rattle,n),p,g*.35);
     if((element==="building-wall"||element==="building-floor")&&(style==="timber"||style==="multi-level"))
       one(select(elementAssets.beam.strain,n),p,g*.34);
     if((style==="industrial"||style==="underground")&&element!=="building-window")
       one(select(elementAssets.metalStructure,n),p,g*.27);
     return;
   }
   if(stage==="debris"){
     if(element==="building-wall")one(select(elementAssets.wall.detail,n),p,g*.28);
     if(element==="building-stair")one(select(elementAssets.chain,n),p,g*.25);
     if(element==="building-parapet")one(select(elementAssets.roof.fall,n),p,g*.27);
     return;
   }
   if(stage!=="break")return;
   if(element==="building-window"){
     one(select(elementAssets.window.frame,n),p,g*.46);
   }else if(element==="building-door"){
     one(select(elementAssets.door.impact,n),p,g*.68);
     one(select(elementAssets.door.hinge,n+1),p,g*.34);
     if(style==="industrial"||style==="underground")one(select(elementAssets.chain,n+2),p,g*.26);
   }else if(element==="building-floor"){
     one(select(elementAssets.floor.break,n),p,g*.62);
     one(select(elementAssets.floor.creak,n+1),p,g*.31);
     if(style==="timber"||style==="multi-level")one(select(elementAssets.beam.fall,n+2),p,g*.43);
     if(Number(p.y)>3.2)one(select(elementAssets.roof.fall,n+3),p,g*.27);
   }else if(element==="building-stair"){
     one(select(elementAssets.stair.hit,n),p,g*.62);
     one(select(elementAssets.stair.rattle,n+1),p,g*.49);
     one(select(elementAssets.chain,n+2),p,g*.28);
   }else if(element==="building-parapet"){
     one(select(elementAssets.roof.break,n),p,g*.58);
     one(select(elementAssets.roof.fall,n+1),p,g*.48);
     if(style==="industrial"||style==="underground")one(select(elementAssets.metalStructure,n+2),p,g*.31);
   }else if(element==="building-wall"){
     one(select(elementAssets.wall.heavy,n),p,g*.66);
     one(select(elementAssets.wall.rubble,n+1),p,g*.52);
     one(select(elementAssets.wall.detail,n+2),p,g*.31);
     if(style==="timber"||style==="multi-level"){
       one(select(elementAssets.beam.strain,n+3),p,g*.31);
       one(select(elementAssets.beam.fall,n+4),p,g*.41);
     }
     if(style==="industrial"||style==="underground")one(select(elementAssets.metalStructure,n+3),p,g*.38);
   }
 }
 function impact(p){
   const a=assets[p.material]??assets.stone,n=hash(p.id)+Math.abs(Number(p.variant)||0)*17+hash(p.stage)+hash(p.now??0),g=.28+.46*limit(p.intensity,0,1);
   const rate=.94+(n%3)*.06;
   if(p.stage==="strain"){
     if(voices.size>=20)return;
     one(select(a.strain??a.hit,n),p,g*.40,{playbackRate:rate});
     elementLayers(p,n,g,"strain");
   }else if(p.stage==="debris"){
     if(voices.size>=28)return;
     one(select(a.detail??a.fall,n),p,g*.32,{playbackRate:1.08});
     elementLayers(p,n,g,"debris");
   }else if(p.stage==="break"){
     one(select(a.hit,n),p,g,{playbackRate:rate});
     one(select(a.fall,n+1),p,g*.81,{playbackRate:rate});
     if(a.detail)one(select(a.detail,n+2),p,g*.48,{playbackRate:1.03});
     // Each material has a distinct recorded secondary texture.
     if(p.element==="building-floor"||p.element==="building-wall"||p.element==="building-parapet")
       one(select(dust,n),p,g*.65);
     if((p.style==="industrial"||p.style==="underground")&&p.material!=="metal")one(select(assets.metal.fall,n),p,g*.36);
     if((p.style==="timber"||p.style==="multi-level")&&p.material!=="wood"&&p.material!=="glass")one(select(assets.wood.fall,n),p,g*.36);
     if(p.style==="interior"&&p.material==="stone"&&p.element!=="building-floor")one(select(assets.tile.fall,n),p,g*.32);
     if(p.element==="building-stair")one(select(assets.metal.fall,n),p,g*.52);
     if(p.element==="building-door"&&p.material==="wood")one(select(assets.wood.hit,n+1),p,g*.55);
     if(p.element==="building-window"||p.material==="glass")one(select(assets.glass.fall,n+2),p,g*.72);
     elementLayers(p,n,g,"break");

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
     if(!g){g={handles:[],p,nextPop:performance.now()+1800,keys:[choose(fireLow,hash(p.id)),choose(fireCrackle,hash(p.id+"crackle"))]};fires.set(p.id,g);}
     g.p=p;
     if(performance.now()>=g.nextPop){
       g.nextPop=performance.now()+3000+Math.random()*3000;
       if(voices.size<20)one(select(firePops,hash(p.id)+Math.floor(performance.now()/1000)),p,.48*limit(p.intensity,.2,1),{radius:45});
     }
     // Reattempt missing / out-of-range tracks on subsequent snapshots.
     for(const [i,k] of g.keys.entries()){
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
   const buffers=await Promise.all(crateKeys.map(load));
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
 ctx.services.provide("destruction-audio",{warm,warmAll,crateLoop,crateReady:()=>crateKeys.every(k=>cache.has(k)),crateStart:(p,options)=>play("crate-start",p,options.gain,options),crateStop:(p,options)=>play("crate-stop",p,options.gain,options)});
}
