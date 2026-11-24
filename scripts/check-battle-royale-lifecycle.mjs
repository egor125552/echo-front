import test from "node:test";
import assert from "node:assert/strict";

import { setup } from "../src/plugins/battle-royale/server.js";
import { createEchoFrontGame } from "../src/server/game.js";

function fixture() {
  const listeners = new Map();
  const events = {
    on(name, fn) {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(fn);
    },
    emit(name, payload = {}) {
      for (const fn of listeners.get(name) ?? []) fn(payload);
    },
  };
  const entities = [
    { id: "winner", kind: "human", bot: false, alive: true },
    { id: "victim", kind: "human", bot: false, alive: true },
  ];
  const serviceMap = new Map([
    ["entities", { all: () => entities, get: id => entities.find(entity => entity.id === id) }],
    ["health", { applyDamage() {} }],
  ]);
  const ctx = {
    events,
    services: { get: name => serviceMap.get(name), provide: (name, value) => serviceMap.set(name, value) },
    components: { get() { return null; } },
  };
  return { ctx, events, entities, serviceMap };
}

test("ending during deployment clears the deployment-active flag and preserves event time", async () => {
  const { ctx, events, entities, serviceMap } = fixture();
  await setup(ctx);
  const battleRoyale = serviceMap.get("battle-royale");
  battleRoyale.arm(1000);
  assert.equal(battleRoyale.status(1500).deployment.active, true);

  entities[1].alive = false;
  events.emit("entity:died", { entityId: "victim", killerId: "winner", now: 2000 });
  const status = battleRoyale.status(2000);
  assert.equal(status.phase, "ended");
  assert.equal(status.winnerId, "winner");
  assert.equal(status.endedAt, 2000);
  assert.equal(status.deployment.active, false);
  assert.equal(status.deployment.completedAt, null);
  assert.equal(battleRoyale.placementOf("victim"), 2);
  assert.equal(battleRoyale.placementOf("winner"), 1);
});


test("existing human resumes after deployment but a fresh late join cannot enter the active match", async () => {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  try {
    const playerId = "lifecycle-resume-human";
    const first = game.api.connectHuman(playerId);
    const now = Date.now();
    game.host.events.emit("parachute:landed", { entityId: playerId, now });
    assert.equal(game.host.services.get("battle-royale").status(now).deployment.active, false);
    const resumed = game.api.connectHuman(playerId);
    assert.equal(first.resumed, false);
    assert.equal(resumed.resumed, true);
    assert.throws(() => game.api.connectHuman("lifecycle-late-human"), /late join is not available/);
  } finally {
    await game.host.stop();
  }
});

test("an expired disconnected session cannot spawn a fresh battle-royale fighter", async () => {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  try {
    const playerId = "lifecycle-expired-human";
    game.api.connectHuman(playerId);
    assert.equal(game.api.disconnectHuman(playerId), true);
    assert.throws(() => game.api.connectHuman(playerId), /Reconnect grace expired/);
  } finally {
    await game.host.stop();
  }
});


test("expired disconnect after deployment is a forfeit with placement instead of a silent disappearance", async () => {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  try {
    const playerId = "lifecycle-forfeit-human";
    game.api.connectHuman(playerId);
    const landedAt = 5_000_000;
    game.host.events.emit("parachute:landed", { entityId: playerId, now: landedAt });
    const battle = game.host.services.get("battle-royale");
    assert.equal(battle.status(landedAt).deployment.active, false);
    const forfeitAt = landedAt + 30_000;
    assert.equal(game.api.disconnectHuman(playerId, forfeitAt), true);
    assert.equal(game.host.services.get("entities").get(playerId), undefined);
    assert.equal(battle.placementOf(playerId), 96);
  } finally {
    await game.host.stop();
  }
});

test("disconnect during deployment frees the slot without recording a combat placement", async () => {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  try {
    const playerId = "lifecycle-deployment-leave";
    game.api.connectHuman(playerId);
    const battle = game.host.services.get("battle-royale");
    assert.equal(battle.status().deployment.active, true);
    assert.equal(game.api.disconnectHuman(playerId, 6_000_000), true);
    assert.equal(battle.placementOf(playerId), null);
  } finally {
    await game.host.stop();
  }
});


test("suspending a connected driver stops the car without losing the reconnect seat", async () => {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  try {
    const playerId = "lifecycle-suspended-driver";
    game.api.connectHuman(playerId);
    const now = Date.now() + 1_000;
    game.host.events.emit("parachute:landed", { entityId: playerId, now });
    const services = game.host.services;
    const vehicles = services.get("vehicles");
    const movement = services.get("movement");
    const car = vehicles.stateFor("br-jeep-2");
    movement.teleport(playerId, { x: car.x, y: 0, z: car.z + 2 });
    assert.equal(vehicles.enter(playerId, now, "br-jeep-2"), true);
    vehicles.setInput(playerId, { forward: 1, strafe: 0.4, fireHeld: true });
    assert.equal(vehicles.stateFor("br-jeep-2").input.throttle, 1);

    assert.equal(game.api.suspendHuman(playerId), true);
    const stopped = vehicles.stateFor("br-jeep-2");
    assert.equal(stopped.input.throttle, 0);
    assert.equal(stopped.input.steering, 0);
    assert.equal(stopped.input.nitro, false);
    assert.equal(stopped.input.handbrake, true);
    assert.equal(stopped.driverId, playerId);

    const resumed = game.api.connectHuman(playerId);
    assert.equal(resumed.resumed, true);
    assert.equal(vehicles.driverId("br-jeep-2"), playerId);
  } finally {
    await game.host.stop();
  }
});

test("second human with allowEarlyDropIn can join within 90s after first human lands, dropping via parachute with ground-level squad bots", async () => {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  try {
    const startedAt = 10_000_000;
    const p1 = "early-drop-human-1";
    const p2 = "early-drop-human-2";
    game.api.connectHuman(p1, startedAt, { allowEarlyDropIn: true });
    game.host.events.emit("parachute:landed", { entityId: p1, now: startedAt + 12_000 });
    const br = game.host.services.get("battle-royale");
    assert.equal(br.status(startedAt + 12_000).deployment.active, false);

    // Without allowEarlyDropIn, unit contract still rejects late join
    assert.throws(() => game.api.connectHuman("blocked-late", startedAt + 25_000), /late join is not available/);

    // With allowEarlyDropIn inside 90s window, friend drops in via parachute and bots spawn on ground
    const joined2 = game.api.connectHuman(p2, startedAt + 25_000, { allowEarlyDropIn: true });
    assert.equal(joined2.resumed, false);
    const p2Transform = game.host.components.get(p2, "Transform");
    assert(p2Transform.y >= 400, `Expected late drop-in human to launch at parachute altitude, got y=${p2Transform.y}`);
    for (const mateId of joined2.squadmates) {
      const matePos = game.host.components.get(mateId, "Transform");
      assert.equal(matePos.y, 0, `Expected late drop-in squad bot ${mateId} to spawn on ground, got y=${matePos.y}`);
    }
    assert.equal(game.api.joinStatusFor(p2, startedAt + 25_000, { allowEarlyDropIn: true }).joinable, true);
    assert.equal(game.api.joinStatusFor("third-human", startedAt + 120_000, { allowEarlyDropIn: true }).joinable, false);
  } finally {
    await game.host.stop();
  }
});

