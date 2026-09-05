import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createEchoFrontGame } from "../src/server/game.js";

const PLAYER_ID = "55555555-5555-4555-8555-555555555555";
const OTHER_PLAYER_ID = "66666666-6666-4666-8666-666666666666";
const DT = 0.05;
let game;
let movement;
let map;
let jump;
let ragdoll;
let now = Date.now() + 1000;

before(async () => {
  game = await createEchoFrontGame({ mode: "battle-royale" });
  const services = game.host.services;
  movement = services.get("movement");
  map = services.get("map");
  jump = services.get("jump");
  ragdoll = services.get("ragdoll");
  game.api.connectHuman(PLAYER_ID);
  game.api.connectHuman(OTHER_PLAYER_ID);
  const entities = services.get("entities");
  for (const entity of [...entities.all()]) {
    if (entity.bot) entities.remove(entity.id);
  }
  for (const id of [PLAYER_ID, OTHER_PLAYER_ID]) {
    const parachute = game.host.components.get(id, "Parachute");
    Object.assign(parachute, {
      phase: "landed", airborne: false, simulatedVerticalVelocity: 0,
      inflation: 0, glideSpeed: 0, airSpeed: 0,
    });
  }
  // Keep a second survivor so Battle Royale does not end on the first frame.
  movement.teleport(OTHER_PLAYER_ID, { x: -300, y: 0, z: -300 });
  assert.ok(services.get("battle-royale").isActive());
  assert.ok(services.get("vehicles").snapshot().length > 0,
    "The integration check must include the shared vehicle physics world");
});
after(async () => game?.host.stop());

function position() {
  const { x, y, z, grounded } = game.host.components.get(PLAYER_ID, "Transform");
  return { x, y, z, grounded };
}

function frame(input = {}) {
  now += DT * 1000;
  game.api.handleInput(PLAYER_ID, input, now);
  game.api.step(DT, now);
  const current = position();
  assert.ok(Number.isFinite(current.y) && current.y >= -0.12,
    `Player penetrated the ground: ${JSON.stringify(current)}`);
  assert.equal(ragdoll.isActive(PLAYER_ID), false,
    `Normal building traversal caused a fall: ${JSON.stringify(current)}`);
  return current;
}

function startAt(point) {
  movement.teleport(PLAYER_ID, { angle: Math.PI / 2, ...point });
  for (let tick = 0; tick < 4; tick += 1) frame();
  game.drainEvents();
}

function walkToX(targetX, { ascending = false } = {}) {
  const direction = Math.sign(targetX - position().x);
  let previous = position();
  for (let tick = 0; tick < 240; tick += 1) {
    if (direction * (targetX - previous.x) <= 0.12) {
      frame();
      return position();
    }
    const current = frame({ forward: direction });
    if (ascending) {
      assert.ok(current.y >= previous.y - 0.12,
        `Player dropped while climbing: ${JSON.stringify(previous)} -> ${JSON.stringify(current)}`);
    }
    previous = current;
  }
  assert.fail(`Player could not reach x=${targetX}: ${JSON.stringify(position())}`);
}

for (const route of [
  { name: "two-storey house", door: "two-storey-front-door", outsideX: 124.5, insideX: 127.5, upperX: 136, z: 120 },
  { name: "warehouse", door: "warehouse-front-door", outsideX: 77, insideX: 73.6, upperX: 65.5, z: 0 },
]) {
  test(`${route.name}: enter, climb, descend and exit through the real match loop at 50 ms`, () => {
    map.setDoorOpen(route.door, true, PLAYER_ID, now);
    startAt({ x: route.outsideX, y: 0, z: route.z });
    walkToX(route.insideX);
    const upstairs = walkToX(route.upperX, { ascending: true });
    assert.ok(Math.abs(upstairs.y - 3.2) < 0.12,
      `${route.name}: failed to reach the upper floor: ${JSON.stringify(upstairs)}`);
    for (let tick = 0; tick < 20; tick += 1) {
      assert.ok(Math.abs(frame().y - 3.2) < 0.12, `${route.name}: upper floor did not support the player`);
    }
    const downstairs = walkToX(route.insideX);
    assert.ok(Math.abs(downstairs.y) < 0.12,
      `${route.name}: failed to descend: ${JSON.stringify(downstairs)}`);
    const outside = walkToX(route.outsideX);
    assert.ok(Math.abs(outside.y) < 0.12);
    assert.ok(Math.abs(outside.z - route.z) < 0.15);
    const blockages = game.drainEvents().filter((packet) =>
      packet.event === "movement:blocked" && packet.payload.recipientId === PLAYER_ID);
    assert.deepEqual(blockages, [], `${route.name}: ordinary traversal produced obstacle announcements`);
  });
}

test("jumping in place halfway up the staircase lands back on the stairs", () => {
  map.setDoorOpen("two-storey-front-door", true, PLAYER_ID, now);
  startAt({ x: 127.5, y: 0, z: 120 });
  walkToX(131.5, { ascending: true });
  for (let tick = 0; tick < 10; tick += 1) frame();
  const takeoff = position();
  assert.ok(takeoff.y > 1 && takeoff.y < 2.2, "Jump must start halfway up the staircase");
  let apex = frame({ jumpPressed: true }).y;
  let wasActive = Boolean(jump.stateFor(PLAYER_ID));
  for (let tick = 0; tick < 50; tick += 1) {
    const current = frame();
    apex = Math.max(apex, current.y);
    wasActive ||= Boolean(jump.stateFor(PLAYER_ID));
    assert.ok(current.y >= takeoff.y - 0.15, "Jump fell through the stairs");
  }
  assert.ok(wasActive, "The input must trigger the real jump plugin");
  assert.ok(apex > takeoff.y + 0.5, "The jump did not leave the stairs");
  assert.equal(jump.stateFor(PLAYER_ID), null, "Jump did not finish");
  assert.ok(Math.abs(position().y - takeoff.y) < 0.15, "Jump did not return to the stair surface");
  walkToX(136, { ascending: true });
  assert.ok(Math.abs(position().y - 3.2) < 0.12, "Player cannot continue upstairs after jumping");
});

test("walking into the side of a staircase stays above ground and explains the obstacle", () => {
  startAt({ x: 131.5, y: 0, z: 123, angle: 0 });
  for (let tick = 0; tick < 30; tick += 1) {
    const current = frame({ forward: 1 });
    assert.ok(current.z >= 122.25, `Player penetrated the stair side: ${JSON.stringify(current)}`);
    assert.ok(Math.abs(current.y) < 0.12, "Side contact lifted or buried the player");
  }
  const announcements = game.drainEvents().filter((packet) =>
    packet.event === "movement:blocked" && packet.payload.recipientId === PLAYER_ID);
  assert.ok(announcements.some((packet) =>
    packet.payload.speech === "Боковая стенка лестницы. Подойди к её началу"),
  `Missing useful stair-side announcement: ${JSON.stringify(announcements)}`);
});

test("ground-floor navigation goes around the solid staircase when leaving and re-entering", () => {
  map.setDoorOpen("two-storey-front-door", true, PLAYER_ID, now);
  const navigation = game.host.services.get("ground-navigation");
  const inside = { x: 139, y: 0, z: 120 };
  const outside = { x: 124, y: 0, z: 120 };
  startAt(inside);
  for (const target of [outside, inside]) {
    const route = [...navigation.requiredWaypoints(position(), target), target];
    for (const waypoint of route) {
      let reached = false;
      for (let tick = 0; tick < 300; tick += 1) {
        const current = position();
        const dx = waypoint.x - current.x;
        const dz = waypoint.z - current.z;
        const distance = Math.hypot(dx, dz);
        if (distance < 0.08) {
          reached = true;
          break;
        }
        // Angle is east throughout this scenario. Forward and strafe together
        // follow the service's actual waypoints without teleporting around walls.
        const scale = Math.max(distance, 3.25 * DT);
        const next = frame({ forward: dx / scale, strafe: dz / scale });
        assert.ok(next.y < 0.2,
          `Ground-floor route climbed the stairs: ${JSON.stringify(next)}, route=${JSON.stringify(route)}`);
      }
      assert.ok(reached,
        `Ground-floor route stuck at ${JSON.stringify(position())}, waypoint=${JSON.stringify(waypoint)}, route=${JSON.stringify(route)}`);
    }
    assert.ok(Math.hypot(position().x - target.x, position().z - target.z) < 0.1);
  }
});

test("automatic guidance follows the stair bypass without skipping its corners", () => {
  map.setDoorOpen("two-storey-front-door", true, PLAYER_ID, now);
  startAt({ x: 139, y: 0, z: 120 });
  const navigation = game.host.services.get("navigation");
  const guidance = game.host.services.get("navigation-face");
  const target = { x: 123, y: 0, z: 120 };
  navigation.registerTarget({ id: "test-building-exit", name: "Test exit", position: target, arriveDistance: 1 });
  navigation.selectTarget(PLAYER_ID, "test-building-exit", now);
  navigation.toggle(PLAYER_ID, now);
  guidance.enableGuidance(PLAYER_ID, now);
  try {
    for (let tick = 0; tick < 500; tick++) {
      const current = frame({ forward: 1 });
      assert.ok(current.y < 0.2, "Guidance took an unintended staircase shortcut");
      if (Math.hypot(current.x - target.x, current.z - target.z) < 1.05) return;
    }
    assert.fail(`Automatic stair bypass is stuck: ${JSON.stringify(position())}`);
  } finally {
    navigation.stop(PLAYER_ID, now);
    guidance.disableGuidance(PLAYER_ID, now);
    navigation.unregisterTarget("test-building-exit");
  }
});

test("automatic guidance reaches the upper floor and returns downstairs", () => {
  map.setDoorOpen("two-storey-front-door", true, PLAYER_ID, now);
  startAt({ x: 139, y: 0, z: 120 });
  const navigation = game.host.services.get("navigation");
  const guidance = game.host.services.get("navigation-face");
  for (const target of [{ x: 136, y: 3.2, z: 120 }, { x: 123, y: 0, z: 120 }]) {
    navigation.registerTarget({ id: "test-floor-change", name: "Test floor", position: target, arriveDistance: 1 });
    navigation.selectTarget(PLAYER_ID, "test-floor-change", now);
    navigation.toggle(PLAYER_ID, now);
    guidance.enableGuidance(PLAYER_ID, now);
    try {
      let reached = false;
      for (let tick = 0; tick < 600; tick++) {
        const current = frame({ forward: 1 });
        if (Math.hypot(current.x - target.x, current.z - target.z) < 1.05
          && Math.abs(current.y - target.y) < 0.2) {
          reached = true;
          break;
        }
        assert.ok(navigation.stateFor(PLAYER_ID).active, "Navigation announced arrival on the wrong floor");
      }
      assert.ok(reached, `Floor navigation stuck: ${JSON.stringify(position())}, target=${JSON.stringify(target)}`);
    } finally {
      navigation.stop(PLAYER_ID, now);
      guidance.disableGuidance(PLAYER_ID, now);
      navigation.unregisterTarget("test-floor-change");
    }
  }
});
