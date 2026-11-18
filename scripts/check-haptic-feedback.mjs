import assert from "node:assert/strict";
import { test } from "node:test";
import { EventBus } from "../public/client/core/event-bus.js";
import * as hapticPlugin from "../public/client/plugins/haptic-feedback.js";
import * as gamepadHapticsPlugin from "../public/client/plugins/gamepad-haptics.js";

const {
  HAPTICS_ENABLED_KEY,
  HAPTICS_INTENSITY_KEY,
  HAPTIC_PRIORITY,
  HAPTIC_PATTERNS,
  CRITICAL_DAMAGE_AMOUNT,
  clampIntensity,
  scaleVibratePattern,
  patternDurationMs,
  createShotTracker,
  createHapticArbitrator,
  hapticCueForGameEvent,
} = hapticPlugin;

function createServiceRegistry() {
  const map = new Map();
  return {
    map,
    api: {
      provide(name, value) {
        assert(!map.has(name), `Duplicate service: ${name}`);
        map.set(name, value);
      },
      get(name) {
        assert(map.has(name), `Missing service: ${name}`);
        return map.get(name);
      },
      has(name) {
        return map.has(name);
      },
    },
  };
}

function createFakeElement(initial = {}) {
  const listeners = new Map();
  return {
    ...initial,
    addEventListener(type, fn) {
      const list = listeners.get(type) ?? [];
      list.push(fn);
      listeners.set(type, list);
    },
    dispatch(type, event = {}) {
      for (const fn of listeners.get(type) ?? []) fn(event);
    },
  };
}

test("shot tracker distinguishes single shot from sustained automatic queue", () => {
  const tracker = createShotTracker(260);
  assert.deepEqual(tracker.nextShot("rifle", 1000), { mode: "single", count: 1 });
  assert.deepEqual(tracker.nextShot("rifle", 1100), { mode: "burst-entry", count: 2 });
  assert.deepEqual(tracker.nextShot("rifle", 1200), { mode: "burst-sustained", count: 3 });
  assert.deepEqual(tracker.nextShot("rifle", 1300), { mode: "burst-sustained", count: 4 });

  // Pausing past burst window resets back to single shot
  assert.deepEqual(tracker.nextShot("rifle", 1700), { mode: "single", count: 1 });

  // Switching weapon resets burst immediately
  assert.deepEqual(tracker.nextShot("pistol", 1780), { mode: "single", count: 1 });

  // Trigger release resets burst immediately even before burst window expires
  assert.deepEqual(tracker.nextShot("pistol", 1980), { mode: "burst-entry", count: 2 });
  tracker.onFireStop();
  assert.deepEqual(tracker.nextShot("pistol", 2050), { mode: "single", count: 1 });
});

test("haptic cues produce distinct tactile signatures for single shot, burst queue, normal hit, and critical damage", () => {
  const self = "player-1";

  const pistolSingle = hapticCueForGameEvent(
    { event: "weapon:fired", payload: { entityId: self, weaponId: "pistol" } },
    self,
    { shotMode: "single" },
  );
  assert.equal(pistolSingle?.kind, "weapon:pistol");
  assert.equal(pistolSingle?.pattern, "single");
  assert.equal(typeof pistolSingle?.vibrate, "number");
  assert.equal(pistolSingle?.vibrate, HAPTIC_PATTERNS.shotSinglePistol.vibrate);

  const rifleSingle = hapticCueForGameEvent(
    { event: "weapon:fired", payload: { entityId: self, weaponId: "rifle" } },
    self,
    { shotMode: "single" },
  );
  assert.equal(rifleSingle?.kind, "weapon:rifle");
  assert.equal(rifleSingle?.vibrate, HAPTIC_PATTERNS.shotSingleRifle.vibrate);

  const burstEntry = hapticCueForGameEvent(
    { event: "weapon:fired", payload: { entityId: self, weaponId: "rifle" } },
    self,
    { shotMode: "burst-entry" },
  );
  assert.equal(burstEntry?.kind, "weapon:burst-entry");
  assert.equal(burstEntry?.pattern, "burst");
  assert.deepEqual(burstEntry?.vibrate, [10, 18, 10, 18, 10]);

  const burstSustained = hapticCueForGameEvent(
    { event: "weapon:fired", payload: { entityId: self, weaponId: "rifle" } },
    self,
    { shotMode: "burst-sustained" },
  );
  assert.equal(burstSustained?.kind, "weapon:burst-sustained");
  assert.deepEqual(burstSustained?.vibrate, [11, 18, 11]);

  assert.equal(
    hapticCueForGameEvent({ event: "weapon:fired", payload: { entityId: "enemy-2", weaponId: "rifle" } }, self),
    null,
    "shots fired by another entity must never vibrate self",
  );

  // Standard non-critical flesh hit (20 dmg at high health -> single medium pulse)
  const lightDmg = hapticCueForGameEvent(
    { event: "combat:damage", payload: { targetId: self, attackerId: "enemy-2", healthApplied: 20, armorAbsorbed: 0 } },
    self,
    { remainingHealthRatio: 0.85 },
  );
  assert.equal(lightDmg?.kind, "damage:health");
  assert.equal(lightDmg?.priority, HAPTIC_PRIORITY.HIGH);
  assert.equal(typeof lightDmg?.vibrate, "number");
  assert(lightDmg.vibrate > pistolSingle.vibrate && lightDmg.vibrate < 120);

  // Critical damage (>= 45 dmg) -> prolonged surging multi-wave pattern
  const heavyCritical = hapticCueForGameEvent(
    {
      event: "combat:damage",
      payload: { targetId: self, attackerId: "enemy-2", healthApplied: CRITICAL_DAMAGE_AMOUNT, armorAbsorbed: 0 },
    },
    self,
    { remainingHealthRatio: 0.7 },
  );
  assert.equal(heavyCritical?.kind, "damage:critical");
  assert.equal(heavyCritical?.pattern, "critical");
  assert.equal(heavyCritical?.priority, HAPTIC_PRIORITY.CRITICAL);
  assert.deepEqual(heavyCritical?.vibrate, [130, 35, 160, 40, 110]);
  assert(patternDurationMs(heavyCritical.vibrate) >= 450);

  // Low remaining health threshold (<= 35% HP remaining) also escalates a 17-dmg bullet to critical feedback
  const lowHpCritical = hapticCueForGameEvent(
    { event: "combat:damage", payload: { targetId: self, attackerId: "enemy-2", healthApplied: 17, armorAbsorbed: 0 } },
    self,
    { remainingHealthRatio: 0.31 },
  );
  assert.equal(lowHpCritical?.kind, "damage:critical");
  assert.equal(lowHpCritical?.priority, HAPTIC_PRIORITY.CRITICAL);

  const armorHit = hapticCueForGameEvent({
    event: "combat:damage",
    payload: { targetId: self, attackerId: "enemy-2", healthApplied: 0, armorAbsorbed: 25 },
  }, self);
  assert.equal(armorHit?.kind, "damage:armor");

  const armorBreak = hapticCueForGameEvent({
    event: "combat:damage",
    payload: { targetId: self, attackerId: "enemy-2", healthApplied: 10, armorAbsorbed: 20, armorBroke: true },
  }, self);
  assert.equal(armorBreak?.kind, "damage:armor-break");
  assert.equal(armorBreak?.priority, HAPTIC_PRIORITY.BREAK);
  assert(patternDurationMs(armorBreak.vibrate) >= 350);

  const killed = hapticCueForGameEvent({
    event: "combat:damage",
    payload: { targetId: self, attackerId: "enemy-2", healthApplied: 40, armorAbsorbed: 0, killed: true },
  }, self);
  assert.equal(killed?.kind, "damage:killed");
  assert.equal(killed?.priority, HAPTIC_PRIORITY.FATAL);
  assert.equal(killed?.allowAfterDeath, true);
  assert(patternDurationMs(killed.vibrate) >= 500);

  assert.equal(
    hapticCueForGameEvent({
      event: "combat:damage",
      payload: { targetId: self, attackerId: "enemy-2", healthApplied: 0, armorAbsorbed: 0, spawnProtected: true },
    }, self),
    null,
  );

  const hitConfirm = hapticCueForGameEvent({
    event: "combat:damage",
    payload: { targetId: "enemy-2", attackerId: self, healthApplied: 22, armorAbsorbed: 0 },
  }, self);
  assert.equal(hitConfirm?.kind, "hit-confirm");
  assert.equal(hitConfirm?.vibrate, HAPTIC_PATTERNS.hitConfirm.vibrate);

  const killConfirm = hapticCueForGameEvent({
    event: "combat:damage",
    payload: { targetId: "enemy-2", attackerId: self, healthApplied: 22, armorAbsorbed: 0, killed: true },
  }, self);
  assert.equal(killConfirm?.kind, "hit-confirm:killed");
  assert.equal(killConfirm?.priority, HAPTIC_PRIORITY.HIGH);

  const zone = hapticCueForGameEvent({ event: "battle-royale:zone-damage", payload: { entityId: self } }, self);
  assert.equal(zone?.kind, "zone:damage");
  assert.equal(zone?.priority, HAPTIC_PRIORITY.LOW);
  assert(zone?.cooldownMs >= 900);
});

test("intensity scaling and priority arbitrator protect critical damage pulses from lower-priority chatter", () => {
  assert.equal(clampIntensity(0.05), 0.2);
  assert.equal(clampIntensity(2), 1);
  assert.equal(clampIntensity("bad"), 1);

  assert.equal(scaleVibratePattern(22, 0.2), 8, "minimum perceptible pulse is clamped at 8ms");
  assert.equal(scaleVibratePattern(100, 0.5), 50);
  const scaledArray = scaleVibratePattern([90, 40, 150], 0.5);
  assert.deepEqual(scaledArray, [45, 33, 75]);
  assert.equal(patternDurationMs(scaledArray), 153);

  const arb = createHapticArbitrator();
  assert.equal(arb.shouldPlay({ kind: "weapon:burst-entry", priority: HAPTIC_PRIORITY.ACTION, cooldownMs: 38, durationMs: 66 }, 100), true);
  // Same priority within cooldown is suppressed
  assert.equal(arb.shouldPlay({ kind: "weapon:burst-entry", priority: HAPTIC_PRIORITY.ACTION, cooldownMs: 38, durationMs: 66 }, 130), false);
  // Higher priority (critical damage) immediately preempts active shot burst!
  assert.equal(arb.shouldPlay({ kind: "damage:critical", priority: HAPTIC_PRIORITY.CRITICAL, cooldownMs: 140, durationMs: 475 }, 115), true);
  // Lower/equal priority arriving while critical pulse is still active (115 + 475 = 590) is blocked
  assert.equal(arb.shouldPlay({ kind: "weapon:rifle", priority: HAPTIC_PRIORITY.ACTION, cooldownMs: 35, durationMs: 22 }, 300), false);
  assert.equal(arb.shouldPlay({ kind: "damage:health", priority: HAPTIC_PRIORITY.HIGH, cooldownMs: 55, durationMs: 70 }, 400), false);
  // Fatal kill preempts even active critical damage!
  assert.equal(arb.shouldPlay({ kind: "damage:killed", priority: HAPTIC_PRIORITY.FATAL, cooldownMs: 200, durationMs: 595 }, 450), true);
});

test("haptic-feedback plugin integrates single/burst/critical patterns, Web Vibration API, Gamepad Haptics, and settings UI", async () => {
  const old = {
    window: globalThis.window,
    document: globalThis.document,
    navigator: globalThis.navigator,
    localStorage: globalThis.localStorage,
    requestAnimationFrame: globalThis.requestAnimationFrame,
  };

  const storage = new Map();
  const vibrated = [];
  const gamepadRumbles = [];
  const docListeners = new Map();
  const winListeners = new Map();

  const enabledInput = createFakeElement({ checked: true });
  const intensityInput = createFakeElement({ value: "1", disabled: false });
  const intensityValue = createFakeElement({ textContent: "" });
  const testPatternSelect = createFakeElement({ value: "default", disabled: false });
  const testButton = createFakeElement({});
  const statusNode = createFakeElement({ textContent: "" });

  const fakePad = {
    mapping: "standard",
    vibrationActuator: {
      async playEffect(type, params) {
        gamepadRumbles.push({ type, ...params });
      },
    },
  };

  let hasBeenActive = false;
  let hidden = false;

  globalThis.localStorage = {
    getItem(key) { return storage.get(key) ?? null; },
    setItem(key, value) { storage.set(key, String(value)); },
  };
  globalThis.requestAnimationFrame = (cb) => { cb(); return 1; };
  globalThis.document = {
    get hidden() { return hidden; },
    querySelector(selector) {
      if (selector === "#haptics-enabled") return enabledInput;
      if (selector === "#haptics-intensity") return intensityInput;
      if (selector === "#haptics-intensity-value") return intensityValue;
      if (selector === "#haptics-test-pattern") return testPatternSelect;
      if (selector === "#haptics-test") return testButton;
      if (selector === "#haptics-status") return statusNode;
      return null;
    },
    addEventListener(type, fn) {
      const list = docListeners.get(type) ?? [];
      list.push(fn);
      docListeners.set(type, list);
    },
  };
  globalThis.window = {
    addEventListener(type, fn) {
      const list = winListeners.get(type) ?? [];
      list.push(fn);
      winListeners.set(type, list);
    },
  };
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    writable: true,
    value: {
      vibrate(pattern) {
        vibrated.push(pattern);
        return true;
      },
      getGamepads() {
        return [fakePad];
      },
      userActivation: {
        get hasBeenActive() { return hasBeenActive; },
        get isActive() { return hasBeenActive; },
      },
    },
  });

  try {
    const events = new EventBus();
    const s = createServiceRegistry();
    s.map.set("network", { playerId: "player-1" });

    await hapticPlugin.setup({ events, services: s.api });
    await gamepadHapticsPlugin.setup({ events, services: s.api });

    const haptics = s.api.get("haptic-feedback");
    const padService = s.api.get("gamepad-haptics");
    assert.equal(haptics.enabled, true);
    assert.equal(haptics.intensity, 1);
    assert.equal(padService.supported(), true);

    // Before user activation, navigator.vibrate is skipped while gamepad plays single shot
    events.emit("game:event", {
      event: "weapon:fired",
      payload: { entityId: "player-1", weaponId: "pistol" },
    });
    await Promise.resolve();
    assert.equal(vibrated.length, 0, "must not call navigator.vibrate before first user gesture");
    assert.equal(gamepadRumbles.length, 1);

    // Reset via fire-stop and activate user gesture: wait past previous 42ms duration, then test single -> burst-entry -> burst-sustained
    hasBeenActive = true;
    events.emit("input:fire-stop", {});
    await new Promise((resolve) => setTimeout(resolve, 55));
    vibrated.length = 0;

    // Shot 1: short single impulse
    events.emit("game:event", {
      event: "weapon:fired",
      payload: { entityId: "player-1", weaponId: "rifle" },
    });
    await Promise.resolve();
    assert.equal(vibrated[0], 22, "first rifle shot is a single short impulse");

    // Wait 60ms (> 46ms gamepad duration) and fire shot 2 -> enters automatic burst queue!
    await new Promise((resolve) => setTimeout(resolve, 60));
    events.emit("game:event", {
      event: "weapon:fired",
      payload: { entityId: "player-1", weaponId: "rifle" },
    });
    await Promise.resolve();
    assert.deepEqual(vibrated[1], [10, 18, 10, 18, 10], "second rapid shot enters burst micro-vibration series");

    // Wait 75ms and fire shot 3 -> sustained queue pulse train
    await new Promise((resolve) => setTimeout(resolve, 75));
    events.emit("game:event", {
      event: "weapon:fired",
      payload: { entityId: "player-1", weaponId: "rifle" },
    });
    await Promise.resolve();
    assert.deepEqual(vibrated[2], [11, 18, 11], "third rapid shot continues sustained queue micro-vibrations");

    // Release trigger -> resets queue so next shot is single again
    events.emit("input:fire-stop", {});
    await new Promise((resolve) => setTimeout(resolve, 50));
    vibrated.length = 0;
    events.emit("game:event", {
      event: "weapon:fired",
      payload: { entityId: "player-1", weaponId: "rifle" },
    });
    await Promise.resolve();
    assert.equal(vibrated[0], 22, "after releasing trigger, next shot returns to single impulse");

    // Track snapshot HP and verify cumulative hit crossing 35% threshold triggers prolonged critical response
    events.emit("game:snapshot", {
      entities: [{ id: "player-1", alive: true, health: 90, healthMax: 200 }],
    });
    vibrated.length = 0;
    // Hit 1: 15 dmg (90 -> 75 / 200 = 37.5% > 35%) -> standard damage pulse, preempts shot
    events.emit("game:event", {
      event: "combat:damage",
      payload: { targetId: "player-1", attackerId: "bot-1", healthApplied: 15, armorAbsorbed: 0 },
    });
    await Promise.resolve();
    assert.equal(typeof vibrated[0], "number", "hit above 35% HP gives standard damage pulse");

    // Hit 2: 15 dmg (75 -> 60 / 200 = 30% <= 35%) -> escalates to CRITICAL prolonged pattern immediately!
    vibrated.length = 0;
    events.emit("game:event", {
      event: "combat:damage",
      payload: { targetId: "player-1", attackerId: "bot-1", healthApplied: 15, armorAbsorbed: 0 },
    });
    await Promise.resolve();
    assert.deepEqual(vibrated[0], [130, 35, 160, 40, 110], "dropping into <=35% HP triggers critical damage pattern");

    // Intensity slider updates UI, persistence, and scales critical pattern
    intensityInput.value = "0.5";
    intensityInput.dispatch("input");
    assert.equal(haptics.intensity, 0.5);
    assert.equal(intensityValue.textContent, "50%");
    assert.equal(storage.get(HAPTICS_INTENSITY_KEY), "0.5");

    // Pattern selector previews single / burst / critical cleanly
    vibrated.length = 0;
    testPatternSelect.value = "single";
    await haptics.test(testPatternSelect.value);
    assert.equal(vibrated[0], scaleVibratePattern(28, 0.5));

    vibrated.length = 0;
    testPatternSelect.value = "burst";
    await haptics.test(testPatternSelect.value);
    assert.deepEqual(vibrated[0], scaleVibratePattern([10, 18, 10, 18, 10], 0.5));

    vibrated.length = 0;
    testPatternSelect.value = "critical";
    await haptics.test(testPatternSelect.value);
    assert.deepEqual(vibrated[0], scaleVibratePattern([130, 35, 160, 40, 110], 0.5));
    assert.match(statusNode.textContent, /вибрация устройства и геймпада/i);

    // Reset intensity to 1.0 for remaining lifecycle checks
    intensityInput.value = "1";
    intensityInput.dispatch("input");

    // Hidden tab blocks vibration
    vibrated.length = 0;
    gamepadRumbles.length = 0;
    hidden = true;
    events.emit("game:event", {
      event: "combat:damage",
      payload: { targetId: "player-1", attackerId: "bot-1", healthApplied: 20, armorAbsorbed: 0 },
    });
    await Promise.resolve();
    assert.equal(vibrated.length, 0);
    assert.equal(gamepadRumbles.length, 0);
    hidden = false;

    // Armor break followed by lethal hit still plays fatal death pattern (FATAL > BREAK)
    events.emit("game:event", {
      event: "entity:respawned",
      payload: { entityId: "player-1" },
    });
    events.emit("game:snapshot", {
      entities: [{ id: "player-1", alive: true, health: 200, healthMax: 200 }],
    });
    vibrated.length = 0;
    events.emit("game:event", {
      event: "combat:damage",
      payload: { targetId: "player-1", attackerId: "bot-1", healthApplied: 10, armorAbsorbed: 30, armorBroke: true },
    });
    await Promise.resolve();
    assert.deepEqual(vibrated[0], [85, 30, 150, 35, 95]);

    vibrated.length = 0;
    events.emit("game:event", {
      event: "combat:damage",
      payload: { targetId: "player-1", attackerId: "bot-1", healthApplied: 90, armorAbsorbed: 0, killed: true },
    });
    await Promise.resolve();
    assert.deepEqual(vibrated[0], [150, 45, 210, 50, 140], "lethal hit always preempts even armor-break pulse");

    // Dead state blocks post-death weapon chatter until respawned
    vibrated.length = 0;
    events.emit("game:snapshot", {
      entities: [{ id: "player-1", alive: false, health: 0, healthMax: 200 }],
    });
    events.emit("game:event", {
      event: "weapon:fired",
      payload: { entityId: "player-1", weaponId: "rifle" },
    });
    await Promise.resolve();
    assert.equal(vibrated.length, 0, "no shot vibration while dead");

    events.emit("game:event", {
      event: "entity:respawned",
      payload: { entityId: "player-1" },
    });
    events.emit("game:event", {
      event: "weapon:fired",
      payload: { entityId: "player-1", weaponId: "rifle" },
    });
    await Promise.resolve();
    assert.equal(vibrated.length, 1, "vibration resumes cleanly after respawn");

    // Disabling haptics stops active vibration and disables intensity + pattern select
    vibrated.length = 0;
    enabledInput.checked = false;
    enabledInput.dispatch("change");
    assert.equal(haptics.enabled, false);
    assert.equal(storage.get(HAPTICS_ENABLED_KEY), "false");
    assert.equal(intensityInput.disabled, true);
    assert.equal(testPatternSelect.disabled, true);
    assert.deepEqual(vibrated, [0], "turning off cancels ongoing vibration via navigator.vibrate(0)");
  } finally {
    Object.assign(globalThis, {
      window: old.window,
      document: old.document,
      localStorage: old.localStorage,
      requestAnimationFrame: old.requestAnimationFrame,
    });
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      writable: true,
      value: old.navigator,
    });
  }
});

test("gamepad-input plugin supports Hold Triangle for armor plating with immediate rumble, short tap for interact, and full gamepad controls", async () => {
  const { setup: setupGamepadInput, GAMEPAD_ARMOR_HOLD_MS } = await import("../public/client/plugins/gamepad-input.js");
  assert.equal(GAMEPAD_ARMOR_HOLD_MS, 380);

  const old = {
    window: globalThis.window,
    document: globalThis.document,
    navigator: globalThis.navigator,
    performance: globalThis.performance,
  };

  let fakeNow = 1000;
  const rumbles = [];
  const overlayToggles = [];
  const buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
  const fakePad = {
    connected: true,
    id: "DualSense Wireless Controller",
    axes: [0, 0, 0, 0],
    buttons,
    vibrationActuator: {
      type: "dual-rumble",
      playEffect: async (type, params) => {
        rumbles.push({ type, ...params });
      },
    },
  };

  let currentEntity = {
    id: "player-1",
    alive: true,
    downed: false,
    airborne: false,
    armor: 50,
    armorMax: 150,
    armorPlates: 2,
    armorPlating: false,
  };

  try {
    globalThis.performance = { now: () => fakeNow };
    globalThis.window = {
      addEventListener() {},
      removeEventListener() {},
    };
    globalThis.document = {
      getElementById: () => null,
      querySelector: () => null,
    };
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      writable: true,
      value: {
        getGamepads: () => [fakePad],
      },
    });

    const events = new EventBus();
    const baseInput = {
      state: { lookSensitivity: 0.0042 },
      sample: () => ({
        forward: 0,
        strafe: 0,
        turn: 0,
        pitch: 0,
        sprint: false,
        jumpPressed: false,
        interactPressed: false,
        interactHeld: false,
        interactReleased: false,
        platePressed: false,
        stimulantPressed: false,
        navigationTogglePressed: false,
        navigationNextPressed: false,
        navigationPrevPressed: false,
        navigationFacePressed: false,
        weaponSlot: null,
        firePressed: false,
        fireHeld: false,
      }),
    };
    const services = new Map([
      ["input", baseInput],
      ["overlay-Manager-Stub", null],
      ["overlay-manager", {
        isOpen: () => false,
        toggle: (panel) => overlayToggles.push(panel),
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

    await setupGamepadInput(ctx);
    events.emit("network:welcome", { playerId: "player-1" });
    events.emit("game:snapshot", { entities: [currentEntity] });

    // 1. Hold Triangle (button 3) >= 380ms starts armor plating and fires immediate rumble so user can release
    buttons[3].pressed = true;
    buttons[3].value = 1;
    let sampled = baseInput.sample();
    assert.equal(sampled.platePressed, false, "Initial press at t=1000ms waits for hold threshold when armor can be plated");
    assert.equal(sampled.interactPressed, false);
    assert.equal(sampled.interactHeld, true);

    fakeNow += 400; // 400ms >= 380ms
    sampled = baseInput.sample();
    assert.equal(sampled.platePressed, true, "Holding Triangle >= 380ms triggers platePressed while still held");
    assert.equal(sampled.interactPressed, false, "Holding Triangle for armor does not misfire interactPressed");
    assert(rumbles.length >= 1, "Immediate gamepad rumble confirms armor plating started so player can release Triangle");

    // Releasing Triangle after armor hold does NOT trigger interactPressed
    buttons[3].pressed = false;
    buttons[3].value = 0;
    fakeNow += 30;
    sampled = baseInput.sample();
    assert.equal(sampled.interactPressed, false, "Releasing Triangle after armor hold does not trigger interact");
    assert.equal(sampled.interactReleased, true);

    // 2. Short tap on Triangle (< 380ms) triggers interactPressed on release
    buttons[3].pressed = true;
    buttons[3].value = 1;
    fakeNow += 50;
    sampled = baseInput.sample();
    assert.equal(sampled.interactPressed, false);

    buttons[3].pressed = false;
    buttons[3].value = 0;
    fakeNow += 120; // 120ms < 380ms
    sampled = baseInput.sample();
    assert.equal(sampled.interactPressed, true, "Short tap (<380ms) on Triangle triggers interactPressed");

    // 3. D-Pad Up (button 12), D-Pad Down (13), D-Pad Left (14), D-Pad Right (15), Square (2), R3 (11), Select (8), Start (9)
    buttons[12].pressed = true;
    buttons[13].pressed = true;
    buttons[14].pressed = true;
    buttons[15].pressed = true;
    buttons[2].pressed = true;
    buttons[11].pressed = true;
    buttons[8].pressed = true;
    buttons[9].pressed = true;
    fakeNow += 40;
    sampled = baseInput.sample();
    assert.equal(sampled.stimulantPressed, true, "D-Pad Up triggers stimulant / self-revive");
    assert.equal(sampled.navigationTogglePressed, true, "D-Pad Down toggles route guidance");
    assert.equal(sampled.navigationPrevPressed, true, "D-Pad Left selects previous navigation target");
    assert.equal(sampled.navigationNextPressed, true, "D-Pad Right selects next navigation target");
    assert.equal(sampled.jumpPressed, true, "Square triggers jump");
    assert.equal(sampled.navigationFacePressed, true, "R3 on ground auto-faces navigation target");
    assert.deepEqual(overlayToggles, ["map", "menu"], "Select toggles map and Start toggles menu");
  } finally {
    Object.assign(globalThis, {
      window: old.window,
      document: old.document,
      performance: old.performance,
    });
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      writable: true,
      value: old.navigator,
    });
  }
});

