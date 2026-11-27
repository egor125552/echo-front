import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { EventBus } from "../public/client/core/event-bus.js";
import * as playJournalPlugin from "../public/client/plugins/play-journal.js";
import * as iphoneGesturesPlugin from "../public/client/plugins/iphone-gestures.js";
import * as accessibleMenusPlugin from "../public/client/plugins/accessible-menus.js";

function createServiceRegistry() {
  const map = new Map();
  return {
    map,
    api: {
      provide(name, value) {
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

class FakeElement {
  constructor(tag = "div", { id = "", attrs = {} } = {}) {
    this.tagName = tag.toUpperCase();
    this.id = id;
    this.dataset = {};
    this.attributes = new Map(Object.entries(attrs));
    this.children = [];
    this.parentElement = null;
    this.hidden = false;
    this.open = false;
    this.inert = false;
    this.checked = false;
    this.disabled = false;
    this.value = "";
    this.scrollTop = 0;
    this.scrollHeight = 100;
    this.isConnected = true;
    this._textContent = "";
    this.textWrites = 0;
    this.listeners = new Map();
    this.focused = false;
    this.scrolledIntoView = false;
  }

  get textContent() {
    return this._textContent;
  }

  set textContent(val) {
    this.textWrites += 1;
    this._textContent = String(val ?? "");
  }

  set innerHTML(val) {
    this._innerHTML = String(val ?? "");
  }

  get innerHTML() {
    return this._innerHTML ?? "";
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  append(...nodes) {
    for (const node of nodes) {
      if (!node) continue;
      node.parentElement = this;
      this.children.push(node);
    }
  }

  prepend(...nodes) {
    for (const node of nodes.reverse()) {
      if (!node) continue;
      node.parentElement = this;
      this.children.unshift(node);
    }
  }

  replaceChildren(...nodes) {
    this.children = [];
    this.append(...nodes);
  }

  addEventListener(type, fn) {
    const list = this.listeners.get(type) ?? [];
    list.push(fn);
    this.listeners.set(type, list);
  }

  dispatch(type, event = {}) {
    const evt = {
      type,
      target: event.target ?? this,
      cancelable: event.cancelable ?? true,
      defaultPrevented: false,
      stoppedImmediate: false,
      preventDefault() { this.defaultPrevented = true; },
      stopImmediatePropagation() { this.stoppedImmediate = true; },
      ...event,
    };
    for (const fn of this.listeners.get(type) ?? []) {
      fn(evt);
    }
    return evt;
  }

  matchesSelector(selector) {
    const parts = selector.split(",").map((s) => s.trim()).filter(Boolean);
    return parts.some((part) => {
      if (part.startsWith("#")) return this.id === part.slice(1);
      if (part === "[contenteditable='true']") return this.getAttribute("contenteditable") === "true";
      if (part.startsWith("[data-menu-index=\"")) {
        const idx = part.slice(18, -2);
        return this.dataset.menuIndex === idx;
      }
      if (part.startsWith("[data-navigation-action=\"")) {
        const val = part.slice(25, -2);
        return this.dataset.navigationAction === val;
      }
      return this.tagName === part.toUpperCase();
    });
  }

  closest(selector) {
    let cur = this;
    while (cur) {
      if (cur.matchesSelector(selector)) return cur;
      cur = cur.parentElement;
    }
    return null;
  }

  querySelector(selector) {
    const all = this.querySelectorAll(selector);
    return all[0] ?? null;
  }

  querySelectorAll(selector) {
    const out = [];
    const visit = (node) => {
      for (const child of node.children) {
        if (child.matchesSelector(selector)) out.push(child);
        visit(child);
      }
    };
    visit(this);
    return out;
  }

  focus() {
    this.focused = true;
  }

  scrollIntoView() {
    this.scrolledIntoView = true;
  }
}

test("index.html removes live-region spam attributes and binds checkbox labels explicitly", () => {
  const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  assert.match(html, /<label class="setting-row" for="speech-enabled">/);
  assert.match(html, /<label class="setting-row" for="journal-enabled">/);
  assert.match(html, /<p id="journal-status">Журнал включён\.<\/p>/);
  assert.match(html, /<p id="enemy-ai-status"><\/p>/);
  assert.doesNotMatch(html, /id="journal-status"[^>]*(aria-live|role="status")/);
  assert.doesNotMatch(html, /id="enemy-ai-status"[^>]*(aria-live|role="status")/);
});

test("styles.css hides buried panels behind fullscreen gesture mode and disables scroll hijack in menus", () => {
  const css = readFileSync(new URL("../public/styles.css", import.meta.url), "utf8");
  assert.match(
    css,
    /html\[data-touch-mode="gestures"\]\[data-game-active="true"\]\s+main\s*>\s*:not\(#game-panel\):not\(#announcer\):not\(#speech-status\)\s*\{\s*display:\s*none\s*!important;/,
  );
  assert.match(
    css,
    /html\[data-touch-mode="gestures"\]\[data-game-active="true"\]\s+#accessible-game-menu:not\(\[hidden\]\)[\s\S]*?z-index:\s*50;[\s\S]*?touch-action:\s*none;/,
  );
});

test("play-journal does not churn DOM status or textarea while panel is closed, and flushes on open", async () => {
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  const prevStorage = globalThis.localStorage;
  const prevInterval = globalThis.setInterval;
  const prevClearInterval = globalThis.clearInterval;

  const elements = new Map();
  const makeEl = (tag, id) => {
    const el = new FakeElement(tag, { id });
    elements.set(`#${id}`, el);
    return el;
  };

  const technicalTools = makeEl("details", "technical-tools");
  const journalPanel = makeEl("details", "journal-panel");
  const enabledInput = makeEl("input", "journal-enabled");
  const formatSelect = makeEl("select", "journal-format");
  const textView = makeEl("textarea", "journal-text-view");
  const copyButton = makeEl("button", "journal-copy");
  const copyStatus = makeEl("p", "journal-copy-status");
  const downloadButton = makeEl("button", "journal-download");
  const downloadFallback = makeEl("div", "journal-download-fallback");
  const clearButton = makeEl("button", "journal-clear");
  const status = makeEl("p", "journal-status");
  technicalTools.open = false;
  journalPanel.open = false;

  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
  };
  globalThis.document = {
    querySelector: (sel) => elements.get(sel) ?? null,
    getElementById: (id) => elements.get(`#${id}`) ?? null,
    addEventListener: () => {},
  };
  globalThis.window = { addEventListener: () => {} };
  const intervals = [];
  globalThis.setInterval = (fn) => { intervals.push(fn); return intervals.length; };
  globalThis.clearInterval = () => {};

  try {
    const events = new EventBus();
    const services = createServiceRegistry();
    services.api.provide("network", {
      connected: true,
      mode: "battle-royale",
      room: "br-test",
      playerId: "p1",
      send: () => true,
    });

    await playJournalPlugin.setup({ events, services: services.api });
    const initialWrites = status.textWrites;
    const initialText = textView.value;

    for (let i = 0; i < 40; i += 1) {
      events.emit("game:event", {
        event: "weapon:selected",
        payload: { entityId: "p1", weaponId: "rifle" },
      });
    }

    assert.equal(status.textWrites, initialWrites, "closed journal must not write #journal-status");
    assert.equal(textView.value, initialText, "closed journal must not rewrite #journal-text-view");

    technicalTools.open = true;
    journalPanel.open = true;
    journalPanel.dispatch("toggle");

    assert.ok(status.textWrites > initialWrites, "opening journal flushes status");
    assert.match(status.textContent, /Событий в тексте:\s*40/);
    assert.match(textView.value, /Выбрано оружие/);
  } finally {
    globalThis.document = prevDoc;
    globalThis.window = prevWin;
    globalThis.localStorage = prevStorage;
    globalThis.setInterval = prevInterval;
    globalThis.clearInterval = prevClearInterval;
  }
});

test("iphone-gestures ignores touches on checkbox labels and settings panels even in active gesture mode", async () => {
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  const prevElement = globalThis.Element;

  const docListeners = new Map();
  const gamePanel = new FakeElement("section", { id: "game-panel" });
  gamePanel.hidden = false;
  const settingsPanel = new FakeElement("details", { id: "settings-panel" });
  const label = new FakeElement("label");
  const span = new FakeElement("span");
  const checkbox = new FakeElement("input", { id: "speech-enabled" });
  label.append(span, checkbox);
  settingsPanel.append(label);

  globalThis.Element = FakeElement;
  globalThis.document = {
    hidden: false,
    getElementById: (id) => (id === "game-panel" ? gamePanel : null),
    addEventListener: (type, fn) => {
      const list = docListeners.get(type) ?? [];
      list.push(fn);
      docListeners.set(type, list);
    },
  };
  globalThis.window = { addEventListener: () => {} };

  try {
    const events = new EventBus();
    const services = createServiceRegistry();
    services.api.provide("input", {
      setVirtualControl: () => true,
      clearVirtualMovement: () => {},
      triggerVirtualAction: () => true,
    });
    services.api.provide("touch-control-settings", { mode: "gestures" });

    await iphoneGesturesPlugin.setup({ events, services: services.api });

    const fireTouchStart = (target) => {
      let prevented = false;
      const evt = {
        target,
        cancelable: true,
        changedTouches: [{ identifier: 1, clientX: 50, clientY: 50, target }],
        touches: [{ identifier: 1, clientX: 50, clientY: 50, target }],
        preventDefault() { prevented = true; },
      };
      for (const fn of docListeners.get("touchstart") ?? []) fn(evt);
      return prevented;
    };

    assert.equal(fireTouchStart(span), false, "tapping label span in settings must NOT be prevented");
    assert.equal(fireTouchStart(label), false, "tapping label in settings must NOT be prevented");
    assert.equal(fireTouchStart(settingsPanel), false, "tapping settings panel must NOT be prevented");
    assert.equal(fireTouchStart(gamePanel), true, "tapping game-panel still captures gesture");
  } finally {
    globalThis.document = prevDoc;
    globalThis.window = prevWin;
    globalThis.Element = prevElement;
  }
});

test("accessible-menus supports full-surface swipes over menu buttons, in-menu settings, and does not swallow Enter on settings controls", async () => {
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  const prevElement = globalThis.Element;
  const prevRAF = globalThis.requestAnimationFrame;

  const winListeners = new Map();
  const docListeners = new Map();
  const body = new FakeElement("body");
  const main = new FakeElement("main");
  const gamePanel = new FakeElement("section", { id: "game-panel" });
  gamePanel.hidden = false;
  const settingsPanel = new FakeElement("details", { id: "settings-panel" });
  const settingsSummary = new FakeElement("summary");
  const speechCheckbox = new FakeElement("input", { id: "speech-enabled" });
  speechCheckbox.checked = true;
  settingsPanel.append(settingsSummary, speechCheckbox);
  main.append(gamePanel, settingsPanel);
  body.append(main);

  // When createMenuUi sets section.innerHTML, populate child nodes dynamically.
  const menuTitle = new FakeElement("h2", { id: "accessible-game-menu-title" });
  const menuResume = new FakeElement("button", { id: "accessible-game-menu-resume" });
  const menuList = new FakeElement("ul", { id: "accessible-game-menu-list" });
  const menuStatus = new FakeElement("p", { id: "accessible-game-menu-status" });

  let createdMenuSection = null;
  const documentElement = { dataset: { touchMode: "gestures", gameActive: "true" } };

  globalThis.Element = FakeElement;
  globalThis.requestAnimationFrame = () => 1;
  globalThis.document = {
    documentElement,
    body,
    activeElement: null,
    createElement(tag) {
      const el = new FakeElement(tag);
      if (tag === "section") {
        const origAppend = body.append.bind(body);
        el.querySelector = (sel) => {
          if (sel === "#accessible-game-menu-title") return menuTitle;
          if (sel === "#accessible-game-menu-list") return menuList;
          if (sel === "#accessible-game-menu-resume") return menuResume;
          if (sel === "#accessible-game-menu-status") return menuStatus;
          return FakeElement.prototype.querySelector.call(el, sel);
        };
        createdMenuSection = el;
      }
      return el;
    },
    querySelector(sel) {
      if (sel === "main") return main;
      if (sel === "#game-panel") return gamePanel;
      if (sel === "#speech-enabled") return speechCheckbox;
      if (sel === "#touch-controls") return null;
      return null;
    },
    getElementById(id) {
      if (id === "accessible-game-menu") return createdMenuSection;
      if (id === "game-panel") return gamePanel;
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

  try {
    const events = new EventBus();
    const services = createServiceRegistry();
    let speechEnabled = true;
    let speechRate = 1.7;
    const spoken = [];
    let hapticsEnabled = true;
    let hapticsIntensity = 1;
    let touchMode = "gestures";

    services.api.provide("input", {
      enable: () => {},
      disable: () => {},
      sample: () => ({}),
    });
    services.api.provide("network", {
      connected: true,
      mode: "battle-royale",
      playerId: "p1",
      enemyAiMode: "standard",
      setEnemyAiMode: (m) => m,
    });
    services.api.provide("speech", {
      get enabled() { return speechEnabled; },
      get rate() { return speechRate; },
      setEnabled(next) {
        speechEnabled = Boolean(next);
        speechCheckbox.checked = speechEnabled;
        return speechEnabled;
      },
      setRate(next) {
        speechRate = next;
        return speechRate;
      },
      say(text) {
        if (speechEnabled) spoken.push(text);
      },
    });
    services.api.provide("social-profile", {
      friends: [],
      isFriend: () => false,
      addFriend: async () => true,
      removeFriend: async () => true,
    });
    services.api.provide("haptic-feedback", {
      get enabled() { return hapticsEnabled; },
      get intensity() { return hapticsIntensity; },
      setEnabled(v) { hapticsEnabled = Boolean(v); },
      setIntensity(v) { hapticsIntensity = v; },
      test() {},
    });
    services.api.provide("touch-control-settings", {
      get mode() { return touchMode; },
      setMode(v) {
        touchMode = v;
        documentElement.dataset.touchMode = v;
      },
    });

    await accessibleMenusPlugin.setup({ events, services: services.api });
    const menus = services.api.get("menus");

    // 1. Pressing Enter on #settings-panel summary while game is active must NOT be swallowed
    let enterPrevented = false;
    for (const fn of winListeners.get("keydown") ?? []) {
      fn({
        code: "Enter",
        target: settingsSummary,
        preventDefault() { enterPrevented = true; },
        stopImmediatePropagation() { enterPrevented = true; },
      });
    }
    assert.equal(enterPrevented, false, "Enter on settings summary must not be swallowed");

    // 2. Open Main Menu -> modal sets inert AND aria-hidden on main
    menus.openMain();
    assert.equal(menus.open, true);
    assert.equal(main.inert, true);
    assert.equal(main.getAttribute("aria-hidden"), "true");

    const mainButtons = () => menuList.querySelectorAll("button");
    const labels = mainButtons().map((b) => b.textContent);
    assert.ok(labels.includes("Карта"), "Main menu includes Карта in battle-royale");
    assert.ok(labels.includes("Настройки звука и управления"), "Main menu includes Настройки звука и управления");
    assert.equal(mainButtons()[0].getAttribute("aria-current"), "true");

    // Helper for 1-finger swipe starting directly on a menu button
    const swipeOn = (target, x1, y1, x2, y2) => {
      createdMenuSection.dispatch("touchstart", {
        target,
        touches: [{ identifier: 7, clientX: x1, clientY: y1 }],
      });
      createdMenuSection.dispatch("touchmove", {
        target,
        touches: [{ identifier: 7, clientX: x2, clientY: y2 }],
      });
      createdMenuSection.dispatch("touchend", {
        target,
        changedTouches: [{ identifier: 7, clientX: x2, clientY: y2 }],
      });
    };

    // 3. Swipe DOWN directly over button 0 -> selects index 1 (Карта), and suppresses follow-up synthetic click
    swipeOn(mainButtons()[0], 120, 200, 120, 280);
    assert.equal(mainButtons()[1].getAttribute("aria-current"), "true");
    assert.equal(mainButtons()[1].textContent, "Карта");
    // Synthetic click right after swipe must be ignored
    mainButtons()[0].dispatch("click");
    assert.equal(menus.open, true, "suppressed click on item 0 must not close menu");

    // 4. Swipe UP over button 1 -> returns to index 0
    swipeOn(mainButtons()[1], 120, 280, 120, 200);
    assert.equal(mainButtons()[0].getAttribute("aria-current"), "true");

    // 5. Swipe DOWN to "Настройки звука и управления" and short-tap on ANY button -> opens settings screen
    const settingsIdx = mainButtons().findIndex((b) => b.textContent === "Настройки звука и управления");
    assert.ok(settingsIdx > 0);
    for (let step = 0; step < settingsIdx; step += 1) {
      swipeOn(mainButtons()[0], 120, 200, 120, 280);
    }
    assert.equal(mainButtons()[settingsIdx].getAttribute("aria-current"), "true");

    // Tap directly on button 0 (different button under finger) -> must activate currently selected item (Settings)!
    createdMenuSection.dispatch("touchstart", {
      target: mainButtons()[0],
      touches: [{ identifier: 9, clientX: 120, clientY: 200 }],
    });
    createdMenuSection.dispatch("touchend", {
      target: mainButtons()[0],
      changedTouches: [{ identifier: 9, clientX: 122, clientY: 201 }],
    });
    assert.equal(menus.screen, "settings");
    assert.match(mainButtons()[0].textContent, /Игровая озвучка: включена/);

    // 6. Tap to toggle "Игровая озвучка" -> syncs speech service AND #speech-enabled checkbox
    createdMenuSection.dispatch("touchstart", {
      target: mainButtons()[0],
      touches: [{ identifier: 10, clientX: 120, clientY: 200 }],
    });
    createdMenuSection.dispatch("touchend", {
      target: mainButtons()[0],
      changedTouches: [{ identifier: 10, clientX: 120, clientY: 200 }],
    });
    assert.equal(speechEnabled, false);
    assert.equal(speechCheckbox.checked, false);
    assert.match(mainButtons()[0].textContent, /Игровая озвучка: выключена/);

    // 7. Swipe LEFT -> goes back to Main Menu
    swipeOn(mainButtons()[0], 200, 200, 100, 200);
    assert.equal(menus.screen, "main");

    // 8. Swipe RIGHT -> closes menu and clears inert & aria-hidden
    swipeOn(mainButtons()[0], 100, 200, 220, 200);
    assert.equal(menus.open, false);
    assert.equal(main.inert, false);
    assert.equal(main.getAttribute("aria-hidden"), null);
  } finally {
    globalThis.document = prevDoc;
    globalThis.window = prevWin;
    globalThis.Element = prevElement;
    globalThis.requestAnimationFrame = prevRAF;
  }
});
