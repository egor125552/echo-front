import assert from "node:assert/strict";
import { test } from "node:test";
import { EventBus } from "../public/client/core/event-bus.js";
import * as coreSoundPack from "../public/client/plugins/core-sound-pack.js";

function createServiceRegistry(initial = []) {
  const map = new Map(initial);
  return {
    get(name) { return map.get(name); },
    has(name) { return map.has(name); },
    provide(name, value) { map.set(name, value); },
  };
}

test("warmEssential resolves cleanly even when individual audio assets fail to load", async () => {
  const events = new EventBus();
  const attempted = [];
  const audioStub = {
    async load(url) {
      attempted.push(url);
      if (url.includes("precise-booming-shot")) {
        throw new Error("Simulated transient network error");
      }
      return {};
    },
    async playCentered() { return {}; },
    async playSpatial() { return {}; },
    stopChannel() {},
  };
  const services = createServiceRegistry([
    ["audio", audioStub],
    ["network", { playerId: "p-1" }],
  ]);

  await coreSoundPack.setup({ events, services });
  const pack = services.get("sound-pack");
  await pack.warmEssential();

  assert(attempted.some((u) => u.includes("single-shot-m-1-rifle")), "Warm essential loads marksman sound");
  assert(attempted.some((u) => u.includes("precise-booming-shot")), "Warm essential attempts sniper sound without throwing");
});

test("spatial-audio load evicts failed cache entries and resume settles safely if suspended", async () => {
  const old = {
    window: globalThis.window,
    fetch: globalThis.fetch,
  };
  let fetchCalls = 0;

  class FakeAudioContext {
    constructor() {
      this.state = "suspended";
      this.currentTime = 0;
      this.sampleRate = 44100;
      this.destination = {};
    }
    createGain() { return { gain: { value: 1, setTargetAtTime() {} }, connect(t) { return t; } }; }
    createBiquadFilter() { return { type: "lowpass", Q: { value: 0 }, frequency: { value: 18000, setTargetAtTime() {} }, connect(t) { return t; } }; }
    createConvolver() { return { buffer: null, connect(t) { return t; } }; }
    createBuffer(ch, len) { return { numberOfChannels: ch, getChannelData: () => new Float32Array(len) }; }
    async decodeAudioData() { return { duration: 1 }; }
    async resume() { throw new Error("Simulated audio focus interruption"); }
  }

  globalThis.window = { AudioContext: FakeAudioContext };
  globalThis.fetch = async () => {
    fetchCalls += 1;
    if (fetchCalls === 1) return { ok: false, status: 503 };
    return { ok: true, status: 200, async arrayBuffer() { return new ArrayBuffer(8); } };
  };

  try {
    const { setup } = await import("../public/client/plugins/spatial-audio.js");
    const events = new EventBus();
    const services = createServiceRegistry([["network", { playerId: "p-1" }]]);
    await setup({ events, services });
    const audio = services.get("audio");

    await audio.resume();
    await assert.rejects(() => audio.load("/assets/test-retry.mp3"), /Audio HTTP 503/);
    const decoded = await audio.load("/assets/test-retry.mp3");
    assert.equal(decoded.duration, 1);
    assert.equal(fetchCalls, 2, "Failed fetch must not poison cache for retry");
  } finally {
    globalThis.window = old.window;
    globalThis.fetch = old.fetch;
  }
});
