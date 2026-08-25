import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  ENTITY_FIELDS,
  compactEntity,
  diffEntity,
  encodeInputRecord,
} from "../client/plugins/play-journal.js";

test("journal v2 entity layout includes height, armor inventory and world context", () => {
  assert.deepEqual(ENTITY_FIELDS, [
    "x", "y", "z", "angle", "alive", "health", "armor",
    "armorPlates", "armorPlateMax", "armorReserve", "armorReserveMax", "armorSatchel",
    "weapon", "ammo", "reserve", "weapons", "team", "location", "acousticZone",
  ]);

  const compact = compactEntity({
    x: 1.23456,
    y: 3.2,
    z: -4.56789,
    angle: 0.123456,
    alive: true,
    health: 90,
    armor: 25,
    armorPlates: 1,
    armorPlateMax: 3,
    armorReserve: 2,
    armorReserveMax: 5,
    armorSatchel: false,
    weapon: "pistol",
    ammo: 99,
    reserve: 400,
    weapons: ["pistol"],
    team: 1,
    location: "Склад, второй этаж",
    acousticZone: "warehouse-upper",
  });
  assert.deepEqual(compact, [
    1.235, 3.2, -4.568, 0.1235, 1, 90, 25,
    1, 3, 2, 5, 0,
    "pistol", 99, 400, ["pistol"], 1,
    "Склад, второй этаж", "warehouse-upper",
  ]);
});

test("journal snapshot delta stores only changed v2 entity fields", () => {
  const previous = [
    1, 3.2, 2, 0.5, 1, 100, 50,
    1, 3, 2, 5, 0,
    "pistol", 100, 400, ["pistol"], 1,
    "Склад, второй этаж", "warehouse-upper",
  ];
  const next = [
    1, 2.7, 2, 0.6, 1, 100, 50,
    1, 3, 2, 5, 0,
    "pistol", 99, 400, ["pistol"], 1,
    "Склад, лестница", "warehouse-stairs",
  ];
  const diff = diffEntity(previous, next);
  assert.equal(
    diff.mask,
    (1 << 1) | (1 << 3) | (1 << 13) | (1 << 17) | (1 << 18),
  );
  assert.deepEqual(diff.values, [2.7, 0.6, 99, "Склад, лестница", "warehouse-stairs"]);
});

test("journal input record keeps E and B impulses as well as combat controls", () => {
  assert.deepEqual(
    encodeInputRecord(1234, {
      forward: 1,
      strafe: -1,
      turn: 1,
      sprint: true,
      fireHeld: true,
      firePressed: true,
      reload: false,
      selectDelta: -1,
      interactPressed: true,
      platePressed: true,
    }),
    ["i", 1234, 1, -1, 1, 1, 1, 1, 0, -1, 1, 1],
  );
});

test("public play journal mirrors v2 source and documents the new controls", async () => {
  const source = await readFile(new URL("../client/plugins/play-journal.js", import.meta.url), "utf8");
  const publicCopy = await readFile(new URL("../public/client/plugins/play-journal.js", import.meta.url), "utf8");
  assert.equal(publicCopy, source);
  assert.match(source, /version: "2\.0\.0"/);
  assert.match(source, /\["EFJ", 2/);
  assert.match(source, /KeyE: 12/);
  assert.match(source, /KeyB: 13/);
  assert.match(source, /interactPressed/);
  assert.match(source, /platePressed/);
  assert.match(source, /"y"/);
  assert.match(source, /"armorReserve"/);
});
