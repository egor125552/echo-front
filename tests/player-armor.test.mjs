import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createEchoFrontGame } from "../src/server/game.js";

test("a hit that breaks player armor does not spill damage into health", async () => {
  const game = await createEchoFrontGame();
  game.api.connectHuman("human-armor-gate");

  const combat = game.host.services.get("combat");
  const protection = game.host.services.get("spawn-protection");
  protection.clear("human-armor-gate");

  const armor = game.host.components.get("human-armor-gate", "Armor");
  const health = game.host.components.get("human-armor-gate", "Health");
  assert.ok(armor);
  assert.ok(health);

  armor.current = 10;
  health.current = 100;

  const defenderFeedback = [];
  const off = game.host.events.on("feedback:sound", (payload) => {
    if (payload.recipientId === "human-armor-gate") defenderFeedback.push(payload.key);
  });

  const breakingHit = combat.damage("human-armor-gate", 28, {
    attackerId: "attacker",
    weaponId: "pistol",
    now: 1000,
  });

  assert.equal(armor.current, 0);
  assert.equal(health.current, 100, "the armor-breaking hit must not spill into health");
  assert.equal(breakingHit.healthApplied ?? breakingHit.applied, 0);
  assert.equal(breakingHit.armorBroke, true);
  assert.ok(defenderFeedback.some((key) => key === "armor.hit1" || key === "armor.hit2"));
  assert.ok(defenderFeedback.includes("armor.self-break"));
  assert.equal(defenderFeedback.includes("hit.player"), false);

  defenderFeedback.length = 0;
  const healthHit = combat.damage("human-armor-gate", 28, {
    attackerId: "attacker",
    weaponId: "pistol",
    now: 1100,
  });

  assert.equal(health.current, 72);
  assert.equal(healthHit.applied, 28);
  assert.ok(defenderFeedback.includes("hit.player"));
  assert.equal(defenderFeedback.includes("armor.self-break"), false);

  off();
  await game.host.stop();
});

test("player armor break audio and speech are mirrored to the public client", async () => {
  const sourceSound = await readFile(new URL("../client/plugins/core-sound-pack.js", import.meta.url), "utf8");
  const publicSound = await readFile(new URL("../public/client/plugins/core-sound-pack.js", import.meta.url), "utf8");
  const sourceAnnouncer = await readFile(new URL("../client/plugins/announcer.js", import.meta.url), "utf8");
  const publicAnnouncer = await readFile(new URL("../public/client/plugins/announcer.js", import.meta.url), "utf8");

  assert.equal(publicSound, sourceSound);
  assert.equal(publicAnnouncer, sourceAnnouncer);
  assert.match(sourceSound, /"armor\.self-break": "\/assets\/audio\/core\/armor-break\.mp3"/);
  assert.match(sourceAnnouncer, /armor\.self-break/);
  assert.match(sourceAnnouncer, /Ваша броня разбита/);
});
