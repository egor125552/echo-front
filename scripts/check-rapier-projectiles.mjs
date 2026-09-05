import { createEchoFrontGame } from "../src/server/game.js";
import { MAX_PROJECTILE_POOL } from "../src/plugins/rapier-projectiles/server.js";

const SHOOTER_ID = "11111111-1111-4111-8111-111111111111";
const TARGET_ID = "22222222-2222-4222-8222-222222222222";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function approximate(actual, expected, tolerance = 0.0001) {
  return Math.abs(Number(actual) - Number(expected)) <= tolerance;
}

function entitySnapshot(game, entityId) {
  return game.api.snapshot().entities.find((entity) => entity.id === entityId) ?? null;
}

function durability(game, entityId) {
  const snapshot = entitySnapshot(game, entityId);
  return {
    health: Number(snapshot?.health) || 0,
    armor: Number(snapshot?.armor) || 0,
  };
}

function sameDurability(first, second) {
  return first.health === second.health && first.armor === second.armor;
}

function totalDurability(state) {
  return state.health + state.armor;
}

async function main() {
  const game = await createEchoFrontGame({ mode: "tdm" });
  try {
    const services = game.host.services;
    const entities = services.get("entities");
    const movement = services.get("movement");
    const weapons = services.get("weapons");
    const projectiles = services.get("projectiles");
    const physics = services.get("physics");
    const teams = services.get("teams");
    const spawnProtection = services.get("spawn-protection");

    game.api.connectHuman(SHOOTER_ID);
    game.api.connectHuman(TARGET_ID);

    let now = Date.now() + 3000;
    for (let frame = 0; frame < 4; frame += 1) {
      now += 1000 / 60;
      game.api.step(1 / 60, now);
    }

    for (const entity of [...entities.all()]) {
      if (entity.bot) entities.remove(entity.id);
    }
    spawnProtection.clear(SHOOTER_ID);
    spawnProtection.clear(TARGET_ID);

    movement.teleport(SHOOTER_ID, { x: 0, y: 0, z: 0, angle: 0 });
    movement.teleport(TARGET_ID, { x: 0, y: 0, z: -10, angle: Math.PI });

    assert(teams.teamOf(SHOOTER_ID) !== teams.teamOf(TARGET_ID), "Test players must be enemies");
    assert(
      physics.lineOfSight(
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: -10 },
        SHOOTER_ID,
        TARGET_ID,
      ),
      "Projectile test lane must be unobstructed",
    );
    assert(weapons.definitions.pistol.muzzleVelocity === 120, "Pistol projectile speed changed unexpectedly");
    assert(weapons.definitions.rifle.muzzleVelocity === 200, "Rifle projectile speed changed unexpectedly");
    assert(approximate(weapons.definitions.pistol.projectileMass, 0.008), "Pistol projectile mass changed unexpectedly");
    assert(approximate(weapons.definitions.pistol.projectileRadius, 0.005), "Pistol projectile radius changed unexpectedly");
    assert(approximate(weapons.definitions.rifle.projectileMass, 0.004), "Rifle projectile mass changed unexpectedly");
    assert(approximate(weapons.definitions.rifle.projectileRadius, 0.003), "Rifle projectile radius changed unexpectedly");
    assert(
      weapons.definitions.rifle.muzzleVelocity > weapons.definitions.pistol.muzzleVelocity,
      "Every firearm must keep its own projectile velocity",
    );

    const durabilityBefore = durability(game, TARGET_ID);
    assert(totalDurability(durabilityBefore) > 0, "Target durability is unavailable");
    assert(weapons.fire(SHOOTER_ID, now), "Pistol did not spawn a projectile");

    const durabilityImmediatelyAfterFire = durability(game, TARGET_ID);
    assert(
      sameDurability(durabilityImmediatelyAfterFire, durabilityBefore),
      `Hitscan regression: durability changed inside weapons.fire (${JSON.stringify(durabilityBefore)} -> ${JSON.stringify(durabilityImmediatelyAfterFire)})`,
    );
    assert(projectiles.activeCount() === 1, "A real projectile was not left active after firing");
    const firedProjectile = projectiles.activeSnapshot(4).find((item) => item.weaponId === "pistol");
    assert(firedProjectile?.shape === "ball", "Pistol projectile is not using a Rapier ball collider");
    assert(approximate(firedProjectile?.mass, 0.008), "Pistol projectile did not receive its physical mass");
    assert(approximate(firedProjectile?.radius, 0.005), "Pistol projectile did not receive its physical radius");

    let durabilityAfterFlight = durabilityImmediatelyAfterFire;
    const flightTrace = [];
    for (let frame = 0; frame < 45 && sameDurability(durabilityAfterFlight, durabilityBefore); frame += 1) {
      now += 1000 / 60;
      game.api.step(1 / 60, now);
      durabilityAfterFlight = durability(game, TARGET_ID);
      if (frame < 16) {
        flightTrace.push({
          frame,
          durability: durabilityAfterFlight,
          active: projectiles.activeSnapshot(2),
          stats: projectiles.stats(),
        });
      }
    }
    assert(
      totalDurability(durabilityAfterFlight) < totalDurability(durabilityBefore),
      `Rapier projectile crossed the target without applying damage (${JSON.stringify(durabilityBefore)} -> ${JSON.stringify(durabilityAfterFlight)}); trace=${JSON.stringify(flightTrace)}`,
    );
    assert(projectiles.stats().hitTotal >= 1, "Rapier contact was not recorded as a projectile hit");

    movement.teleport(SHOOTER_ID, { x: 0, y: 0, z: 0, angle: 0 });
    movement.teleport(TARGET_ID, { x: 0, y: 0, z: -20, angle: Math.PI });
    spawnProtection.clear(TARGET_ID);
    now += 500;
    const dodgeBefore = durability(game, TARGET_ID);
    assert(weapons.fire(SHOOTER_ID, now), "Second pistol projectile did not spawn");
    assert(sameDurability(durability(game, TARGET_ID), dodgeBefore), "Second shot became hitscan");
    movement.teleport(TARGET_ID, { x: 4, y: 0, z: -20, angle: Math.PI });

    for (let frame = 0; frame < 45; frame += 1) {
      now += 1000 / 60;
      game.api.step(1 / 60, now);
    }
    const dodgeAfter = durability(game, TARGET_ID);
    assert(
      sameDurability(dodgeAfter, dodgeBefore),
      `Dodged physical projectile still damaged target (${JSON.stringify(dodgeBefore)} -> ${JSON.stringify(dodgeAfter)})`,
    );

    // Rapier gravity must bend the trajectory without any custom ballistic position updates.
    now += 500;
    const gravityId = projectiles.spawn({
      shooterId: SHOOTER_ID,
      weaponId: "gravity-probe",
      damage: 0,
      speed: 120,
      range: 24,
      mass: 0.008,
      radius: 0.005,
      origin: { x: 80, y: 30, z: 80 },
      direction: { x: 1, y: 0, z: 0 },
      now,
    });
    assert(gravityId, "Gravity probe projectile was not created");
    const gravityStart = projectiles.activeSnapshot(8).find((item) => item.projectileId === gravityId);
    assert(gravityStart, "Gravity probe snapshot is unavailable");
    for (let frame = 0; frame < 6; frame += 1) {
      now += 1000 / 60;
      game.api.step(1 / 60, now);
    }
    const gravityAfter = projectiles.activeSnapshot(8).find((item) => item.projectileId === gravityId);
    assert(gravityAfter, "Gravity probe expired too early");
    const measuredDrop = gravityStart.y - gravityAfter.y;
    assert(measuredDrop > 0.025, `Rapier gravity did not produce measurable bullet drop (${measuredDrop})`);
    assert(gravityAfter.vy < -0.5, `Rapier gravity did not create downward velocity (${gravityAfter.vy})`);
    for (let frame = 0; frame < 8; frame += 1) {
      now += 1000 / 60;
      game.api.step(1 / 60, now);
    }
    assert(
      !projectiles.activeSnapshot(MAX_PROJECTILE_POOL).some((item) => item.projectileId === gravityId),
      "Gravity probe did not expire at its bounded lifetime",
    );

    // A static Rapier wall must physically terminate the projectile before it can continue through it.
    const testWall = physics.createWall({
      x: 60,
      y: 0,
      z: 60,
      hx: 0.12,
      hz: 2,
      height: 4,
      kind: "projectile-test-wall",
    });
    const impactsBeforeWall = projectiles.stats().worldImpactTotal;
    const wallProjectileId = projectiles.spawn({
      shooterId: SHOOTER_ID,
      weaponId: "wall-probe",
      damage: 0,
      speed: 120,
      range: 20,
      mass: 0.008,
      radius: 0.005,
      origin: { x: 55, y: 1, z: 60 },
      direction: { x: 1, y: 0, z: 0 },
      now,
    });
    assert(wallProjectileId, "Wall probe projectile was not created");
    for (let frame = 0; frame < 12; frame += 1) {
      now += 1000 / 120;
      game.api.step(1 / 120, now);
      if (!projectiles.activeSnapshot(16).some((item) => item.projectileId === wallProjectileId)) break;
    }
    const wallStats = projectiles.stats();
    assert(
      wallStats.worldImpactTotal > impactsBeforeWall,
      "Rapier wall did not register a physical projectile impact",
    );
    assert(
      !projectiles.activeSnapshot(16).some((item) => item.projectileId === wallProjectileId),
      "Projectile remained active after hitting a Rapier wall",
    );
    physics.removeWall(testWall);

    for (let index = 0; index < MAX_PROJECTILE_POOL + 17; index += 1) {
      projectiles.spawn({
        shooterId: SHOOTER_ID,
        weaponId: "pool-stress",
        damage: 0,
        speed: 120,
        range: 28,
        origin: { x: index * 0.05, y: 20, z: 20 },
        direction: { x: 0, y: 1, z: 0 },
        now: now + index,
      });
    }
    const stats = projectiles.stats();
    assert(stats.projectileShape === "ball", "Projectile pool is not using Rapier ball colliders");
    assert(stats.gravityDriven === true, "Projectile system is not marked as Rapier-gravity driven");
    assert(stats.poolCapacity === MAX_PROJECTILE_POOL, "Projectile pool capacity changed unexpectedly");
    assert(stats.poolSize <= MAX_PROJECTILE_POOL, "Projectile pool allocated beyond its hard cap");
    assert(stats.active <= MAX_PROJECTILE_POOL, "Active projectile count exceeded the hard cap");
    assert(stats.recycledAtCapacity >= 17, "Projectile pool did not recycle at capacity");

    console.log(JSON.stringify({
      ok: true,
      engine: stats.engine,
      collisionSource: stats.collisionSource,
      projectileShape: stats.projectileShape,
      noHitscan: sameDurability(durabilityImmediatelyAfterFire, durabilityBefore),
      hitAfterRapierSteps: totalDurability(durabilityAfterFlight) < totalDurability(durabilityBefore),
      impactBefore: durabilityBefore,
      impactAfter: durabilityAfterFlight,
      dodgeWorked: sameDurability(dodgeAfter, dodgeBefore),
      pistolVelocity: weapons.definitions.pistol.muzzleVelocity,
      rifleVelocity: weapons.definitions.rifle.muzzleVelocity,
      pistolMass: weapons.definitions.pistol.projectileMass,
      rifleMass: weapons.definitions.rifle.projectileMass,
      pistolRadius: weapons.definitions.pistol.projectileRadius,
      rifleRadius: weapons.definitions.rifle.projectileRadius,
      measuredDropAfter100ms: measuredDrop,
      downwardVelocityAfter100ms: gravityAfter.vy,
      wallImpactWorked: wallStats.worldImpactTotal > impactsBeforeWall,
      poolSize: stats.poolSize,
      poolCapacity: stats.poolCapacity,
      recycledAtCapacity: stats.recycledAtCapacity,
      collisionEventsTotal: stats.collisionEventsTotal,
      physicsStepCount: stats.physicsStepCount,
    }));
  } finally {
    try { await game.host.stop(); } catch {}
  }
}

await main();
