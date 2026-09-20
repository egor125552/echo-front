import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  setup, lowHealthIntensity, softenedMuffleCutoffForIntensity,
  downedRecoveryAudioState, MAX_REVERB_MIX, MAX_STUN_INTENSITY, MUFFLE_MAX_HZ,
} from '../public/client/plugins/low-health-audio.js';

test('maximal injury is 20% softer and preserves audible surroundings', async () => {
  const handlers=new Map(),mixes=[],cutoffs=[];
  const audio={
    setReverbMix(value){mixes.push(value)},
    setMuffleCutoff(value){cutoffs.push(value)},
    stopChannel(){},resume:async()=>{},
    playCentered:async()=>({stop(){},setGain(){}}),
  };
  await setup({
    services:{get(name){return name==='audio'?audio:{playerId:'human'}},provide(){}},
    events:{on(name,handler){handlers.set(name,handler)}},
  });
  const snapshot=health=>({now:1000,entities:[{id:'human',alive:true,health,healthMax:200}]});
  handlers.get('game:snapshot')(snapshot(200));
  assert.equal(mixes.at(-1),0);
  assert.equal(cutoffs.at(-1),MUFFLE_MAX_HZ);
  handlers.get('game:snapshot')(snapshot(20));
  assert.equal(lowHealthIntensity(20,200),1);
  assert(Math.abs(mixes.at(-1)-MAX_REVERB_MIX*MAX_STUN_INTENSITY)<1e-9);
  assert(cutoffs.at(-1)>3500, 'Maximum injury must leave some world sounds audible');
  assert(Math.abs(cutoffs.at(-1)-softenedMuffleCutoffForIntensity(1))<1e-9);
  const downed=downedRecoveryAudioState({
    downed:true, normalHealthMax:200,
    stimulantUse:{downed:true,startedAt:0,completesAt:6000},
  },0);
  assert.equal(downed.intensity,MAX_STUN_INTENSITY);
  assert(downed.cutoff>3500);
});
