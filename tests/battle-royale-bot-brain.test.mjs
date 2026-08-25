import test from "node:test";
import assert from "node:assert/strict";
import {
  botPersonality,
  chooseUtilityDecision,
} from "../src/plugins/battle-royale-bot-brain/server.js";

function enemy(id, distance, health = 200, armor = 100) {
  return {
    entityId: id,
    distance,
    transform: { x: distance, y: 0, z: 0 },
    health,
    healthMax: 200,
    armor,
    armorMax: 150,
  };
}

test("healthy aggressive bot accepts a favorable single fight", () => {
  const decision = chooseUtilityDecision({
    profile: {
      aggression: 0.9,
      caution: 0.3,
      curiosity: 0.5,
      persistence: 0.7,
      preferredRange: 10,
      flankBias: 0.8,
    },
    ownDurability: 0.92,
    visibleEnemies: [enemy("wounded", 9, 70, 0)],
  });

  assert.equal(decision.goal, "engage");
  assert.equal(decision.target.entityId, "wounded");
  assert.ok(["flank", "press", "space"].includes(decision.tactic));
});

test("hurt cautious bot refuses an outnumbered fight instead of suiciding", () => {
  const decision = chooseUtilityDecision({
    profile: {
      aggression: 0.3,
      caution: 0.92,
      curiosity: 0.4,
      persistence: 0.4,
      preferredRange: 8,
      flankBias: 0.7,
    },
    ownDurability: 0.2,
    visibleEnemies: [
      enemy("a", 5),
      enemy("b", 7),
      enemy("c", 9),
    ],
  });

  assert.equal(decision.goal, "evade");
  assert.equal(decision.threatCount, 3);
});

test("bot rotates into the ring instead of wandering when zone pressure exists", () => {
  const decision = chooseUtilityDecision({
    profile: {
      aggression: 0.5,
      caution: 0.7,
      curiosity: 0.5,
      persistence: 0.5,
      preferredRange: 8,
      flankBias: 0.5,
    },
    ownDurability: 0.8,
    zoneTarget: { x: 0, y: 0, z: 0, distance: 340, radius: 360 },
  });

  assert.equal(decision.goal, "zone");
});

test("memory competes with curiosity and a persistent bot hunts its last known target", () => {
  const decision = chooseUtilityDecision({
    profile: {
      aggression: 0.55,
      caution: 0.5,
      curiosity: 0.35,
      persistence: 0.92,
      preferredRange: 9,
      flankBias: 0.5,
    },
    ownDurability: 0.8,
    memory: { entityId: "lost-enemy", transform: { x: 30, y: 0, z: 4 } },
    interestTarget: { kind: "poi-interest", x: 15, y: 0, z: 12 },
  });

  assert.equal(decision.goal, "hunt");
  assert.equal(decision.memory.entityId, "lost-enemy");
});

test("curious bot investigates world information when there is no immediate threat", () => {
  const decision = chooseUtilityDecision({
    profile: {
      aggression: 0.45,
      caution: 0.5,
      curiosity: 0.9,
      persistence: 0.35,
      preferredRange: 8,
      flankBias: 0.5,
    },
    ownDurability: 1,
    interestTarget: { kind: "sound-interest", x: 12, y: 0, z: -8 },
  });

  assert.equal(decision.goal, "investigate");
});

test("bot personalities are deterministic but not clones", () => {
  const one = botPersonality("br-bot-1", "pistol");
  const same = botPersonality("br-bot-1", "pistol");
  const other = botPersonality("br-bot-2", "pistol");
  const rifle = botPersonality("br-bot-1", "rifle");

  assert.deepEqual(one, same);
  assert.notDeepEqual(one, other);
  assert.ok(rifle.preferredRange > one.preferredRange);
});
