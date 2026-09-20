import assert from 'node:assert/strict';
import {setup} from '../public/client/plugins/tutorial-guide.js';

const previousDocument=globalThis.document;
globalThis.document={querySelector:()=>null};
const handlers=new Map(),sent=[];
let generation=0;
const network={playerId:'tutorial-test-player',send:(type,payload)=>sent.push({type,payload})};
const speech={get requestGeneration(){return generation},get rate(){return 1.7},say(){generation++}};
try{
 await setup({services:{get(name){return name==='network'?network:speech}},events:{on(name,callback){handlers.set(name,callback)},emit(){}}});
 handlers.get('network:welcome')({tutorial:true});
 handlers.get('game:snapshot')({tutorial:{enabled:true,mode:'battle-royale',phase:'automatic-parachute'}});
 const instructionGeneration=generation;
 assert(instructionGeneration>0);
 // A different announcement ends while the tutorial instruction is pending.
 handlers.get('speech:state')({reason:'ended',requestGeneration:instructionGeneration+1});
 assert.equal(sent.length,0,'unrelated speech must not relaunch the tutorial parachute');
 handlers.get('speech:state')({reason:'ended',requestGeneration:instructionGeneration});
 assert.equal(sent.length,1,'actual tutorial instruction completion must advance once');
 assert.deepEqual(sent[0],{type:'tutorial:speech-complete',payload:{phase:'automatic-parachute'}});
 handlers.get('speech:state')({reason:'ended',requestGeneration:instructionGeneration});
 assert.equal(sent.length,1,'duplicate end event must not advance twice');
 console.log('TUTORIAL_SPEECH_CALLBACK_OK');
}finally{globalThis.document=previousDocument}
