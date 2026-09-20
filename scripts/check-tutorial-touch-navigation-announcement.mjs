import assert from 'node:assert/strict';
import {setup} from '../public/client/plugins/tutorial-guide.js';

const previousDocument=globalThis.document;
globalThis.document={querySelector:()=>null};
const handlers=new Map(),spoken=[];
const playerId='navigation-announcement-player';
const speech={get rate(){return 1.7},get requestGeneration(){return spoken.length},say(message){spoken.push(message)}};
try {
 await setup({services:{get(name){return name==='network'?{playerId,send(){}}:speech}},events:{on(name,fn){handlers.set(name,fn)},emit(){}}});
 handlers.get('network:welcome')({tutorial:true});
 for(const phase of ['select-navigation','select-crate','select-second-crate']) {
  handlers.get('game:snapshot')({tutorial:{enabled:true,mode:'battle-royale',phase}});
  const before=spoken.length;
  handlers.get('game:event')({event:'navigation:selected',payload:{entityId:'other-player',targetName:'Склад',distanceMeters:15}});
  assert.equal(spoken.length,before,'other player navigation must not interrupt tutorial');
  handlers.get('game:event')({event:'navigation:selected',payload:{entityId:playerId,targetName:'Склад',distanceMeters:15}});
  assert.equal(spoken.length,before+1);
  assert.match(spoken.at(-1),/сенсорном экране нажми Маршрут/);
  assert.match(spoken.at(-1),/клавиатуре нажми Enter/);
 }
 console.log('TUTORIAL_TOUCH_NAVIGATION_ANNOUNCEMENT_OK');
}finally{globalThis.document=previousDocument}
