import assert from "node:assert/strict";
import { test } from "node:test";
import { createEchoFrontGame } from "../src/server/game.js";
import {
  INITIAL_GENERATED_CRATE_COUNT,
  MAX_ACTIVE_GENERATED_CRATES,
} from "../src/plugins/battle-royale-crate-generator/server.js";

const PLAYER = "11111111-2222-4333-8444-555555555555";

function groundEntity(game, id, position) {
  const c = game.host.components;
  const s = game.host.services;
  const parachute = c.get(id, "Parachute");
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
  s.get("movement").teleport(id, position);
}

function advanceDeployment(game, nowRef) {
  const br = game.host.services.get("battle-royale");
  while (!br.canAct(nowRef.now) || br.status(nowRef.now)?.deployment?.active) {
    nowRef.now += 250;
    game.api.step(0.05, nowRef.now);
  }
}

test("generates randomized, obstacle-free, interactable crates across the map each match", async () => {
  const gameA = await createEchoFrontGame({ mode: "battle-royale" });
  const gameB = await createEchoFrontGame({ mode: "battle-royale" });
  try {
    const mapA = gameA.host.services.get("map");
    const mapB = gameB.host.services.get("map");
    const shopA = gameA.host.services.get("shop");
    const vehiclesA = gameA.host.services.get("vehicles");
    const cratePhysicsA = gameA.host.services.get("crate-physics");

    const genA = mapA.crates.filter((c) => c.generated);
    const genB = mapB.crates.filter((c) => c.generated);
    assert.equal(genA.length, INITIAL_GENERATED_CRATE_COUNT);
    assert.equal(genB.length, INITIAL_GENERATED_CRATE_COUNT);

    // Positions differ between fresh matches
    const sameFirst = Math.abs(genA[0].x - genB[0].x) < 0.01 && Math.abs(genA[0].z - genB[0].z) < 0.01;
    assert.equal(sameFirst, false, "Generated crate coordinates must vary per match");

    const hasRifle = genA.some((c) => c.loot === "rifle");
    const hasArmor = genA.some((c) => c.loot === "armor");
    assert(hasRifle && hasArmor, "Generated crates must include both rifle and armor loot");

    // Clearance checks against buildings, shops, vehicles, and physics bodies
    for (const crate of genA) {
      assert.equal(mapA.insideAnyBuilding({ x: crate.x, y: 0, z: crate.z }, 5.5), false);
      for (const s of shopA.stations()) {
        assert(Math.hypot(crate.x - s.x, crate.z - s.z) >= 9.5, `Crate ${crate.id} too close to shop ${s.id}`);
      }
      for (const v of vehiclesA.snapshot()) {
        assert(Math.hypot(crate.x - v.x, crate.z - v.z) >= 6.5, `Crate ${crate.id} too close to vehicle ${v.id}`);
      }
      assert(cratePhysicsA.crate(crate.id), `Generated crate ${crate.id} must have dynamic physics body`);
    }

    // Player can interact with a generated crate to get loot + dollars
    const nowRef = { now: Date.now() + 1000 };
    const joined = gameA.api.connectHuman(PLAYER);
    const keepIds = new Set([PLAYER, ...joined.squadmates, "br-bot-6"]);
    for (const ent of [...gameA.host.services.get("entities").all()]) {
      if (ent.bot && !keepIds.has(ent.id)) gameA.host.services.get("entities").remove(ent.id);
    }
    groundEntity(gameA, "br-bot-6", { x: -450, y: 0, z: -450, angle: 0 });
    advanceDeployment(gameA, nowRef);
    const target = genA.find((c) => !c.opened) ?? genA[0];
    groundEntity(gameA, PLAYER, { x: target.x - 1.1, y: 0, z: target.z, angle: Math.PI / 2 });
    gameA.drainEvents();
    gameA.api.handleInput(PLAYER, { interactPressed: true }, nowRef.now);
    assert.equal(target.opened, true, "Generated crate must open on interact");
    const self = gameA.api.snapshotFor(PLAYER, nowRef.now).entities.find((e) => e.id === PLAYER);
    assert(self.cash >= 800, "Opening generated crate must grant dollars");
  } finally {
    await gameA.host.stop();
    await gameB.host.stop();
  }
});

test("dynamically replenishes crates inside the safe zone and recycles opened generated crates at cap", async () => {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  const nowRef = { now: Date.now() + 2000 };
  try {
    game.api.connectHuman(PLAYER);
    advanceDeployment(game, nowRef);

    const map = game.host.services.get("map");
    const generator = game.host.services.get("crate-generator");
    const br = game.host.services.get("battle-royale");
    const navigation = game.host.services.get("navigation");

    // Mark nearly all crates opened so replenishment triggers cleanly
    for (const crate of map.crates) {
      crate.opened = true;
    }
    const openedEventCountBefore = generator.unopenedInSafeZone(nowRef.now);
    assert.equal(openedEventCountBefore, 0);

    // Trigger replenishment over time via normal match ticks
    for (let i = 0; i < 340; i += 1) {
      nowRef.now += 50;
      game.api.step(0.05, nowRef.now);
    }

    const statsAfter = generator.stats();
    assert(statsAfter.generatedUnopened >= 1, `Expected new crates to generate mid-match, got ${statsAfter.generatedUnopened}`);

    const zoneRadius = br.zoneRadiusAt(nowRef.now);
    const newlyGenerated = map.crates.filter((c) => c.generated && !c.opened);
    for (const c of newlyGenerated) {
      assert(Math.hypot(c.x, c.z) <= zoneRadius, "Replenished crate must spawn inside safe zone");
    }

    // Navigation map exposes generated crates cleanly
    const crateTargets = navigation.availableTargets(PLAYER, nowRef.now).filter((t) => t.kind === "crate");
    assert(crateTargets.length >= 1, "Карта must list generated unopened crates");

    // Spawn until past cap, verifying opened generated crates recycle cleanly without exceeding cap
    for (let i = 0; i < MAX_ACTIVE_GENERATED_CRATES + 6; i += 1) {
      const oldestOpened = map.crates.find((c) => c.generated && !c.opened);
      if (oldestOpened) oldestOpened.opened = true;
      generator.spawnCrate({ now: nowRef.now + i * 10 });
    }
    assert(
      generator.stats().generatedTotal <= MAX_ACTIVE_GENERATED_CRATES,
      `Generated crates must recycle at cap ${MAX_ACTIVE_GENERATED_CRATES}, got ${generator.stats().generatedTotal}`,
    );
  } finally {
    await game.host.stop();
  }
});

test("tutorial mode keeps crate layout deterministic with zero random outdoor crates", async () => {
  const game = await createEchoFrontGame({ mode: "battle-royale", tutorial: true });
  try {
    const generator = game.host.services.get("crate-generator");
    assert.equal(generator.stats().generatedTotal, 0);
  } finally {
    await game.host.stop();
  }
});
