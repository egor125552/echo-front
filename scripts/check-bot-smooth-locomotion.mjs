import assert from "node:assert/strict";
import { test } from "node:test";
import { createEchoFrontGame } from "../src/server/game.js";

const PLAYER_ID = "88888888-8888-4888-8888-888888888888";

function wrapAngle(value) {
  let angle = Number(value) || 0;
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function groundEntity(game, id, pos) {
  const parachute = game.host.components.get(id, "Parachute");
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
  game.host.services.get("movement").teleport(id, { y: 0, angle: 0, ...pos });
}

function measureAngularBehavior(samples) {
  let totalAbsTurn = 0;
  let reversals = 0;
  let prevSign = 0;
  for (let i = 1; i < samples.length; i += 1) {
    const delta = wrapAngle(samples[i] - samples[i - 1]);
    totalAbsTurn += Math.abs(delta);
    if (Math.abs(delta) > 0.008) {
      const sign = Math.sign(delta);
      if (prevSign !== 0 && sign !== prevSign) reversals += 1;
      prevSign = sign;
    }
  }
  return { totalAbsTurn, reversals };
}

test("BR human squadmates hold calm overwatch beside player without spinning in circles when player looks around", async () => {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  const s = game.host.services;
  const c = game.host.components;
  let now = Date.now() + 3000;
  try {
    const joined = s.get("match-api").connectHuman(PLAYER_ID, now);
    s.get("battle-royale").arm(now);

    const enemyId = "br-bot-5";
    const keepIds = new Set([PLAYER_ID, ...joined.squadmates, enemyId]);
    for (const ent of [...s.get("entities").all()]) {
      if (ent.bot && !keepIds.has(ent.id)) s.get("entities").remove(ent.id);
    }

    groundEntity(game, PLAYER_ID, { x: 10, y: 0, z: 10, angle: 0 });
    groundEntity(game, joined.squadmates[0], { x: 8.5, y: 0, z: 11.2, angle: -0.5 });
    groundEntity(game, joined.squadmates[1], { x: 11.5, y: 0, z: 11.2, angle: 0.5 });
    groundEntity(game, joined.squadmates[2], { x: 10, y: 0, z: 12.2, angle: Math.PI });
    groundEntity(game, enemyId, { x: -350, y: 0, z: -350 });

    const traces = new Map(joined.squadmates.map((id) => [id, []]));
    const startPos = new Map(joined.squadmates.map((id) => {
      const t = c.get(id, "Transform");
      return [id, { x: t.x, z: t.z }];
    }));

    // Simulate 4 seconds while human turns their camera back and forth 180 degrees in place
    for (let step = 0; step < 80; step += 1) {
      now += 50;
      const turnCmd = step < 40 ? 1 : -1;
      game.api.handleInput(PLAYER_ID, { turn: turnCmd }, now);
      game.api.step(0.05, now);
      for (const mateId of joined.squadmates) {
        traces.get(mateId).push(c.get(mateId, "Transform").angle);
      }
    }

    for (const mateId of joined.squadmates) {
      const t = c.get(mateId, "Transform");
      const moved = Math.hypot(t.x - startPos.get(mateId).x, t.z - startPos.get(mateId).z);
      const { totalAbsTurn, reversals } = measureAngularBehavior(traces.get(mateId));
      assert(moved <= 1.5, `Squadmate ${mateId} must hold position calmly instead of wandering off in circles (moved=${moved.toFixed(2)}m)`);
      assert(totalAbsTurn <= 2.4, `Squadmate ${mateId} must not spin camera while settled beside leader (totalAbsTurn=${totalAbsTurn.toFixed(2)})`);
      assert(reversals <= 1, `Squadmate ${mateId} must have near-zero camera oscillation (reversals=${reversals})`);
    }
  } finally {
    await game.host.stop();
  }
});

test("BR patrolling bots travel smoothly forward without 8D camera oscillation or blind circle loops", async () => {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  const s = game.host.services;
  const c = game.host.components;
  let now = Date.now() + 4000;
  try {
    s.get("battle-royale").arm(now);
    const botA = "br-bot-5";
    const botB = "br-bot-6";
    for (const ent of [...s.get("entities").all()]) {
      if (ent.bot && ent.id !== botA && ent.id !== botB) s.get("entities").remove(ent.id);
    }

    groundEntity(game, botA, { x: -160, y: 0, z: -140, angle: 0.35 });
    groundEntity(game, botB, { x: -360, y: 0, z: -360, angle: 0 });
    for (const id of [botA, botB]) {
      const b = c.get(id, "Bot");
      b.lastKnownTargetId = null;
      b.freeRoamWaypoint = null;
      b.nextThinkAt = 0;
    }

    const startA = { x: -160, z: -140 };
    const anglesA = [];
    let forwardAlignSamples = 0;
    let totalMoveSamples = 0;
    let prevPos = { ...startA };

    // Simulate 8 seconds (160 ticks) of free patrol in open terrain
    for (let step = 0; step < 160; step += 1) {
      now += 50;
      game.api.step(0.05, now);
      const t = c.get(botA, "Transform");
      anglesA.push(t.angle);
      const stepDx = t.x - prevPos.x;
      const stepDz = t.z - prevPos.z;
      const stepDist = Math.hypot(stepDx, stepDz);
      if (stepDist > 0.04) {
        totalMoveSamples += 1;
        const headX = Math.sin(t.angle);
        const headZ = -Math.cos(t.angle);
        const dot = (stepDx * headX + stepDz * headZ) / stepDist;
        if (dot >= 0.7) forwardAlignSamples += 1;
      }
      prevPos = { x: t.x, z: t.z };
    }

    const endA = c.get(botA, "Transform");
    const movedTotal = Math.hypot(endA.x - startA.x, endA.z - startA.z);
    const { totalAbsTurn, reversals } = measureAngularBehavior(anglesA);

    assert(movedTotal >= 14, `Patrolling bot must cover real ground smoothly (moved=${movedTotal.toFixed(2)}m)`);
    assert(totalAbsTurn <= 4.5, `Patrolling bot must not spin camera across 8s (totalAbsTurn=${totalAbsTurn.toFixed(2)})`);
    assert(reversals <= 2, `Patrolling bot must have minimal left-right angular reversals (reversals=${reversals})`);
    assert(totalMoveSamples > 40);
    const alignRatio = forwardAlignSamples / totalMoveSamples;
    assert(alignRatio >= 0.85, `Patrolling bot must face where it walks instead of crabbing sideways (alignRatio=${alignRatio.toFixed(2)})`);
  } finally {
    await game.host.stop();
  }
});

test("BR obstacle avoidance guides bot smoothly around exterior wall without side-to-side ping-pong", async () => {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  const s = game.host.services;
  const c = game.host.components;
  let now = Date.now() + 5000;
  try {
    s.get("battle-royale").arm(now);
    const mover = "br-bot-5";
    const anchor = "br-bot-6";
    for (const ent of [...s.get("entities").all()]) {
      if (ent.bot && ent.id !== mover && ent.id !== anchor) s.get("entities").remove(ent.id);
    }

    // Place bot facing directly into west wall of warehouse (x=45, z=-15..15) so avoidance must detour smoothly
    groundEntity(game, mover, { x: 42.5, y: 0, z: -2, angle: Math.PI / 2 });
    groundEntity(game, anchor, { x: -360, y: 0, z: -360 });
    const botState = c.get(mover, "Bot");
    botState.freeRoamWaypoint = { x: 85, y: 0, z: 0 };
    botState.freeRoamUntil = now + 15_000;
    botState.nextThinkAt = 0;

    const angles = [];
    let sideFlips = 0;
    let prevSide = botState.avoidDirection;
    for (let step = 0; step < 80; step += 1) {
      now += 50;
      game.api.step(0.05, now);
      angles.push(c.get(mover, "Transform").angle);
      if (botState.avoidDirection !== prevSide) {
        sideFlips += 1;
        prevSide = botState.avoidDirection;
      }
    }

    const { reversals } = measureAngularBehavior(angles);
    assert(sideFlips <= 1, `Obstacle avoidance must commit cleanly without left-right wall ping-pong (sideFlips=${sideFlips})`);
    assert(reversals <= 2, `Bot camera must stay calm while routing around wall (reversals=${reversals})`);
  } finally {
    await game.host.stop();
  }
});

test("TDM bots roam, hunt, and fight with damped camera motion and zero overshoot oscillation", async () => {
  const game = await createEchoFrontGame({ mode: "tdm" });
  const s = game.host.services;
  const c = game.host.components;
  let now = Date.now() + 2000;
  try {
    game.api.connectHuman("smooth-tdm-viewer", now);
    const bots = s.get("bots").all();
    assert(bots.length >= 2);
    const traces = new Map(bots.map((b) => [b.id, []]));

    for (let step = 0; step < 120; step += 1) {
      now += 50;
      game.api.handleInput("smooth-tdm-viewer", {}, now);
      game.api.step(0.05, now);
      for (const bot of bots) {
        if (!bot.alive) continue;
        traces.get(bot.id).push(c.get(bot.id, "Transform").angle);
      }
    }

    for (const [botId, angles] of traces) {
      if (angles.length < 30) continue;
      const { totalAbsTurn, reversals } = measureAngularBehavior(angles);
      assert(
        reversals <= 6,
        `TDM bot ${botId} camera oscillated too many times across 6s (reversals=${reversals}, totalAbsTurn=${totalAbsTurn.toFixed(2)})`,
      );
      assert(
        totalAbsTurn <= 12.5,
        `TDM bot ${botId} camera spun excessively across 6s (totalAbsTurn=${totalAbsTurn.toFixed(2)})`,
      );
    }
  } finally {
    await game.host.stop();
  }
});
