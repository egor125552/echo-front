import assert from 'node:assert/strict';
import {setup} from '../public/client/plugins/tutorial-guide.js';
const oldDocument=globalThis.document;
globalThis.document={querySelector:()=>null};
const handlers=new Map(),spoken=[];
const playerId='tutorial-revival-player';
const speech={get rate(){return 1.7},get requestGeneration(){return spoken.length},say(message){spoken.push(message)}};
try {
 await setup({services:{get(name){return name==='network'?{playerId,send(){}}:speech}},events:{on(name,fn){handlers.set(name,fn)},emit(){}}});
 handlers.get('network:welcome')({tutorial:true});
 handlers.get('game:snapshot')({tutorial:{enabled:true,mode:'battle-royale',phase:'use-stimulant'}});
 const before=spoken.length;
 handlers.get('game:event')({event:'injury:stim-cancelled',payload:{entityId:'another-player',reason:'no-room-to-stand'}});
 assert.equal(spoken.length,before,'other player failure must not interrupt tutorial');
 handlers.get('game:event')({event:'injury:stim-cancelled',payload:{entityId:playerId,reason:'no-room-to-stand'}});
 assert.equal(spoken.length,before+1);
 assert.match(spoken.at(-1),/Отползи на свободное место/);
 assert.match(spoken.at(-1),/Стимулятор сохранён/);
 handlers.get('game:event')({event:'injury:stim-cancelled',payload:{entityId:playerId,reason:'action'}});
 assert.match(spoken.at(-1),/Остановись и попробуй снова/);
 console.log('TUTORIAL_REVIVAL_ANNOUNCEMENT_OK');
}finally{globalThis.document=oldDocument}
