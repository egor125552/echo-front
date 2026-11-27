import assert from "node:assert/strict";
import { test } from "node:test";
import { EventBus } from "../public/client/core/event-bus.js";
import {
  detectGamepadInfo,
  resolveActiveControlProfile,
  setup as setupControlProfile,
} from "../public/client/plugins/control-profile.js";
import {
  tutorialMessageFor,
  setup as setupTutorialGuide,
} from "../public/client/plugins/tutorial-guide.js";

test("detectGamepadInfo accurately distinguishes PlayStation DualSense/DualShock from standard controllers", () => {
  assert.equal(detectGamepadInfo([]), null);
  assert.equal(detectGamepadInfo([{ connected: false, id: "DualSense Wireless Controller" }]), null);

  const ps5 = detectGamepadInfo([{ connected: true, mapping: "standard", id: "DualSense Wireless Controller" }]);
  assert.equal(ps5?.kind, "gamepad-playstation");
  assert.equal(ps5?.isPlayStation, true);

  const ps4 = detectGamepadInfo([{ connected: true, mapping: "standard", id: "Sony Computer Entertainment Wireless Controller (054c-09cc)" }]);
  assert.equal(ps4?.kind, "gamepad-playstation");
  assert.equal(ps4?.isPlayStation, true);

  const xbox = detectGamepadInfo([{ connected: true, mapping: "standard", id: "Xbox Wireless Controller" }]);
  assert.equal(xbox?.kind, "gamepad-standard");
  assert.equal(xbox?.isPlayStation, false);
});

test("resolveActiveControlProfile respects explicit choice and falls back cleanly in auto mode", () => {
  assert.equal(
    resolveActiveControlProfile({
      storedProfile: "touch-gestures",
      detectedGamepad: { kind: "gamepad-playstation" },
    }),
    "touch-gestures",
  );
  assert.equal(
    resolveActiveControlProfile({
      storedProfile: "auto",
      detectedGamepad: { kind: "gamepad-playstation" },
    }),
    "gamepad-playstation",
  );
  assert.equal(
    resolveActiveControlProfile({
      storedProfile: "auto",
      touchMode: "gestures",
      detectedGamepad: null,
    }),
    "touch-gestures",
  );
  assert.equal(
    resolveActiveControlProfile({
      storedProfile: "auto",
      touchMode: "buttons",
      touchCapable: true,
    }),
    "touch-buttons",
  );
});

test("tutorialMessageFor adapts instructions across gestures, buttons, keyboard, PlayStation gamepad, and emergency auto-deploy", () => {
  const gesturesMove = tutorialMessageFor("tdm", "move-forward", { profile: "touch-gestures" });
  assert.match(gesturesMove, /один палец/i);
  const gesturesFire = tutorialMessageFor("tdm", "fire", { profile: "touch-gestures" });
  assert.match(gesturesFire, /тремя пальцами/i);
  const gesturesParachute = tutorialMessageFor("battle-royale", "deploy-parachute", { profile: "touch-gestures" });
  assert.match(gesturesParachute, /два быстрых касания/i);
  const gesturesArmor = tutorialMessageFor("battle-royale", "apply-armor", { profile: "touch-gestures" });
  assert.match(gesturesArmor, /двойное касание двумя пальцами/i);

  const psMove = tutorialMessageFor("tdm", "move-forward", { profile: "gamepad-playstation" });
  assert.match(psMove, /PlayStation/i);
  assert.match(psMove, /левый стик/i);
  const psFire = tutorialMessageFor("tdm", "fire", { profile: "gamepad-playstation" });
  assert.match(psFire, /R2/);
  const psReload = tutorialMessageFor("tdm", "reload", { profile: "gamepad-playstation" });
  assert.match(psReload, /Квадрат/);
  const psArmor = tutorialMessageFor("battle-royale", "apply-armor", { profile: "gamepad-playstation" });
  assert.match(psArmor, /Треугольник/);

  const buttonsFire = tutorialMessageFor("tdm", "fire", { profile: "touch-buttons" });
  assert.match(buttonsFire, /кнопку Огонь/i);

  const keyboardFire = tutorialMessageFor("tdm", "fire", { profile: "keyboard" });
  assert.match(keyboardFire, /клавиатуре нажми X/i);

  const autoDeploySteer = tutorialMessageFor("battle-royale", "steer-parachute", {
    profile: "gamepad-playstation",
    tutorial: { autoDeployedEarly: true },
  });
  assert.match(autoDeploySteer, /автоматическая аварийная высадка/i);
  assert.match(autoDeploySteer, /королевской битве/i);
});

test("tutorial-guide dynamically re-announces current step when player switches between buttons and gestures mid-tutorial, and announces early auto-deploy once", async () => {
  const old = {
    document: globalThis.document,
    window: globalThis.window,
    localStorage: globalThis.localStorage,
    navigator: globalThis.navigator,
    requestAnimationFrame: globalThis.requestAnimationFrame,
  };
  const storage = new Map();
  globalThis.document = {
    documentElement: { dataset: {} },
    querySelector: () => null,
  };
  globalThis.window = { addEventListener() {} };
  globalThis.localStorage = {
    getItem: (k) => storage.get(k) ?? null,
    setItem: (k, v) => storage.set(k, String(v)),
  };
  globalThis.requestAnimationFrame = (cb) => { cb(); return 1; };
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    writable: true,
    value: { getGamepads: () => [], maxTouchPoints: 5 },
  });

  try {
    const events = new EventBus();
    let touchMode = "buttons";
    const spoken = [];
    const services = new Map([
      ["touch-control-settings", {
        get mode() { return touchMode; },
        setMode(next) {
          if (next === touchMode) return;
          touchMode = next;
          events.emit("touch-control:mode-changed", { mode: touchMode });
        },
      }],
      ["network", { playerId: "p1", send() {} }],
      ["speech", {
        rate: 1.7,
        get requestGeneration() { return spoken.length; },
        say(text) { spoken.push(text); },
      }],
    ]);
    const ctx = {
      events,
      services: {
        get: (k) => services.get(k),
        has: (k) => services.has(k),
        provide: (k, v) => services.set(k, v),
      },
    };

    await setupControlProfile(ctx);
    await setupTutorialGuide(ctx);

    events.emit("network:welcome", { tutorial: true });
    events.emit("game:snapshot", {
      tutorial: { enabled: true, mode: "tdm", phase: "fire" },
    });
    assert.match(spoken.at(-1), /кнопку Огонь/i);

    // Switch live from buttons -> gestures mid-tutorial!
    services.get("touch-control-settings").setMode("gestures");
    assert.match(spoken.at(-1), /Режим управления обновлён/i);
    assert.match(spoken.at(-1), /тремя пальцами/i);

    // Early auto-deploy in BR explains auto-deploy once on steer-parachute, and does not repeat on ground-run
    events.emit("network:welcome", { tutorial: true });
    events.emit("game:snapshot", {
      tutorial: { enabled: true, mode: "battle-royale", phase: "steer-parachute", autoDeployedEarly: true },
    });
    assert.match(spoken.at(-1), /автоматическая аварийная высадка/i);

    events.emit("game:snapshot", {
      tutorial: { enabled: true, mode: "battle-royale", phase: "ground-run", autoDeployedEarly: true },
    });
    assert.doesNotMatch(spoken.at(-1), /автоматическая аварийная высадка/i);
    assert.match(spoken.at(-1), /Посадка завершена/i);
  } finally {
    globalThis.document = old.document;
    globalThis.window = old.window;
    globalThis.localStorage = old.localStorage;
    globalThis.requestAnimationFrame = old.requestAnimationFrame;
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      writable: true,
      value: old.navigator,
    });
  }
});
