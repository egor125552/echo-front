import test from "node:test";
import assert from "node:assert/strict";
import { createEchoFrontGame } from "../src/server/game.js";

async function scenario(run) {
  const game = await createEchoFrontGame({ mode: "tdm" });
  const id = "pistol-armor-check-player";
  try {
    game.api.connectHuman(id);
    const components = game.host.components;
    const weapons = game.host.services.get("weapons");
    const armor = game.host.services.get("armor");
    const inventory = components.get(id, "Weapons");
    const pistol = inventory.items[inventory.selected];
    const state = components.get(id, "Armor");
    const now = Date.now() + 5000;
    await run({ game, id, components, weapons, armor, pistol, state, now });
  } finally {
    await game.host.stop();
  }
}

test("quick separate pistol taps fire faster than hold cadence while hold remains limited", () =>
  scenario(({ weapons, id, pistol, now }) => {
    const before = pistol.ammo;
    assert.equal(weapons.fire(id, now, { pressed: true }), true);
    assert.equal(weapons.fire(id, now + 30, { pressed: true }), true);
    assert.equal(pistol.ammo, before - 2);
    assert.equal(weapons.fire(id, now + 31), false);
    assert.equal(weapons.fire(id, now + 231), true);
  }));

test("empty pistol and rifle magazines reload automatically without creating bullets", () =>
  scenario(({ weapons, id, pistol, now, components }) => {
    pistol.ammo = 1;
    const reserve = pistol.reserve;
    assert.equal(weapons.fire(id, now, { pressed: true }), true);
    assert.equal(pistol.ammo, 0);
    assert(pistol.reloadUntil > now);
    assert.equal(weapons.fire(id, now + 40, { pressed: true }), false);
    weapons.tickAutomatic(now + 1300);
    assert.equal(pistol.ammo, 100);
    assert.equal(pistol.reserve, reserve - 100);
    const rifle = weapons.definitions.rifle;
    const inventory = components.get(id, "Weapons");
    inventory.items.push({ id: rifle.id, ammo: 1, reserve: 30, lastFireAt: -Infinity, reloadUntil: 0 });
    inventory.selected = inventory.items.length - 1;
    assert.equal(weapons.fire(id, now + 1400), true);
    weapons.tickAutomatic(now + 3000);
    assert.equal(inventory.items[inventory.selected].ammo, 30);
    assert.equal(inventory.items[inventory.selected].reserve, 0);
  }));

test("one armor command installs only available plates and does not stop movement", () =>
  scenario(({ game, id, armor, state, now, components }) => {
    const value = state.plateValue;
    state.current = 0;
    state.reserve = 2;
    game.api.handleInput(id, { platePressed: true, forward: 1 }, now);
    assert.equal(armor.isPlating(id), true);
    assert.equal(components.get(id, "Input").forward, 1);
    game.api.handleInput(id, { forward: 1 }, now + 200);
    assert.equal(armor.isPlating(id), true);
    armor.tick(now + 1100);
    assert.equal(state.current, value);
    assert.equal(armor.isPlating(id), true);
    armor.tick(now + 2200);
    assert.equal(state.current, value * 2);
    assert.equal(state.reserve, 0);
    assert.equal(armor.isPlating(id), false);
    armor.tick(now + 4000);
    assert.equal(state.current, value * 2);
  }));

test("firing during a plate sequence cancels it without spending remaining plates", () =>
  scenario(({ game, id, armor, state, now }) => {
    state.current = 0;
    state.reserve = 3;
    game.api.handleInput(id, { platePressed: true }, now);
    armor.tick(now + 1100);
    assert.equal(state.reserve, 2);
    game.api.handleInput(id, { firePressed: true }, now + 1200);
    assert.equal(armor.isPlating(id), false);
    armor.tick(now + 4000);
    assert.equal(state.reserve, 2);
  }));
