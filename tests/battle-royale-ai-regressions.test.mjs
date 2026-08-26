import test from "node:test";
import assert from "node:assert/strict";
import { PluginHost } from "../src/core/plugin-host.js";
import { createEchoFrontGame } from "../src/server/game.js";
import * as rapierPhysics from "../src/plugins/rapier-physics/server.js";
import * as battleRoyaleMapPlugin from "../src/plugins/battle-royale-map/server.js";
import {
  BUILDING,
  BUILDING_CENTER_X,
  BUILDING_CENTER_Z,
  MIN_STARTING_SEPARATION,
  PLAYER_SPAWN_CLEARANCE,
  STAIR,
  UPPER_FLOOR_Y,
  WAREHOUSE_FRONT_DOOR,
  acousticZoneAt,
  locationAt,
  navigationWaypoint,
  stairHeightAt,
  surfaceAt,
} from "../src/plugins/battle-royale-map/server.js";

async function activeBattleRoyale(playerId) {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  game.api.connectHuman(playerId);
  const deployment = game.api.snapshot().match;
  game.api.step(0.05, deployment.deploymentEndsAt + 1);
  return { game, now: deployment.deploymentEndsAt + 1 };
}

function keepOneBot(game) {
  const entities = game.host.services.get("entities");
  const bots = entities.all().filter((entity) => entity.bot);
  const hunter = bots[0];
  assert.ok(hunter);
  for (const bot of bots.slice(1)) entities.remove(bot.id);
  return hunter;
}

test("the area under the physical ramp is ground floor, not a fake metal stair zone", () => {
  const x = (STAIR.minX + STAIR.maxX) / 2;
  const z = (STAIR.minZ + STAIR.maxZ) / 2;
  const rampY = stairHeightAt({ x, z });
  assert.ok(rampY > 1);

  assert.equal(surfaceAt({ x, y: 0, z }), "concrete");
  assert.equal(acousticZoneAt({ x, y: 0, z }), "warehouse-ground");
  assert.equal(locationAt({ x, y: 0, z }), "Склад, первый этаж");

  assert.equal(surfaceAt({ x, y: rampY, z }), "metal");
  assert.equal(acousticZoneAt({ x, y: rampY, z }), "warehouse-stairs");
  assert.equal(locationAt({ x, y: rampY, z }), "Склад, лестница");
});

test("warehouse navigation exposes semantic door and stair waypoints instead of hard-coding them in bot AI", () => {
  const outside = { x: BUILDING.maxX + 8, y: 0, z: 5 };
  const groundInside = { x: BUILDING.maxX - 4, y: 0, z: 4 };
  const upperEast = { x: BUILDING_CENTER_X + 5, y: UPPER_FLOOR_Y, z: 7 };
  const upperWest = { x: BUILDING_CENTER_X - 5, y: UPPER_FLOOR_Y, z: 7 };

  const enter = navigationWaypoint(outside, upperWest);
  assert.equal(enter?.doorId, "warehouse-front-door");

  const climb = navigationWaypoint(groundInside, upperWest);
  assert.equal(climb?.kind, "stair");
  assert.ok(climb.x >= STAIR.minX - 1 && climb.x <= STAIR.maxX + 1);

  const roomDoor = navigationWaypoint(upperEast, upperWest);
  assert.equal(roomDoor?.doorId, "warehouse-upper-room-door");
});

test("all 96 deterministic starts are outside immediate weapon range and the human start keeps extra clearance", async () => {
  const host = await new PluginHost({ plugins: [rapierPhysics, battleRoyaleMapPlugin] }).start();
  const map = host.services.get("map");
  const spawns = Array.from({ length: 96 }, () => map.nextSpawn());
  assert.equal(spawns.length, 96);
  assert.ok(Math.abs(spawns[0].x - 125) < 0.001);
  assert.ok(Math.abs(spawns[0].z) < 0.001);

  let minimum = Infinity;
  for (let i = 0; i < spawns.length; i += 1) {
    for (let j = i + 1; j < spawns.length; j += 1) {
      minimum = Math.min(minimum, Math.hypot(spawns[i].x - spawns[j].x, spawns[i].z - spawns[j].z));
    }
  }
  assert.ok(minimum >= MIN_STARTING_SEPARATION, `starts are still too dense: ${minimum}`);

  const humanClearance = Math.min(...spawns.slice(1).map((spawn) => (
    Math.hypot(spawn.x - spawns[0].x, spawn.z - spawns[0].z)
  )));
  assert.ok(humanClearance >= PLAYER_SPAWN_CLEARANCE, `human start clearance is only ${humanClearance}`);
  await host.stop();
});

test("door interaction debounces duplicate presses without blocking a deliberate later toggle", async () => {
  const host = await new PluginHost({ plugins: [rapierPhysics, battleRoyaleMapPlugin] }).start();
  const map = host.services.get("map");
  const actor = {
    entityId: "door-debounce",
    x: WAREHOUSE_FRONT_DOOR.x + 1,
    y: 0,
    z: WAREHOUSE_FRONT_DOOR.z,
  };

  const opened = map.interact({ ...actor, now: 1000 });
  assert.equal(opened?.open, true);
  const duplicate = map.interact({ ...actor, now: 1100 });
  assert.equal(duplicate?.ignored, true);
  assert.equal(duplicate?.open, true);
  const closed = map.interact({ ...actor, now: 1600 });
  assert.equal(closed?.open, false);
  await host.stop();
});

test("a BR bot remembers the last actually seen position instead of tracking a hidden player's live coordinates", async () => {
  const { game, now } = await activeBattleRoyale("br-memory-human");
  const hunter = keepOneBot(game);
  const movement = game.host.services.get("movement");
  const physics = game.host.services.get("physics");
  const botCombat = game.host.services.get("bot-combat");

  movement.teleport(hunter.id, { x: 0, y: 0, z: -10, angle: Math.PI });
  movement.teleport("br-memory-human", { x: 0, y: 0, z: -6, angle: 0 });
  const state = game.host.components.get(hunter.id, "Bot");
  state.nextThinkAt = 0;
  botCombat.tick(0.1, now + 100);
  assert.equal(state.lastKnownTargetId, "br-memory-human");
  assert.ok(Math.abs(state.lastKnownX) < 0.001);
  assert.ok(Math.abs(state.lastKnownZ + 6) < 0.001);

  physics.createWall({ kind: "test-wall", x: 0, z: -8, hx: 15, hz: 0.25, height: 3 });
  movement.teleport("br-memory-human", { x: 8, y: 0, z: -6, angle: 0 });
  state.nextThinkAt = 0;
  botCombat.tick(0.1, now + 400);

  assert.ok(Math.abs(state.lastKnownX) < 0.001, `hidden live x leaked into bot memory: ${state.lastKnownX}`);
  assert.ok(Math.abs(state.lastKnownZ + 6) < 0.001, `hidden live z leaked into bot memory: ${state.lastKnownZ}`);
  await game.host.stop();
});

test("a BR bot with a known upper-floor target opens the closed warehouse and physically climbs the Rapier stair", async () => {
  const { game, now: start } = await activeBattleRoyale("br-upper-human");
  const hunter = keepOneBot(game);
  const movement = game.host.services.get("movement");
  const map = game.host.services.get("map");

  movement.teleport(hunter.id, {
    x: WAREHOUSE_FRONT_DOOR.x + 4,
    y: 0,
    z: WAREHOUSE_FRONT_DOOR.z,
    angle: -Math.PI / 2,
  });
  movement.teleport("br-upper-human", {
    x: BUILDING_CENTER_X - 5,
    y: UPPER_FLOOR_Y,
    z: BUILDING_CENTER_Z + 4,
    angle: 0,
  });

  const state = game.host.components.get(hunter.id, "Bot");
  state.lastKnownTargetId = "br-upper-human";
  state.lastKnownX = BUILDING_CENTER_X - 5;
  state.lastKnownY = UPPER_FLOOR_Y;
  state.lastKnownZ = BUILDING_CENTER_Z + 4;
  state.lastKnownUntil = start + 20000;
  state.nextThinkAt = 0;

  for (let step = 1; step <= 240; step += 1) {
    game.api.step(0.05, start + step * 50);
    const transform = game.host.components.get(hunter.id, "Transform");
    if ((transform?.y ?? 0) > UPPER_FLOOR_Y - 0.35) break;
  }

  const transform = game.host.components.get(hunter.id, "Transform");
  const frontDoor = map.doors.find((door) => door.id === "warehouse-front-door");
  assert.equal(frontDoor?.open, true, "bot should open the entrance instead of grinding against the closed door");
  assert.ok((transform?.y ?? 0) > UPPER_FLOOR_Y - 0.35, `bot never reached the upper floor: x=${transform?.x}, y=${transform?.y}, z=${transform?.z}`);
  assert.ok(transform.x < STAIR.maxX, `bot did not traverse the stair run: x=${transform.x}`);
  await game.host.stop();
});

test("a heard shot in the upper west room makes the bot pass the inner door instead of orbiting the stair top", async () => {
  const playerId = "br-upper-search-human";
  const { game, now: start } = await activeBattleRoyale(playerId);
  const hunter = keepOneBot(game);
  const movement = game.host.services.get("movement");
  const map = game.host.services.get("map");
  const brain = game.host.services.get("bot-brain");

  movement.teleport(hunter.id, {
    x: WAREHOUSE_FRONT_DOOR.x + 5,
    y: 0,
    z: WAREHOUSE_FRONT_DOOR.z,
    angle: -Math.PI / 2,
  });
  movement.teleport(playerId, {
    x: BUILDING_CENTER_X - 6,
    y: UPPER_FLOOR_Y,
    z: BUILDING_CENTER_Z + 5,
    angle: 0,
  });

  const state = game.host.components.get(hunter.id, "Bot");
  state.nextThinkAt = 0;
  game.api.step(0.05, start + 50);
  game.host.events.emit("sound:spatial", {
    entityId: playerId,
    key: "weapon.pistol.fire",
    radius: 110,
    x: BUILDING_CENTER_X - 6,
    y: UPPER_FLOOR_Y,
    z: BUILDING_CENTER_Z + 5,
    now: start + 50,
  });
  movement.teleport(playerId, { x: -300, y: 0, z: -300, angle: 0 });

  let crossedInnerDoor = false;
  let sawInvestigate = false;
  let sawSearch = false;
  for (let step = 2; step <= 320; step += 1) {
    game.api.step(0.05, start + step * 50);
    const transform = game.host.components.get(hunter.id, "Transform");
    const brainState = brain.stateFor(hunter.id);
    sawInvestigate ||= brainState?.machineState === "investigate";
    sawSearch ||= brainState?.machineState === "search";
    if ((transform?.y ?? 0) >= UPPER_FLOOR_Y - 0.2 && (transform?.x ?? Infinity) < BUILDING_CENTER_X - 0.5) {
      crossedInnerDoor = true;
      if (sawSearch) break;
    }
  }

  const transform = game.host.components.get(hunter.id, "Transform");
  const frontDoor = map.doors.find((door) => door.id === "warehouse-front-door");
  const upperDoor = map.doors.find((door) => door.id === "warehouse-upper-room-door");
  assert.equal(frontDoor?.open, true, "bot should enter the warehouse");
  assert.equal(upperDoor?.open, true, "bot should open the inner upper-room door");
  assert.equal(sawInvestigate, true, "bot should enter investigate state after hearing the shot");
  assert.equal(crossedInnerDoor, true, `bot never crossed the inner door: x=${transform?.x}, y=${transform?.y}, z=${transform?.z}`);
  assert.equal(sawSearch, true, "bot should continue into bounded search after reaching the heard area");
  await game.host.stop();
});