import fs from "node:fs";
import { performance } from "node:perf_hooks";
import {randomUUID} from "node:crypto";
// Usage: node scripts/cloud-pileup-engine-lab.mjs <worker-url> <token-file-or-private-wrangler-json> [rounds]
const root=process.argv[2];
const credentialPath=process.argv[3];
if(!root||!credentialPath)throw Error("Usage: node scripts/cloud-pileup-engine-lab.mjs <worker-url> <token-file-or-private-wrangler-json> [rounds]");
const secretText=fs.readFileSync(credentialPath,"utf8").trim();
const token=credentialPath.endsWith(".json")?JSON.parse(secretText).vars.ENGINE_LAB_TOKEN:secretText;
if(typeof token!=="string"||token.length<32)throw Error("Missing private Engine Lab token");
const steps=10, rounds=Math.max(2,Math.min(40,Number(process.argv[4])||20));
const cases=[
 {variant:"optimized",oldTraffic:false,room:"pileup-fast-"+randomUUID().slice(0,12),times:[],errors:[]},
 {variant:"baseline",oldTraffic:true,room:"pileup-old-"+randomUUID().slice(0,12),times:[],errors:[]},
];
const n=v=>Number(v.toFixed(2));
const pick=(a,p)=>{if(!a.length)return null;const x=[...a].sort((l,r)=>l-r);return n(x[Math.min(x.length-1,Math.floor(x.length*p))])};
async function call(test,action,other={}) {
 const url=new URL("/api/engine-lab",root);
 url.searchParams.set("mode","battle-royale");
 url.searchParams.set("room",test.room);
 url.searchParams.set("probe_action",action);
 if(action==="scenario.advance")url.searchParams.set("probe_round",String(test.times.length));
 const began=performance.now();
 let response,body;
 try{
  response=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json","X-Engine-Lab-Token":token},
   body:JSON.stringify({action,...other}),signal:AbortSignal.timeout(90000)});
  const raw=await response.text();
  try{body=JSON.parse(raw)}catch{throw new Error("non-json status "+response.status+" "+raw.slice(0,320))}
 }catch(e){throw new Error(action+" "+test.variant+" request failed "+e.message,{cause:e})}
 const duration=performance.now()-began;
 if(!response.ok||!body.ok){throw new Error(action+" "+test.variant+" HTTP "+response.status+" "+JSON.stringify(body).slice(0,520))}
 return {duration,result:body.result??body};
}
for(const test of cases) {
 try {
 const create=await call(test,"scenario.create",{watch:["cloud-pileup-human"]});
 const setup=await call(test,"scenario.pileup",{oldTraffic:test.oldTraffic});
 test.initial=setup.result;
 const start=await call(test,"scenario.start");
 console.log("CLOUD_ENGINE_LAB_SETUP",JSON.stringify({variant:test.variant,ms:n(create.duration+setup.duration+start.duration),bots:setup.result.setup.bots,humans:1,cars:setup.result.foundVehicles,drivers:setup.result.setup.driversAtStart,fleet:setup.result.setup.fleetSize}));
 }catch(e){console.log("CLOUD_LAB_SETUP_FAILED",String(e));process.exit(1)}
}
for(let i=0;i<rounds;i++){
 const order=i%2===0?cases:[...cases].reverse();
 for(const test of order){
  try{
   const r=await call(test,"scenario.advance",{steps,sampleEvery:10});
   test.times.push(r.duration);
   test.lastAdvance=r.result;
  }catch(e){test.errors.push(String(e));console.log("CLOUD_ADVANCE_FAILED",JSON.stringify({variant:test.variant,round:i,error:String(e)}));}
 }
 if(i%5===4||i===0)console.log("CLOUD_LAB_PROGRESS",JSON.stringify(cases.map(t=>({variant:t.variant,round:i+1,advances:t.times.length,meanMs:n(t.times.reduce((x,y)=>x+y,0)/Math.max(1,t.times.length)),errors:t.errors.slice(-1)}))));
 if(cases.some(t=>t.errors.length))break;
}
for(const test of cases){
 let summary=null,report=null;
 try{summary=(await call(test,"scenario.pileup-summary")).result}catch(e){test.errors.push(String(e))}
 try{report=(await call(test,"scenario.report")).result}catch(e){test.errors.push(String(e))}
 const warm=test.times.slice(2);
 console.log("CLOUD_ENGINE_LAB_RESULT",JSON.stringify({
  variant:test.variant,room:test.room,initial:test.initial,
  roundsDone:test.times.length,stepsDone:test.lastAdvance?.steps??0,
  simulatedMs:test.lastAdvance?.simulatedMs??0,
  meanRoundTripMs:warm.length?n(warm.reduce((a,b)=>a+b,0)/warm.length):null,
  medianRoundTripMs:pick(warm,.5),p95RoundTripMs:pick(warm,.95),
  minRoundTripMs:warm.length?n(Math.min(...warm)):null,maxRoundTripMs:warm.length?n(Math.max(...warm)):null,
  perStepWallMs:warm.length?n(warm.reduce((a,b)=>a+b,0)/warm.length/steps):null,
  sampleCounts:warm.length,measurements:test.times.map(n),
  summary,anomalies:report?.anomalies?.length,errors:test.errors
 }));
}
