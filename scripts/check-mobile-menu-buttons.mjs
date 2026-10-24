import assert from "node:assert/strict";
import { test } from "node:test";
import { EventBus } from "../public/client/core/event-bus.js";
import { readFileSync } from "node:fs";
import * as menusPlugin from "../public/client/plugins/accessible-menus.js";

function fakeBrowser() {
  const byId = new Map(), handlers = new Map();
  const doc = { activeElement: null, documentElement: { dataset: { touchMode: "gestures" } },
    querySelector(selector) { return selector === "main" ? page : selector === "#touch-controls" ? controls :
      selector === "#game-panel" ? panel : null; },
    createElement(tag) { return new FakeElement(tag); },
    addEventListener(type, fn) { (handlers.get(type) ?? handlers.set(type, []).get(type)).push(fn); },
    body: { append(node) { if (node.id) byId.set(node.id, node); } },
  };
  class FakeElement {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.listeners = new Map();
      this.attributes = new Map(); this.dataset = {}; this.hidden = false; this.isConnected = true; }
    set innerHTML(value) { this.innerMarkup = value;
      for (const match of value.matchAll(/id="([^"]+)"/g)) {
        this.children.push(new FakeElement(match[1].endsWith("list") ? "ul" : "button"));
        this.children.at(-1).id = match[1];
      }
    }
    querySelector(selector) {
      if (selector.startsWith("#")) return this.children.find(x => x.id === selector.slice(1)) ?? null;
      if (selector.startsWith("[data-menu-index")) {
        const index = selector.match(/"(\d+)"/)?.[1];
        return this.children.flatMap(li => li.children).find(x => x.dataset.menuIndex === index) ?? null;
      }
      return null;
    }
    addEventListener(type, fn) { (this.listeners.get(type) ?? this.listeners.set(type, []).get(type)).push(fn); }
    dispatch(type, event = {}) { for (const fn of this.listeners.get(type) ?? []) fn(event); }
    append(...nodes) { this.children.push(...nodes); }
    prepend(...nodes) { this.children.unshift(...nodes); }
    replaceChildren(...nodes) { this.children = [...nodes]; }
    setAttribute(name, value) { this.attributes.set(name, value); }
    closest() { return null; }
    focus() { doc.activeElement = this; this.dispatch("focus"); }
    click() { this.dispatch("click"); }
  }
  const page = new FakeElement("main"), controls = new FakeElement("div");
  const panel = new FakeElement("section"), originalFocus = new FakeElement("button");
  originalFocus.focus();
  return { doc, handlers, byId, panel, page, originalFocus };
}

test("game help documents real gesture thresholds and fullscreen menu controls", () => {
  const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  const css = readFileSync(new URL("../public/styles.css", import.meta.url), "utf8");
  const gesture = readFileSync(new URL("../public/client/plugins/iphone-gestures.js", import.meta.url), "utf8");
  for (const phrase of ["Управление жестами на iPhone", "26 пикселей", "125 пикселей",
    "два пальца", "тремя пальцами", "Продолжить игру", "Кнопки"]) {
    assert(html.includes(phrase), `Gesture instructions missing: ${phrase}`);
  }
  assert.match(gesture, /MOVE_DEAD_ZONE_PX = 26/);
  assert.match(gesture, /RUN_THRESHOLD_PX = 125/);
  assert.match(css, /#accessible-game-menu:not\(\[hidden\]\)[^{]*\{[^}]*position: fixed/s);
});

test("tap and VoiceOver-style click on native Continue game button actually closes menu", async () => {
  const old = { document: globalThis.document, window: globalThis.window, Element: globalThis.Element,
    requestAnimationFrame: globalThis.requestAnimationFrame };
  const browser = fakeBrowser();
  globalThis.document = browser.doc;
  globalThis.window = { addEventListener() {} };
  globalThis.Element = class {};
  globalThis.requestAnimationFrame = cb => { if (cb.name !== "pollGamepad") cb(); return 1; };
  let disabled=0,enabled=0,voice=[];
  const input={ sample(){return {}},disable(){disabled++},enable(){enabled++} };
  const network={connected:true,mode:"battle-royale",playerId:"human"};
  const social={friends:[],isFriend(){return false}};
  const services=new Map([["input",input],["network",network],["speech",{say(t){voice.push(t)}}],
    ["social-profile",social]]);
  const ctx={events:new EventBus(),services:{ get(id){return services.get(id)},provide(id,value){services.set(id,value)} }};
  try{
    await menusPlugin.setup(ctx);
    const menus=services.get("menus");
    menus.openMain();
    const ui=browser.byId.get("accessible-game-menu");
    assert.equal(ui.hidden,false);
    assert.equal(browser.page.inert,true);
    assert.equal(disabled,1);
    const list=ui.querySelector("#accessible-game-menu-list");
    const menuButtons=list.children.map(li=>li.children[0]);
    assert(menuButtons.length>=2);
    assert.equal(menuButtons[0].tagName,"BUTTON");
    assert.equal(menuButtons[0].textContent,"Продолжить игру");
    assert.equal(menuButtons[0].type,"button");
    menuButtons[0].click();
    assert.equal(menus.open,false);
    assert.equal(ui.hidden,true);
    assert.equal(browser.page.inert,false);
    assert.equal(enabled,1);
    assert.equal(browser.doc.activeElement,browser.originalFocus);

    menus.openMain();
    const friendButton=ui.querySelector("#accessible-game-menu-list").children
      .map(li=>li.children[0]).find(button=>button.textContent==="Друзья");
    friendButton.click();
    assert.equal(menus.screen,"friends", "nested menu actions must be clickable too");
    ui.querySelector("#accessible-game-menu-resume").click();
    assert.equal(menus.open,false);
    assert.equal(enabled,2);

    menus.openMain();
    const start={identifier:10,clientX:30,clientY:220};
    const end={identifier:10,clientX:155,clientY:230};
    let prevented=false;
    ui.dispatch("touchstart",{touches:[start],target:ui});
    ui.dispatch("touchend",{changedTouches:[end],preventDefault(){prevented=true}});
    assert.equal(menus.open,false, "right swipe on blank menu should resume gesture play");
    assert.equal(prevented,true);

    menus.openMap();
    const map=ui.querySelector("#accessible-game-menu-list").children[0].children[0];
    assert.equal(map.tagName,"BUTTON");
    assert.equal(map.textContent,"Нет доступных точек");
    ui.querySelector("#accessible-game-menu-resume").click();
    assert.equal(menus.open,false);
  } finally {
    Object.assign(globalThis,old);
  }
});
