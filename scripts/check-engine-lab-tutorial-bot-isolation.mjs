import assert from 'node:assert/strict';
import {createEchoFrontGame} from '../src/server/game.js';
import {EngineLab} from '../src/server/engine-lab.js';
const game=await createEchoFrontGame({mode:'battle-royale'});
const lab=new EngineLab(game,{mode:'battle-royale',room:'normal-bot-damage',watch:['normal-human']});
try {
 const prepared=await lab.prepare([{command:'service.call',args:{service:'match-api',method:'connectHuman',arguments:['normal-human']}}]);
 assert(prepared.results.every(row=>row.ok));
 const bot=game.host.services.get('entities').all().find(entity=>entity.bot&&entity.alive);
 assert(bot);
 const hp=game.host.components.get(bot.id,'Health');
 assert(hp);
 const result=game.host.services.get('health').applyDamage(bot.id,hp.current+1000,{attackerId:'normal-human',weaponId:'rifle',now:Date.now()});
 assert.equal(result.killed,true,'ordinary battle royale bots must remain vulnerable');
 assert.equal(bot.alive,false);
 console.log('NORMAL_BATTLE_ROYALE_BOT_DAMAGE_OK');
}finally{await game.host.stop()}
