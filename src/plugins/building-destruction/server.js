import { legacyBuildingTopology } from "../battle-royale-building-navigation/server.js";
// Game-only destruction state. Uses existing virtual colliders and arbitrary
// game hit points, not engineering data or real-world building layouts.
export const manifest = {
  id: "building-destruction",
  version: "1.0.0",
  requires: ["rapier-physics", "rapier-toggleable-colliders", "match-api",
    "battle-royale-building-factory", "battle-royale-special-ops", "battle-royale-building-navigation", "combat"],
  capabilities: ["services.consume", "services.provide", "events.on", "events.emit", "components.read"],
};
const KINDS = new Set(["building-wall", "building-door", "building-floor", "building-stair", "building-parapet", "building-window"]);
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const number = (n, fallback = 0) => Number.isFinite(Number(n)) ? Number(n) : fallback;
const distance = (a,b) => Math.hypot(a.x-b.x, a.y-b.y, a.z-b.z);
const material = (s) => /glass/i.test(s) ? "glass" : /metal|steel|iron/i.test(s) ? "metal" :
  /wood|timber/i.test(s) ? "wood" : /tile|ceramic/i.test(s) ? "tile" : "stone";
const hash = (s) => { let h=2166136261; for (const c of String(s)) h=Math.imul(h^c.charCodeAt(0),16777619); return h>>>0; };

export async function setup(ctx) {
  const physics=ctx.services.get("physics"), map=ctx.services.get("map"), api=ctx.services.get("match-api");
  const nav=ctx.services.get("building-navigation"), entities=ctx.services.get("entities"), combat=ctx.services.get("combat");
  const parts=new Map(), debris=new Map(), fires=new Map(), changed=new Map(), enclosureCounts=new Map();
  const savedTopology=new Map((map.navigationBuildings??[]).map(x=>[x.id,x]));
  const legacy=legacyBuildingTopology(map);if(legacy&&!savedTopology.has(legacy.id))savedTopology.set(legacy.id,legacy);
  const originalWallList=[...(map.walls??[])];
  let serial=0, revision=0, contactCursor=physics.contactForceCursor?.()??0, lastHeatAt=0, clock=0, ended=false;

  function register(collider, spec, row=null, door=null) {
    if (!collider || !KINDS.has(spec.kind) || parts.has(collider.handle)) return;
    const group=String(spec.buildingId ?? door?.buildingId ?? (number(spec.y)<-2 ? "underground" : map.building?.id ?? "building"));
    const type=String(spec.kind);
    const pos={x:number(spec.x),y:number(spec.y)+(type==="building-floor"?0:number(spec.height??spec.rise,2)/2),z:number(spec.z)};
    const m=material(spec.material??spec.surface??(type==="building-door"?"wood":"concrete"));
    const id="part-"+(++serial);
    const underground=number(spec.y)<-2;
    // Preserve underground containment and ground support. No holes into the void.
    const protectedSupport=(underground && !/перегород|partition/i.test(spec.accessibleName??"")) || (type==="building-floor" && number(spec.y)<=.1);
    const maxHp=m==="glass"?.35:m==="wood"?.75:1;
    const style=underground?"underground":group==="warehouse"?"industrial":group==="two-storey-house"?"multi-level":group==="forest-hut"?"timber":"interior";
    const p={id,group,type,m,pos,collider,row,door,protectedSupport,maxHp,style,hp:maxHp,state:"intact",due:0,
      seed:hash(id+group+m),doorWasOpen:Boolean(door?.open),stairId:spec.stairId??row?.stairId};
    parts.set(collider.handle,p);
    if(["building-wall","building-window","building-door"].includes(p.type)){
      const count=enclosureCounts.get(group)??{total:0,broken:0};count.total++;enclosureCounts.set(group,count);
    }
  }
  for (const w of originalWallList) register(w.collider,w,w);
  for (const d of map.doors??[]) register(d.collider,{...physics.colliderInfo(d.collider)?.worldObject,...d,kind:"building-door"},null,d);
  // Include independent game rooms created by other plugins without duplicating existing parts.
  physics.world.forEachCollider?.(c=>{const s=physics.colliderInfo(c)?.worldObject;if(s&&KINDS.has(s.kind))register(c,s);});
  function event(p,stage,intensity,at=p.pos) {
    ctx.events.emit("building:material", {id:p.id,buildingId:p.group,material:p.m,style:p.style,element:p.type,stage,
      variant:(p.seed+revision)%3, intensity:clamp(intensity,.15,1),...at,radius:150,now:clock||Date.now()});
  }
  function mark(p,state) {
    if(state==="broken"&&p.state!=="broken"&&["building-wall","building-window","building-door"].includes(p.type)){const c=enclosureCounts.get(p.group);if(c)c.broken++;}
    p.state=state; revision++;
    changed.set(p.id,{id:p.id,buildingId:p.group,material:p.m,element:p.type,state,...p.pos});
  }
  function ignite(p,now,major) {
    // Fictional fire zones: bounded duration, not combustion/structural simulation.
    if(ended || p.type==="building-window")return;
    const key=p.group+":"+Math.round(p.pos.x/6)+":"+Math.round(p.pos.y/3)+":"+Math.round(p.pos.z/6);
    const existing=fires.get(key);
    if(existing){existing.until=Math.max(existing.until,now+45000);return;}
    if(fires.size>=30)return;
    fires.set(key,{id:key,...p.pos,y:p.pos.y-.5,buildingId:p.group,intensity:major?.85:.55,until:now+60000});
  }
  function damage(payload, major=false) {
    if(ended||![payload?.x,payload?.y,payload?.z].every(Number.isFinite))return;
    const now=number(payload.now,clock||Date.now());
    const radius=clamp(number(payload.blastRadius,8),2,80);
    for(const p of parts.values()) {
      if(p.state==="broken"||p.state==="queued")continue;
      const d=distance(p.pos,payload); if(d>radius)continue;
      const gameHit=(major?1.45:.68)*(1-d/(radius*1.1));
      p.hp-=gameHit;
      if(p.state==="intact") {mark(p,"damaged");if(p.m!=="glass")event(p,"strain",gameHit);}
      if((major||p.m==="wood")&&gameHit>.27)ignite(p,now,major);
      if(p.hp<=0&&!p.protectedSupport){
        mark(p,"queued");p.due=now+100+(p.seed%850);
      }
    }
  }
  ctx.events.on("cannon:impact",p=>damage(p,false));
  ctx.events.on("mine:detonated",p=>damage(p,false));
  ctx.events.on("nuke:detonated",p=>damage(p,true));

  function rebuildNav(group) {
    const topology=savedTopology.get(group);
    if(!topology)return;
    const stairs=[...parts.values()].filter(p=>p.group===group&&p.state==="broken"&&p.type==="building-stair");
    const destroyedStairs=new Set(stairs.filter(p=>p.stairId).map(p=>String(p.stairId)));
    const transitions=topology.transitions.filter(t=>!(t.kind==="stair"&&(stairs.some(p=>!p.stairId)||destroyedStairs.has(String(t.id).replace(/:(bottom|top)$/,"")))));
    nav.registerBuilding({...topology,transitions});
  }
  function breakPart(p,now) {
    if(p.state!=="queued"||p.protectedSupport)return;
    if(!physics.setWallEnabled(p.collider,false))return;
    mark(p,"broken");
    if(p.row)p.row.destroyed=true;
    if(p.door){p.door.destroyed=true;p.door.open=true;}
    event(p,"break",.95);if(p.m==="wood")ignite(p,now,false);
    if(p.type==="building-stair")rebuildNav(p.group);
    // Small, bounded game rubble pieces. No real structure calculations.
    if(debris.size<44) {
      const id="building-rubble:"+p.id;
      const h=p.m==="glass"?.07:.19+(p.seed%9)*.023;
      const body=physics.createDynamicCuboid(id,{...p.pos,hx:h,hy:h*.65,hz:h*.9,mass:7,friction:.8,
        restitution:.08,linearDamping:.3,angularDamping:.55,metadata:{kind:"building-rubble",material:p.m,contactForceThreshold:20}});
      if(body)debris.set(id,{id,p,until:now+12000,last:now,settled:false});
    }
  }
  function reset() {
    physics.beginBatch?.();
    try {
      for(const p of parts.values()) {
        if(p.state==="broken")physics.setWallEnabled(p.collider,p.door?!p.doorWasOpen:true);
        if(p.row)delete p.row.destroyed;
        if(p.door&&p.door.destroyed){delete p.door.destroyed;p.door.open=p.doorWasOpen;}
        p.hp=p.maxHp;p.state="intact";p.due=0;
      }
      for(const id of debris.keys())physics.removeDynamicBody(id);
    }finally{physics.endBatch?.();}
    for(const t of savedTopology.values())nav.registerBuilding(t);
    debris.clear();fires.clear();changed.clear();for(const c of enclosureCounts.values())c.broken=0;revision++;lastHeatAt=0;ended=false;
  }
  ctx.events.on("battle-royale:started",reset);
  ctx.events.on("battle-royale:ended",()=>{fires.clear();ended=true;});
  const originalStep=api.step.bind(api);
  api.step=(dt,now=Date.now())=>{
    clock=now;
    // Apply a limited number of state transitions per game tick.
    const due=ended?[]:[...parts.values()].filter(p=>p.state==="queued"&&p.due<=now).slice(0,5);
    if(due.length){physics.beginBatch?.();try{for(const p of due)breakPart(p,now);}finally{physics.endBatch?.();}}
    const result=originalStep(dt,now);
    const contacts=physics.contactForces?.(128)??[];
    for(const c of contacts) {
      if(c.sequence<=contactCursor)continue;
      for(const obj of [c.collider1?.worldObject,c.collider2?.worldObject]){
        const b=debris.get(obj?.bodyId);
        if(!b||now-b.last<250||number(c.maxForceMagnitude)<25)continue;
        const state=physics.dynamicBodyState(b.id);
        if(state){event(b.p,"debris",clamp(number(c.maxForceMagnitude)/1200,.15,.65),state);b.last=now;}
      }
    }
    contactCursor=physics.contactForceCursor?.()??contactCursor;
    for(const [id,b] of debris){
      const s=physics.dynamicBodyState(id);
      if(!s||now>=b.until){physics.removeDynamicBody(id);debris.delete(id);}
    }
    for(const [id,f] of fires)if(now>=f.until)fires.delete(id);
    if(now-lastHeatAt>=1500&&fires.size){
      lastHeatAt=now;
      for(const ent of entities.all()){
        if(!ent.alive)continue;
        const t=ctx.components.get(ent.id,"Transform");if(!t)continue;
        if([...fires.values()].some(f=>distance(f,t)<2.4))combat.damage(ent.id,3,{weaponId:"environment-fire",now});
      }
    }
    return result;
  };
  const baseProfile=map.acousticProfileAt?.bind(map);
  const factory=ctx.services.get("building-factory");
  const originalCreate=factory.createBuilding.bind(factory);
  factory.createBuilding=spec=>{
    const result=originalCreate(spec);
    if(result?.navigation)savedTopology.set(result.id,result.navigation);
    for(const w of map.walls??[])register(w.collider,w,w);
    for(const d of map.doors??[])register(d.collider,{...physics.colliderInfo(d.collider)?.worldObject,...d,kind:"building-door"},null,d);
    return result;
  };
  if(baseProfile)map.acousticProfileAt=position=>{
    const profile=baseProfile(position);
    const entry=factory.buildingAt(position);
    const id=entry?.id??(String(profile?.zone??"").startsWith("warehouse")?"warehouse":null);
    if(!id||!profile)return profile;
    const enclosure=enclosureCounts.get(id);
    if(!enclosure?.total)return profile;
    const fraction=enclosure.broken/enclosure.total;
    return {...profile,reverbMix:(Number(profile.reverbMix)||0)*(1-fraction*.92)};
  };
  const baseHeight=map.heightAt?.bind(map);
  if(baseHeight)map.heightAt=position=>{
    const base=baseHeight(position);
    if(![...parts.values()].some(p=>p.state==="broken"&&(p.type==="building-floor"||p.type==="building-stair")))return base;
    const y=Math.max(number(position?.y),number(base))+.12;
    const support=physics.raycastSupportWorld({x:number(position?.x),y,z:number(position?.z)},{x:0,y:-1,z:0},50);
    return support?y-support.distance:base;
  };
  const originalSnapshot=api.snapshotFor.bind(api);
  api.snapshotFor=(id,now=Date.now())=>{
    const s=originalSnapshot(id,now);
    const listener=ctx.components.get(s.spectator?.active?s.spectator.targetId:id,"Transform");
    const local=[...fires.values()].filter(f=>listener&&distance(f,listener)<85).sort((a,b)=>distance(a,listener)-distance(b,listener)).slice(0,5);
    s.destruction={revision,parts:[...changed.values()],fires:local.map(f=>({...f,occlusion:clamp(number(map.acousticOcclusionBetween?.(listener,f)),0,1)}))};
    return s;
  };
  const originalEvents=api.eventsForPlayer.bind(api);
  api.eventsForPlayer=(id,packets=[])=>{
    const base=originalEvents(id,packets), seen=new Set(base),listener=ctx.components.get(id,"Transform");
    return [...base,...packets.filter(p=>!seen.has(p)&&p.event==="building:material"&&listener&&distance(listener,p.payload)<p.payload.radius)
      .map(p=>({...p,payload:{...p.payload,occlusion:clamp(number(map.acousticOcclusionBetween?.(listener,p.payload)),0,1)}}))];
  };
  // Expose existing in-game state, not a remotely callable damage command.
  ctx.services.provide("building-destruction",{summary:()=>({parts:parts.size,changed:changed.size,broken:[...parts.values()].filter(p=>p.state==="broken").length,fires:fires.size,debris:debris.size})});
}
