import test from "node:test";
import assert from "node:assert/strict";
import { createEchoFrontGame } from "../src/server/game.js";
import { drivingInput } from "../src/plugins/battle-royale-bot-vehicles/driving.js";
import { MAX_PUSH_AUDIO_DURATION_MS } from "../src/plugins/battle-royale-crate-integration/server.js";
import {
  MAX_CRATE_SOUND_DURATION_MS,
  CRATE_FADE_OUT_MS,
  crateDragGainForSpeed,
} from "../public/client/plugins/battle-royale-crate-interaction.js";

function shortestAngleDelta(from, to) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function groundEntity(game, id, position) {
  const c = game.host.components;
  const s = game.host.services;
  const parachute = c.get(id, "Parachute");
  if (parachute) {
    Object.assign(parachute, {
      phase: "landed",
      airborne: false,
      simulatedVerticalVelocity: 0,
      inflation: 0,
      glideSpeed: 0,
      airSpeed: 0,
    });
  }
  s.get("movement").teleport(id, position);
}

test("1. Core bot locomotion clamps targetAngle without overshoot across 50ms physics ticks", async () => {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  try {
    const movement = game.host.services.get("movement");
    const bots = game.host.services.get("bots").all();
    assert.ok(bots.length > 0, "Expected battle royale bots");
    const bot = bots[0];
    groundEntity(game, bot.id, { x: 0, y: 0, z: 0, angle: 0 });
    const transform = game.host.components.get(bot.id, "Transform");

    const targetAngle = 0.28;
    movement.setInput(bot.id, {
      forward: 1,
      strafe: 0,
      turn: 1,
      targetAngle,
      sprint: false,
    });

    let now = 20_000;
    const angles = [];
    for (let i = 0; i < 8; i += 1) {
      now += 50;
      movement.tick(0.05, now);
      angles.push(transform.angle);
    }

    for (const angle of angles) {
      assert.ok(
        angle <= targetAngle + 1e-6,
        `Bot angle ${angle} must never overshoot targetAngle ${targetAngle}`,
      );
    }
    assert.ok(
      Math.abs(shortestAngleDelta(transform.angle, targetAngle)) < 0.005,
      `Bot angle ${transform.angle} should settle cleanly on targetAngle ${targetAngle}`,
    );
  } finally {
    game.stop?.();
  }
});

test("2. Bot vehicle drivingInput avoids bang-bang gas-brake oscillation during cruise and gentle turns", () => {
  const point = { x: 0, y: 0, z: -180 };
  let speed = 18;
  let angle = 0.14;
  let previousSteering = 0;
  const throttles = [];

  for (let tick = 0; tick < 20; tick += 1) {
    const vehicle = {
      x: 0,
      y: 0,
      z: 0,
      angle,
      speed,
      forwardSpeed: speed,
      groundedWheels: 4,
    };
    const cmd = drivingInput(vehicle, point, {
      dt: 0.05,
      previousSteering,
      remaining: 180,
      obstacleDistance: 120,
    });
    throttles.push(cmd.forward);
    previousSteering = cmd.strafe;
    angle *= 0.88;
    speed += cmd.forward * 0.35;
  }

  const fullBrakeCount = throttles.filter((f) => f <= -0.5).length;
  assert.equal(
    fullBrakeCount,
    0,
    `Expected zero full-brake spikes while cruising/turning toward open waypoint, got throttles=${JSON.stringify(throttles)}`,
  );
});

test("3. Downed squadmates self-revive reliably even after interrupted team revive or 0 initial stims", async () => {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  try {
    const s = game.host.services;
    const entities = s.get("entities");
    const health = s.get("health");
    const injury = s.get("injury");
    const stimulants = s.get("stimulants");

    let now = Date.now() + 10_000;
    const welcome = game.api.connectHuman("11111111-2222-4333-8444-666666666666", now);
    assert.ok(welcome.squadmates.length >= 2, "Expected human squadmates");
    const mateA = welcome.squadmates[0];
    const mateB = welcome.squadmates[1];
    const mateC = welcome.squadmates[2];

    for (let i = 0; i < 40; i += 1) {
      now += 250;
      game.api.step(0.25, now);
    }

    groundEntity(game, welcome.playerId, { x: -40, y: 0, z: -40, angle: 0 });
    groundEntity(game, mateA, { x: 10, y: 0, z: 10, angle: 0 });
    groundEntity(game, mateB, { x: 180, y: 0, z: 180, angle: 0 });
    groundEntity(game, mateC, { x: -180, y: 0, z: -180, angle: 0 });

    const enemy = entities.all().find((e) => e.bot && e.alive && !e.humanSquad);
    groundEntity(game, enemy.id, { x: 400, y: 0, z: 400, angle: 0 });

    // Knock down player and mateC so mateA and mateB have no nearby standing reviver
    health.applyDamage(welcome.playerId, 500, { attackerId: enemy.id, weaponId: "rifle", now });
    health.applyDamage(mateC, 500, { attackerId: enemy.id, weaponId: "rifle", now });

    // Case A: mateA is downed, gets partial team revive, then reviver pauses; mateA must still self-revive!
    health.applyDamage(mateA, 500, { attackerId: enemy.id, weaponId: "rifle", now });
    assert.equal(injury.isDowned(mateA), true, "mateA should be downed");
    const stA = injury.stateFor(mateA);
    stA.reviveProgressMs = 900;
    stA.reviverId = null;

    // Case B: mateB has 0 stimulants before knockdown; emergency squad self-revive must grant 1 and revive mateB
    health.applyDamage(mateB, 50, { attackerId: enemy.id, weaponId: "rifle", now });
    while (stimulants.count(mateB) > 0) {
      assert.equal(stimulants.start(mateB, now), true);
      now += 2100;
      stimulants.tick(now);
      health.applyDamage(mateB, 50, { attackerId: enemy.id, weaponId: "rifle", now });
    }
    assert.equal(stimulants.totalCount(mateB), 0, "mateB should have 0 stimulants before knockdown");
    health.applyDamage(mateB, 500, { attackerId: enemy.id, weaponId: "rifle", now });
    assert.equal(injury.isDowned(mateB), true, "mateB should be downed");

    // Step simulation for 8.5 seconds so both mateA and mateB complete self-revive
    for (let i = 0; i < 85; i += 1) {
      now += 100;
      game.api.step(0.1, now);
    }

    assert.equal(injury.isDowned(mateA), false, "mateA should have self-revived after interrupted team revive");
    assert.equal(injury.isDowned(mateB), false, "mateB should have self-revived via emergency squad stimulant");
  } finally {
    game.stop?.();
  }
});

test("4. Spatial audio events for squadmate armor plating and revives are forwarded to human player", async () => {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  try {
    const s = game.host.services;
    const armor = s.get("armor");
    const health = s.get("health");
    const entities = s.get("entities");
    const injury = s.get("injury");

    let now = Date.now() + 30_000;
    const welcome = game.api.connectHuman("11111111-2222-4333-8444-777777777777", now);
    const mateId = welcome.squadmates[0];
    groundEntity(game, welcome.playerId, { x: 10, y: 0, z: 10, angle: 0 });
    groundEntity(game, mateId, { x: 12, y: 0, z: 11, angle: 0 });
    groundEntity(game, welcome.squadmates[1], { x: 12.5, y: 0, z: 11.2, angle: 0 });

    const capturedPackets = [];
    const record = (event) => game.host.events.on(event, (payload) => capturedPackets.push({ event, payload }));
    record("armor:plating-started");
    record("armor:plating-completed");
    record("injury:team-revive-started");
    record("injury:revived");
    record("sound:spatial");

    const mateArmor = game.host.components.get(mateId, "Armor");
    mateArmor.current = 50;
    mateArmor.reserve = 2;
    assert.equal(armor.startPlating(mateId, now), true);
    now += 1100;
    armor.tick(now);

    const enemy = entities.all().find((e) => e.bot && e.alive && !e.humanSquad);
    health.applyDamage(mateId, 500, { attackerId: enemy.id, weaponId: "rifle", now });
    assert.equal(injury.startTeamRevive(welcome.squadmates[1], mateId, now), true);

    const forwarded = game.api.eventsForPlayer(welcome.playerId, capturedPackets);
    assert.ok(
      forwarded.some((p) => p.event === "armor:plating-started" && p.payload.entityId === mateId && Number.isFinite(p.payload.x)),
      "Expected squadmate armor:plating-started with 3D coordinates to be forwarded to player",
    );
    assert.ok(
      forwarded.some((p) => p.event === "armor:plating-completed" && p.payload.entityId === mateId),
      "Expected squadmate armor:plating-completed to be forwarded to player",
    );
    assert.ok(
      forwarded.some((p) => p.event === "injury:team-revive-started" && p.payload.entityId === mateId),
      "Expected squadmate injury:team-revive-started to be forwarded to player",
    );
    assert.ok(
      forwarded.some((p) => p.event === "sound:spatial" && p.payload.key === "armor.plate.start"),
      "Expected spatial sound armor.plate.start to be forwarded to player",
    );
    assert.ok(
      forwarded.some((p) => p.event === "sound:spatial" && p.payload.key === "injury.revive.start"),
      "Expected spatial sound injury.revive.start to be forwarded to player",
    );
  } finally {
    game.stop?.();
  }
});

test("5. Crate push metallic sound scales with speed and stops at 5000ms max duration", () => {
  assert.equal(MAX_PUSH_AUDIO_DURATION_MS, 5000);
  assert.equal(MAX_CRATE_SOUND_DURATION_MS, 5000);
  assert.ok(CRATE_FADE_OUT_MS >= 400 && CRATE_FADE_OUT_MS <= 1000);

  const stoppedGain = crateDragGainForSpeed(0.02);
  const slowGain = crateDragGainForSpeed(0.15);
  const mediumGain = crateDragGainForSpeed(0.75);
  const fastGain = crateDragGainForSpeed(1.6);

  assert.equal(stoppedGain, 0);
  assert.ok(slowGain > 0 && slowGain < mediumGain, `Expected slowGain (${slowGain}) < mediumGain (${mediumGain})`);
  assert.ok(mediumGain < fastGain, `Expected mediumGain (${mediumGain}) < fastGain (${fastGain})`);
});

test("6. Squadmate kills credit the human player with +$300 cash and increment squadKills", async () => {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  try {
    const s = game.host.services;
    const entities = s.get("entities");
    const health = s.get("health");
    const shop = s.get("shop");

    let now = Date.now() + 50_000;
    const welcome = game.api.connectHuman("11111111-2222-4333-8444-888888888888", now);
    const mateId = welcome.squadmates[0];
    const enemy = entities.all().find((e) => e.bot && e.alive && !e.humanSquad);
    assert.ok(enemy, "Expected an enemy bot");

    const cashEvents = [];
    game.host.events.on("shop:cash-gained", (payload) => cashEvents.push(payload));

    const beforeCash = shop.balanceOf(welcome.playerId);
    health.applyDamage(enemy.id, 500, { attackerId: mateId, weaponId: "rifle", now });
    if (enemy.alive) {
      health.applyDamage(enemy.id, 500, { attackerId: mateId, weaponId: "rifle", now: now + 50 });
    }

    const afterCash = shop.balanceOf(welcome.playerId);
    assert.equal(afterCash, beforeCash + 300, "Human player should receive +$300 when squadmate kills an enemy");
    assert.ok(
      cashEvents.some((e) => e.entityId === welcome.playerId && e.reason === "squad-elimination" && e.amount === 300),
      "Expected shop:cash-gained event with reason=squad-elimination for human player",
    );

    const snap = game.api.snapshotFor(welcome.playerId, now + 100);
    const selfSnap = snap.entities.find((e) => e.id === welcome.playerId);
    assert.ok(selfSnap.squadKills >= 1, `Expected squadKills >= 1 on player snapshot, got ${selfSnap?.squadKills}`);
  } finally {
    game.stop?.();
  }
});
