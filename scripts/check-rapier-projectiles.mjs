import { createEchoFrontGame } from "../src/server/game.js";
import { MAX_PROJECTILE_POOL } from "../src/plugins/rapier-projectiles/server.js";

const SHOOTER_ID = "11111111-1111-4111-8111-111111111111";
const TARGET_ID = "22222222-2222-4222-8222-222222222222";

function assert(condition, message) {
  if (!condition) throw new Error(message);
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

    // The target is moved after the trigger pull but before Rapier advances. A
    // hitscan weapon would have already damaged it; a real projectile can miss.
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

    // Saturation is bounded: oldest active projectiles are recycled instead of
    // allocating an unbounded number of Rapier rigid bodies in a Worker.
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
    assert(stats.poolCapacity === MAX_PROJECTILE_POOL, "Projectile pool capacity changed unexpectedly");
    assert(stats.poolSize <= MAX_PROJECTILE_POOL, "Projectile pool allocated beyond its hard cap");
    assert(stats.active <= MAX_PROJECTILE_POOL, "Active projectile count exceeded the hard cap");
    assert(stats.recycledAtCapacity >= 17, "Projectile pool did not recycle at capacity");

    console.log(JSON.stringify({
      ok: true,
      engine: stats.engine,
      collisionSource: stats.collisionSource,
      noHitscan: sameDurability(durabilityImmediatelyAfterFire, durabilityBefore),
      hitAfterRapierSteps: totalDurability(durabilityAfterFlight) < totalDurability(durabilityBefore),
      impactBefore: durabilityBefore,
      impactAfter: durabilityAfterFlight,
      dodgeWorked: sameDurability(dodgeAfter, dodgeBefore),
      pistolVelocity: weapons.definitions.pistol.muzzleVelocity,
      rifleVelocity: weapons.definitions.rifle.muzzleVelocity,
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
