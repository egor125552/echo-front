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
      hitTotal: stats.hitTotal,
      activeProjectiles: stats.active,
      poolSize: stats.poolSize,
    }));
  } finally {
    try { await game.host.stop(); } catch {}
  }
}

await main();
