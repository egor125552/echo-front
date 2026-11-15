import assert from "node:assert/strict";
import { test } from "node:test";
import { createEchoFrontGame } from "../src/server/game.js";
import { EngineLab, handleEngineLabRequest } from "../src/server/engine-lab.js";

test("Engine Lab request handler works without a token file and executes scenario lifecycle", async () => {
  let createdGame = null;
  try {
    const roomHost = {
      mode: "battle-royale",
      roomName: "engine-lab:battle-royale:test-room-1",
      game: null,
      lab: null,
      gameLoopTimer: null,
      ctx: { getWebSockets: () => [] },
      stopGameLoop() {},
      async ensureGame(mode) {
        this.mode = mode || "battle-royale";
        this.game = await createEchoFrontGame({ mode: this.mode });
        createdGame = this.game;
        return this.game;
      },
    };
    const createReq = new Request("http://127.0.0.1:3000/api/engine-lab?mode=battle-royale&room=test-room-1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "scenario.create", watch: ["br-bot-1", "br-bot-2"] }),
    });
    const createRes = await handleEngineLabRequest(roomHost, createReq);
    assert.equal(createRes.status, 200);
    const createBody = await createRes.json();
    assert.equal(createBody.ok, true);
    assert.equal(createBody.phase, "preparing");
  } finally {
    await createdGame?.host.stop();
  }
});

test("Battle Royale 2-bot squads share target intel, coordinate breacher/flanker roles, and dissolve truce in final 1v1", async () => {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  try {
    const services = game.host.services;
    const entities = services.get("entities");
    const movement = services.get("movement");
    const perception = services.get("bot-perception");
    const botCombat = services.get("bot-combat");
    const battleRoyale = services.get("battle-royale");
    const map = services.get("map");
    let now = Date.now() + 2000;
    battleRoyale.arm(now);

    // Land all bots so they are active on the ground.
    for (const entity of entities.all()) {
      const parachute = game.host.components.get(entity.id, "Parachute");
      if (parachute) {
        Object.assign(parachute, {
          phase: "landed",
          airborne: false,
          simulatedVerticalVelocity: 0,
          inflation: 0,
        });
      }
    }

    assert.equal(botCombat.squadPartnerId("br-bot-1"), "br-bot-2");
    assert.equal(botCombat.squadPartnerId("br-bot-2"), "br-bot-1");
    assert.equal(botCombat.squadRoleFor("br-bot-1"), "breacher");
    assert.equal(botCombat.squadRoleFor("br-bot-2"), "flanker");

    // Place squad (br-bot-1, br-bot-2) outside warehouse door and enemy br-bot-5 inside.
    map.setDoorOpen("warehouse-front-door", true, "br-bot-1", now);
    movement.teleport("br-bot-1", { x: 77.5, y: 0, z: 0, angle: -Math.PI / 2 });
    movement.teleport("br-bot-2", { x: 79.2, y: 0, z: 0.4, angle: -Math.PI / 2 });
    movement.teleport("br-bot-5", { x: 71.5, y: 0, z: 0, angle: Math.PI / 2 });

    // Move other bots far away so they don't interfere with the warehouse test.
    let offset = 0;
    for (const entity of entities.all()) {
      if (["br-bot-1", "br-bot-2", "br-bot-5"].includes(entity.id)) continue;
      offset += 1;
      movement.teleport(entity.id, { x: -350 - (offset % 20) * 6, y: 0, z: -350 - Math.floor(offset / 20) * 6 });
    }

    services.get("spatial-grid").rebuild(now);
    assert.equal(perception.areSquadmates("br-bot-1", "br-bot-2"), true);
    const visibleForBot1 = perception.visibleEnemies("br-bot-1", 28, { now, limit: 8 });
    assert.ok(
      !visibleForBot1.some((e) => e.entityId === "br-bot-2"),
      "Squadmate br-bot-2 must not appear in br-bot-1 visibleEnemies while other enemies live",
    );
    assert.ok(
      visibleForBot1.some((e) => e.entityId === "br-bot-5"),
      "Enemy br-bot-5 inside warehouse must be visible through open doorway",
    );

    // Step combat so br-bot-1 and br-bot-2 engage br-bot-5 and coordinate roles.
    for (let i = 0; i < 6; i += 1) {
      now += 50;
      game.api.step(0.05, now);
    }

    const state1 = game.host.components.get("br-bot-1", "Bot");
    const state2 = game.host.components.get("br-bot-2", "Bot");
    assert.equal(state1.lastKnownTargetId, "br-bot-5");
    assert.equal(state2.lastKnownTargetId, "br-bot-5", "Squadmate br-bot-2 must receive target callout from br-bot-1");
    assert.equal(state1.squadRoleActive, "breacher");
    assert.equal(state2.squadRoleActive, "flanker");
    assert.notEqual(
      Math.sign(state1.strafeDirection),
      Math.sign(state2.strafeDirection),
      "Breacher and flanker must split onto opposite strafe directions",
    );

    // Verify that when all other participants die and only the 2 squadmates remain,
    // the squad truce dissolves so the match can finish with a single winner.
    for (const entity of entities.all()) {
      if (entity.id !== "br-bot-1" && entity.id !== "br-bot-2") {
        entity.alive = false;
      }
    }
    services.get("spatial-grid").rebuild(now + 100);
    assert.equal(
      perception.areSquadmates("br-bot-1", "br-bot-2"),
      false,
      "Squad truce must dissolve when only the squadmates remain alive",
    );
  } finally {
    await game.host.stop();
  }
});

test("Engine Lab warehouse scenario navigates ground floor, stairs, and upper floor without stalled-pedestrian anomalies", async () => {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  try {
    const services = game.host.services;
    services.get("battle-royale").arm(Date.now());
    const lab = new EngineLab(game, {
      mode: "battle-royale",
      room: "warehouse-squad-lab",
      watch: ["br-bot-1", "br-bot-2"],
    });

    const entities = services.get("entities");
    const movement = services.get("movement");
    for (const entity of entities.all()) {
      const parachute = game.host.components.get(entity.id, "Parachute");
      if (parachute) {
        Object.assign(parachute, {
          phase: "landed",
          airborne: false,
          simulatedVerticalVelocity: 0,
          inflation: 0,
        });
      }
    }

    // Place a 2-bot squad right outside the warehouse to sweep ground and upper floors.
    movement.teleport("br-bot-1", { x: 78.2, y: 0, z: -0.4, angle: -Math.PI / 2 });
    movement.teleport("br-bot-2", { x: 80.4, y: 0, z: 0.4, angle: -Math.PI / 2 });

    let offset = 0;
    for (const entity of entities.all()) {
      if (["br-bot-1", "br-bot-2"].includes(entity.id)) continue;
      offset += 1;
      movement.teleport(entity.id, { x: -320 - (offset % 15) * 8, y: 0, z: 250 + Math.floor(offset / 15) * 8 });
    }

    // Verify warehouse-priority includes both ground and upper floor points.
    const priority = services.get("warehouse-priority");
    const interest = services.get("bot-interest");
    const firstTarget = interest.targetFor("br-bot-1", game.host.components.get("br-bot-1", "Transform"), Date.now());
    assert.ok(firstTarget?.priorityVisit, "Bot near warehouse must start a warehouse priority visit");
    const visit = priority.visitFor("br-bot-1");
    assert.ok(visit?.points?.some((p) => Math.abs(Number(p.y) || 0) < 0.2), "Visit must include ground-floor points");
    assert.ok(visit?.points?.some((p) => Number(p.y) >= 3.0), "Visit must include upper-floor points");

    lab.start();
    let reachedInsideWarehouse = false;
    let reachedUpperFloorOrStair = false;
    for (let stepBatch = 0; stepBatch < 10; stepBatch += 1) {
      await lab.advance({ steps: 50, sampleEvery: 10 });
      for (const botId of ["br-bot-1", "br-bot-2"]) {
        const pos = game.host.components.get(botId, "Transform");
        if (pos.x < 74.2 && pos.x > 54) {
          reachedInsideWarehouse = true;
        }
        if (pos.y > 0.65) {
          reachedUpperFloorOrStair = true;
        }
      }
    }

    assert.ok(reachedInsideWarehouse, "Squad bots must enter the warehouse interior through the doorway");
    assert.ok(reachedUpperFloorOrStair, "Squad bots must climb the warehouse staircase toward the upper floor");
    const report = lab.report();
    const stalls = report.anomalies.filter((a) => a.type === "possible-stalled-pedestrian");
    assert.equal(
      stalls.length,
      0,
      `Warehouse squad navigation must not produce stalled-pedestrian anomalies: ${JSON.stringify(stalls)}`,
    );
  } finally {
    await game.host.stop();
  }
});
