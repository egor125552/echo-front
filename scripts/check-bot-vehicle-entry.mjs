import assert from "node:assert/strict";
import { test } from "node:test";
import { createEchoFrontGame } from "../src/server/game.js";

const VEHICLE_ID = "br-jeep-2";
const DESTINATION = { x: -100, y: 0, z: 0 };

async function fixture(run) {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  const { services, components } = game.host;
  const entities = services.get("entities");
  const movement = services.get("movement");
  const vehicles = services.get("vehicles");
  const physics = services.get("physics");
  let now = Date.now();
  function ground(id, position) {
    const parachute = components.get(id, "Parachute");
    if (parachute) Object.assign(parachute, { phase: "landed", airborne: false,
      simulatedVerticalVelocity: 0, inflation: 0, glideSpeed: 0, airSpeed: 0 });
    movement.teleport(id, position);
  }
  function spawn(id, position) {
    entities.spawn({ id, kind: "bot", bot: true, health: 200, weapons: ["rifle"], position });
    ground(id, position);
    return id;
  }
  function advance(count = 1) {
    for (let i = 0; i < count; i += 1) {
      now += 1000 / 30;
      game.api.step(1 / 30, now);
    }
  }
  try {
    // Two distant humans keep the match active even after a test driver dies.
    game.api.connectHuman("entry-human-1");
    game.api.connectHuman("entry-human-2");
    for (const entity of entities.all()) if (entity.bot) entities.remove(entity.id);
    ground("entry-human-1", { x: 200, y: 0, z: 200 });
    ground("entry-human-2", { x: -200, y: 0, z: 200 });
    const body = physics.dynamicBody(VEHICLE_ID);
    body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    physics.setDynamicBodyTranslation(VEHICLE_ID, { x: 0, y: 1, z: 0 });
    physics.setDynamicBodyLinearVelocity(VEHICLE_ID, { x: 0, y: 0, z: 0 });
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    advance(45);
    assert.ok(services.get("battle-royale").isActive(), "Fixture must keep the real match active");
    await run({ game, services, components, entities, vehicles, physics, spawn, ground, advance,
      now: () => now, get drivers() { return services.get("bot-vehicles"); } });
  } finally {
    await game.host.stop();
  }
}

for (const vehicleId of ["br-jeep-1", VEHICLE_ID]) {
  test(`a bot can enter the free driver seat of ${vehicleId}`, () => fixture(({ vehicles, spawn, now }) => {
    const car = vehicles.snapshot().find((vehicle) => vehicle.id === vehicleId);
    const bot = spawn("entry-bot", { x: car.x, y: 0, z: car.z + 2.5 });
    assert.equal(vehicles.enter(bot, now(), vehicleId), true);
    assert.equal(vehicles.driverId(vehicleId), bot);
  }));
}

test("assigned bot walks to the car without teleporting, then takes the driver seat", () => fixture(({ drivers, spawn, components, vehicles, advance, now }) => {
  const bot = spawn("walking-bot", { x: 0, y: 0, z: 12 });
  const start = { ...components.get(bot, "Transform") };
  assert.equal(drivers.assign(bot, VEHICLE_ID, DESTINATION, now()), true);
  assert.deepEqual(components.get(bot, "Transform"), start, "Assignment must not teleport the bot");
  assert.equal(vehicles.isDriving(bot), false);
  advance();
  const first = components.get(bot, "Transform");
  assert.ok(Math.hypot(first.x - start.x, first.z - start.z) < 1, "One frame must not jump to the car");
  let walked = false;
  for (let tick = 0; tick < 450 && !vehicles.isDriving(bot); tick += 1) {
    advance();
    const position = components.get(bot, "Transform");
    if (!vehicles.isDriving(bot) && Math.hypot(position.x - start.x, position.z - start.z) > 1) walked = true;
  }
  assert.ok(walked, "Bot must visibly cover ground on foot before entering");
  assert.equal(vehicles.driverId(VEHICLE_ID), bot, "Bot must reach and enter the car within 15 seconds");
}));

test("a bot cannot replace a living human driver or become a passenger", () => fixture(({ drivers, spawn, ground, vehicles, advance, now }) => {
  ground("entry-human-1", { x: 0, y: 0, z: 2.5 });
  assert.equal(vehicles.enter("entry-human-1", now(), VEHICLE_ID), true);
  const bot = spawn("waiting-bot", { x: 0, y: 0, z: 3 });
  assert.equal(vehicles.enter(bot, now(), VEHICLE_ID), false);
  assert.equal(drivers.assign(bot, VEHICLE_ID, DESTINATION, now()), false);
  advance(15);
  assert.equal(vehicles.driverId(VEHICLE_ID), "entry-human-1");
  assert.equal(vehicles.isDriving(bot), false);
}));

test("another bot can take the free seat after the driver dies", () => fixture(({ services, spawn, vehicles, now }) => {
  const first = spawn("dead-driver", { x: 0, y: 0, z: 2.5 });
  assert.equal(vehicles.enter(first, now(), VEHICLE_ID), true);
  const result = services.get("health").applyDamage(first, 10000, { now: now() });
  assert.equal(result.killed, true);
  assert.equal(vehicles.driverId(VEHICLE_ID), null);
  const second = spawn("replacement-driver", { x: 0, y: 0, z: -2.5 });
  assert.equal(vehicles.enter(second, now(), VEHICLE_ID), true);
  assert.equal(vehicles.driverId(VEHICLE_ID), second);
}));

test("two bots cannot share one driver seat", () => fixture(({ spawn, vehicles, now }) => {
  const first = spawn("first-driver", { x: 0, y: 0, z: 2.5 });
  const second = spawn("second-driver", { x: 0, y: 0, z: -2.5 });
  const results = [vehicles.enter(first, now(), VEHICLE_ID), vehicles.enter(second, now(), VEHICLE_ID)];
  assert.deepEqual(results, [true, false]);
  assert.equal(vehicles.driverId(VEHICLE_ID), first);
  assert.equal(vehicles.isDriving(second), false);
}));

test("a seated bot cannot fire its weapon", () => fixture(({ services, components, spawn, vehicles, now }) => {
  const bot = spawn("armed-driver", { x: 0, y: 0, z: 2.5 });
  const inventory = components.get(bot, "Weapons");
  const weapon = inventory.items[inventory.selected];
  assert.ok(weapon.ammo > 0, "Fixture must give the driver a loaded weapon");
  assert.equal(vehicles.enter(bot, now(), VEHICLE_ID), true);
  const ammo = weapon.ammo;
  assert.equal(services.get("weapons").fire(bot, now() + 1000), false);
  assert.equal(weapon.ammo, ammo, "A rejected shot must not consume ammunition");
}));

test("a passenger cannot use on-foot controls and can exit with interact", () => fixture(({ services, components, ground, vehicles, now }) => {
  ground("entry-human-1", { x: 0, y: 0, z: 2.5 });
  ground("entry-human-2", { x: 0, y: 0, z: -2.5 });
  assert.equal(vehicles.enter("entry-human-1", now(), VEHICLE_ID), true);
  assert.equal(vehicles.enterPassenger("entry-human-2", VEHICLE_ID, now()), true);
  assert.equal(vehicles.isPassenger("entry-human-2"), true);

  const inventory = components.get("entry-human-2", "Weapons");
  const weapon = inventory.items[inventory.selected];
  const ammo = weapon.ammo;
  services.get("movement").setInput("entry-human-2", { forward: 1, strafe: 1, sprint: true });
  assert.deepEqual(components.get("entry-human-2", "Input"), {
    forward: 0, strafe: 0, turn: 0, sprint: false, fireHeld: false,
  });
  assert.equal(services.get("weapons").fire("entry-human-2", now() + 1000), false);
  assert.equal(weapon.ammo, ammo, "Passenger fire must not consume ammunition without drive-by support");

  assert.equal(vehicles.interact("entry-human-2", now() + 1100), true, "Interact must exit the passenger seat");
  assert.equal(vehicles.isPassenger("entry-human-2"), false);
  assert.deepEqual(vehicles.passengerIds(VEHICLE_ID), []);
  assert.equal(services.get("weapons").fire("entry-human-2", now() + 2000), true,
    "Normal weapon fire must resume after leaving the passenger seat");
}));

test("a downed passenger is automatically removed from the vehicle", () => fixture(({ services, ground, vehicles, now }) => {
  ground("entry-human-1", { x: 0, y: 0, z: 2.5 });
  ground("entry-human-2", { x: 0, y: 0, z: -2.5 });
  assert.equal(vehicles.enter("entry-human-1", now(), VEHICLE_ID), true);
  assert.equal(vehicles.enterPassenger("entry-human-2", VEHICLE_ID, now()), true);

  const result = services.get("health").applyDamage("entry-human-2", 10_000, {
    attackerId: "entry-human-1", weaponId: "passenger-down-test", now: now() + 1000,
  });
  assert.equal(result.downed, true, "Fixture damage must enter the BR downed state");
  assert.equal(vehicles.isPassenger("entry-human-2"), false, "Downed entity must leave passenger state");
  assert.deepEqual(vehicles.passengerIds(VEHICLE_ID), [], "Downed passenger must release the seat");
  assert.equal(vehicles.driverId(VEHICLE_ID), "entry-human-1", "Passenger downing must not eject the driver");
  assert.equal(services.get("injury").stateFor("entry-human-2")?.downed, true);
}));

test("a passenger is ejected when the driver disconnects", () => fixture(({ game, ground, vehicles, now }) => {
  ground("entry-human-1", { x: 0, y: 0, z: 2.5 });
  ground("entry-human-2", { x: 0, y: 0, z: -2.5 });
  assert.equal(vehicles.enter("entry-human-1", now(), VEHICLE_ID), true);
  assert.equal(vehicles.enterPassenger("entry-human-2", VEHICLE_ID, now()), true);

  assert.equal(game.api.disconnectHuman("entry-human-1", now() + 1000), true);
  assert.equal(vehicles.driverId(VEHICLE_ID), null);
  assert.equal(vehicles.isPassenger("entry-human-2"), false, "Driver removal must release passengers");
  assert.deepEqual(vehicles.passengerIds(VEHICLE_ID), []);
  assert.equal(vehicles.stateFor(VEHICLE_ID)?.occupied, false);
}));

test("multiple passengers are ejected to distinct positions", () => fixture(({ components, ground, spawn, vehicles, now }) => {
  ground("entry-human-1", { x: 0, y: 0, z: 2.5 });
  assert.equal(vehicles.enter("entry-human-1", now(), VEHICLE_ID), true);
  const passengers = [
    spawn("multi-passenger-1", { x: 0, y: 0, z: 2.2 }),
    spawn("multi-passenger-2", { x: 0, y: 0, z: 2.0 }),
    spawn("multi-passenger-3", { x: 0, y: 0, z: 1.8 }),
  ];
  for (const id of passengers) assert.equal(vehicles.enterPassenger(id, VEHICLE_ID, now()), true);

  assert.equal(vehicles.exit("entry-human-1", now() + 1000, "multi-passenger-test"), true);
  const positions = passengers.map((id) => ({ id, ...components.get(id, "Transform") }));
  for (let i = 0; i < positions.length; i += 1) {
    for (let j = i + 1; j < positions.length; j += 1) {
      const spacing = Math.hypot(positions[i].x - positions[j].x, positions[i].z - positions[j].z);
      assert.ok(spacing >= 1, `Passengers ${positions[i].id}/${positions[j].id} overlapped after ejection (${spacing})`);
    }
  }
  assert.deepEqual(vehicles.passengerIds(VEHICLE_ID), []);
}));


test("plating is blocked while seated and cancelled on vehicle entry", () => fixture(({ services, components, ground, vehicles, now }) => {
  const armor = services.get("armor");
  const player = "entry-human-1";
  const armorState = components.get(player, "Armor");
  armorState.current = Math.max(0, armorState.maximum - armorState.plateValue);
  armorState.reserve = 2;
  ground(player, { x: 0, y: 0, z: 2.5 });

  assert.equal(vehicles.enter(player, now(), VEHICLE_ID), true);
  assert.equal(armor.startPlating(player, now() + 10), false, "A seated occupant must not start plating");
  assert.equal(armor.isPlating(player), false);
  assert.equal(vehicles.exit(player, now() + 20, "plating-test"), true);

  assert.equal(armor.startPlating(player, now() + 30), true, "On-foot player should be able to start plating");
  assert.equal(armor.isPlating(player), true);
  ground(player, { x: 0, y: 0, z: 2.5 });
  assert.equal(vehicles.enter(player, now() + 40, VEHICLE_ID), true);
  assert.equal(armor.isPlating(player), false, "Entering a vehicle must cancel active plating");
}));


test("high-speed driver bailout ragdolls both driver and passengers", () => fixture(({ services, ground, vehicles, physics, now }) => {
  const match = services.get("match-api");
  const ragdoll = services.get("ragdoll");
  const driver = "entry-human-1";
  const passenger = "entry-human-2";
  ground(driver, { x: 0, y: 0, z: 2.5 });
  ground(passenger, { x: 0, y: 0, z: -2.5 });
  assert.equal(vehicles.enter(driver, now(), VEHICLE_ID), true);
  assert.equal(vehicles.enterPassenger(passenger, VEHICLE_ID, now()), true);
  physics.setDynamicBodyLinearVelocity(VEHICLE_ID, { x: 30, y: 0, z: 0 });
  match.step(0.05, now() + 50);
  assert.ok(vehicles.stateFor(VEHICLE_ID).speedKph > 100, "Fixture must reach high-speed bailout velocity");
  match.handleInput(driver, { interactPressed: true }, now() + 60);
  assert.equal(vehicles.driverId(VEHICLE_ID), null);
  assert.deepEqual(vehicles.passengerIds(VEHICLE_ID), []);
  assert.equal(ragdoll.stateFor(driver)?.reason, "vehicle-eject", "Driver must ragdoll on high-speed bailout");
  assert.equal(ragdoll.stateFor(passenger)?.reason, "vehicle-eject", "Passenger must inherit high-speed bailout ragdoll");
}));


test("high-speed passenger self-exit ragdolls only that passenger", () => fixture(({ services, ground, vehicles, physics, now }) => {
  const match = services.get("match-api");
  const ragdoll = services.get("ragdoll");
  const driver = "entry-human-1";
  const passenger = "entry-human-2";
  ground(driver, { x: 0, y: 0, z: 2.5 });
  ground(passenger, { x: 0, y: 0, z: -2.5 });
  assert.equal(vehicles.enter(driver, now(), VEHICLE_ID), true);
  assert.equal(vehicles.enterPassenger(passenger, VEHICLE_ID, now()), true);
  physics.setDynamicBodyLinearVelocity(VEHICLE_ID, { x: 30, y: 0, z: 0 });
  match.step(0.05, now() + 50);
  match.handleInput(passenger, { interactPressed: true }, now() + 60);
  assert.equal(vehicles.driverId(VEHICLE_ID), driver, "Passenger bailout must not eject the driver");
  assert.deepEqual(vehicles.passengerIds(VEHICLE_ID), []);
  assert.equal(ragdoll.stateFor(driver), null, "Driver must remain seated after passenger bailout");
  assert.equal(ragdoll.stateFor(passenger)?.reason, "vehicle-eject", "Passenger must ragdoll on high-speed self-exit");
}));


test("active ragdoll cannot enter a vehicle but recovered player can", () => fixture(({ services, components, ground, vehicles, physics, now }) => {
  const match = services.get("match-api");
  const ragdoll = services.get("ragdoll");
  const player = "entry-human-1";
  ground(player, { x: 0, y: 0, z: 2.5 });
  assert.equal(vehicles.enter(player, now(), VEHICLE_ID), true);
  physics.setDynamicBodyLinearVelocity(VEHICLE_ID, { x: 18, y: 0, z: 0 });
  match.step(0.05, now() + 50);
  match.handleInput(player, { interactPressed: true }, now() + 60);
  assert.equal(ragdoll.stateFor(player)?.reason, "vehicle-eject");
  assert.equal(components.get(player, "Transform")?.ragdollActive, true);
  assert.equal(vehicles.enter(player, now() + 61, VEHICLE_ID), false, "Active ragdoll must not re-enter a vehicle");

  physics.setDynamicBodyLinearVelocity(VEHICLE_ID, { x: 0, y: 0, z: 0 });
  let tickNow = now() + 100;
  for (let i = 0; i < 320 && ragdoll.isActive(player); i += 1) {
    tickNow += 50;
    match.step(0.05, tickNow);
  }
  assert.equal(ragdoll.isActive(player), false, "Fixture must allow natural ragdoll recovery");
  assert.equal(components.get(player, "Transform")?.ragdollActive, false, "Ragdoll flag must clear on recovery");
  const car = vehicles.stateFor(VEHICLE_ID);
  ground(player, { x: car.x + 1, y: 0, z: car.z });
  assert.equal(vehicles.enter(player, tickNow + 10, VEHICLE_ID), true, "Recovered player must be allowed back into a vehicle");
}));

test("one approaching bot reserves the car against a second approach", () => fixture(({ drivers, spawn, now }) => {
  const first = spawn("reserved-first", { x: 0, y: 0, z: 12 });
  const second = spawn("reserved-second", { x: 0, y: 0, z: -12 });
  assert.equal(drivers.assign(first, VEHICLE_ID, DESTINATION, now()), true);
  assert.equal(drivers.assign(second, VEHICLE_ID, DESTINATION, now()), false);
}));

test("stealing a reserved car only briefly delays the bot from choosing another", () => fixture(({ drivers, spawn, ground, vehicles, physics, advance, now }) => {
  const bot = spawn("stolen-car-bot", { x: 0, y: 0, z: 12 });
  assert.equal(drivers.assign(bot, VEHICLE_ID, DESTINATION, now()), true);
  ground("entry-human-1", { x: 0, y: 0, z: 2.5 });
  assert.equal(vehicles.enter("entry-human-1", now(), VEHICLE_ID), true);
  advance();
  assert.equal(drivers.stateFor(bot), null, "Bot must release a car stolen by a human");
  assert.equal(vehicles.exit("entry-human-1", now(), "test-exit"), true);

  const replacement = vehicles.snapshot().find(car => car.id !== VEHICLE_ID && !car.occupied);
  assert.ok(replacement, "Fixture needs a replacement vehicle");
  physics.setDynamicBodyTranslation(replacement.id, { x: 10, y: 1, z: 0 });
  physics.setDynamicBodyLinearVelocity(replacement.id, { x: 0, y: 0, z: 0 });
  ground(bot, { x: 10, y: 0, z: 6 });
  advance(55);
  if (!drivers.stateFor(bot)) {
    assert.equal(drivers.assign(bot, replacement.id, { x: -100, y: 0, z: 0 }, now()), true,
      "Bot must be allowed to choose another car after the short retry delay");
  }
  assert.ok(drivers.stateFor(bot), "Bot must resume vehicle use instead of staying locked out for 45 seconds");
}));

test("at most two bots can reserve different cars for driving", () => fixture(({ drivers, vehicles, spawn, now }) => {
  const cars = vehicles.snapshot().filter((car) => !car.driverId).slice(0, 3);
  assert.equal(cars.length, 3, "Fixture needs three available cars");
  const outcomes = cars.map((car, index) => {
    const bot = spawn(`capacity-bot-${index}`, { x: car.x, y: 0, z: car.z + 6 });
    return drivers.assign(bot, car.id, { x: car.x - 100, y: 0, z: car.z }, now());
  });
  assert.deepEqual(outcomes, [true, true, false]);
}));

test("a bot driver is ejected by a severe crash instead of being crash-immune", () => fixture(({ game, services, spawn, vehicles, advance, now }) => {
  const bot = spawn("crash-driver", { x: 0, y: 0, z: 2.4 });
  assert.equal(vehicles.enter(bot, now(), VEHICLE_ID), true);

  const originalTickPhysics = vehicles.tickPhysics.bind(vehicles);
  let emitted = false;
  vehicles.tickPhysics = (dt, tickNow) => {
    const result = originalTickPhysics(dt, tickNow);
    if (!emitted) {
      emitted = true;
      game.host.events.emit("vehicle:impact", {
        driverId: bot, vehicleId: VEHICLE_ID, speedBefore: 30, speedAfter: 0, deltaSpeed: 30,
        crashSeverity: 40, crashTier: "critical", impactSource: "rapier-contact-force",
        contactForceMagnitude: 2_000_000, maxContactForceMagnitude: 900_000,
        forceRatio: 5, contactSequence: 1, now: tickNow,
      });
    }
    return result;
  };
  try {
    advance();
  } finally {
    vehicles.tickPhysics = originalTickPhysics;
  }

  const ragdoll = services.get("ragdoll").stateFor(bot);
  assert.equal(vehicles.driverId(VEHICLE_ID), null, "Severe crash must release the bot driver seat");
  assert.equal(ragdoll?.reason, "vehicle-crash", "Severe crash must eject the bot into vehicle-crash ragdoll");
}));

test("a bot crash quarantines the car for AI without blocking a human driver", () => fixture(({ drivers, spawn, ground, vehicles, now }) => {
  const crashed = spawn("quarantine-driver", { x: 0, y: 0, z: 2.5 });
  assert.equal(vehicles.enter(crashed, now(), VEHICLE_ID), true);
  assert.equal(vehicles.exit(crashed, now(), "crash-eject"), true);
  assert.ok(drivers.vehicleCooldownFor(VEHICLE_ID) > now(), "Crash-ejected vehicle must enter AI quarantine");

  const replacement = spawn("quarantine-replacement", { x: 0, y: 0, z: -2.5 });
  assert.equal(drivers.assign(replacement, VEHICLE_ID, DESTINATION, now()), false,
    "Another bot must not immediately reuse a crash-quarantined car");

  ground("entry-human-1", { x: 0, y: 0, z: 2.5 });
  assert.equal(vehicles.enter("entry-human-1", now(), VEHICLE_ID), true,
    "AI quarantine must not prevent a human from entering the same car");
}));

test("a bot driver commits to a human-driven vehicle ram and counts the real impact", () => fixture(({ game, drivers, spawn, ground, vehicles, physics, advance, now }) => {
  const targetVehicle = vehicles.snapshot().find((car) => car.id !== VEHICLE_ID && !car.occupied);
  assert.ok(targetVehicle, "Fixture needs a second free vehicle for the human target");

  ground("entry-human-1", { x: targetVehicle.x, y: 0, z: targetVehicle.z + 2.5 });
  assert.equal(vehicles.enter("entry-human-1", now(), targetVehicle.id), true);

  const bot = spawn("ram-driver", { x: 0, y: 0, z: 2.5 });
  assert.equal(drivers.assign(bot, VEHICLE_ID, { x: -100, y: 0, z: 0 }, now()), true);
  for (let i = 0; i < 120 && !vehicles.isDriving(bot); i += 1) advance();
  assert.equal(vehicles.driverId(VEHICLE_ID), bot, "Ram bot must enter its vehicle first");

  const ramCar = vehicles.stateFor(VEHICLE_ID);
  const ahead = {
    x: ramCar.x + Math.sin(ramCar.angle) * 35,
    y: 1,
    z: ramCar.z - Math.cos(ramCar.angle) * 35,
  };
  physics.setDynamicBodyTranslation(targetVehicle.id, ahead);
  physics.setDynamicBodyLinearVelocity(targetVehicle.id, { x: 0, y: 0, z: 0 });
  advance(4);

  const ramState = drivers.stateFor(bot);
  assert.equal(ramState?.ramVehicleId, targetVehicle.id, "Human-driven car must become the explicit ram target");
  assert.equal(ramState?.ramTargetId, "entry-human-1");
  assert.equal(drivers.summary().ramAttempts, 1, "One continuous ram lock must count as one attempt");

  game.host.events.emit("vehicle:impact", {
    driverId: bot, vehicleId: VEHICLE_ID, otherBodyId: targetVehicle.id,
    speedBefore: 16, speedAfter: 9, deltaSpeed: 7, crashSeverity: 8,
    impactSource: "rapier-contact-force", now: now(),
  });
  const summary = drivers.summary();
  assert.equal(summary.hits, 1, "Only the real target-vehicle impact may count as a ram hit");
  assert.equal(summary.states.find((state) => state.id === bot)?.ramVehicleId, null,
    "Successful ram must clear the active target and enter cooldown");
}));
