import assert from "node:assert/strict";
import { test } from "node:test";
import { createEchoFrontGame } from "../src/server/game.js";
import { EventBus } from "../public/client/core/event-bus.js";
import { setup as setupJournal } from "../public/client/plugins/play-journal.js";

test("TDM tutorial grants and trains Marksman rifle and Sniper rifle before receive-hit", async () => {
  const game = await createEchoFrontGame({ mode: "tdm", tutorial: true });
  try {
    const playerId = "tutorial-weapons-human";
    game.api.connectHuman(playerId, { name: "Курсант" });
    const tutorial = game.host.services.get("tutorial-session");
    const weapons = game.host.services.get("weapons");
    const entities = game.host.services.get("entities");
    const teams = game.host.services.get("teams");
    assert(tutorial, "tutorial-session service must exist");

    const now = Date.now();
    // Advance movement and fire phases cleanly
    const enemy = teams.enemiesOf(playerId).find((e) => e.bot);
    assert(enemy, "tutorial enemy bot must exist");

    // Walk through move-forward -> strafe -> sprint -> fire -> hit-enemy -> eliminate-enemy -> reload
    tutorial.handleInput(playerId, { forward: 1 }, now);
    const t = game.host.components.get(playerId, "Transform");
    t.x += 6;
    tutorial.tick(playerId, now + 100);
    assert.equal(tutorial.describe(playerId).phase, "strafe");

    tutorial.handleInput(playerId, { strafe: 1 }, now + 200);
    t.z += 4;
    tutorial.tick(playerId, now + 300);
    assert.equal(tutorial.describe(playerId).phase, "sprint");

    tutorial.handleInput(playerId, { forward: 1, sprint: true }, now + 400);
    t.x += 12;
    tutorial.tick(playerId, now + 500);
    assert.equal(tutorial.describe(playerId).phase, "fire");

    tutorial.handleInput(playerId, { firePressed: true }, now + 600);
    assert.equal(tutorial.describe(playerId).phase, "hit-enemy");

    game.host.events.emit("combat:damage", {
      attackerId: playerId,
      targetId: enemy.id,
      healthApplied: 22,
      now: now + 700,
    });
    assert.equal(tutorial.describe(playerId).phase, "eliminate-enemy");

    game.host.events.emit("entity:died", {
      entityId: enemy.id,
      killerId: playerId,
      now: now + 800,
    });
    assert.equal(tutorial.describe(playerId).phase, "reload");

    // Pressing reload grants Marksman rifle and advances to select-marksman
    tutorial.handleInput(playerId, { reload: true }, now + 900);
    assert.equal(tutorial.describe(playerId).phase, "select-marksman");
    assert.equal(weapons.has(playerId, "marksman"), true, "marksman rifle must be granted");

    // Select marksman rifle
    const inv = game.host.components.get(playerId, "Weapons");
    const marksmanIdx = inv.items.findIndex((item) => item.id === "marksman");
    assert(marksmanIdx >= 0, "marksman must be in inventory");
    weapons.select(playerId, marksmanIdx - inv.selected);
    assert.equal(tutorial.describe(playerId).phase, "fire-marksman");

    // Fire marksman rifle -> grants sniper and advances to select-sniper
    const firedMarksman = weapons.fire(playerId, now + 1500, { pressed: true });
    assert.equal(firedMarksman, true, "marksman rifle must fire");
    assert.equal(tutorial.describe(playerId).phase, "select-sniper");
    assert.equal(weapons.has(playerId, "sniper"), true, "sniper rifle must be granted");

    // Select sniper rifle
    const sniperIdx = inv.items.findIndex((item) => item.id === "sniper");
    assert(sniperIdx >= 0, "sniper must be in inventory");
    weapons.select(playerId, sniperIdx - inv.selected);
    assert.equal(tutorial.describe(playerId).phase, "fire-sniper");

    // Fire sniper rifle -> advances to receive-hit
    const firedSniper = weapons.fire(playerId, now + 2200, { pressed: true });
    assert.equal(firedSniper, true, "sniper rifle must fire");
    assert.equal(tutorial.describe(playerId).phase, "receive-hit");
    assert(entities.get(playerId)?.alive, "player remains alive");
  } finally {
    await game.host.stop();
  }
});

test("journal copy and download buttons are enabled immediately and work synchronously even without Clipboard API", async () => {
  const originals = {
    document: globalThis.document,
    localStorage: globalThis.localStorage,
    navigator: globalThis.navigator,
    setInterval: globalThis.setInterval,
    createObjectURL: URL.createObjectURL,
    revokeObjectURL: URL.revokeObjectURL,
  };

  let execCopyCalled = 0;
  let downloadedName = "";
  let downloadedBlob = null;

  const makeEl = (extra = {}) => ({
    disabled: true,
    checked: true,
    hidden: true,
    value: "",
    textContent: "",
    style: {},
    listeners: new Map(),
    children: [],
    addEventListener(type, fn) { this.listeners.set(type, fn); },
    setAttribute() {},
    append(child) { this.children.push(child); },
    focus() {},
    select() {},
    setSelectionRange() {},
    remove() {},
    click() { downloadedName = this.download || downloadedName; },
    ...extra,
  });

  const elements = {
    "#journal-enabled": makeEl({ checked: true }),
    "#journal-format": makeEl({ value: "text" }),
    "#journal-text-view": makeEl({ value: "" }),
    "#journal-copy": makeEl({ disabled: true }),
    "#journal-copy-status": makeEl(),
    "#journal-download": makeEl({ disabled: true }),
    "#journal-download-fallback": makeEl({ hidden: true }),
    "#journal-clear": makeEl(),
    "#journal-status": makeEl(),
  };

  globalThis.document = {
    querySelector: (selector) => elements[selector] ?? null,
    createElement: (tag) => makeEl({ tag }),
    execCommand: (cmd) => {
      if (cmd === "copy") {
        execCopyCalled += 1;
        return true;
      }
      return false;
    },
    body: { append() {} },
  };
  globalThis.localStorage = { getItem: () => "true", setItem() {} };
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      clipboard: {
        writeText: async () => { throw new Error("NotAllowedError"); },
      },
    },
  });
  globalThis.setInterval = () => 1;
  URL.createObjectURL = (blob) => { downloadedBlob = blob; return "blob:test-journal"; };
  URL.revokeObjectURL = () => {};

  try {
    const events = new EventBus();
    const services = new Map([["network", { connected: false, send: () => false }]]);
    await setupJournal({
      events,
      services: {
        get: (name) => services.get(name),
        provide: (name, value) => services.set(name, value),
      },
    });

    // Immediately after startup (even before joining a match), both buttons MUST be clickable!
    assert.equal(elements["#journal-copy"].disabled, false, "copy button must be enabled immediately");
    assert.equal(elements["#journal-download"].disabled, false, "download button must be enabled immediately");

    const journal = services.get("play-journal");
    const copied = await journal.copyText();
    assert.equal(copied, true, "synchronous copy fallback must succeed when Clipboard API rejects");
    assert.equal(execCopyCalled, 1);
    assert.match(elements["#journal-copy-status"].textContent, /скопирован/i);

    await journal.download();
    assert(downloadedBlob, "download blob must be created");
    assert.match(downloadedName, /\.txt$/);
    assert.equal(elements["#journal-download-fallback"].hidden, false, "manual fallback link must appear");
    assert.match(elements["#journal-status"].textContent, /скачивание/i);
  } finally {
    globalThis.document = originals.document;
    globalThis.localStorage = originals.localStorage;
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: originals.navigator });
    globalThis.setInterval = originals.setInterval;
    URL.createObjectURL = originals.createObjectURL;
    URL.revokeObjectURL = originals.revokeObjectURL;
  }
});
