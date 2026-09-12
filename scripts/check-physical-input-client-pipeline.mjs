import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventBus } from '../client/core/event-bus.js';
import * as keyboardInput from '../client/plugins/input.js';
import * as parachuteInput from '../client/plugins/parachute-input.js';
import * as parkourInput from '../client/plugins/parkour-input.js';
import * as crateInteraction from '../client/plugins/battle-royale-crate-interaction.js';

function createBrowserStub() {
  const listeners = new Map();
  const windowStub = {
    addEventListener(type, handler) {
      const list = listeners.get(type) ?? [];
      list.push(handler);
      listeners.set(type, list);
    },
    dispatch(type, event) {
      for (const handler of listeners.get(type) ?? []) handler(event);
    },
  };
  const documentStub = {
    hidden: false,
    body: { appendChild() {} },
    querySelectorAll() { return []; },
    querySelector() { return null; },
    getElementById() { return null; },
    createElement() {
      return {
        id: '', className: '', textContent: '',
        setAttribute() {},
      };
    },
    addEventListener() {},
  };
  return { windowStub, documentStub };
}

function makeServices() {
  const map = new Map();
  return {
    map,
    api: {
      provide(name, value) {
        assert.equal(map.has(name), false, `duplicate service ${name}`);
        map.set(name, value);
      },
      get(name) {
        assert.equal(map.has(name), true, `missing service ${name}`);
        return map.get(name);
      },
      has(name) { return map.has(name); },
    },
  };
}

function keyEvent(code) {
  return {
    code,
    repeat: false,
    preventDefault() {},
  };
}

test('physical keyboard actions survive the real wrapped client pipeline', async () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousRaf = globalThis.requestAnimationFrame;
  const previousSetInterval = globalThis.setInterval;
  const { windowStub, documentStub } = createBrowserStub();
  globalThis.window = windowStub;
  globalThis.document = documentStub;
  globalThis.requestAnimationFrame = (callback) => callback();
  globalThis.setInterval = () => 0;

  try {
    const events = new EventBus();
    const services = makeServices();
    const ctx = { events, services: services.api };

    await keyboardInput.setup(ctx);
    services.map.set('network', { connected: true, playerId: 'player' });
    services.map.set('speech', { enabled: false, say() {} });
    services.map.set('audio', {
      async playSpatial() { return null; },
      stopChannel() {},
      async resume() {},
    });
    await parachuteInput.setup(ctx);
    await parkourInput.setup(ctx);
    await crateInteraction.setup(ctx);

    const input = services.map.get('input');
    input.enable();

    const samples = [];
    events.on('input:changed', () => samples.push(input.sample()));

    const cases = [
      ['Space', 'parachutePressed'],
      ['KeyR', 'reload'],
      ['KeyB', 'platePressed'],
      ['KeyN', 'stimulantPressed'],
      ['KeyE', 'interactPressed'],
      ['KeyC', 'posePressed'],
      ['KeyX', 'firePressed'],
    ];

    for (const [code, field] of cases) {
      samples.length = 0;
      windowStub.dispatch('keydown', keyEvent(code));
      assert.equal(samples.length, 1, `${code} keydown must emit one input sample`);
      assert.equal(samples[0][field], true,
        `${code} must reach the final wrapped input sample as ${field}`);
      const afterImpulse = input.sample();
      assert.equal(afterImpulse[field], false, `${field} must remain one-shot after the first sample`);
      const samplesBeforeKeyup = samples.length;
      windowStub.dispatch('keyup', keyEvent(code));
      if (code === 'KeyE') {
        assert.equal(samples.length, samplesBeforeKeyup + 1, 'KeyE keyup must emit a release sample');
        const releaseSample = samples.at(-1);
        assert.equal(releaseSample.interactHeld, false, 'KeyE keyup must clear crate interactHeld state');
        assert.equal(releaseSample.interactReleased, true, 'KeyE keyup must expose one interactReleased impulse');
      }
    }

    samples.length = 0;
    windowStub.dispatch('keydown', keyEvent('KeyZ'));
    samples.length = 0;
    windowStub.dispatch('keydown', keyEvent('ArrowLeft'));
    assert.equal(samples.length, 1, 'Z + ArrowLeft must emit one input sample');
    assert.equal(samples[0].selectDelta, -1, 'Z + ArrowLeft must request previous weapon');
    windowStub.dispatch('keyup', keyEvent('ArrowLeft'));
    windowStub.dispatch('keyup', keyEvent('KeyZ'));

    samples.length = 0;
    windowStub.dispatch('keydown', keyEvent('KeyZ'));
    samples.length = 0;
    windowStub.dispatch('keydown', keyEvent('ArrowRight'));
    assert.equal(samples.length, 1, 'Z + ArrowRight must emit one input sample');
    assert.equal(samples[0].selectDelta, 1, 'Z + ArrowRight must request next weapon');
    windowStub.dispatch('keyup', keyEvent('ArrowRight'));
    windowStub.dispatch('keyup', keyEvent('KeyZ'));
  } finally {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
    globalThis.requestAnimationFrame = previousRaf;
    globalThis.setInterval = previousSetInterval;
  }
});
