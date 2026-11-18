import assert from "node:assert/strict";
import { test } from "node:test";
import { createEchoFrontGame } from "../src/server/game.js";

const PLAYER = "11111111-2222-4333-8444-555555555555";
const ENEMY_ID = "br-bot-6";

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

function advanceDeploymentIfNeeded(game, nowRef) {
  const br = game.host.services.get("battle-royale");
  while (!br.canAct(nowRef.now)) {
    nowRef.now += 250;
    game.api.step(0.05, nowRef.now);
  }
}

test("opening crates awards dollars and Buy Stations appear on navigation map", async () => {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  const s = game.host.services;
  const nowRef = { now: Date.now() + 1000 };
  try {
    game.api.connectHuman(PLAYER);
    advanceDeploymentIfNeeded(game, nowRef);

    const map = s.get("map");
    const crate = map.crates.find((c) => !c.opened && Math.abs(c.y) < 1.5);
    assert(crate, "Expected an accessible ground crate");

    groundEntity(game, PLAYER, { x: crate.x - 1.0, y: crate.y, z: crate.z, angle: 0 });
    game.drainEvents();

    game.api.handleInput(PLAYER, { interactPressed: true }, nowRef.now);
    const snap = game.api.snapshotFor(PLAYER, nowRef.now);
    const self = snap.entities.find((e) => e.id === PLAYER);
    assert(self.cash >= 800 && self.cash <= 1200, `Expected crate cash in $800-$1200, got ${self.cash}`);
    assert.equal(snap.shops.length, 5, "Expected 5 Buy Stations on the map");

    const cashEvents = game.drainEvents().filter((e) => e.event === "shop:cash-gained");
    assert(cashEvents.some((e) => e.payload.entityId === PLAYER && e.payload.reason === "crate"));

    const targets = s.get("navigation").availableTargets(PLAYER, nowRef.now);
    assert(targets.some((t) => t.kind === "shop"), "Navigation map must expose Buy Station targets");
  } finally {
    await game.host.stop();
  }
});

test("enhanced 1s stimulants self-revive quickly and turbo stimulants boost HP to 600 with a strict 3-purchase limit", async () => {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  const s = game.host.services;
  const nowRef = { now: Date.now() + 2000 };
  try {
    const joined = game.api.connectHuman(PLAYER);
    advanceDeploymentIfNeeded(game, nowRef);

    const keepIds = new Set([PLAYER, ...joined.squadmates, ENEMY_ID]);
    for (const ent of [...s.get("entities").all()]) {
      if (ent.bot && !keepIds.has(ent.id)) s.get("entities").remove(ent.id);
    }

    const shop = s.get("shop");
    const station = shop.stations()[0];
    groundEntity(game, PLAYER, { x: station.x + 1.5, y: station.y, z: station.z, angle: 0 });
    groundEntity(game, joined.squadmates[0], { x: 80, y: 0, z: 80, angle: 0 });
    groundEntity(game, joined.squadmates[1], { x: 82, y: 0, z: 80, angle: 0 });
    groundEntity(game, joined.squadmates[2], { x: 84, y: 0, z: 80, angle: 0 });
    groundEntity(game, ENEMY_ID, { x: -300, y: 0, z: -300, angle: 0 });

    shop.grantCash(PLAYER, 12000, "test");
    game.drainEvents();

    // Verify shop:open-requested fires on shopOpenPressed
    game.api.handleInput(PLAYER, { shopOpenPressed: true }, nowRef.now);
    const openEvents = game.drainEvents().filter((e) => e.event === "shop:open-requested");
    assert.equal(openEvents.length, 1);

    // Buy 1s enhanced stimulant ($900)
    game.api.handleInput(PLAYER, { shopBuy: { itemId: "fast-stimulant" } }, nowRef.now);
    let snapSelf = game.api.snapshotFor(PLAYER, nowRef.now).entities.find((e) => e.id === PLAYER);
    assert.equal(snapSelf.fastStimulants, 1);
    assert.equal(snapSelf.cash, 11100);

    // Down the player and trigger standard N/stimulantPressed -> must auto-pick fast 1s stimulant!
    s.get("health").applyDamage(PLAYER, 999, { attackerId: ENEMY_ID, weaponId: "rifle", now: nowRef.now });
    assert.equal(s.get("injury").isDowned(PLAYER), true);

    game.api.handleInput(PLAYER, { stimulantPressed: true }, nowRef.now);
    for (let i = 0; i < 19; i += 1) {
      nowRef.now += 50;
      game.api.handleInput(PLAYER, {}, nowRef.now);
      game.api.step(0.05, nowRef.now);
    }
    assert.equal(s.get("injury").isDowned(PLAYER), true, "Fast stimulant takes 1000ms (still active at 950ms)");
    nowRef.now += 60;
    game.api.step(0.05, nowRef.now);
    assert.equal(s.get("injury").isDowned(PLAYER), false, "Fast stimulant must self-revive in 1 second");
    snapSelf = game.api.snapshotFor(PLAYER, nowRef.now).entities.find((e) => e.id === PLAYER);
    assert.equal(snapSelf.fastStimulants, 0);

    // Buy 3 turbo stimulants ($1800 each); 4th purchase must fail!
    for (let i = 0; i < 3; i += 1) {
      const res = shop.buy(PLAYER, { itemId: "turbo-stimulant" }, nowRef.now);
      assert.equal(res.ok, true, `Turbo purchase #${i + 1} must succeed`);
    }
    const fourthAttempt = shop.buy(PLAYER, { itemId: "turbo-stimulant" }, nowRef.now);
    assert.equal(fourthAttempt.ok, false);
    assert.equal(fourthAttempt.reason, "limit-reached");

    // Standing turbo stimulant raises health & maximum to 600 HP in 1 second
    game.api.handleInput(PLAYER, { turboStimulantPressed: true }, nowRef.now);
    for (let i = 0; i < 21; i += 1) {
      nowRef.now += 50;
      game.api.step(0.05, nowRef.now);
    }
    snapSelf = game.api.snapshotFor(PLAYER, nowRef.now).entities.find((e) => e.id === PLAYER);
    assert.equal(snapSelf.health, 600);
    assert.equal(snapSelf.healthMax, 600);
    assert.equal(snapSelf.turboStimulants, 2);
    assert.equal(snapSelf.turboPurchasedCount, 3);

    // Even after consuming one, lifetime purchase limit of 3 remains enforced
    const afterUseAttempt = shop.buy(PLAYER, { itemId: "turbo-stimulant" }, nowRef.now);
    assert.equal(afterUseAttempt.ok, false);
    assert.equal(afterUseAttempt.reason, "limit-reached");

    // Downed turbo stimulant revives AND boosts HP to 600 in 1 second
    s.get("health").applyDamage(PLAYER, 9999, { attackerId: ENEMY_ID, weaponId: "rifle", now: nowRef.now });
    assert.equal(s.get("injury").isDowned(PLAYER), true);
    game.api.handleInput(PLAYER, { turboStimulantPressed: true }, nowRef.now);
    for (let i = 0; i < 21; i += 1) {
      nowRef.now += 50;
      game.api.step(0.05, nowRef.now);
    }
    snapSelf = game.api.snapshotFor(PLAYER, nowRef.now).entities.find((e) => e.id === PLAYER);
    assert.equal(s.get("injury").isDowned(PLAYER), false);
    assert.equal(snapSelf.health, 600);
    assert.equal(snapSelf.healthMax, 600);
    assert.equal(snapSelf.turboStimulants, 1);
  } finally {
    await game.host.stop();
  }
});

test("human can buy back fallen squadmate via parachute, and living squadmate bots autonomously buy back a dead human", async () => {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  const s = game.host.services;
  const nowRef = { now: Date.now() + 3000 };
  try {
    const joined = game.api.connectHuman(PLAYER);
    advanceDeploymentIfNeeded(game, nowRef);

    const [mate0, mate1, mate2] = joined.squadmates;
    const keepIds = new Set([PLAYER, ...joined.squadmates, ENEMY_ID]);
    for (const ent of [...s.get("entities").all()]) {
      if (ent.bot && !keepIds.has(ent.id)) s.get("entities").remove(ent.id);
    }

    const shop = s.get("shop");
    const station = shop.stations()[0];
    groundEntity(game, PLAYER, { x: station.x + 1.8, y: station.y, z: station.z, angle: 0 });
    groundEntity(game, mate0, { x: 20, y: 0, z: 20, angle: 0 });
    groundEntity(game, mate1, { x: station.x + 12, y: station.y, z: station.z + 2, angle: 0 });
    groundEntity(game, mate2, { x: 90, y: 0, z: 90, angle: 0 });
    groundEntity(game, ENEMY_ID, { x: -350, y: 0, z: -350, angle: 0 });

    // Kill mate0 cleanly (down then finish)
    s.get("health").applyDamage(mate0, 999, { attackerId: ENEMY_ID, weaponId: "rifle", now: nowRef.now });
    s.get("combat").damage(mate0, 999, { attackerId: ENEMY_ID, weaponId: "rifle", now: nowRef.now });
    assert.equal(s.get("entities").get(mate0).alive, false);

    // Human buys back mate0
    shop.grantCash(PLAYER, 1500, "test");
    game.drainEvents();
    game.api.handleInput(PLAYER, { shopBuy: { itemId: "buyback", targetId: mate0 } }, nowRef.now);
    const redeployedMate = s.get("entities").get(mate0);
    assert.equal(redeployedMate.alive, true, "Bought-back squadmate must return alive");
    assert.equal(s.get("parachute").stateFor(mate0)?.airborne, true, "Bought-back squadmate must redeploy via parachute");
    const buybackEvents = game.drainEvents();
    assert(buybackEvents.some((e) => e.event === "shop:teammate-bought-back" && e.payload.targetId === mate0));

    // Now kill PLAYER while mate1 has $1600 nearby and watch living squadmates bring player back!
    groundEntity(game, mate0, { x: 95, y: 0, z: 95, angle: 0 });
    groundEntity(game, mate1, { x: station.x + 10, y: station.y, z: station.z, angle: 0 });
    shop.grantCash(mate1, 1600, "test");

    s.get("health").applyDamage(PLAYER, 999, { attackerId: ENEMY_ID, weaponId: "rifle", now: nowRef.now });
    s.get("combat").damage(PLAYER, 999, { attackerId: ENEMY_ID, weaponId: "rifle", now: nowRef.now });
    assert.equal(s.get("entities").get(PLAYER).alive, false);

    const deadSnap = game.api.snapshotFor(PLAYER, nowRef.now);
    assert.equal(deadSnap.spectator.active, true);
    assert(joined.squadmates.includes(deadSnap.spectator.targetId), "Dead human must spectate living squadmates first");

    let revived = false;
    for (let i = 0; i < 200; i += 1) {
      nowRef.now += 50;
      game.api.step(0.05, nowRef.now);
      if (s.get("entities").get(PLAYER).alive) {
        revived = true;
        break;
      }
    }
    assert.equal(revived, true, "Living bot squadmate must navigate to Buy Station and buy back dead human");
    const playerAfterBuyback = game.api.snapshotFor(PLAYER, nowRef.now);
    assert.equal(playerAfterBuyback.spectator, null);
    assert.equal(playerAfterBuyback.playerPlacement, null, "Bought-back player placement must be cleared");
    assert.equal(s.get("parachute").stateFor(PLAYER)?.airborne, true, "Bought-back player must drop in on a parachute");
  } finally {
    await game.host.stop();
  }
});

test("bot squadmate loots crates for cash when broke, then buys back dead human", async () => {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  const s = game.host.services;
  const nowRef = { now: Date.now() + 4000 };
  try {
    const joined = game.api.connectHuman(PLAYER);
    advanceDeploymentIfNeeded(game, nowRef);

    const [mate0, mate1, mate2] = joined.squadmates;
    const keepIds = new Set([PLAYER, mate0, ENEMY_ID]);
    for (const ent of [...s.get("entities").all()]) {
      if (ent.bot && !keepIds.has(ent.id)) s.get("entities").remove(ent.id);
    }

    const shop = s.get("shop");
    const station = shop.stations()[0];
    // Find 2 unopened crates within ~40m of station (or move bot right next to nearby unopened crates)
    const map = s.get("map");
    const nearCrates = map.crates
      .filter((c) => !c.opened && Math.abs(c.y) < 1.5)
      .sort((a, b) => Math.hypot(a.x - station.x, a.z - station.z) - Math.hypot(b.x - station.x, b.z - station.z));
    assert(nearCrates.length >= 2);
    const firstCrate = nearCrates[0];

    groundEntity(game, mate0, { x: firstCrate.x + 1.5, y: firstCrate.y, z: firstCrate.z, angle: 0 });
    groundEntity(game, ENEMY_ID, { x: -350, y: 0, z: -350, angle: 0 });
    groundEntity(game, PLAYER, { x: -345, y: 0, z: -350, angle: 0 });

    s.get("health").applyDamage(PLAYER, 999, { attackerId: ENEMY_ID, weaponId: "rifle", now: nowRef.now });
    s.get("combat").damage(PLAYER, 999, { attackerId: ENEMY_ID, weaponId: "rifle", now: nowRef.now });
    assert.equal(s.get("entities").get(PLAYER).alive, false);

    let revived = false;
    for (let i = 0; i < 800; i += 1) {
      nowRef.now += 50;
      game.api.step(0.05, nowRef.now);
      if (s.get("entities").get(PLAYER).alive) {
        revived = true;
        break;
      }
    }
    assert.equal(revived, true, "Broke bot squadmate must open nearby crates to collect $1500 and buy back dead human");
  } finally {
    await game.host.stop();
  }
});

test("bots actively spot and engage enemies at medium combat distances", async () => {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  const s = game.host.services;
  const nowRef = { now: Date.now() + 5000 };
  try {
    game.api.connectHuman(PLAYER);
    advanceDeploymentIfNeeded(game, nowRef);

    const botA = "br-bot-5";
    const botB = "br-bot-7";
    const keepIds = new Set([PLAYER, botA, botB]);
    for (const ent of [...s.get("entities").all()]) {
      if (ent.bot && !keepIds.has(ent.id)) s.get("entities").remove(ent.id);
    }

    groundEntity(game, PLAYER, { x: -350, y: 0, z: -350, angle: 0 });
    groundEntity(game, botA, { x: 200, y: 0, z: 200, angle: 0 });
    groundEntity(game, botB, { x: 200, y: 0, z: 166, angle: Math.PI });
    s.get("weapons").grant(botA, "rifle");
    s.get("weapons").grant(botB, "rifle");

    game.drainEvents();
    let shots = 0;
    for (let i = 0; i < 60; i += 1) {
      nowRef.now += 50;
      game.api.step(0.05, nowRef.now);
      const events = game.drainEvents();
      shots += events.filter((e) => e.event === "weapon:fired" && (e.payload.entityId === botA || e.payload.entityId === botB)).length;
    }
    assert(shots >= 4, `Expected active bot firefight (~34m distance) with >= 4 shots, got ${shots}`);
  } finally {
    await game.host.stop();
  }
});
