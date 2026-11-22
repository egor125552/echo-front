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
  const triggeredActions = [];
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
  s.map.set("input", {
    setVirtualControl(...args) { virtualActions.push(args); },
    triggerVirtualAction(action) { triggeredActions.push(action); },
  });
  try {
    await touchSettings.setup({ events, services: s.api });
    await iphoneGestures.setup({ events, services: s.api });
    const mode = s.map.get("touch-control-settings");
    assert.equal(mode.mode, "buttons");
    assert.equal(picker.value, "buttons");
    const finger = (x, y, id = 1) => ({ identifier: id, clientX: x, clientY: y,
      target: new globalThis.Element() });
    const dispatch = (kind, touches) => {
      const list = Array.isArray(touches) ? touches : [touches];
      let prevented = false;
      for (const listener of handlers.get(kind) ?? []) {
        listener({ changedTouches: list, cancelable: true,
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
    mode.setMode("gestures");

    // 2-finger horizontal drag turns camera
    virtualActions.length = 0;
    dispatch("touchstart", [finger(100, 100, 1), finger(140, 100, 2)]);
    dispatch("touchmove", [finger(160, 100, 1), finger(200, 100, 2)]);
    assert(virtualActions.some(([name, val]) => name === "turn" && val > 0),
      "two-finger horizontal drag must turn camera right");
    dispatch("touchend", [finger(160, 100, 1), finger(200, 100, 2)]);
    assert(virtualActions.some(([name, val]) => name === "turn" && val === 0),
      "lifting two fingers must reset camera turn to 0");

    // 2-finger swipe up switches weapon, swipe down opens map
    triggeredActions.length = 0;
    dispatch("touchstart", [finger(100, 160, 1), finger(140, 160, 2)]);
    dispatch("touchmove", [finger(100, 90, 1), finger(140, 90, 2)]);
    dispatch("touchend", [finger(100, 90, 1), finger(140, 90, 2)]);
    assert(triggeredActions.includes("weapon-next"), "two-finger swipe up must switch weapon");

    triggeredActions.length = 0;
    dispatch("touchstart", [finger(100, 90, 1), finger(140, 90, 2)]);
    dispatch("touchmove", [finger(100, 160, 1), finger(140, 160, 2)]);
    dispatch("touchend", [finger(100, 160, 1), finger(140, 160, 2)]);
    assert(triggeredActions.includes("map"), "two-finger swipe down must open map");

    // 2-finger triple tap immediately triggers stimulant
    triggeredActions.length = 0;
    for (let i = 0; i < 3; i++) {
      dispatch("touchstart", [finger(100, 100, 1), finger(140, 100, 2)]);
      dispatch("touchend", [finger(100, 100, 1), finger(140, 100, 2)]);
    }
    assert(triggeredActions.includes("stimulant"), "two-finger triple tap must trigger stimulant");

    // 1-finger triple tap jumps on tap 2 and triggers parkour-pose on tap 3
    triggeredActions.length = 0;
    for (let i = 0; i < 3; i++) {
      dispatch("touchstart", finger(100, 100, 1));
      dispatch("touchend", finger(100, 100, 1));
    }
    assert(triggeredActions.includes("parachute"), "double tap must trigger jump/parachute");
    assert(triggeredActions.includes("parkour-pose"), "triple tap must trigger parkour-pose");

    // 4-finger tap toggles navigation-face
    triggeredActions.length = 0;
    dispatch("touchstart", [finger(80, 100, 1), finger(110, 100, 2), finger(140, 100, 3), finger(170, 100, 4)]);
    dispatch("touchend", [finger(80, 100, 1), finger(110, 100, 2), finger(140, 100, 3), finger(170, 100, 4)]);
    assert(triggeredActions.includes("navigation-face"), "four-finger tap must toggle auto-guidance");

    // 4-finger directional swipes: left = mine, up = nuke, right = electro-mode, down = parachute-status
    triggeredActions.length = 0;
    dispatch("touchstart", [finger(140, 120, 1), finger(170, 120, 2), finger(200, 120, 3), finger(230, 120, 4)]);
    dispatch("touchmove", [finger(70, 120, 1), finger(100, 120, 2), finger(130, 120, 3), finger(160, 120, 4)]);
    dispatch("touchend", [finger(70, 120, 1), finger(100, 120, 2), finger(130, 120, 3), finger(160, 120, 4)]);
    assert(triggeredActions.includes("mine"), "four-finger swipe left must plant mine");

    triggeredActions.length = 0;
    dispatch("touchstart", [finger(80, 180, 1), finger(110, 180, 2), finger(140, 180, 3), finger(170, 180, 4)]);
    dispatch("touchmove", [finger(80, 110, 1), finger(110, 110, 2), finger(140, 110, 3), finger(170, 110, 4)]);
    dispatch("touchend", [finger(80, 110, 1), finger(110, 110, 2), finger(140, 110, 3), finger(170, 110, 4)]);
    assert(triggeredActions.includes("nuke"), "four-finger swipe up must aim/launch mini-nuke");

    triggeredActions.length = 0;
    dispatch("touchstart", [finger(60, 120, 1), finger(90, 120, 2), finger(120, 120, 3), finger(150, 120, 4)]);
    dispatch("touchmove", [finger(130, 120, 1), finger(160, 120, 2), finger(190, 120, 3), finger(220, 120, 4)]);
    dispatch("touchend", [finger(130, 120, 1), finger(160, 120, 2), finger(190, 120, 3), finger(220, 120, 4)]);
    assert(triggeredActions.includes("electro-mode"), "four-finger swipe right must switch electro-rifle mode");

    // While Mini-Nuke is aiming, 2-finger swipe up cycles nuke distance instead of switching weapon
    events.emit("game:snapshot", { specialOps: { nukeAiming: true } });
    triggeredActions.length = 0;
    dispatch("touchstart", [finger(100, 160, 1), finger(140, 160, 2)]);
    dispatch("touchmove", [finger(100, 90, 1), finger(140, 90, 2)]);
    dispatch("touchend", [finger(100, 90, 1), finger(140, 90, 2)]);
    assert(triggeredActions.includes("nuke-cycle-next"), "two-finger swipe up while aiming nuke must cycle distance");
    events.emit("game:snapshot", { specialOps: { nukeAiming: false } });

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
