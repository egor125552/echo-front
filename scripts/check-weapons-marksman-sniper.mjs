import assert from "node:assert/strict";
import { test } from "node:test";
import { createEchoFrontGame } from "../src/server/game.js";
import { resolveSoundUrl, SPATIAL_SOUND_PROFILES } from "../public/client/plugins/core-sound-pack.js";
import { HAPTIC_PATTERNS, hapticCueForGameEvent } from "../public/client/plugins/haptic-feedback.js";

const PLAYER = "11111111-2222-4333-8444-555555555555";

function groundEntity(game, id, position) {
  const c = game.host.components;
  const s = game.host.services;
  s.get("vehicles")?.exit?.(id);
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

test("TDM spawns player with pistol first plus marksman and sniper, preserving cadence and auto-reload", async () => {
  const game = await createEchoFrontGame({ mode: "tdm" });
  const id = "marksman-sniper-tdm-player";
  try {
    game.api.connectHuman(id);
    const weapons = game.host.services.get("weapons");
    const inventory = game.host.components.get(id, "Weapons");

    assert.deepEqual(
      inventory.items.map((w) => w.id),
      ["pistol", "marksman", "sniper"],
    );
    assert.equal(inventory.selected, 0);
    assert.equal(weapons.definitions.marksman.name, "Винтовка");
    assert.equal(weapons.definitions.marksman.automatic, false);
    assert.equal(weapons.definitions.marksman.holdRepeat, true);
    assert.equal(weapons.definitions.marksman.damage, 68);
    assert.equal(weapons.definitions.marksman.range, 92);
    assert.equal(weapons.definitions.marksman.armorDamageMultiplier, 1.65);
    assert.equal(weapons.definitions.sniper.name, "Снайперка");
    assert.equal(weapons.definitions.sniper.automatic, false);
    assert.equal(weapons.definitions.sniper.holdRepeat, false);
    assert.equal(weapons.definitions.sniper.damage, 165);
    assert.equal(weapons.definitions.sniper.range, 155);
    assert.equal(weapons.definitions.sniper.shattersArmor, true);

    const now = Date.now() + 10000;

    // Switch to marksman (slot 1)
    game.api.handleInput(id, { selectDelta: 1 }, now);
    assert.equal(inventory.items[inventory.selected].id, "marksman");

    const marksmanItem = inventory.items[1];
    game.api.handleInput(id, { firePressed: true, fireHeld: true }, now);
    assert.equal(marksmanItem.ammo, 14, "Marksman must fire immediately on press");
    // Hold-repeat cadence (250ms for 240 rpm): shouldn't fire at +180ms, should fire at +270ms
    weapons.tickAutomatic(now + 180);
    assert.equal(marksmanItem.ammo, 14, "Marksman hold-repeat respects 240 RPM delay");
    weapons.tickAutomatic(now + 270);
    assert.equal(marksmanItem.ammo, 13, "Marksman hold-repeat fires second shot after 250ms");

    // Auto-reload on empty marksman magazine
    game.api.handleInput(id, { fireHeld: false }, now + 650);
    marksmanItem.ammo = 1;
    const reserveBeforeReload = marksmanItem.reserve;
    assert.equal(weapons.fire(id, now + 700, { pressed: true }), true);
    assert.equal(marksmanItem.ammo, 0);
    assert(marksmanItem.reloadUntil > now + 700);
    weapons.tickAutomatic(now + 2300);
    assert.equal(marksmanItem.ammo, 15);
    assert.equal(marksmanItem.reserve, reserveBeforeReload - 15);

    // Switch to sniper (slot 2)
    game.api.handleInput(id, { selectDelta: 1 }, now + 2400);
    assert.equal(inventory.items[inventory.selected].id, "sniper");

    const sniperItem = inventory.items[2];
    game.api.handleInput(id, { firePressed: true, fireHeld: true }, now + 2500);
    assert.equal(sniperItem.ammo, 5, "Sniper fires single bolt-action shot on press");

    // Holding fire does NOT auto-repeat sniper even after rechamber time
    weapons.tickAutomatic(now + 3900);
    assert.equal(sniperItem.ammo, 5, "Bolt-action sniper must not auto-repeat while held");

    // Rapid double tap during ~1111ms rechamber is blocked even with pressed: true
    assert.equal(weapons.fire(id, now + 3100, { pressed: true }), false, "Blocked during bolt rechamber");
    // After rechamber passes, physical press fires cleanly
    assert.equal(weapons.fire(id, now + 3800, { pressed: true }), true, "Fires after bolt rechamber completes");
    assert.equal(sniperItem.ammo, 4);

    // Empty sniper magazine triggers automatic reload without creating bullets
    sniperItem.ammo = 1;
    const sniperReserve = sniperItem.reserve;
    assert.equal(weapons.fire(id, now + 5100, { pressed: true }), true);
    assert.equal(sniperItem.ammo, 0);
    assert(sniperItem.reloadUntil > now + 5100);
    weapons.tickAutomatic(now + 7100);
    assert.equal(sniperItem.ammo, 6);
    assert.equal(sniperItem.reserve, sniperReserve - 6);
  } finally {
    await game.host.stop();
  }
});

test("sound-pack maps uploaded MP3s to marksman and sniper with longer spatial reach, and haptics stay distinct", () => {
  assert.equal(
    resolveSoundUrl({ key: "weapon.marksman" }),
    "/assets/aistudio/single-shot-m-1-rifle_c09ae09f.mp3",
  );
  assert.equal(
    resolveSoundUrl({ key: "weapon.sniper" }),
    "/assets/aistudio/precise-booming-shot-from-a-short-barreled-weapon_4606b104.mp3",
  );
  assert(
    SPATIAL_SOUND_PROFILES["weapon.sniper"].referenceDistance > SPATIAL_SOUND_PROFILES["weapon.marksman"].referenceDistance,
  );
  assert(
    SPATIAL_SOUND_PROFILES["weapon.marksman"].referenceDistance > SPATIAL_SOUND_PROFILES["weapon.rifle"].referenceDistance,
  );

  const self = "player-self";
  const marksmanCue = hapticCueForGameEvent(
    { event: "weapon:fired", payload: { entityId: self, weaponId: "marksman" } },
    self,
    { shotMode: "single" },
  );
  const sniperCue = hapticCueForGameEvent(
    { event: "weapon:fired", payload: { entityId: self, weaponId: "sniper" } },
    self,
    { shotMode: "single" },
  );
  const sniperSupposedBurstCue = hapticCueForGameEvent(
    { event: "weapon:fired", payload: { entityId: self, weaponId: "sniper" } },
    self,
    { shotMode: "burst-entry" },
  );

  assert.equal(marksmanCue?.kind, "weapon:marksman");
  assert.equal(marksmanCue?.vibrate, HAPTIC_PATTERNS.shotSingleMarksman.vibrate);
  assert.equal(sniperCue?.kind, "weapon:sniper");
  assert.deepEqual(sniperCue?.vibrate, HAPTIC_PATTERNS.shotSingleSniper.vibrate);
  assert.equal(sniperSupposedBurstCue?.kind, "weapon:sniper");
});

test("Sniper shatters full 150-plate armor in one hit and Marksman deals heavy bonus armor damage while Pistol stays 1:1", async () => {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  const s = game.host.services;
  const nowRef = { now: Date.now() + 2000 };
  try {
    const joined = game.api.connectHuman(PLAYER);
    const enemyId = "br-bot-6";
    const keepIds = new Set([PLAYER, enemyId, ...joined.squadmates]);
    for (const ent of [...s.get("entities").all()]) {
      if (ent.bot && !keepIds.has(ent.id)) s.get("entities").remove(ent.id);
    }
    groundEntity(game, enemyId, { x: -450, y: 0, z: -450, angle: 0 });
    advanceDeployment(game, nowRef);

    const combat = s.get("combat");
    const armorComp = game.host.components.get(PLAYER, "Armor");
    const healthComp = game.host.components.get(PLAYER, "Health");

    assert.equal(s.get("entities").get(PLAYER)?.alive, true, "Player must be alive after deployment");
    // Verify Sniper shatters full 150 armor in 1 hit + leaves strong HP punch + emits break cues
    armorComp.current = 150;
    healthComp.current = 200;
    game.drainEvents();
    const sniperHit = combat.damage(PLAYER, 165, {
      attackerId: enemyId,
      weaponId: "sniper",
      now: nowRef.now,
    });
    assert.equal(sniperHit.armorAbsorbed, 150, "Sniper must shatter full 150 armor in one hit");
    assert.equal(sniperHit.armorBroke, true, "Sniper must trigger armorBroke on full armor");
    assert.equal(armorComp.current, 0);
    assert(healthComp.current < 120, `Sniper must still punch through armor to HP (remaining HP: ${healthComp.current})`);
    const events = game.drainEvents();
    assert(events.some((e) => e.event === "feedback:sound" && e.payload.recipientId === enemyId && e.payload.key === "armor.break"));
    assert(events.some((e) => e.event === "feedback:sound" && e.payload.recipientId === PLAYER && e.payload.key === "armor.self-break"));

    // Verify Marksman deals 1.65x armor damage (strips 112/150 on hit 1, shatters remainder on hit 2)
    armorComp.current = 150;
    healthComp.current = 200;
    const marksmanHit1 = combat.damage(PLAYER, 68, { attackerId: enemyId, weaponId: "marksman", now: nowRef.now });
    assert.equal(marksmanHit1.armorAbsorbed, 112);
    assert.equal(armorComp.current, 38);
    assert.equal(marksmanHit1.armorBroke, false);
    const marksmanHit2 = combat.damage(PLAYER, 68, { attackerId: enemyId, weaponId: "marksman", now: nowRef.now + 260 });
    assert.equal(marksmanHit2.armorBroke, true);
    assert.equal(armorComp.current, 0);
    assert(healthComp.current < 170);

    // Verify Pistol stays standard 1:1 plate absorption
    armorComp.current = 100;
    healthComp.current = 200;
    const pistolHit = combat.damage(PLAYER, 22, { attackerId: enemyId, weaponId: "pistol", now: nowRef.now + 500 });
    assert.equal(pistolHit.armorAbsorbed, 22);
    assert.equal(armorComp.current, 78);
    assert.equal(healthComp.current, 200);
    void joined;
  } finally {
    await game.host.stop();
  }
});

test("Battle Royale spawns marksman & sniper crates, sells/restocks them in shop, and both enemies & squadmates wield sniper skillfully", async () => {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  const s = game.host.services;
  const nowRef = { now: Date.now() + 2000 };
  try {
    const joined = game.api.connectHuman(PLAYER);
    const enemyBotId = "br-bot-6";
    const keepIds = new Set([PLAYER, enemyBotId, ...joined.squadmates]);
    for (const ent of [...s.get("entities").all()]) {
      if (ent.bot && !keepIds.has(ent.id)) s.get("entities").remove(ent.id);
    }
    groundEntity(game, enemyBotId, { x: -450, y: 0, z: -450, angle: 0 });
    advanceDeployment(game, nowRef);

    const map = s.get("map");
    const nav = s.get("navigation");
    const shop = s.get("shop");
    const weapons = s.get("weapons");

    const marksmanCrate = map.crates.find((c) => c.generated && c.loot === "marksman" && !c.opened);
    const sniperCrate = map.crates.find((c) => c.generated && c.loot === "sniper" && !c.opened);
    assert(marksmanCrate, "Battle Royale must spawn marksman crates");
    assert(sniperCrate, "Battle Royale must spawn sniper crates");

    groundEntity(game, PLAYER, { x: sniperCrate.x - 2, y: 0, z: sniperCrate.z, angle: Math.PI / 2 });
    const targetsNearSniper = nav.availableTargets(PLAYER, nowRef.now);
    assert(targetsNearSniper.some((t) => t.kind === "crate" && t.name === "Ящик со снайперкой"));

    groundEntity(game, PLAYER, { x: marksmanCrate.x - 1, y: 0, z: marksmanCrate.z, angle: Math.PI / 2 });
    const targetsNearMarksman = nav.availableTargets(PLAYER, nowRef.now);
    assert(targetsNearMarksman.some((t) => t.kind === "crate" && t.name === "Ящик с винтовкой"));

    // Interact with marksman crate -> grants marksman
    game.api.handleInput(PLAYER, { interactPressed: true }, nowRef.now);
    assert.equal(marksmanCrate.opened, true);
    assert.equal(weapons.has(PLAYER, "marksman"), true);

    // Spend some reserve and open a second marksman crate -> restocks reserve ammo (+24)
    const marksmanInv = game.host.components.get(PLAYER, "Weapons").items.find((w) => w.id === "marksman");
    marksmanInv.reserve = 10;
    const secondMarksmanCrate = map.crates.find((c) => c.generated && c.loot === "marksman" && !c.opened);
    if (secondMarksmanCrate) {
      groundEntity(game, PLAYER, { x: secondMarksmanCrate.x - 1, y: 0, z: secondMarksmanCrate.z, angle: Math.PI / 2 });
      game.api.handleInput(PLAYER, { interactPressed: true }, nowRef.now);
      assert.equal(marksmanInv.reserve, 34);
    }

    // Buy sniper in Buy Station ($1100), verify describeFor, restock (+10), and cap check
    const station = shop.stations()[0];
    groundEntity(game, PLAYER, { x: station.x + 1.5, y: station.y, z: station.z, angle: 0 });
    shop.grantCash(PLAYER, 5000, "test");

    let desc = shop.describeFor(PLAYER, nowRef.now);
    assert.equal(desc.prices.marksman, 700);
    assert.equal(desc.prices.sniper, 1100);
    assert.equal(desc.marksmanOwned, true);
    assert.equal(desc.sniperOwned, false);

    const buySniper = shop.buy(PLAYER, { itemId: "sniper" }, nowRef.now);
    assert.equal(buySniper.ok, true);
    assert.equal(weapons.has(PLAYER, "sniper"), true);

    const sniperInv = game.host.components.get(PLAYER, "Weapons").items.find((w) => w.id === "sniper");
    sniperInv.reserve = 25;
    game.drainEvents();
    const restockSniper = shop.buy(PLAYER, { itemId: "sniper" }, nowRef.now);
    assert.equal(restockSniper.ok, true);
    assert.equal(sniperInv.reserve, 35);
    const shopEvents = game.drainEvents().filter((e) => e.event === "shop:purchased");
    assert.equal(shopEvents.at(-1)?.payload?.itemName, "Патроны для снайперки (+10)");

    // Fill sniper reserve to cap (72) and verify Shop rejects with capacity-full
    sniperInv.reserve = 72;
    const cappedSniper = shop.buy(PLAYER, { itemId: "sniper" }, nowRef.now);
    assert.equal(cappedSniper.ok, false);
    assert.equal(cappedSniper.reason, "capacity-full");

    // 1. Verify sniper bot with rifle backup switches to rifle in <10m close quarters
    groundEntity(game, PLAYER, { x: 200, y: 0, z: 200, angle: 0 });
    game.host.components.get(PLAYER, "Armor").current = 150;
    game.host.components.get(PLAYER, "Health").current = 200;
    for (const mateId of joined.squadmates) {
      groundEntity(game, mateId, { x: -420, y: 0, z: -420, angle: 0 });
    }
    groundEntity(game, enemyBotId, { x: 200, y: 0, z: 192, angle: Math.PI });
    const botInv = game.host.components.get(enemyBotId, "Weapons");
    botInv.items = [
      { id: "sniper", ammo: 6, reserve: 36, lastFireAt: -Infinity, reloadUntil: 0 },
      { id: "rifle", ammo: 30, reserve: 120, lastFireAt: -Infinity, reloadUntil: 0 },
      { id: "pistol", ammo: 100, reserve: 400, lastFireAt: -Infinity, reloadUntil: 0 },
    ];
    botInv.selected = 0;

    for (let i = 0; i < 12; i += 1) {
      nowRef.now += 50;
      game.api.handleInput(PLAYER, {}, nowRef.now);
      game.api.step(0.05, nowRef.now);
    }
    assert.equal(
      botInv.items[botInv.selected].id,
      "rifle",
      "Expected sniper bot with rifle backup to switch to rifle in <10m close quarters",
    );

    // 2. Verify sniper bot switches back to sniper at ~60m, leads/hits strafing player, shatters armor & holds standoff range
    groundEntity(game, PLAYER, { x: 200, y: 0, z: 200, angle: 0 });
    game.host.components.get(PLAYER, "Armor").current = 150;
    game.host.components.get(PLAYER, "Health").current = 200;
    groundEntity(game, enemyBotId, { x: 200, y: 0, z: 140, angle: Math.PI });

    game.drainEvents();
    let sniperShots = 0;
    let playerArmorBroke = false;
    for (let i = 0; i < 80; i += 1) {
      nowRef.now += 50;
      game.api.handleInput(PLAYER, { strafe: i % 30 < 15 ? 0.55 : -0.55 }, nowRef.now);
      game.api.step(0.05, nowRef.now);
      const evts = game.drainEvents();
      sniperShots += evts.filter(
        (e) => e.event === "weapon:fired" && e.payload.entityId === enemyBotId && e.payload.weaponId === "sniper",
      ).length;
      if (evts.some((e) => e.event === "combat:damage" && e.payload.targetId === PLAYER && e.payload.armorBroke)) {
        playerArmorBroke = true;
      }
    }
    assert(sniperShots >= 2, `Expected BR sniper bot to fire multiple precise shots at ~60m, got ${sniperShots}`);
    assert.equal(playerArmorBroke, true, "Expected skilled sniper bot to hit moving player and shatter armor");

    const botPos = game.host.components.get(enemyBotId, "Transform");
    const playerPos = game.host.components.get(PLAYER, "Transform");
    const distAfterSniping = Math.hypot(botPos.x - playerPos.x, botPos.z - playerPos.z);
    assert(distAfterSniping >= 26, `Expected sniper bot to hold standoff distance instead of rushing into CQB (${distAfterSniping.toFixed(1)}m)`);

    // 3. Verify sniper squadmate (Напарник 3) also keeps sniper ready & fires skillfully at ~57m enemy
    const sniperMateId = joined.squadmates[2];
    if (sniperMateId) {
      groundEntity(game, PLAYER, { x: 200, y: 0, z: 215, angle: 0 });
      groundEntity(game, sniperMateId, { x: 206, y: 0, z: 215, angle: 0 });
      groundEntity(game, enemyBotId, { x: 206, y: 0, z: 158, angle: Math.PI });
      game.host.components.get(enemyBotId, "Health").current = 200;
      game.host.components.get(enemyBotId, "Armor").current = 150;
      game.drainEvents();
      let mateSniperShots = 0;
      for (let i = 0; i < 70; i += 1) {
        nowRef.now += 50;
        game.api.step(0.05, nowRef.now);
        const evts = game.drainEvents();
        mateSniperShots += evts.filter(
          (e) => e.event === "weapon:fired" && e.payload.entityId === sniperMateId && e.payload.weaponId === "sniper",
        ).length;
      }
      assert(mateSniperShots >= 1, `Expected squadmate sniper to engage 57m target skillfully, got ${mateSniperShots}`);
    }
  } finally {
    await game.host.stop();
  }
});
