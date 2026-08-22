import test from "node:test";
import assert from "node:assert/strict";
import {
  ENTITY_FIELDS,
  compactEntity,
  diffEntity,
  encodeInputRecord,
} from "../client/plugins/play-journal.js";

test("journal entity layout remains compact and documented", () => {
  assert.deepEqual(ENTITY_FIELDS, [
    "x", "z", "angle", "alive", "health", "armor",
    "weapon", "ammo", "reserve", "weapons", "team",
  ]);

  const compact = compactEntity({
    x: 1.23456,
    z: -4.56789,
    angle: 0.123456,
    alive: true,
    health: 90,
    armor: 25,
    weapon: "pistol",
    ammo: 99,
    reserve: 400,
    weapons: ["pistol"],
    team: 1,
  });
  assert.deepEqual(compact, [1.235, -4.568, 0.1235, 1, 90, 25, "pistol", 99, 400, ["pistol"], 1]);
});

test("journal snapshot delta stores only changed entity fields", () => {
  const previous = [1, 2, 0.5, 1, 100, 50, "pistol", 100, 400, ["pistol"], 1];
  const next = [1, 2.2, 0.6, 1, 100, 50, "pistol", 99, 400, ["pistol"], 1];
  const diff = diffEntity(previous, next);
  assert.equal(diff.mask, (1 << 1) | (1 << 2) | (1 << 7));
  assert.deepEqual(diff.values, [2.2, 0.6, 99]);
});

test("journal input record keeps millisecond timestamp and gameplay impulses", () => {
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
    }),
    ["i", 1234, 1, -1, 1, 1, 1, 1, 0, -1],
  );
});
