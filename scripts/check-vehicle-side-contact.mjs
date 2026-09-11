import assert from "node:assert/strict";
import { test } from "node:test";
import { createEchoFrontGame } from "../src/server/game.js";

const BOT_ID = "vehicle-side-contact-bot";
const VEHICLE_SPEED = 20;
const FRAME_SECONDS = 0.05;

function rotate(yaw, x, z) {
  return { x: Math.cos(yaw) * x + Math.sin(yaw) * z, z: -Math.sin(yaw) * x + Math.cos(yaw) * z };
}

async function drivePastBot({ vehicleId, yaw, lateral, expectedHit, speed = VEHICLE_SPEED, victimBot = true }) {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  const services = game.host.services;
  const physics = services.get("physics");
  const vehicles = services.get("vehicles");
  const entities = services.get("entities");
  const ragdoll = services.get("ragdoll");
  let now = Date.now();
  let restoreStep;
  try {
    // The complete vehicle, affordance, and ragdoll plugins remain enabled.
    // Only vehicle ticks advance, so the pedestrian's AI cannot walk out of the lane.
    for (const entity of entities.all()) entities.remove(entity.id);
    const body = physics.dynamicBody(vehicleId);
    const start = rotate(yaw, -5, 0);
    body.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
    physics.setDynamicBodyTranslation(vehicleId, { ...start, y: 1 });
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    physics.setDynamicBodyLinearVelocity(vehicleId, { x: 0, y: 0, z: 0 });
    for (let tick = 0; tick < 60; tick += 1) {
      now += 1000 / 60;
      vehicles.tickPhysics(1 / 60, now);
    }
    // Suspension settling can rotate a parked car slightly. Align the initial
    // heading and lane once, before driving, so grazing distances are reproducible.
    const settledHeight = body.translation().y;
    body.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
    physics.setDynamicBodyTranslation(vehicleId, { ...start, y: settledHeight });

    const botPosition = { ...rotate(yaw, 0, lateral), y: 0 };
    let character;
    const createCharacter = physics.createCharacter;
    physics.createCharacter = (...args) => {
      const created = createCharacter(...args);
      if (args[0] === BOT_ID) character = created;
      return created;
    };
    try {
      entities.spawn({ id: BOT_ID, kind: victimBot ? "bot" : "human", bot: victimBot, position: botPosition });
    } finally {
      physics.createCharacter = createCharacter;
    }
    assert.equal(services.get("bots").isBot(BOT_ID), victimBot, "Victim bot registration must match the scenario");
    assert.ok(character?.collider, "Bot must have a real character collider");

    const solidColliders = Array.from({ length: body.numColliders() }, (_, index) => body.collider(index))
      .filter((collider) => !collider.isSensor());
    assert.ok(solidColliders.length >= 2, "Fixture must include the car's solid exterior shell");
    const observedContacts = new Map();
    const step = physics.step;
    restoreStep = () => { physics.step = step; };
    physics.step = (dt) => {
      const result = step(dt);
      if (character.collider.isEnabled()) {
        for (const collider of solidColliders) {
          physics.world.contactPair(collider, character.collider, (manifold) => {
            if (manifold.numContacts() > 0 || manifold.numSolverContacts() > 0) {
              observedContacts.set(collider.handle, (observedContacts.get(collider.handle) ?? 0) + 1);
            }
          });
        }
      }
      return result;
    };

    // A single initial velocity models a coasting car. No teleport or repeated
    // velocity injection forces it through the pedestrian after the collision.
    physics.setDynamicBodyLinearVelocity(vehicleId, { ...rotate(yaw, speed, 0), y: 0 });
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    let activated = false;
    for (let tick = 0; tick < 40; tick += 1) {
      now += FRAME_SECONDS * 1000;
      vehicles.tickPhysics(FRAME_SECONDS, now);
      activated ||= ragdoll.isActive(BOT_ID);
      if (activated) break;
    }
    const summary = services.get("fleet-pedestrian-ragdoll").summary();
    const evidence = JSON.stringify({ yaw, lateral, physicalContacts: observedContacts.size, activated, lastHit: summary.lastHit });
    if (expectedHit) {
      assert.ok(observedContacts.size > 0, `Fixture missed the bot physically: ${evidence}`);
      assert.equal(activated, true, `Real car-side contact failed to knock the bot down: ${evidence}`);
      assert.equal(summary.lastHit?.entityId, BOT_ID);
      assert.equal(summary.lastHit?.isBot, victimBot);
      assert.equal(summary.lastHit?.vehicleId, vehicleId);
    } else {
      assert.equal(observedContacts.size, 0, `Near-miss fixture unexpectedly touched the bot: ${evidence}`);
      assert.equal(activated, false, `Car knocked down a bot it never touched: ${evidence}`);
      const end = body.translation();
      assert.ok(Math.cos(yaw) * end.x - Math.sin(yaw) * end.z > 3,
        "The miss must actually drive past the bot, not stop before reaching it");
    }
  } finally {
    restoreStep?.();
    await game.host.stop();
  }
}

for (const scenario of [
  { name: "jeep right side", vehicleId: "br-jeep-2", yaw: 0, lateral: 1.3, expectedHit: true },
  { name: "jeep left side", vehicleId: "br-jeep-2", yaw: 0, lateral: -1.3, expectedHit: true },
  { name: "jeep side at 45 degrees", vehicleId: "br-jeep-2", yaw: Math.PI / 4, lateral: 1.2, expectedHit: true },
  { name: "jeep side at 90 degrees", vehicleId: "br-jeep-2", yaw: Math.PI / 2, lateral: -1.3, expectedHit: true },
  { name: "supercar side", vehicleId: "br-supercar-1", yaw: 0, lateral: 1.24, expectedHit: true },
  { name: "force-backed low-speed jeep hit", vehicleId: "br-jeep-2", yaw: 0, lateral: 1.3, speed: 4, expectedHit: true },
  { name: "legacy primary jeep hits a human through the fleet-wide system", vehicleId: "br-jeep-1", yaw: 0, lateral: 1.3, speed: 20, victimBot: false, expectedHit: true },
  { name: "jeep passes clear on the right", vehicleId: "br-jeep-2", yaw: 0, lateral: 2, expectedHit: false },
  { name: "jeep passes clear at 45 degrees", vehicleId: "br-jeep-2", yaw: Math.PI / 4, lateral: -2, expectedHit: false },
]) {
  test(scenario.name, () => drivePastBot(scenario));
}
