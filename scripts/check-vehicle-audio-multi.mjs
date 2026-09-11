import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setup } from '../client/plugins/battle-royale-vehicle-audio.js';

function makeHarness() {
  const handlers = new Map();
  const plays = [];
  const stoppedChannels = [];
  const audio = {
    context: {
      sampleRate: 100,
      currentTime: 1,
      createBuffer(channels, length) {
        return { numberOfChannels: channels, duration: length / 100, getChannelData: () => new Float32Array(length) };
      },
    },
    load: async url => ({ duration: url.includes('truck') ? 2 : 1.2 }),
    resume: async () => {},
    setCabinMuffleCutoff() {},
    stopChannel(channel) { stoppedChannels.push(channel); },
    playSpatialBuffer(buffer, vehicle, options) {
      const record = {
        id: vehicle.id,
        channel: options.channel,
        updates: 0,
        occlusionUpdates: 0,
        faded: false,
        stopped: false,
      };
      plays.push(record);
      return {
        source: { loopStart: 0, loopEnd: 0, playbackRate: { setTargetAtTime() {} } },
        update() { record.updates += 1; },
        updateOcclusion() { record.occlusionUpdates += 1; },
        fadeOut() { record.faded = true; },
        stop() { record.stopped = true; },
      };
    },
  };
  const ctx = {
    services: { get(name) { return name === 'audio' ? audio : { playerId: 'human' }; } },
    events: { on(name, fn) { handlers.set(name, fn); } },
  };
  return { ctx, handlers, plays, stoppedChannels };
}

function snapshot(vehicles) {
  return {
    mode: 'battle-royale',
    entities: [{ id: 'human', x: 0, y: 0, z: 0, angle: 0 }],
    vehicles,
  };
}

test('nearby vehicles keep independent looping engines and fade independently', async () => {
  const h = makeHarness();
  await setup(h.ctx);
  const emit = h.handlers.get('game:snapshot');
  const a = { id: 'car-a', kind: 'truck', x: 10, z: 0, speedKph: 30, input: {}, groundedWheels: 4, occlusion: 0 };
  const b = { id: 'car-b', kind: 'supercar', x: -14, z: 4, speedKph: 60, input: {}, groundedWheels: 4, occlusion: 0.2 };

  emit(snapshot([a, b]));
  const engines = h.plays.filter(p => p.channel?.startsWith('br-vehicle-engine:'));
  assert.equal(engines.length, 2);
  assert.notEqual(engines[0].channel, engines[1].channel);

  emit(snapshot([{ ...a, occlusion: 0.7 }, b]));
  assert.equal(h.plays.filter(p => p.channel?.startsWith('br-vehicle-engine:')).length, 2, 'occlusion changes must not restart an engine');
  assert(engines.find(p => p.id === 'car-a').occlusionUpdates >= 2);

  emit(snapshot([b]));
  assert.equal(engines.find(p => p.id === 'car-a').faded, true, 'departing car must fade out');
  assert.equal(engines.find(p => p.id === 'car-b').faded, false, 'remaining car must keep playing');
});
