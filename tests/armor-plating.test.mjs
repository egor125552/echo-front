import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { createEchoFrontGame } from "../src/server/game.js";
import {
  ARMOR_PLATE_VALUE,
  PLATING_DURATION_MS,
  plateCountForArmor,
} from "../src/plugins/armor/server.js";

test("player keeps 125 total armor split into four plates", async () => {
  const game = await createEchoFrontGame();
  game.api.connectHuman("human-four-plates");

  const snapshot = game.api.snapshot().entities.find((entity) => entity.id === "human-four-plates");
  assert.equal(ARMOR_PLATE_VALUE, 31.25);
  assert.equal(snapshot.armor, 125);
  assert.equal(snapshot.armorMax, 125);
  assert.equal(snapshot.armorPlates, 4);
  assert.equal(snapshot.armorPlateMax, 4);

  assert.equal(plateCountForArmor(125), 4);
  assert.equal(plateCountForArmor(103), 4);
  assert.equal(plateCountForArmor(81), 3);
  assert.equal(plateCountForArmor(62.5), 2);
  assert.equal(plateCountForArmor(31.25), 1);
  assert.equal(plateCountForArmor(0), 0);

  await game.host.stop();
});

test("plating adds exactly one plate and emits the matching sequential plate number", async () => {
  const game = await createEchoFrontGame();
  game.api.connectHuman("human-plating-sequence");

  const armor = game.host.components.get("human-plating-sequence", "Armor");
  const armorService = game.host.services.get("armor");
  armor.current = 62.5;
  game.drainEvents();

  assert.equal(armorService.startPlating("human-plating-sequence", 1000), true);
  let events = game.drainEvents();
  const started = events.find((packet) => packet.event === "armor:plating-started");
  assert.equal(started?.payload?.targetPlate, 3);

  armorService.tick(1000 + PLATING_DURATION_MS - 1);
  assert.equal(armor.current, 62.5);
  assert.equal(armorService.isPlating("human-plating-sequence"), true);

  armorService.tick(1000 + PLATING_DURATION_MS);
  assert.equal(armor.current, 93.75);
  assert.equal(armorService.isPlating("human-plating-sequence"), false);
  events = game.drainEvents();
  const thirdPlate = events.find((packet) => packet.event === "armor:plating-completed");
  assert.equal(thirdPlate?.payload?.plateNumber, 3);

  assert.equal(armorService.startPlating("human-plating-sequence", 3000), true);
  armorService.tick(3000 + PLATING_DURATION_MS);
  assert.equal(armor.current, 125);
  events = game.drainEvents();
  const fourthPlate = events.find((packet) => packet.event === "armor:plating-completed");
  assert.equal(fourthPlate?.payload?.plateNumber, 4);
  assert.equal(armorService.startPlating("human-plating-sequence", 5000), false);

  await game.host.stop();
});

test("damage and movement cancel an in-progress armor plate", async () => {
  const game = await createEchoFrontGame();
  game.api.connectHuman("human-plating-cancel");

  const armor = game.host.components.get("human-plating-cancel", "Armor");
  const armorService = game.host.services.get("armor");
  const combat = game.host.services.get("combat");
  const protection = game.host.services.get("spawn-protection");
  protection.clear("human-plating-cancel");
  armor.current = 62.5;

  assert.equal(armorService.startPlating("human-plating-cancel", 1000), true);
  assert.equal(armorService.isPlating("human-plating-cancel"), true);
  combat.damage("human-plating-cancel", 5, {
    attackerId: "test-attacker",
    weaponId: "pistol",
    now: 1100,
  });
  assert.equal(armorService.isPlating("human-plating-cancel"), false);

  armor.current = 62.5;
  game.api.handleInput("human-plating-cancel", { platePressed: true }, 2000);
  assert.equal(armorService.isPlating("human-plating-cancel"), true);
  game.api.handleInput("human-plating-cancel", { forward: 1 }, 2100);
  assert.equal(armorService.isPlating("human-plating-cancel"), false);

  await game.host.stop();
});

test("client maps the start cue and four completion cues in strict plate order", async () => {
  const source = await readFile(new URL("../client/plugins/armor-plating-audio.js", import.meta.url), "utf8");
  const publicSource = await readFile(new URL("../public/client/plugins/armor-plating-audio.js", import.meta.url), "utf8");
  const preset = await readFile(new URL("../client/presets/echo-front.js", import.meta.url), "utf8");
  const publicPreset = await readFile(new URL("../public/client/presets/echo-front.js", import.meta.url), "utf8");

  assert.equal(publicSource, source);
  assert.equal(publicPreset, preset);
  assert.match(preset, /armorPlatingAudio/);
  assert.match(source, /plate-insert-start\.mp3/);
  assert.match(source, /1: "\/assets\/audio\/armor-plating\/plate-install-1\.mp3"/);
  assert.match(source, /2: "\/assets\/audio\/armor-plating\/plate-install-2\.mp3"/);
  assert.match(source, /3: "\/assets\/audio\/armor-plating\/plate-install-3\.mp3"/);
  assert.match(source, /4: "\/assets\/audio\/armor-plating\/plate-install-heavy\.mp3"/);
});

test("armor plating assets and accessible controls are present", async () => {
  const assets = [
    "plate-insert-start.mp3",
    "plate-install-1.mp3",
    "plate-install-2.mp3",
    "plate-install-3.mp3",
    "plate-install-heavy.mp3",
  ];

  for (const name of assets) {
    const info = await stat(new URL(`../public/assets/audio/armor-plating/${name}`, import.meta.url));
    assert.equal(info.isFile(), true);
    assert.ok(info.size > 0);
  }

  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const input = await readFile(new URL("../client/plugins/input.js", import.meta.url), "utf8");
  const publicInput = await readFile(new URL("../public/client/plugins/input.js", import.meta.url), "utf8");

  assert.equal(publicInput, input);
  assert.match(input, /"KeyB"/);
  assert.match(input, /armor-plate/);
  assert.match(html, /B — поставить одну бронепластину/);
  assert.match(html, /data-touch-action="armor-plate"/);
  assert.match(html, />Поставить бронепластину</);
});
