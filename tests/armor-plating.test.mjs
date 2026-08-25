import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { createEchoFrontGame } from "../src/server/game.js";
import {
  ARMOR_PLATE_VALUE,
  DEFAULT_MAX_PLATES,
  DEFAULT_RESERVE_PLATE_CAPACITY,
  SATCHEL_RESERVE_PLATE_CAPACITY,
  PLATING_DURATION_MS,
  plateCountForArmor,
} from "../src/plugins/armor/server.js";

test("battle royale starts with the classic two of three plates and an empty five-plate reserve", async () => {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  game.api.connectHuman("human-warzone-armor");

  const snapshot = game.api.snapshot().entities.find((entity) => entity.id === "human-warzone-armor");
  assert.equal(ARMOR_PLATE_VALUE, 50);
  assert.equal(DEFAULT_MAX_PLATES, 3);
  assert.equal(DEFAULT_RESERVE_PLATE_CAPACITY, 5);
  assert.equal(SATCHEL_RESERVE_PLATE_CAPACITY, 8);
  assert.equal(snapshot.armor, 100);
  assert.equal(snapshot.armorMax, 150);
  assert.equal(snapshot.armorPlates, 2);
  assert.equal(snapshot.armorPlateMax, 3);
  assert.equal(snapshot.armorReserve, 0);
  assert.equal(snapshot.armorReserveMax, 5);

  assert.equal(plateCountForArmor(150), 3);
  assert.equal(plateCountForArmor(101), 3);
  assert.equal(plateCountForArmor(100), 2);
  assert.equal(plateCountForArmor(50), 1);
  assert.equal(plateCountForArmor(0), 0);

  await game.host.stop();
});

test("plating consumes one carried plate only when installation completes", async () => {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  game.api.connectHuman("human-plating-sequence");

  const armor = game.host.components.get("human-plating-sequence", "Armor");
  const armorService = game.host.services.get("armor");
  armor.current = 50;
  assert.equal(armorService.grantPlates("human-plating-sequence", 2), 2);
  assert.equal(armorService.describe("human-plating-sequence").reservePlates, 2);
  game.drainEvents();

  assert.equal(armorService.startPlating("human-plating-sequence", 1000), true);
  let events = game.drainEvents();
  const started = events.find((packet) => packet.event === "armor:plating-started");
  assert.equal(started?.payload?.targetPlate, 2);
  assert.equal(started?.payload?.reservePlates, 2);

  armorService.tick(1000 + PLATING_DURATION_MS - 1);
  assert.equal(armor.current, 50);
  assert.equal(armorService.describe("human-plating-sequence").reservePlates, 2);
  assert.equal(armorService.isPlating("human-plating-sequence"), true);

  armorService.tick(1000 + PLATING_DURATION_MS);
  assert.equal(armor.current, 100);
  assert.equal(armorService.describe("human-plating-sequence").reservePlates, 1);
  assert.equal(armorService.isPlating("human-plating-sequence"), false);
  events = game.drainEvents();
  const secondPlate = events.find((packet) => packet.event === "armor:plating-completed");
  assert.equal(secondPlate?.payload?.plateNumber, 2);
  assert.equal(secondPlate?.payload?.reservePlates, 1);

  assert.equal(armorService.startPlating("human-plating-sequence", 3000), true);
  assert.equal(armorService.cancelPlating("human-plating-sequence", "test"), true);
  assert.equal(armor.current, 100);
  assert.equal(armorService.describe("human-plating-sequence").reservePlates, 1, "cancelled plating must not consume a plate");

  assert.equal(armorService.startPlating("human-plating-sequence", 4000), true);
  armorService.tick(4000 + PLATING_DURATION_MS);
  assert.equal(armor.current, 150);
  assert.equal(armorService.describe("human-plating-sequence").reservePlates, 0);
  assert.equal(armorService.startPlating("human-plating-sequence", 6000), false);

  await game.host.stop();
});

test("plate reserve caps at five normally and eight with an armor satchel", async () => {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  game.api.connectHuman("human-plate-capacity");
  const armorService = game.host.services.get("armor");

  assert.equal(armorService.grantPlates("human-plate-capacity", 20), 5);
  let state = armorService.describe("human-plate-capacity");
  assert.equal(state.reservePlates, 5);
  assert.equal(state.reserveCapacity, 5);
  assert.equal(state.hasSatchel, false);
  assert.equal(armorService.grantPlates("human-plate-capacity", 1), 0);

  assert.equal(armorService.grantSatchel("human-plate-capacity"), true);
  state = armorService.describe("human-plate-capacity");
  assert.equal(state.reserveCapacity, 8);
  assert.equal(state.hasSatchel, true);
  assert.equal(armorService.grantPlates("human-plate-capacity", 20), 3);
  state = armorService.describe("human-plate-capacity");
  assert.equal(state.reservePlates, 8);
  assert.equal(armorService.grantSatchel("human-plate-capacity"), false);

  await game.host.stop();
});

test("damage and movement cancel an in-progress armor plate without spending it", async () => {
  const game = await createEchoFrontGame();
  game.api.connectHuman("human-plating-cancel");

  const armor = game.host.components.get("human-plating-cancel", "Armor");
  const armorService = game.host.services.get("armor");
  const combat = game.host.services.get("combat");
  const protection = game.host.services.get("spawn-protection");
  protection.clear("human-plating-cancel");
  armor.current = 62.5;
  const initialReserve = armorService.describe("human-plating-cancel").reservePlates;

  assert.equal(armorService.startPlating("human-plating-cancel", 1000), true);
  assert.equal(armorService.isPlating("human-plating-cancel"), true);
  combat.damage("human-plating-cancel", 5, {
    attackerId: "test-attacker",
    weaponId: "pistol",
    now: 1100,
  });
  assert.equal(armorService.isPlating("human-plating-cancel"), false);
  assert.equal(armorService.describe("human-plating-cancel").reservePlates, initialReserve);

  armor.current = 62.5;
  game.api.handleInput("human-plating-cancel", { platePressed: true }, 2000);
  assert.equal(armorService.isPlating("human-plating-cancel"), true);
  game.api.handleInput("human-plating-cancel", { forward: 1 }, 2100);
  assert.equal(armorService.isPlating("human-plating-cancel"), false);
  assert.equal(armorService.describe("human-plating-cancel").reservePlates, initialReserve);

  await game.host.stop();
});

test("client maps the start cue and completion cues in strict plate order", async () => {
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
