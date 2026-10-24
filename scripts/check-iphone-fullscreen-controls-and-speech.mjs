import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { EventBus } from "../public/client/core/event-bus.js";
import * as touchSettings from "../public/client/plugins/touch-control-settings.js";
import * as iphoneGestures from "../public/client/plugins/iphone-gestures.js";
import * as speechSettings from "../public/client/plugins/speech-settings.js";

function services() {
  const map = new Map();
  return {
    map,
    api: {
      provide(name, value) { assert(!map.has(name)); map.set(name, value); },
      get(name) { assert(map.has(name), name); return map.get(name); },
    },
  };
}

test("iPhone defaults to accessible buttons and gestures only work when selected", async () => {
  const old = { window: globalThis.window, document: globalThis.document,
    Element: globalThis.Element, localStorage: globalThis.localStorage };
  const handlers = new Map();
  const picker = { value: "", addEventListener(kind, listener) { this[kind] = listener; } };
  const hint = { textContent: "" }, panel = { hidden: false }, menu = { hidden: true };
  const modes = new Map();
  const virtualActions = [];
  globalThis.Element = class Element { closest() { return null; } };
  globalThis.localStorage = {
    getItem(key) { return modes.get(key) ?? null; },
    setItem(key, value) { modes.set(key, value); },
  };
  globalThis.document = {
    documentElement: { dataset: {} },
    hidden: false,
    querySelector(selector) { return selector === "#touch-control-mode" ? picker
      : selector === "#touch-mode-status" ? hint : null; },
    getElementById(id) { return id === "game-panel" ? panel : menu; },
    addEventListener(event, cb) { (handlers.get(event) ?? handlers.set(event, []).get(event)).push(cb); },
  };
  globalThis.window = { addEventListener() {} };
  const events = new EventBus();
  const s = services();
  s.map.set("input", { setVirtualControl(...args) { virtualActions.push(args); },
    triggerVirtualAction() {} });
  try {
    await touchSettings.setup({ events, services: s.api });
    await iphoneGestures.setup({ events, services: s.api });
    const mode = s.map.get("touch-control-settings");
    assert.equal(mode.mode, "buttons");
    assert.equal(picker.value, "buttons");
    const finger = (x, y) => ({ identifier: 1, clientX: x, clientY: y,
      target: new globalThis.Element() });
    const dispatch = (kind, touch) => {
      let prevented = false;
      for (const listener of handlers.get(kind) ?? []) {
        listener({ changedTouches: [touch], cancelable: true,
          preventDefault() { prevented = true; } });
      }
      return prevented;
    };
    assert.equal(dispatch("touchstart", finger(90, 120)), false,
      "button mode must allow browser touch gestures");
    assert.equal(virtualActions.length, 0);
    mode.setMode("gestures");
    assert.equal(globalThis.document.documentElement.dataset.touchMode, "gestures");
    assert.equal(modes.get(touchSettings.TOUCH_MODE_KEY), "gestures");
    assert.equal(dispatch("touchstart", finger(90, 120)), true,
      "full-screen gesture on arbitrary page target should be handled");
    dispatch("touchmove", finger(90, 30));
    assert(virtualActions.some(([name, down]) => name === "forward" && down === true));
    mode.setMode("buttons");
    assert(virtualActions.some(([name, down]) => name === "forward" && down === false),
      "changing control mode must release all held movement");
    assert.equal(dispatch("touchstart", finger(80, 120)), false);
    assert.equal(virtualActions.at(-1)[1], false);
    mode.setMode("gestures");
    menu.hidden = false;
    assert.equal(dispatch("touchstart", finger(90, 120)), false,
      "a screen-reader menu should not trigger game gestures");
  } finally {
    Object.assign(globalThis, old);
  }
});

test("Safari voice cold start queues the first real utterance synchronously with no silent primer", async () => {
  const old = { window: globalThis.window, document: globalThis.document,
    navigator: globalThis.navigator, localStorage: globalThis.localStorage,
    SpeechSynthesisUtterance: globalThis.SpeechSynthesisUtterance,
    setTimeout: globalThis.setTimeout };
  globalThis.setTimeout = () => 1; // Prevent voice-refresh timers outliving isolated browser stubs.
  const spoken = [];
  let cancels = 0;
  const synthesizer = {
    speaking: false, pending: false, getVoices() { return []; },
    speak(utterance) { spoken.push(utterance.text); utterance.onstart?.(); },
    cancel() { cancels++; }, resume() {}, addEventListener() {},
  };
  globalThis.window = { speechSynthesis: synthesizer,
    SpeechSynthesisUtterance: class {
      constructor(text) { this.text = text; }
    }, addEventListener() {} };
  globalThis.SpeechSynthesisUtterance = globalThis.window.SpeechSynthesisUtterance;
  Object.defineProperty(globalThis, "navigator", { configurable: true, writable: true,
    value: { userActivation: { isActive: false } } });
  globalThis.localStorage = { getItem() { return null; }, setItem() {} };
  globalThis.document = {
    querySelector() { return null; },
    getElementById() { return null; },
    addEventListener() {},
  };
  try {
    const events = new EventBus(), s = services();
    await speechSettings.setup({ events, services: s.api });
    s.map.get("speech").say("Первый звук игры", { interrupt: true });
    assert.deepEqual(spoken, ["Первый звук игры"]);
    assert.equal(cancels, 0, "cold start should not call speechSynthesis.cancel()");
  } finally {
    Object.assign(globalThis, { window: old.window, document: old.document,
      localStorage: old.localStorage, SpeechSynthesisUtterance: old.SpeechSynthesisUtterance,
      setTimeout: old.setTimeout });
    Object.defineProperty(globalThis, "navigator", { configurable: true, writable: true,
      value: old.navigator });
  }
});

test("gestures occupy full iPhone viewport and startup voice speaks before awaiting audio", () => {
  const style = readFileSync(new URL("../public/styles.css", import.meta.url), "utf8");
  const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  const boot = readFileSync(new URL("../public/client/bootstrap.js", import.meta.url), "utf8");
  assert.match(style, /height: 100dvh/);
  assert.match(style, /#gesture-stage[^{]*\{[^}]*inset: 0/s);
  assert.match(html, /id="touch-control-mode"/);
  assert.match(html, /id="gesture-toolbar"/);
  assert.match(html, /id="quick-speech-test"/);
  const speechIndex = boot.indexOf('speech?.say?.(loadingText, { interrupt: true });');
  const resumeIndex = boot.indexOf('const audioResume = host.services.get("audio").resume();');
  const awaitIndex = boot.indexOf('await audioResume;');
  assert(resumeIndex > 0 && speechIndex > resumeIndex && awaitIndex > speechIndex,
    "both speech and audio must begin before the first await in the play-button click");
});
