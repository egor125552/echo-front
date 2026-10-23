import assert from "node:assert/strict";
import { diffSnapshotValue, applySnapshotPatch, encodeSnapshotMessage, decodeSnapshotMessage } from "../public/client/snapshot-delta.js";

const jsonClone = value => JSON.parse(JSON.stringify(value));
const test = (before, after) => {
  const from = jsonClone(before);
  const to = jsonClone(after);
  const patch = diffSnapshotValue(from, to);
  const restored = applySnapshotPatch(from, jsonClone(patch));
  assert.deepStrictEqual(jsonClone(restored), to);
  assert.deepStrictEqual(from, jsonClone(before), "Applying a patch must not mutate the last snapshot");
  const encoded = encodeSnapshotMessage(to, from, 4);
  if (encoded.full) {
    const decoded = decodeSnapshotMessage(JSON.parse(encoded.message), from, 4);
    assert.deepStrictEqual(decoded.snapshot, to);
  } else {
    const decoded = decodeSnapshotMessage(JSON.parse(encoded.message), from, 4);
    assert.deepStrictEqual(decoded.snapshot, to);
    assert.equal(decoded.sequence, 5);
    assert.throws(() => decodeSnapshotMessage(JSON.parse(encoded.message), from, 3), /sequence/);
  }
  return encoded;
};
const first = {
  now: 1, mode:"battle-royale", map:{crates:[{id:"a",x:1,z:2,opened:false},{id:"b",x:5,z:6,opened:false}]},
  entities:[{id:"p",x:1,y:0,z:2,health:200,weapons:["pistol","rifle"],weapon:"pistol",name:"Игрок"},{id:"bot",x:3,z:4,alive:true}],
  vehicles:[{id:"v1",x:100,speed:0,kind:"offroad",driverId:null,nitro:{value:1,max:5}},{id:"v2",x:300,speed:0,kind:"sport"}],
  match:{phase:"active",remaining:96}, social:{rules:{friendRamProtection:true}}, extra: [1,2,3],
};
const next=jsonClone(first);next.now=2;next.entities[0].x=1.23456789012345;next.entities[0].health=183;next.vehicles[0].driverId="p";next.map.crates[0].opened=true;
const e=test(first,next);
assert.equal(e.full,false);
assert(e.message.length < JSON.stringify({type:"snapshot",snapshot:next}).length);
test(first,first);
const removed=jsonClone(next);removed.entities.splice(1,1);removed.vehicles.splice(0,1);removed.entities.push({id:"bot3",x:8,z:9});delete removed.social;removed.match.phase="ended";
test(next,removed);
const reordered=jsonClone(removed);reordered.entities.reverse();reordered.vehicles.push({id:"v3",x:0,speed:0});reordered.entities[0].weapons=[];
test(removed,reordered);
const nested=jsonClone(reordered);nested.map.crates.reverse();nested.extra=[2,3,1];nested.vehicles[1].driverId=undefined;
test(reordered,nested);
const transitions=[first,next,removed,reordered,nested,first];
let baseline=null, seq=0,bytes=0, fullBytes=0;
for(const snap of transitions){
 const message=encodeSnapshotMessage(snap,baseline,seq);
 const decoded=decodeSnapshotMessage(JSON.parse(message.message),baseline,seq);
 assert.deepStrictEqual(decoded.snapshot,jsonClone(snap));
 baseline=decoded.snapshot;seq=decoded.sequence;
 bytes+=message.message.length;fullBytes+=JSON.stringify({type:"snapshot",snapshot:snap}).length;
}
console.log(JSON.stringify({ok:true,transitions:transitions.length,bytes,fullBytes,savedPercent:Math.round((1-bytes/fullBytes)*100)}));
