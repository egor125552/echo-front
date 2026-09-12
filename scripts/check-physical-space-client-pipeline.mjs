import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventBus } from '../client/core/event-bus.js';
import * as keyboardInput from '../client/plugins/input.js';
import * as parachuteInput from '../client/plugins/parachute-input.js';

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

test('physical Space survives the real keyboard + parachute client pipeline', async () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousRaf = globalThis.requestAnimationFrame;
  const { windowStub, documentStub } = createBrowserStub();
  globalThis.window = windowStub;
  globalThis.document = documentStub;
  globalThis.requestAnimationFrame = (callback) => callback();

  try {
    const events = new EventBus();
    const services = makeServices();
    const ctx = { events, services: services.api };

    await keyboardInput.setup(ctx);
    services.map.set('network', { connected: true, playerId: 'player' });
    services.map.set('speech', { enabled: false, say() {} });
    await parachuteInput.setup(ctx);

    const input = services.map.get('input');
    input.enable();

    const samples = [];
    events.on('input:changed', () => samples.push(input.sample()));

    windowStub.dispatch('keydown', keyEvent('Space'));

    assert.equal(samples.length, 1, 'Space keydown must emit one input sample');
    assert.equal(samples[0].parachutePressed, true,
      'physical Space must reach the final wrapped input sample');

    const afterImpulse = input.sample();
    assert.equal(afterImpulse.parachutePressed, false,
      'parachute impulse must remain one-shot after the first sample');
  } finally {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
    globalThis.requestAnimationFrame = previousRaf;
  }
});
