import assert from "node:assert/strict";
import { test } from "node:test";
import { createEchoFrontGame } from "../src/server/game.js";
import {
  BOT_EXPLORATION_PAUSE_MIN_MS,
  BOT_EXPLORATION_PAUSE_SPREAD_MS,
} from "../src/plugins/battle-royale-bot-interest/server.js";
import { buildingDoorBypassWaypoint } from "../src/plugins/battle-royale-ground-navigation/server.js";
import { createDriverRoutes } from "../src/plugins/battle-royale-bot-vehicles/routes.js";

const PLAYER_ID = "77777777-7777-4777-8777-777777777777";

function landEntity(game, id, pos) {
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

test("loot-house creates east/west room regions with middle passage and a bot traverses out without hitting partition walls", async () => {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  const s = game.host.services;
  const c = game.host.components;
  let now = Date.now() + 5000;
  try {
    const joined = game.api.connectHuman(PLAYER_ID, now);
    // Keep only one bot in loot-house and distant bots to keep BR active cleanly
    const testBotId = "br-bot-5";
    for (const ent of [...s.get("entities").all()]) {
      if (ent.bot && ent.id !== testBotId && ent.id !== "br-bot-6") {
        s.get("entities").remove(ent.id);
      }
    }
    landEntity(game, PLAYER_ID, { x: -210, y: 0, z: 95 });
    landEntity(game, "br-bot-6", { x: -350, y: 0, z: -350 });

    const buildingNav = s.get("building-navigation");
    const lootHouse = buildingNav.list().find((b) => b.id === "loot-house");
    assert(lootHouse, "loot-house must be registered in building-navigation");
    assert(lootHouse.regions.includes("east-room"), "loot-house must expose east-room");
    assert(lootHouse.regions.includes("west-room"), "loot-house must expose west-room");

    const fromEast = { x: -168, y: 0, z: 91.5 };
    const toWestOutside = { x: -200, y: 0, z: 91.5 };
    const route = buildingNav.requiredWaypoints(fromEast, toWestOutside);
    const passage = route.find((w) => w.kind === "passage");
    assert(passage, `Route across loot-house must include a passage waypoint: ${JSON.stringify(route)}`);
    assert(
      Math.abs(passage.z - 95) <= 1.2,
      `Passage waypoint must align with unobstructed middle gap near z=95, got z=${passage.z}`,
    );

    // Place a bot right beside the south partition wall in east-room and steer it out to west outside
    landEntity(game, testBotId, { x: -172.5, y: 0, z: 91.5, angle: 0 });
    const groundNav = s.get("ground-navigation");
    const movement = s.get("movement");
    const botState = c.get(testBotId, "Bot");
    botState.vehicleControl = true; // isolate pure foot navigation to target

    let exited = false;
    for (let tick = 0; tick < 240; tick += 1) {
      now += 50;
      const t = c.get(testBotId, "Transform");
      const wp = groundNav.waypoint(t, toWestOutside) ?? toWestOutside;
      if (wp.doorId) {
        const door = s.get("map").doors.find((d) => d.id === wp.doorId);
        if (door && !door.open && Math.hypot(t.x - door.x, t.z - door.z) <= 2.6) {
          s.get("map").setDoorOpen(door.id, true, testBotId, now);
        }
      }
      const dx = wp.x - t.x;
      const dz = wp.z - t.z;
      const desired = Math.atan2(dx, -dz);
      let delta = desired - t.angle;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      movement.setInput(testBotId, {
        forward: Math.abs(delta) > 1.05 ? 0 : 1,
        turn: Math.max(-1, Math.min(1, delta * 2.1)),
      });
      game.api.step(0.05, now);
      if (t.x <= -186.5) {
        exited = true;
        break;
      }
    }
    assert.equal(exited, true, `Bot must traverse loot-house interior passage and exit west door (pos=${JSON.stringify(c.get(testBotId, "Transform"))})`);
  } finally {
    await game.host.stop();
  }
});

test("ground-navigation bypasses buildings from any side while keeping direct door entry on open side", async () => {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  try {
    const s = game.host.services;
    const groundNav = s.get("ground-navigation");

    // forest-hut center (-110, -75), width 12 (x: -116..-104), depth 10 (z: -80..-70), east door at x=-104
    const fhWestApproach = groundNav.waypoint({ x: -124, y: 0, z: -75 }, { x: -110, y: 0, z: -75 });
    assert.equal(fhWestApproach?.kind, "building-bypass", `Approaching forest-hut from closed west side must bypass: ${JSON.stringify(fhWestApproach)}`);

    const fhDirectEast = groundNav.waypoint({ x: -96, y: 0, z: -75 }, { x: -110, y: 0, z: -75 });
    assert.equal(fhDirectEast?.kind, "door", `Approaching forest-hut from open east side must target door directly: ${JSON.stringify(fhDirectEast)}`);

    // warehouse (x: 45..75, z: -15..15), east door at x=75
    const whWestApproach = groundNav.waypoint({ x: 35, y: 0, z: 0 }, { x: 60, y: 0, z: 0 });
    assert.equal(whWestApproach?.kind, "building-bypass", `Approaching warehouse from closed west side must bypass: ${JSON.stringify(whWestApproach)}`);

    // two-storey-house (x: 126..144, z: 113..127), west door at x=126
    const tsEastApproach = groundNav.waypoint({ x: 152, y: 0, z: 120 }, { x: 135, y: 0, z: 120 });
    assert.equal(tsEastApproach?.kind, "building-bypass", `Approaching two-storey-house from closed east side must bypass: ${JSON.stringify(tsEastApproach)}`);

    const tsDirectWest = groundNav.waypoint({ x: 118, y: 0, z: 120 }, { x: 135, y: 0, z: 120 });
    assert.equal(tsDirectWest?.kind, "door", `Approaching two-storey-house from open west side must target door directly: ${JSON.stringify(tsDirectWest)}`);

    // Outdoor-to-outdoor path crossing forest-hut must also produce exterior obstacle bypass
    const crossForestHut = groundNav.waypoint({ x: -124, y: 0, z: -75 }, { x: -95, y: 0, z: -75 });
    assert.equal(crossForestHut?.kind, "building-bypass", `Outdoor path crossing forest-hut must bypass: ${JSON.stringify(crossForestHut)}`);

    // Pure helper sanity check on 4-corner choice
    const pureBypass = buildingDoorBypassWaypoint(
      { x: -122, y: 0, z: -77 },
      { x: -102.5, y: 0, z: -75 },
      { minX: -116, maxX: -104, minZ: -80, maxZ: -70 },
    );
    assert.equal(pureBypass?.kind, "building-bypass");
    assert(pureBypass.z < -80, `Closer north corner should be picked from z=-77, got z=${pureBypass.z}`);
  } finally {
    await game.host.stop();
  }
});

test("bot turns in place without tight-orbit circling and flanker rally hysteresis prevents 180-deg oscillation", async () => {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  const s = game.host.services;
  const c = game.host.components;
  let now = Date.now() + 6000;
  try {
    s.get("battle-royale").arm(now);
    // Test anti-spin on a bot placed 1.2m from an off-axis sound target facing away
    const spinnerId = "br-bot-3";
    const partnerId = "br-bot-4";
    for (const ent of [...s.get("entities").all()]) {
      if (ent.bot && ![spinnerId, partnerId, "br-bot-5"].includes(ent.id)) {
        s.get("entities").remove(ent.id);
      }
    }
    landEntity(game, partnerId, { x: -120, y: 0, z: 140 });
    landEntity(game, "br-bot-5", { x: -20, y: 0, z: -20 });
    // Put spinnerId at (0, 0, 0) facing south (angle = Math.PI), target 1.1m north-east
    landEntity(game, spinnerId, { x: 0, y: 0, z: 0, angle: Math.PI });
    s.get("bot-interest").recordSound({
      entityId: "br-bot-5",
      key: "footstep.run",
      gait: "run",
      radius: 15,
      x: 0.9,
      y: 0,
      z: -0.9,
      now,
    }, now);

    // Emit sound right beside spinnerId so sound-interest point is 1.27m behind it
    c.get(spinnerId, "Bot").nextThinkAt = 0;
    const tSpin = c.get(spinnerId, "Transform");
    let totalAbsTurn = 0;
    let prevAngle = tSpin.angle;
    for (let i = 0; i < 30; i += 1) {
      now += 50;
      game.api.step(0.05, now);
      let d = tSpin.angle - prevAngle;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      totalAbsTurn += Math.abs(d);
      prevAngle = tSpin.angle;
    }
    // Turning 135 deg takes <= ~2.5 rad, certainly not >= 5 rad endless orbiting
    assert(totalAbsTurn < 3.6, `Bot must turn cleanly without tight-orbit circling (totalAbsTurn=${totalAbsTurn.toFixed(2)})`);

    // Now test flanker hysteresis (partnerId=br-bot-4 is flanker, spinnerId=br-bot-3 is breacher)
    const flankerState = c.get(partnerId, "Bot");
    const breacherState = c.get(spinnerId, "Bot");
    const brain = s.get("bot-brain");
    // Advance past visible/sound memory TTL and isolate away from br-bot-5 and all vehicle spawns (>225m)
    now += 15_000;
    breacherState.lastKnownTargetId = null;
    breacherState.lastKnownUntil = 0;
    landEntity(game, "br-bot-5", { x: -420, y: 0, z: -420 });

    // Step 1: 11m apart (<16m engage threshold) -> squadRallyPartnerActive stays false
    landEntity(game, spinnerId, { x: -120, y: 0, z: 140, angle: 0 });
    landEntity(game, partnerId, { x: -109, y: 0, z: 140, angle: 0 });
    flankerState.squadRallyPartnerActive = false;
    flankerState.nextThinkAt = 0;
    now += 50;
    game.api.step(0.05, now);
    assert.equal(flankerState.squadRallyPartnerActive, false, "Flanker must not engage partner rally at 11m (<16m)");

    // Step 2: 18m apart (>=16m engage threshold) -> engages partner rally
    landEntity(game, partnerId, { x: -102, y: 0, z: 140, angle: 0 });
    flankerState.nextThinkAt = 0;
    now += 50;
    game.api.step(0.05, now);
    assert.equal(flankerState.squadRallyPartnerActive, true, "Flanker must engage partner rally at 18m (>=16m)");

    // Step 3: 10m apart (between 7m and 16m hysteresis band) -> must remain engaged!
    landEntity(game, partnerId, { x: -110, y: 0, z: 140, angle: 0 });
    flankerState.nextThinkAt = 0;
    now += 50;
    game.api.step(0.05, now);
    assert.equal(flankerState.squadRallyPartnerActive, true, "Hysteresis must hold partner rally at 10m (>7m)");
    assert.equal(brain.commitmentFor(partnerId, now)?.target?.kind, "squad-rally-interest");

    // Step 4: 6m apart (<=7m release threshold) -> cleanly releases
    landEntity(game, partnerId, { x: -114, y: 0, z: 140, angle: 0 });
    flankerState.nextThinkAt = 0;
    now += 50;
    game.api.step(0.05, now);
    assert.equal(flankerState.squadRallyPartnerActive, false, "Flanker must release partner rally once within 7m");
  } finally {
    await game.host.stop();
  }
});

test("bot-interest pause stays under 1.5s and map.insideAnyBuilding covers all BR buildings", async () => {
  assert(
    BOT_EXPLORATION_PAUSE_MIN_MS + BOT_EXPLORATION_PAUSE_SPREAD_MS <= 1500,
    `Exploration pause (${BOT_EXPLORATION_PAUSE_MIN_MS} + ${BOT_EXPLORATION_PAUSE_SPREAD_MS}ms) must not stall bots for 3-6s`,
  );
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  try {
    const map = game.host.services.get("map");
    assert.equal(typeof map.insideAnyBuilding, "function");
    assert.equal(map.insideAnyBuilding({ x: -110, y: 0, z: -75 }), true, "inside forest-hut");
    assert.equal(map.insideAnyBuilding({ x: -175, y: 0, z: 95 }), true, "inside loot-house");
    assert.equal(map.insideAnyBuilding({ x: 135, y: 0, z: 120 }), true, "inside two-storey-house");
    assert.equal(map.insideAnyBuilding({ x: 60, y: 0, z: 0 }), true, "inside warehouse");
    assert.equal(map.insideAnyBuilding({ x: 0, y: 0, z: 0 }), false, "open field is outside buildings");
  } finally {
    await game.host.stop();
  }
});

test("vehicle routes keep final destination exact without lateral lane shift and non-anchor cars arrive cleanly", async () => {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  const s = game.host.services;
  let now = Date.now() + 7000;
  try {
    s.get("battle-royale").arm(now);
    const routes = createDriverRoutes(s.get("physics"), s.get("navigation"), s.get("map"));
    const vehicle = s.get("vehicles").snapshot()[0];
    assert(vehicle, "At least one vehicle must exist");
    const destination = { x: vehicle.x, y: 0, z: vehicle.z - 120 };
    const plan = routes.plan(vehicle, destination);
    const last = plan.points.at(-1);
    assert(last, "Route must contain final point");
    assert(
      Math.hypot(last.x - destination.x, last.z - destination.z) < 0.01,
      `Final vehicle waypoint must match exact goal without +4m lane shift: expected ${JSON.stringify(destination)}, got ${JSON.stringify(last)}`,
    );

    // Also test non-anchor destination arrival via bot-vehicles driver near its target
    const driverId = "br-bot-5";
    for (const ent of [...s.get("entities").all()]) {
      if (ent.bot && ent.id !== driverId && ent.id !== "br-bot-6") s.get("entities").remove(ent.id);
    }
    landEntity(game, "br-bot-6", { x: -350, y: 0, z: -350 });
    landEntity(game, driverId, { x: vehicle.x + 2, y: 0, z: vehicle.z });
    const botVehicles = s.get("bot-vehicles");
    const events = [];
    game.host.events.on("bot-vehicle:released", (payload) => events.push(payload));

    const driveDest = { x: vehicle.x, y: 0, z: vehicle.z - 75 };
    const assigned = botVehicles.assign(driverId, vehicle.id, driveDest, now);
    assert.equal(assigned, true, "Driver must be assigned cleanly");
    let released = null;
    for (let tick = 0; tick < 360; tick += 1) {
      now += 50;
      game.api.step(0.05, now);
      released = events.find((e) => e.entityId === driverId);
      if (released) break;
    }
    assert(released, "Driver must reach destination and release cleanly");
    assert.equal(released.reason, "arrived", `Non-anchor destination must release as 'arrived', got '${released.reason}'`);
  } finally {
    await game.host.stop();
  }
});
