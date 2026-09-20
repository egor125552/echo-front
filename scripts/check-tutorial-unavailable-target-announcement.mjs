import assert from 'node:assert/strict';
import {setup} from '../public/client/plugins/tutorial-guide.js';
const previousDocument=globalThis.document;
globalThis.document={querySelector:()=>null};
const handlers=new Map(),spoken=[];
const playerId='lost-crate-player';
const speech={get rate(){return 1.7},get requestGeneration(){return spoken.length},say(message){spoken.push(message)}};
try {
 await setup({services:{get(name){return name==='network'?{playerId,send(){}}:speech}},events:{on(name,fn){handlers.set(name,fn)},emit(){}}});
 handlers.get('network:welcome')({tutorial:true});
 for(const phase of ['select-navigation','select-crate','select-second-crate']) {
   handlers.get('game:snapshot')({tutorial:{enabled:true,mode:'battle-royale',phase:'follow-crate'}});
   const before=spoken.length;
   handlers.get('game:snapshot')({tutorial:{enabled:true,mode:'battle-royale',phase,routeLost:true,neededLoot:'rifle'}});
   assert.equal(spoken.length,before+1);
   assert.match(spoken.at(-1),/Предыдущая цель больше недоступна/);
   assert.match(spoken.at(-1),/Выбери другую/);
 }
 handlers.get('game:snapshot')({tutorial:{enabled:true,mode:'battle-royale',phase:'follow-crate'}});
 handlers.get('game:snapshot')({tutorial:{enabled:true,mode:'battle-royale',phase:'select-crate',routeCancelled:true}});
 assert.match(spoken.at(-1),/Маршрут отключён/);
 assert.doesNotMatch(spoken.at(-1),/цель больше недоступна/);
 console.log('TUTORIAL_UNAVAILABLE_TARGET_ANNOUNCEMENT_OK');
}finally{globalThis.document=previousDocument}
