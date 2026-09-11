import { createEchoFrontGame } from "../src/server/game.js";

const SHOOTER_ID = "33333333-3333-4333-8333-333333333333";
const TARGET_ID = "44444444-4444-4444-8444-444444444444";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function entitySnapshot(game, entityId) {
  return game.api.snapshot().entities.find((entity) => entity.id === entityId) ?? null;
}

function durability(snapshot) {
  return (Number(snapshot?.health) || 0) + (Number(snapshot?.armor) || 0);
}

function groundHuman(game, movement, entityId, position) {
  const parachute = game.host.components.get(entityId, "Parachute");
  if (parachute) {
    parachute.phase = "landed";
    parachute.airborne = false;
    parachute.simulatedVerticalVelocity = 0;
    parachute.inflation = 0;
    parachute.glideSpeed = 0;
    parachute.airSpeed = 0;
  }
  movement.teleport(entityId, position);
}

async function main() {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  try {
    const services = game.host.services;
    const entities = services.get("entities");
    const movement = services.get("movement");
    const weapons = services.get("weapons");
    const projectiles = services.get("projectiles");
    const battleRoyale = services.get("battle-royale");
    const vehicles = services.get("vehicles");
    const ragdoll = services.get("ragdoll");

    game.api.connectHuman(SHOOTER_ID);
    game.api.connectHuman(TARGET_ID);

    for (const entity of [...entities.all()]) {
      if (entity.bot) entities.remove(entity.id);
    }

    assert(battleRoyale.isActive(), "Battle Royale must be active for shared-world projectile test");
    assert(vehicles.snapshot().length > 0, "Battle Royale vehicle physics is unavailable");

    groundHuman(game, movement, SHOOTER_ID, { x: 0, y: 0, z: 0, angle: 0 });
    groundHuman(game, movement, TARGET_ID, { x: 0, y: 0, z: -10, angle: Math.PI });

    let now = Date.now() + 1000;
    const dt = 1 / 30;

    // Establish how many Rapier substeps the existing Battle Royale vehicle world
    // performs for one game frame when no projectile is active.
    let beforeSteps = projectiles.physicsStepCount();
    game.api.step(dt, now);
    const baselineSteps = projectiles.physicsStepCount() - beforeSteps;
    assert(baselineSteps > 0, "Battle Royale did not advance its shared Rapier world");

    // Keep a harmless projectile alive through the next frame. Projectile lifecycle
    // must observe the vehicle-owned Rapier steps and must not add another world.step.
    const probeId = projectiles.spawn({
      shooterId: SHOOTER_ID,
      weaponId: "shared-world-probe",
      damage: 0,
      speed: 120,
      range: 28,
      origin: { x: 0, y: 120, z: 0 },
      direction: { x: 0, y: 1, z: 0 },
      now,
    });
    assert(probeId, "Could not spawn Battle Royale shared-world probe projectile");

    beforeSteps = projectiles.physicsStepCount();
    now += dt * 1000;
    game.api.step(dt, now);
    const stepsWithProjectile = projectiles.physicsStepCount() - beforeSteps;
    assert(
      stepsWithProjectile === baselineSteps,
      `Projectile lifecycle double-stepped Battle Royale Rapier world (${baselineSteps} -> ${stepsWithProjectile})`,
    );

    // Verify the real firearm path in Battle Royale too. Damage must not happen in
    // weapons.fire(); it must happen only after a Rapier CCD collision event.
    groundHuman(game, movement, SHOOTER_ID, { x: 0, y: 0, z: 0, angle: 0 });
    groundHuman(game, movement, TARGET_ID, { x: 0, y: 0, z: -10, angle: Math.PI });

    const beforeImpact = entitySnapshot(game, TARGET_ID);
    assert(beforeImpact && Number.isFinite(beforeImpact.health), "Battle Royale target snapshot is unavailable");
    const durabilityBefore = durability(beforeImpact);
    now += 500;
    assert(weapons.fire(SHOOTER_ID, now), "Battle Royale pistol did not spawn a projectile");

    const immediatelyAfterFire = entitySnapshot(game, TARGET_ID);
    assert(
      durability(immediatelyAfterFire) === durabilityBefore,
      `Battle Royale hitscan regression: durability changed inside weapons.fire (${durabilityBefore} -> ${durability(immediatelyAfterFire)})`,
    );

    let afterImpact = immediatelyAfterFire;
    for (let frame = 0; frame < 30 && durability(afterImpact) === durabilityBefore; frame += 1) {
      now += 1000 / 60;
      game.api.step(1 / 60, now);
      afterImpact = entitySnapshot(game, TARGET_ID);
    }

    assert(
      durability(afterImpact) < durabilityBefore,
      `Battle Royale Rapier projectile did not damage target (${durabilityBefore} -> ${durability(afterImpact)})`,
    );

    // A live ragdoll replaces the ordinary character collider with Rapier body-part
    // colliders. Verify projectile ownership still resolves to the same entity and
    // damage is applied from the real CCD collision event, not from a hidden ray hit.
    groundHuman(game, movement, TARGET_ID, { x: 0, y: 0, z: -10, angle: Math.PI });
    const ragdollBefore = entitySnapshot(game, TARGET_ID);
    const ragdollDurabilityBefore = durability(ragdollBefore);
    assert(ragdoll.activate(TARGET_ID, {
      reason: "projectile-test",
      position: { x: 0, y: 0, z: -10 },
      angle: Math.PI,
      velocity: { x: 0, y: 0, z: 0 },
    }, now), "Could not activate Battle Royale ragdoll target");

    const ragdollProjectileId = projectiles.spawn({
      shooterId: SHOOTER_ID,
      weaponId: "ragdoll-projectile-test",
      damage: 7,
      speed: 120,
      range: 28,
      origin: { x: 0, y: 1, z: -0.55 },
      direction: { x: 0, y: 0, z: -1 },
      now,
    });
    assert(ragdollProjectileId, "Could not spawn projectile toward active ragdoll");
    assert(
      durability(entitySnapshot(game, TARGET_ID)) === ragdollDurabilityBefore,
      "Ragdoll projectile applied damage before Rapier advanced",
    );

    let ragdollAfter = entitySnapshot(game, TARGET_ID);
    for (let frame = 0; frame < 30 && durability(ragdollAfter) === ragdollDurabilityBefore; frame += 1) {
      now += 1000 / 60;
      game.api.step(1 / 60, now);
      ragdollAfter = entitySnapshot(game, TARGET_ID);
    }
    assert(
      durability(ragdollAfter) < ragdollDurabilityBefore,
      `Projectile hit active ragdoll without resolving entity damage (${ragdollDurabilityBefore} -> ${durability(ragdollAfter)})`,
    );

    // The vehicle layer correctly rejects an active ragdoll. Wait for the real
    // physics-driven recovery before starting the seated-driver portion of this
    // regression instead of relying on the old invalid "ragdoll can enter" path.
    for (let frame = 0; frame < 600 && ragdoll.isActive(TARGET_ID); frame += 1) {
      now += 1000 / 60;
      game.api.step(1 / 60, now);
    }
    assert(!ragdoll.isActive(TARGET_ID), "Projectile target did not recover from ragdoll before vehicle test");

    // A seated driver has its ordinary character collider disabled. A projectile
    // hitting the real vehicle chassis must therefore still resolve to an occupant
    // instead of disappearing as a harmless world impact. The chassis protects the
    // occupant, so only a fraction of projectile damage should pass through.
    const vehicleId = "br-jeep-2";
    const vehicleBefore = vehicles.stateFor(vehicleId);
    assert(vehicleBefore && !vehicleBefore.driverId, `${vehicleId} is unavailable for occupant projectile test`);
    groundHuman(game, movement, TARGET_ID, {
      x: vehicleBefore.x + 1.5, y: 0, z: vehicleBefore.z, angle: 0,
    });
    now += 500;
    assert(vehicles.enter(TARGET_ID, now, vehicleId), "Could not seat projectile target in vehicle");
    assert(vehicles.driverId(vehicleId) === TARGET_ID, "Vehicle driver seat did not contain projectile target");

    const seatedBefore = entitySnapshot(game, TARGET_ID);
    const seatedDurabilityBefore = durability(seatedBefore);
    let seatedImpact = null;
    const offImpact = game.host.events.on?.("projectile:impact", (payload) => {
      if (payload?.vehicleId === vehicleId) seatedImpact = payload;
    });
    const vehicleState = vehicles.stateFor(vehicleId);
    const origin = { x: vehicleState.x, y: vehicleState.y + 5, z: vehicleState.z };
    const vehicleProjectileId = projectiles.spawn({
      shooterId: SHOOTER_ID,
      weaponId: "vehicle-occupant-projectile-test",
      damage: 40,
      speed: 120,
      range: 30,
      origin,
      direction: { x: 0, y: -1, z: 0 },
      now,
    });
    assert(vehicleProjectileId, "Could not spawn projectile toward occupied vehicle");

    let seatedAfter = seatedBefore;
    for (let frame = 0; frame < 30 && durability(seatedAfter) === seatedDurabilityBefore; frame += 1) {
      now += 1000 / 60;
      game.api.step(1 / 60, now);
      seatedAfter = entitySnapshot(game, TARGET_ID);
    }
    const seatedDamage = seatedDurabilityBefore - durability(seatedAfter);
    assert(seatedDamage > 0, "Occupied vehicle chassis made the driver projectile-immune");
    assert(seatedDamage < 40, `Vehicle chassis failed to reduce occupant damage (${seatedDamage})`);
    assert(seatedImpact?.targetId === TARGET_ID, `Vehicle projectile resolved to ${seatedImpact?.targetId ?? "no target"} instead of driver`);
    assert(seatedImpact?.vehicleId === vehicleId, "Vehicle projectile impact did not report vehicle id");
    assert(Number(seatedImpact?.damageMultiplier) > 0 && Number(seatedImpact?.damageMultiplier) < 1, "Vehicle projectile impact did not apply a protective multiplier");
    if (typeof offImpact === "function") offImpact();
    vehicles.exit(TARGET_ID, now, "projectile-test-complete");

    // The original br-jeep-1 uses the base vehicle plugin rather than the fleet
    // wrapper. It must follow the same occupant-damage path as the added vehicles.
    const primaryVehicleId = "br-jeep-1";
    const primaryState = vehicles.stateFor(primaryVehicleId);
    groundHuman(game, movement, TARGET_ID, { x: primaryState.x + 1.5, y: 0, z: primaryState.z, angle: 0 });
    now += 500;
    assert(vehicles.enter(TARGET_ID, now, primaryVehicleId), "Could not seat target in base BR jeep");
    const primaryBefore = durability(entitySnapshot(game, TARGET_ID));
    let primaryImpact = null;
    const offPrimary = game.host.events.on?.("projectile:impact", (payload) => {
      if (payload?.vehicleId === primaryVehicleId) primaryImpact = payload;
    });
    const primaryCar = vehicles.stateFor(primaryVehicleId);
    projectiles.spawn({
      shooterId: SHOOTER_ID, weaponId: "base-vehicle-projectile-test", damage: 40,
      speed: 120, range: 30,
      origin: { x: primaryCar.x, y: primaryCar.y + 5, z: primaryCar.z },
      direction: { x: 0, y: -1, z: 0 }, now,
    });
    for (let frame = 0; frame < 30 && durability(entitySnapshot(game, TARGET_ID)) === primaryBefore; frame += 1) {
      now += 1000 / 60;
      game.api.step(1 / 60, now);
    }
    const primaryDamage = primaryBefore - durability(entitySnapshot(game, TARGET_ID));
    assert(primaryDamage > 0 && primaryDamage < 40, `Base BR jeep occupant damage failed (${primaryDamage})`);
    assert(primaryImpact?.targetId === TARGET_ID, "Base BR jeep projectile did not resolve to driver");
    if (typeof offPrimary === "function") offPrimary();
    vehicles.exit(TARGET_ID, now, "base-projectile-test-complete");

    // Friendly occupants must remain protected and the impact telemetry must say so.
    const shooterTeam = game.host.components.get(SHOOTER_ID, "Team");
    const targetTeam = game.host.components.get(TARGET_ID, "Team");
    const originalTargetTeam = targetTeam?.id;
    if (shooterTeam && targetTeam) targetTeam.id = shooterTeam.id;
    const friendlyState = vehicles.stateFor(vehicleId);
    groundHuman(game, movement, TARGET_ID, { x: friendlyState.x + 1.5, y: 0, z: friendlyState.z, angle: 0 });
    now += 500;
    assert(vehicles.enter(TARGET_ID, now, vehicleId), "Could not seat friendly projectile target");
    const friendlyBefore = durability(entitySnapshot(game, TARGET_ID));
    let friendlyImpact = null;
    const offFriendly = game.host.events.on?.("projectile:impact", (payload) => {
      if (payload?.vehicleId === vehicleId && payload?.weaponId === "friendly-vehicle-projectile-test") friendlyImpact = payload;
    });
    const friendlyCar = vehicles.stateFor(vehicleId);
    projectiles.spawn({
      shooterId: SHOOTER_ID, weaponId: "friendly-vehicle-projectile-test", damage: 40,
      speed: 120, range: 30,
      origin: { x: friendlyCar.x, y: friendlyCar.y + 5, z: friendlyCar.z },
      direction: { x: 0, y: -1, z: 0 }, now,
    });
    for (let frame = 0; frame < 30 && !friendlyImpact; frame += 1) {
      now += 1000 / 60;
      game.api.step(1 / 60, now);
    }
    assert(durability(entitySnapshot(game, TARGET_ID)) === friendlyBefore, "Friendly occupied vehicle leaked projectile damage");
    assert(friendlyImpact?.friendBlocked === true, "Friendly vehicle impact failed to report friendBlocked");
    assert(friendlyImpact?.targetId === null, "Friendly vehicle impact incorrectly selected a damage target");
    if (typeof offFriendly === "function") offFriendly();
    vehicles.exit(TARGET_ID, now, "friendly-projectile-test-complete");
    if (targetTeam && originalTargetTeam != null) targetTeam.id = originalTargetTeam;

    const stats = projectiles.stats();
    assert(stats.collisionSource === "rapier-collision-events", "Battle Royale projectile collision source is not Rapier");
    assert(stats.hitTotal >= 2, "Battle Royale projectile contacts were not recorded");

    console.log(JSON.stringify({
      ok: true,
      engine: stats.engine,
      collisionSource: stats.collisionSource,
      sharedWorldBaselineSteps: baselineSteps,
      sharedWorldStepsWithProjectile: stepsWithProjectile,
      noDoubleStep: stepsWithProjectile === baselineSteps,
      noHitscan: durability(immediatelyAfterFire) === durabilityBefore,
      impactBefore: { health: beforeImpact.health, armor: beforeImpact.armor },
      impactAfter: { health: afterImpact.health, armor: afterImpact.armor },
      ragdollImpactBefore: { health: ragdollBefore.health, armor: ragdollBefore.armor },
      ragdollImpactAfter: { health: ragdollAfter.health, armor: ragdollAfter.armor },
      ragdollHitWorked: durability(ragdollAfter) < ragdollDurabilityBefore,
      vehicleOccupantHitWorked: seatedDamage > 0 && seatedDamage < 40,
      vehicleOccupantDamage: seatedDamage,
      vehicleOccupantMultiplier: seatedImpact?.damageMultiplier ?? null,
      hitTotal: stats.hitTotal,
      activeProjectiles: stats.active,
      poolSize: stats.poolSize,
    }));
  } finally {
    try { await game.host.stop(); } catch {}
  }
}

await main();
