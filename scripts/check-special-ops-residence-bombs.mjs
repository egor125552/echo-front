import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createEchoFrontGame } from "../src/server/game.js";
import {
  ELECTRO_LUKASHENKO_STATS,
  ELECTRO_RIFLE_MODES,
  ELECTRO_SUPER_JUMP_CONFIG,
  LANDMINE_CONFIG,
  MINI_NUKE_CONFIG,
  RESIDENCE_SITE,
  chooseBotShopAction,
  computeMiniNukeTarget,
  createAdaptiveBunkerPuzzle,
  evaluateBlastDamage,
  isInsideResidenceNoGuidanceZone,
  nextElectroMode,
  submitPuzzleStep,
} from "../src/game/special-ops-arsenal.js";
import { SPATIAL_SOUND_PROFILES } from "../public/client/plugins/core-sound-pack.js";
import { hapticCueForGameEvent } from "../public/client/plugins/haptic-feedback.js";

function runPureUnitTests() {
  // 1. Guidance allowed outside Residence, blocked inside labyrinth & bunker
  assert.equal(isInsideResidenceNoGuidanceZone({ x: 0, y: 0, z: 0 }), false, "Guidance works outside Residence");
  assert.equal(
    isInsideResidenceNoGuidanceZone({ x: RESIDENCE_SITE.x, y: 0, z: RESIDENCE_SITE.z + 18 }),
    false,
    "Guidance works right up to Residence entrance",
  );
  assert.equal(
    isInsideResidenceNoGuidanceZone({ x: RESIDENCE_SITE.x, y: 0, z: RESIDENCE_SITE.z }),
    true,
    "Guidance blocked inside Residence interior labyrinth",
  );
  assert.equal(
    isInsideResidenceNoGuidanceZone({ x: RESIDENCE_SITE.x, y: -14, z: RESIDENCE_SITE.z }),
    true,
    "Guidance blocked inside deep bunker",
  );

  // 2. Adaptive Bunker Puzzle: relaxes after mistakes and solves cleanly
  const puzzle = createAdaptiveBunkerPuzzle(7, 0);
  assert.equal(puzzle.stages.length, 3);
  const wrongChoice = [1, 2, 3, 4].find((id) => id !== puzzle.stages[0].code[0]);
  submitPuzzleStep(puzzle, wrongChoice);
  const r2 = submitPuzzleStep(puzzle, wrongChoice);
  assert.equal(r2.relaxed, true, "Puzzle adapts & simplifies after 2 mistakes");
  assert.equal(puzzle.stages[1].code.length, 2, "Adaptive mode simplifies all stages to 2 contacts");

  let solved = false;
  while (!solved) {
    const stage = puzzle.stages[puzzle.currentStage];
    for (const contact of stage.code) {
      const stepRes = submitPuzzleStep(puzzle, contact);
      if (stepRes.solved) solved = true;
    }
  }
  assert.equal(solved, true, "Puzzle solves cleanly");

  // 3. Mini-Nuke 185m 360° target & blast damage (including self-hit at 4m, ground-snapping from air, and all 4 compass directions at 165m!)
  assert.equal(MINI_NUKE_CONFIG.blastRadius, 185, "Mini-Nuke blast radius is massive 185m");
  const targetClose = computeMiniNukeTarget({ x: 10, y: 0, z: 20, angle: 0 }, 4, 1000);
  const selfHit = evaluateBlastDamage(targetClose, { x: 10, y: 0, z: 20 }, MINI_NUKE_CONFIG);
  assert.equal(selfHit.hit, true, "Mini-nuke fired at 4m hits launcher");
  assert.equal(selfHit.damage, MINI_NUKE_CONFIG.maxDamage, "4m self-shot deals full lethal core damage");

  // Launching from altitude outdoors must ground-snap to y=0 (never explode in empty sky!)
  const airborneTarget = computeMiniNukeTarget({ x: 0, y: 187, z: 0, angle: 0 }, 215, 1000, 0);
  assert.equal(airborneTarget.y, 0, "Outdoor Mini-Nuke launched from sky snaps ground zero to surface y=0");
  const bunkerTarget = computeMiniNukeTarget({ x: RESIDENCE_SITE.x, y: -14, z: RESIDENCE_SITE.z, angle: 0 }, 4, 1000, 0);
  assert.equal(bunkerTarget.y, -14, "Bunker Mini-Nuke preserves underground elevation");

  for (const [label, pt] of [
    ["North 165m", { x: 0, y: 0, z: -165 }],
    ["South 165m", { x: 0, y: 0, z: 165 }],
    ["East 165m", { x: 165, y: 0, z: 0 }],
    ["West 165m", { x: -165, y: 0, z: 0 }],
  ]) {
    const res = evaluateBlastDamage({ x: 0, y: 0, z: 0 }, pt, MINI_NUKE_CONFIG);
    assert.equal(res.hit, true, `185m 360° Mini-Nuke hits ${label}`);
    assert.ok(res.damage >= MINI_NUKE_CONFIG.minEdgeDamage, `${label} takes >= edge damage (${res.damage})`);
  }

  const farMiss = evaluateBlastDamage({ x: 0, y: 0, z: 0 }, { x: 195, y: 0, z: 0 }, MINI_NUKE_CONFIG);
  assert.equal(farMiss.hit, false, "Outside 185m blast radius takes no damage");

  // Mini-Nuke audio profile & DualSense seismic haptics
  const nukeProfile = SPATIAL_SOUND_PROFILES["bomb.nuke"];
  assert.ok(nukeProfile.referenceDistance >= 75, `bomb.nuke has map-wide referenceDistance (${nukeProfile.referenceDistance})`);
  assert.ok(nukeProfile.rolloffFactor <= 0.035, `bomb.nuke has shallow rolloffFactor (${nukeProfile.rolloffFactor})`);
  const nukeHaptic = hapticCueForGameEvent(
    { event: "nuke:detonated", payload: { ownerId: "enemy-1", blastRadius: 185, hitCount: 3, launchedVehicles: 2 } },
    "human-1",
    { distanceToListener: 160 },
  );
  assert.equal(nukeHaptic?.kind, "nuke:detonated", "Nearby nuke detonation triggers DualSense seismic haptics");
  assert.ok(nukeHaptic.gamepad.duration >= 700, "Nuke detonation produces long seismic DualSense rumble");
  assert.ok(nukeHaptic.gamepad.strong >= 0.9, "Nuke detonation hits near-max heavy motor intensity");

  // 4. Electro modes cycle cleanly & all 3 modes have strong knockback
  const m1 = nextElectroMode("shock");
  const m2 = nextElectroMode(m1.id);
  const m3 = nextElectroMode(m2.id);
  assert.equal(m1.id, "chain");
  assert.equal(m2.id, "overload");
  assert.equal(m3.id, "shock");
  for (const mode of ELECTRO_RIFLE_MODES) {
    assert.ok(mode.knockbackUp >= 6, `Mode ${mode.id} has strong upward toss (${mode.knockbackUp})`);
    assert.ok(mode.knockbackPush >= 9, `Mode ${mode.id} has strong pushback (${mode.knockbackPush})`);
  }

  // 5. Bot shop decision priority (buyback -> electro-drop -> mini-nuke -> mines)
  assert.equal(
    chooseBotShopAction({ cash: 2500, deadTeammates: 1, mineCount: 0, armorReserve: 0, fastStimCount: 0, hasMarksman: false })?.itemId,
    "buyback",
  );
  assert.equal(
    chooseBotShopAction({ cash: 2500, deadTeammates: 0, mineCount: 0, armorReserve: 0, fastStimCount: 0, hasMarksman: false })?.itemId,
    "electro-drop",
  );
  assert.equal(
    chooseBotShopAction({ cash: 1800, deadTeammates: 0, isElectroLukashenko: true, nukeCount: 0, mineCount: 0 })?.itemId,
    "mini-nuke",
  );
  assert.equal(
    chooseBotShopAction({ cash: 500, deadTeammates: 0, mineCount: 0, armorReserve: 4, fastStimCount: 2, hasMarksman: true })?.itemId,
    "mines",
  );

  // 6. Uploaded bomb audio assets exist on disk
  const nukeAsset = path.resolve("public/assets/aistudio/dropped-a-bomb-and-it-exploded_188d696e.mp3");
  const mineAsset = path.resolve("public/assets/aistudio/bomb-drop-and-explosion_424c5b6a.mp3");
  assert.ok(fs.existsSync(nukeAsset), "Mini-Nuke uploaded MP3 exists");
  assert.ok(fs.existsSync(mineAsset), "Mine uploaded MP3 exists");

  console.log("[PASS] Pure special-ops arsenal unit tests");
}

async function runLiveIntegrationTests() {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  const host = game.host;
  const matchApi = game.api;
  const entities = host.services.get("entities");
  const movement = host.services.get("movement");
  const weapons = host.services.get("weapons");
  const teams = host.services.get("teams");
  const map = host.services.get("map");
  const shop = host.services.get("shop");
  const navigation = host.services.get("navigation");
  const specialOps = host.services.get("special-ops");
  const injury = host.services.get("injury");

  const capturedEvents = [];
  for (const ev of [
    "bunker:transition",
    "bunker:puzzle-opened",
    "bunker:puzzle-step",
    "special:electro-equipped",
    "special:electro-mode-changed",
    "special:electro-jump",
    "special:rival-buyback",
    "special:internal-stim",
    "navigation:warning",
    "mine:planted",
    "mine:detonated",
    "nuke:aiming",
    "nuke:launched",
    "nuke:detonated",
    "sound:spatial",
    "shop:purchased",
    "shop:teammate-bought-back",
  ]) {
    host.events.on(ev, (payload) => capturedEvents.push({ event: ev, payload }));
  }

  let now = 1_000_000;
  matchApi.connectHuman("human-1", now);

  // Advance through deployment so match is fully active
  for (let i = 0; i < 65; i += 1) {
    now += 100;
    matchApi.step(0.1, now);
  }
  const brStatus = host.services.get("battle-royale").status(now);
  assert.equal(brStatus.phase, "active", "BR match is active");

  // Land human cleanly
  const humanPara = host.components.get("human-1", "Parachute");
  if (humanPara) {
    humanPara.phase = "landed";
    humanPara.airborne = false;
  }

  // 1. Verify Residence building & 5 Чиновники-революционеры guards spawned
  const residenceNav = (map.navigationBuildings ?? []).find((b) => b.id === "residence");
  assert.ok(residenceNav, "Residence building registered on BR map");

  const officials = entities.all().filter((e) => e.alive && e.official);
  assert.equal(officials.length, 5, "Exactly 5 patrolling Чиновники-революционеры spawned");
  assert.ok(officials[0].name.includes("Чиновник-революционер"), "Officials named properly");

  // 2. Descend through Residence Hatch -> Deep Bunker & verify auto-guidance blocked
  movement.teleport("human-1", {
    x: specialOps.sites.HATCH_TOP.x,
    y: 0,
    z: specialOps.sites.HATCH_TOP.z,
    angle: 0,
  });
  matchApi.handleInput("human-1", { interactPressed: true }, now);
  const bunkerPos = host.components.get("human-1", "Transform");
  assert.ok(bunkerPos.y <= -10, `Human descended into deep bunker (y=${bunkerPos.y})`);
  assert.ok(
    capturedEvents.some((e) => e.event === "bunker:transition" && e.payload.direction === "enter"),
    "bunker:transition enter emitted",
  );

  // Attempt activating auto-guidance inside bunker -> must fail and emit navigation:warning
  const navBefore = capturedEvents.filter((e) => e.event === "navigation:warning").length;
  const navActivated = navigation.toggle("human-1", now);
  assert.equal(navActivated, false, "Auto-guidance blocked inside Residence bunker");
  assert.ok(
    capturedEvents.filter((e) => e.event === "navigation:warning").length > navBefore,
    "navigation:warning emitted when attempting auto-guidance in bunker",
  );

  // 3. Open Adaptive Lock Puzzle at Bunker Vault and crack it -> get Electro-Lukashenko suit!
  movement.teleport("human-1", {
    x: specialOps.sites.BUNKER_VAULT.x,
    y: specialOps.sites.BUNKER_VAULT.y,
    z: specialOps.sites.BUNKER_VAULT.z,
    angle: 0,
  });
  matchApi.handleInput("human-1", { interactPressed: true }, now);
  assert.ok(
    capturedEvents.some((e) => e.event === "bunker:puzzle-opened" && e.payload.entityId === "human-1"),
    "Adaptive bunker puzzle opened at Vault",
  );

  // Crack puzzle via specialAction reading the live VoiceOver hint from snapshot!
  let safety = 0;
  while (!entities.get("human-1").electroLukashenko && safety < 20) {
    safety += 1;
    const snap = matchApi.snapshotFor("human-1", now);
    const hint = snap.specialOps?.bunkerPuzzle?.hint ?? "";
    const contacts = [...hint.matchAll(/Контакт\s+(\d)/g)].map((m) => Number(m[1]));
    assert.ok(contacts.length > 0, `Puzzle hint provides contacts: "${hint}"`);
    for (const switchId of contacts) {
      matchApi.handleInput("human-1", { specialAction: { type: "bunker-puzzle-step", switchId } }, now);
    }
  }
  assert.equal(entities.get("human-1").electroLukashenko, true, "Solving vault puzzle equips Electro-Lukashenko suit");
  assert.equal(host.components.get("human-1", "Health").current, ELECTRO_LUKASHENKO_STATS.maxHealth, "800 HP granted");
  assert.equal(host.components.get("human-1", "Armor").current, ELECTRO_LUKASHENKO_STATS.maxArmor, "800 Armor granted");
  assert.equal(weapons.has("human-1", "electro-rifle"), true, "Electro-rifle granted");
  assert.ok(specialOps.nukeCountOf("human-1") >= 1, "Mini-nuke granted with Electro-Lukashenko suit");
  assert.ok(specialOps.mineCountOf("human-1") >= 2, "Mines granted");

  // 4. Test Electro-Rifle mode cycling & chain shock on Official + nearby enemy
  matchApi.handleInput("human-1", { electroModePressed: true }, now);
  assert.equal(specialOps.electroModeOf("human-1").id, "chain", "Electro-rifle switched to chain mode");

  const enemyA = officials[0];
  const enemyB = officials[1];
  const hpABefore = host.components.get(enemyA.id, "Health").current;
  const hpBBefore = host.components.get(enemyB.id, "Health").current;
  movement.teleport("human-1", { x: 300, y: 0, z: 300, angle: 0 });
  movement.teleport(enemyA.id, { x: 300, y: 0, z: 294, angle: 0 });
  movement.teleport(enemyB.id, { x: 303, y: 0, z: 294, angle: 0 });
  host.events.emit("projectile:impact", {
    weaponId: "electro-rifle",
    shooterId: "human-1",
    targetId: enemyA.id,
    blockedByCover: false,
    now,
  });
  assert.ok(
    host.components.get(enemyA.id, "Health").current < hpABefore,
    "Electro-rifle deals bonus shock damage to Чиновник-революционер",
  );
  assert.ok(
    host.components.get(enemyB.id, "Health").current < hpBBefore,
    "Electro-rifle chain mode arcs to nearby enemy within 9.5m",
  );

  // 5. Test Internal Stimulator (auto-heal below 48% HP)
  const humanHp = host.components.get("human-1", "Health");
  humanHp.current = 300; // < 48% of 800
  now += ELECTRO_LUKASHENKO_STATS.internalStimIntervalMs + 500;
  matchApi.step(0.05, now);
  assert.ok(humanHp.current > 300, `Internal stimulator healed Electro-Lukashenko suit (${humanHp.current})`);

  // 6. Test Landmine planting -> 1.5s arming -> enemy steps on it -> bomb.mine sound (offset 1.45s) + blast damage!
  const minesBefore = specialOps.mineCountOf("human-1");
  movement.teleport("human-1", { x: 400, y: 0, z: 400, angle: 0 });
  matchApi.handleInput("human-1", { minePressed: true }, now);
  assert.equal(specialOps.mineCountOf("human-1"), minesBefore - 1, "Mine count decremented after planting");

  const mineVictim = entities.all().find((e) => e.alive && e.bot && !e.humanSquad && e.id !== enemyA.id && e.id !== enemyB.id);
  const victimPara = host.components.get(mineVictim.id, "Parachute");
  if (victimPara) { victimPara.phase = "landed"; victimPara.airborne = false; }
  const victimHpBefore = host.components.get(mineVictim.id, "Health").current;
  movement.teleport("human-1", { x: 430, y: 0, z: 430, angle: 0 });
  movement.teleport(mineVictim.id, { x: 400.5, y: 0, z: 400.5, angle: 0 });
  now += LANDMINE_CONFIG.armDelayMs + 200;
  matchApi.step(0.05, now);
  const mineBoomSound = capturedEvents.find((e) => e.event === "sound:spatial" && e.payload.key === "bomb.mine");
  assert.ok(mineBoomSound, "Mine emitted bomb.mine spatial sound");
  assert.equal(mineBoomSound.payload.offset, 1.45, "Mine bomb sound skips falling whistle with offset 1.45s");
  assert.ok(
    !mineVictim.alive || host.components.get(mineVictim.id, "Health").current < victimHpBefore,
    "Enemy stepping on mine took heavy explosion damage",
  );

  // 7. Test Mini-Nuke 2-step launch -> exact 2.15s detonation sync, 360° 185m blast radius, vehicle sky-launch & self-damage at 4m!
  const nukeVictims = entities.all()
    .filter((e) => e.alive && e.bot && !e.humanSquad && e.id !== mineVictim.id && e.id !== enemyA.id && e.id !== enemyB.id)
    .slice(0, 4);
  assert.equal(nukeVictims.length, 4, "4 enemy bots available for 360° 185m Mini-Nuke check");
  for (const v of nukeVictims) {
    const vp = host.components.get(v.id, "Parachute");
    if (vp) { vp.phase = "landed"; vp.airborne = false; }
  }
  const vehiclesForNuke = host.services.get("vehicles");
  const primaryJeepBeforeNuke = vehiclesForNuke?.stateFor?.(vehiclesForNuke.vehicleId);
  // Stand 215m south of the primary jeep so default medium distance (215m) puts ground zero RIGHT ON the jeep!
  const gz = {
    x: Math.round(primaryJeepBeforeNuke?.x ?? 94),
    z: Math.round(primaryJeepBeforeNuke?.z ?? 24),
  };
  movement.teleport("human-1", { x: gz.x, y: 0, z: gz.z + 215, angle: 0 }); // angle=0 faces -Z -> ground zero at (gz.x, 0, gz.z)
  // Place 4 targets around ground zero: center, +160m East, -160m West, -160m North (all within 185m 360° radius!)
  movement.teleport(nukeVictims[0].id, { x: gz.x, y: 0, z: gz.z, angle: 0 });
  movement.teleport(nukeVictims[1].id, { x: gz.x + 160, y: 0, z: gz.z, angle: 0 });
  movement.teleport(nukeVictims[2].id, { x: gz.x - 160, y: 0, z: gz.z, angle: 0 });
  movement.teleport(nukeVictims[3].id, { x: gz.x, y: 0, z: gz.z - 160, angle: 0 });

  matchApi.handleInput("human-1", { nukePressed: true }, now); // Step 1: aim
  assert.ok(capturedEvents.some((e) => e.event === "nuke:aiming"), "Step 1 emits nuke:aiming");
  const nukesBeforeLaunch = specialOps.nukeCountOf("human-1");
  matchApi.handleInput("human-1", { firePressed: true }, now); // Step 2: confirm launch with fire!
  assert.equal(specialOps.nukeCountOf("human-1"), nukesBeforeLaunch - 1, "Mini-nuke consumed on launch");
  assert.ok(
    capturedEvents.some((e) => e.event === "sound:spatial" && e.payload.key === "bomb.nuke" && (e.payload.radius ?? 0) >= 1400),
    "Mini-nuke plays map-wide bomb.nuke immediately on launch",
  );

  // Before 2.15s -> must NOT detonate yet
  now += 1500;
  matchApi.step(0.05, now);
  assert.equal(capturedEvents.filter((e) => e.event === "nuke:detonated").length, 0, "Nuke waits for 2.15s boom");

  // At >= 2.15s -> detonates in full 185m 360° sphere AND physically launches vehicles into the sky!
  now += 750;
  matchApi.step(0.05, now);
  const nukeDetEvent = capturedEvents.find((e) => e.event === "nuke:detonated");
  assert.ok(nukeDetEvent, "Nuke detonates at 2.15s sync");
  assert.equal(nukeDetEvent.payload.blastRadius, 185, "Nuke blastRadius reported as 185m");
  assert.ok((nukeDetEvent.payload.launchedVehicles ?? 0) >= 1, "Mini-Nuke physically launches vehicles inside its shockwave!");
  assert.equal(nukeVictims[0].alive, false, "Enemy at nuke ground zero obliterated");
  for (let i = 1; i < 4; i += 1) {
    const v = nukeVictims[i];
    const hitInEvent = (nukeDetEvent.payload.affected ?? []).some((a) => a.entityId === v.id);
    assert.equal(hitInEvent, true, `Enemy #${i} at 160m in different compass direction was blasted by 185m 360° nuke!`);
  }
  // Verify jeep physically flew upward/away over next few physics steps
  for (let i = 0; i < 8; i += 1) {
    now += 50;
    matchApi.step(0.05, now);
  }
  const primaryJeepAfterNuke = vehiclesForNuke?.stateFor?.(vehiclesForNuke.vehicleId);
  if (primaryJeepBeforeNuke && primaryJeepAfterNuke) {
    const jeepLift = primaryJeepAfterNuke.y - primaryJeepBeforeNuke.y;
    const jeepShift = Math.hypot(primaryJeepAfterNuke.x - primaryJeepBeforeNuke.x, primaryJeepAfterNuke.z - primaryJeepBeforeNuke.z);
    assert.ok(
      jeepLift > 4 || jeepShift > 8,
      `Mini-Nuke physically catapulted primary jeep (dy=${jeepLift.toFixed(2)}m, horiz=${jeepShift.toFixed(2)}m)`,
    );
  }

  // Self-damage check: fire mini-nuke at 4m ("Под себя")
  specialOps.grantNuke("human-1", 1);
  humanHp.current = 800;
  const selfArmorBefore = host.components.get("human-1", "Armor").current;
  matchApi.handleInput("human-1", { specialAction: { type: "nuke-launch", distanceMeters: 4 } }, now);
  now += MINI_NUKE_CONFIG.impactDelayMs + 100;
  matchApi.step(0.05, now);
  assert.ok(
    !entities.get("human-1").alive || humanHp.current < 800 || host.components.get("human-1", "Armor").current < selfArmorBefore,
    "Mini-nuke fired at 4m under self blasts the launcher too!",
  );

  // 8. Test Shop purchases (Mines, Mini-Nuke, Electro-Lukashenko drop)
  entities.setAlive("human-1", true);
  host.services.get("ragdoll")?.cancel?.("human-1", now, "test-revive");
  humanHp.current = 800;
  const shopStation = shop.stations().find((s) => s.id === "shop-residence");
  assert.ok(shopStation, "Shop at Residence exists");
  movement.teleport("human-1", { x: shopStation.x, y: 0, z: shopStation.z + 1.5, angle: 0 });
  shop.grantCash("human-1", 10_000, "test");

  const buyMines = shop.buy("human-1", { shopId: shopStation.id, itemId: "mines" }, now);
  assert.equal(buyMines.ok, true, "Bought mines in shop");
  const nukesBeforeShopBuy = specialOps.nukeCountOf("human-1");
  const buyNuke = shop.buy("human-1", { shopId: shopStation.id, itemId: "mini-nuke" }, now);
  assert.equal(buyNuke.ok, true, "Bought mini-nuke in shop");
  assert.equal(
    specialOps.nukeCountOf("human-1"),
    nukesBeforeShopBuy + 1000,
    "Buying mini-nuke in shop grants 1000 strikes",
  );
  const buyElectro = shop.buy("human-1", { shopId: shopStation.id, itemId: "electro-drop" }, now);
  assert.equal(buyElectro.ok, true, "Ordered Electro-Lukashenko airdrop in shop");
  const electroCrate = map.crates.find((c) => c.id === buyElectro.crateId);
  assert.equal(electroCrate?.loot, "electro-lukashenko", "Spawned crate has loot=electro-lukashenko");

  // 8b. Bunker Revive regression: down human right next to a bunker baffle wall at y = -14 -> revive MUST stand them up!
  movement.teleport("human-1", {
    x: RESIDENCE_SITE.x - 3.5,
    y: RESIDENCE_SITE.bunkerY,
    z: RESIDENCE_SITE.z + 5.0 - 0.55,
    angle: 0,
  });
  const humanArmor = host.components.get("human-1", "Armor");
  if (humanArmor) humanArmor.current = 0;
  host.services.get("combat").damage("human-1", 1200, { weaponId: "rifle", now });
  assert.equal(injury.isDowned("human-1"), true, "Human is downed in deep bunker");
  const bunkerRevived = injury.revive("human-1", now + 200, null, { targetHealth: 450 });
  assert.equal(bunkerRevived, true, "Bunker revive next to wall MUST succeed and never freeze downed!");
  assert.equal(injury.isDowned("human-1"), false, "Human stood back up cleanly in bunker");

  // 8c. Electro-rifle super-gun beats sniper in every stat AND pierces vehicles (occupied cars + enemies behind cars)!
  const { computeDistanceDamageMultiplier } = await import("../src/plugins/rapier-projectiles/server.js");
  const electroDef = weapons.definitions["electro-rifle"];
  const sniperDef = weapons.definitions.sniper;
  assert.ok(electroDef.damage > sniperDef.damage, `Electro-rifle damage (${electroDef.damage}) beats sniper (${sniperDef.damage})`);
  assert.ok(electroDef.range > sniperDef.range, `Electro-rifle range (${electroDef.range}) beats sniper (${sniperDef.range})`);
  assert.ok(
    electroDef.muzzleVelocity > sniperDef.muzzleVelocity,
    `Electro-rifle velocity (${electroDef.muzzleVelocity}) beats sniper (${sniperDef.muzzleVelocity})`,
  );
  assert.equal(electroDef.shattersArmor, true, "Electro-rifle shatters armor in one hit");
  assert.equal(electroDef.piercesVehicles, true, "Electro-rifle pierces vehicles");
  assert.equal(
    computeDistanceDamageMultiplier(240, "electro-rifle", electroDef.range),
    1,
    "Electro-rifle retains 100% damage even at 240m distance",
  );

  // Live vehicle-piercing check #1: enemy driving a car gets locked-on & pierced at 100% power by electro-rifle!
  const vehiclesSvc = host.services.get("vehicles");
  const carList = vehiclesSvc?.snapshot?.() ?? [];
  const farCars = carList.filter((v) => v && !v.driverId && Math.hypot(v.x - RESIDENCE_SITE.x, v.z - RESIDENCE_SITE.z) > 80);
  const testCar = farCars[0] ?? carList.find((v) => v && !v.driverId);
  const carEnemy = entities.all().find((e) => e.alive && !injury.isDowned(e.id) && e.bot && !e.humanSquad && !e.official && e.id !== enemyA.id && e.id !== enemyB.id);
  if (testCar && carEnemy) {
    const carPara = host.components.get(carEnemy.id, "Parachute");
    if (carPara) { carPara.phase = "landed"; carPara.airborne = false; }
    movement.teleport(carEnemy.id, { x: testCar.x, y: testCar.y ?? 0, z: testCar.z, angle: 0 });
    const entered = vehiclesSvc.enter?.(carEnemy.id, now, testCar.id);
    assert.equal(entered, true, "Enemy entered test vehicle");
    const shooterPos = { x: testCar.x, y: testCar.y ?? 0, z: testCar.z + 10, angle: 0 };
    movement.teleport("human-1", shooterPos);
    weapons.selectById("human-1", "electro-rifle");
    const carEnemyHp = host.components.get(carEnemy.id, "Health");
    const carEnemyArmor = host.components.get(carEnemy.id, "Armor");
    carEnemyHp.current = 200;
    if (carEnemyArmor) carEnemyArmor.current = 150;
    const targeting = host.services.get("targeting");
    const lock = targeting?.selectTarget?.("human-1", { x: 0, y: 0, z: -1 }, electroDef.range, {
      muzzleVelocity: electroDef.muzzleVelocity,
      weaponId: "electro-rifle",
      piercesVehicles: true,
    });
    assert.equal(lock?.targetId, carEnemy.id, "Electro-rifle target-assist locks onto enemy driving vehicle");
    weapons.fire("human-1", now + 200, { pressed: true });
    for (let i = 0; i < 8; i += 1) {
      now += 50;
      matchApi.step(0.05, now);
    }
    assert.ok(
      !carEnemy.alive || (carEnemyArmor && carEnemyArmor.current === 0 && carEnemyHp.current < 100),
      `Electro-rifle pierced occupied vehicle at full power (alive=${carEnemy.alive}, hp=${carEnemyHp.current}, armor=${carEnemyArmor?.current})`,
    );
    vehiclesSvc.exit?.(carEnemy.id, now);
  }

  // Live vehicle-piercing check #2: enemy standing BEHIND an empty parked car gets locked-on & shot straight through the car!
  const behindCar = farCars.find((v) => v.id !== testCar?.id)
    ?? (vehiclesSvc?.snapshot?.() ?? []).find((v) => v && !v.driverId && v.id !== testCar?.id);
  const behindEnemy = entities.all().find((e) => e.alive && !injury.isDowned(e.id) && e.bot && !e.humanSquad && !e.official && e.id !== carEnemy?.id && e.id !== enemyA.id && e.id !== enemyB.id);
  if (behindCar && behindEnemy) {
    const bPara2 = host.components.get(behindEnemy.id, "Parachute");
    if (bPara2) { bPara2.phase = "landed"; bPara2.airborne = false; }
    movement.teleport("human-1", { x: behindCar.x, y: behindCar.y ?? 0, z: behindCar.z + 8, angle: 0 });
    movement.teleport(behindEnemy.id, { x: behindCar.x, y: behindCar.y ?? 0, z: behindCar.z - 5, angle: 0 });
    const bHp = host.components.get(behindEnemy.id, "Health");
    const bArmor = host.components.get(behindEnemy.id, "Armor");
    bHp.current = 200;
    if (bArmor) bArmor.current = 150;
    const targeting = host.services.get("targeting");
    const lockBehind = targeting?.selectTarget?.("human-1", { x: 0, y: 0, z: -1 }, electroDef.range, {
      muzzleVelocity: electroDef.muzzleVelocity,
      weaponId: "electro-rifle",
      piercesVehicles: true,
    });
    assert.equal(lockBehind?.targetId, behindEnemy.id, "Electro-rifle target-assist locks onto enemy behind parked car");
    weapons.fire("human-1", now + 200, { pressed: true });
    for (let i = 0; i < 8; i += 1) {
      now += 50;
      matchApi.step(0.05, now);
    }
    assert.ok(
      !behindEnemy.alive || (bArmor && bArmor.current === 0 && bHp.current < 100),
      `Electro-rifle punched straight through empty car and hit enemy behind it (alive=${behindEnemy.alive}, hp=${bHp.current}, armor=${bArmor?.current})`,
    );
  }

  // 8d. Mine gunshot detonation + 4m horizontal proximity trigger!
  movement.teleport("human-1", { x: 480, y: 0, z: 480, angle: 0 });
  specialOps.grantMines("human-1", 2);
  matchApi.handleInput("human-1", { minePressed: true }, now);
  const gunshotMine = specialOps.plantedMines[specialOps.plantedMines.length - 1];
  assert.equal(gunshotMine.detonated, false);
  host.events.emit("projectile:impact", {
    shooterId: "human-1",
    weaponId: "electro-rifle",
    x: gunshotMine.x + 1.1,
    y: gunshotMine.y,
    z: gunshotMine.z + 0.5,
    now,
  });
  assert.equal(gunshotMine.detonated, true, "Shooting near a planted mine detonates it immediately");

  // 8e. Squadmate balance check: boosted armor/fast stims, 1.55x outgoing damage, 0.55x incoming damage
  const squadMate = entities.all().find((e) => e.alive && e.bot && e.humanSquad === "human-1");
  assert.ok(squadMate, "Human squadmate exists");
  assert.ok((host.components.get(squadMate.id, "Armor")?.reservePlates ?? 0) >= 6, "Squadmate starts with >= 6 armor plates");
  const testEnemy = entities.all().find((e) => e.alive && e.bot && !e.humanSquad && !e.official);
  if (testEnemy) {
    const enemyArmor = host.components.get(testEnemy.id, "Armor");
    if (enemyArmor) enemyArmor.current = 0;
    const enemyHp = host.components.get(testEnemy.id, "Health");
    enemyHp.current = 200;
    host.services.get("combat").damage(testEnemy.id, 40, { attackerId: squadMate.id, weaponId: "rifle", now });
    assert.ok(enemyHp.current <= 140, `Squadmate damage is amplified (enemy HP dropped from 200 to ${enemyHp.current})`);

    const mateArmor = host.components.get(squadMate.id, "Armor");
    if (mateArmor) mateArmor.current = 0;
    const mateHp = host.components.get(squadMate.id, "Health");
    mateHp.current = 200;
    host.services.get("combat").damage(squadMate.id, 40, { attackerId: testEnemy.id, weaponId: "rifle", distance: 18, now });
    assert.ok(mateHp.current >= 175, `Enemy damage against squadmate is reduced (mate HP stayed at ${mateHp.current})`);
  }

  // 9. Test Bandit living AI: buys back dead teammate at shop, grabs Electro crate, plants mine inside house!
  const ragdollSvc = host.services.get("ragdoll");
  const isStandingBot = (e) => (
    e.alive
    && !injury.isDowned(e.id)
    && !ragdollSvc?.isActive?.(e.id)
    && !vehiclesSvc?.isDriving?.(e.id)
    && e.bot
    && !e.humanSquad
    && !e.official
  );
  const bandit = entities.all().find(isStandingBot);
  const banditTeam = Number(teams.teamOf(bandit.id)) || 0;
  const deadMate = entities.all().find((e) => e.bot && e.id !== bandit.id && Number(teams.teamOf(e.id)) === banditTeam);
  if (deadMate) {
    entities.setAlive(deadMate.id, false);
  }
  const bPara = host.components.get(bandit.id, "Parachute");
  if (bPara) { bPara.phase = "landed"; bPara.airborne = false; }
  shop.grantCash(bandit.id, 3000, "bandit-stash");
  movement.teleport(bandit.id, { x: shopStation.x + 1.2, y: 0, z: shopStation.z + 1.2, angle: 0 });
  now += 2500;
  matchApi.step(0.05, now);
  if (deadMate) {
    assert.equal(deadMate.alive, true, "Bandit bot bought back dead teammate at shop!");
  }

  // Bandit grabs landed Electro-Lukashenko crate
  electroCrate.y = 0;
  electroCrate.airdropPhase = "landed";
  movement.teleport(bandit.id, { x: electroCrate.x + 0.6, y: 0, z: electroCrate.z + 0.6, angle: 0 });
  now += 2500;
  matchApi.step(0.05, now);
  assert.equal(bandit.electroLukashenko, true, "Bandit bot picked up Electro-Lukashenko crate and equipped it!");

  // Bandit plants mine inside Two-Storey House (x: 135, z: 120)
  const plantedCountBefore = specialOps.plantedMines.length;
  movement.teleport(bandit.id, { x: 135, y: 0, z: 120, angle: 0 });
  now += 20_000;
  matchApi.step(0.05, now);
  assert.ok(specialOps.plantedMines.length > plantedCountBefore, "Bandit bot planted a mine inside a building!");

  // 9a-extra. Electro-Rifle ONE-SHOT knockback check: 1 single shot (whether it downs OR kills!) MUST catapult the enemy sky-high!
  const oneShotVictim = entities.all().find((e) => isStandingBot(e) && e.id !== bandit.id);
  assert.ok(oneShotVictim, "Enemy available for 1-shot Electro-Rifle knockback test");
  const osvPara = host.components.get(oneShotVictim.id, "Parachute");
  if (osvPara) { osvPara.phase = "landed"; osvPara.airborne = false; }
  const osvHp = host.components.get(oneShotVictim.id, "Health");
  const osvArmor = host.components.get(oneShotVictim.id, "Armor");
  osvHp.current = 180; // 1 shot (185 dmg) immediately downs (or kills if last squadmate)!
  if (osvArmor) osvArmor.current = 0;
  movement.teleport("human-1", { x: -300, y: 0, z: 300, angle: 0 });
  movement.teleport(oneShotVictim.id, { x: -300, y: 0, z: 290, angle: 0 });
  weapons.selectById("human-1", "electro-rifle");
  weapons.fire("human-1", now + 200, { pressed: true });
  const readRagdollPeakY = (id) => {
    const rs = ragdollSvc?.stateFor?.(id);
    const pelvis = rs?.parts?.find((p) => p.name === "pelvis");
    const ty = Number(host.components.get(id, "Transform")?.y) || 0;
    return Math.max(ty, Number(pelvis?.y) || 0);
  };
  let peakOneShotY = 0;
  for (let i = 0; i < 12; i += 1) {
    now += 50;
    matchApi.step(0.05, now);
    peakOneShotY = Math.max(peakOneShotY, readRagdollPeakY(oneShotVictim.id));
  }
  assert.ok(
    !oneShotVictim.alive || injury.isDowned(oneShotVictim.id),
    `Enemy was immediately downed or killed in 1 Electro-Rifle shot (alive=${oneShotVictim.alive}, downed=${injury.isDowned(oneShotVictim.id)}, hp=${osvHp.current})`,
  );
  assert.equal(ragdollSvc?.isActive?.(oneShotVictim.id), true, "1-shot Electro-Rifle victim has active ragdoll");
  assert.ok(peakOneShotY >= 1.6, `1-shot Electro-Rifle victim was catapulted skyward (peakY=${peakOneShotY.toFixed(2)}m)!`);

  // Also test 1-shot INSTANT KILL (eliminating a solo bot whose squadmates are already dead) -> dead ragdoll MUST ALSO fly sky-high!
  const instantKillVictim = entities.all().find((e) => isStandingBot(e) && e.id !== bandit.id && e.id !== oneShotVictim.id);
  assert.ok(instantKillVictim, "Second enemy available for 1-shot instant-kill knockback test");
  const ikTeam = Number(teams.teamOf(instantKillVictim.id)) || 0;
  for (const mate of entities.all()) {
    if (mate.id !== instantKillVictim.id && Number(teams.teamOf(mate.id)) === ikTeam) {
      entities.setAlive(mate.id, false);
    }
  }
  const ikPara = host.components.get(instantKillVictim.id, "Parachute");
  if (ikPara) { ikPara.phase = "landed"; ikPara.airborne = false; }
  host.components.get(instantKillVictim.id, "Health").current = 150;
  const ikArmor = host.components.get(instantKillVictim.id, "Armor");
  if (ikArmor) ikArmor.current = 0;
  movement.teleport("human-1", { x: -340, y: 0, z: 300, angle: 0 });
  movement.teleport(instantKillVictim.id, { x: -340, y: 0, z: 290, angle: 0 });
  weapons.fire("human-1", now + 250, { pressed: true });
  let peakKillY = 0;
  for (let i = 0; i < 12; i += 1) {
    now += 50;
    matchApi.step(0.05, now);
    peakKillY = Math.max(peakKillY, readRagdollPeakY(instantKillVictim.id));
  }
  assert.equal(instantKillVictim.alive, false, "Solo enemy died instantly in 1 Electro-Rifle shot");
  assert.equal(ragdollSvc?.isActive?.(instantKillVictim.id), true, "1-shot killed enemy has active ragdoll");
  assert.ok(peakKillY >= 1.6, `1-shot KILLED enemy corpse was catapulted skyward (peakY=${peakKillY.toFixed(2)}m)!`);

  // 9b. Test Electro-Lukashenko Super-Jump: UP + FAR FORWARD + mid-air body turning + release-to-glide + Slam (15s cooldown)!
  const slamVictim = entities.all().find((e) => isStandingBot(e) && e.id !== bandit.id && e.id !== oneShotVictim.id);
  assert.ok(slamVictim, "Enemy available for Electro Super-Jump Slam test");
  const svPara = host.components.get(slamVictim.id, "Parachute");
  if (svPara) { svPara.phase = "landed"; svPara.airborne = false; }
  movement.teleport("human-1", { x: 0, y: 0, z: -40, angle: 0 }); // angle=0 flies toward -Z
  humanHp.current = 800;
  const slamVictimHp = host.components.get(slamVictim.id, "Health");
  const slamVictimArmor = host.components.get(slamVictim.id, "Armor");
  slamVictimHp.current = 200;
  if (slamVictimArmor) slamVictimArmor.current = 150;

  // Step 1: Launch UP + FAR FORWARD and rotate body mid-air with Left-Stick strafe!
  matchApi.handleInput("human-1", { electroJumpPressed: true, strafe: 0 }, now);
  assert.equal(specialOps.electroJumpPhaseOf("human-1", now), "rising", "Super-Jump launches into rising phase");
  for (let i = 0; i < 16; i += 1) {
    now += 50;
    matchApi.handleInput("human-1", { strafe: i >= 8 ? 0.8 : 0 }, now);
    matchApi.step(0.05, now);
  }
  const midAirPos = host.components.get("human-1", "Transform");
  const forwardTravelled = Math.hypot(midAirPos.x - 0, midAirPos.z - (-40));
  assert.ok(midAirPos.y >= 15, `Super-Jump lifted Electro-Lukashenko high into the air (y=${midAirPos.y.toFixed(1)})`);
  assert.ok(forwardTravelled >= 20, `Super-Jump propelled Electro-Lukashenko far forward (${forwardTravelled.toFixed(1)}m)!`);
  assert.ok(Math.abs(midAirPos.angle) >= 0.5, `Player rotated body smoothly mid-flight (angle=${midAirPos.angle.toFixed(2)} rad)!`);

  // Step 2: Release Square -> enters ballistic free-flight ("gliding")!
  matchApi.handleInput("human-1", { electroJumpReleased: true, strafe: 0 }, now);
  assert.equal(specialOps.electroJumpPhaseOf("human-1", now), "gliding", "Releasing Square switches rising -> gliding free-flight");

  // Place slamVictim 10m ahead of current position and trigger Meteor Slam DOWN!
  movement.teleport(slamVictim.id, { x: midAirPos.x + 8, y: 0, z: midAirPos.z, angle: 0 });
  matchApi.handleInput("human-1", { electroJumpPressed: true }, now);
  assert.equal(specialOps.electroJumpPhaseOf("human-1", now), "diving", "Pressing Square in glide triggers Meteor Slam dive");
  for (let i = 0; i < 24; i += 1) {
    now += 50;
    matchApi.step(0.05, now);
  }
  const landedPos = host.components.get("human-1", "Transform");
  assert.ok(landedPos.y <= 0.5, `Electro-Lukashenko landed cleanly after slam (y=${landedPos.y.toFixed(1)})`);
  assert.equal(humanHp.current, 800, "Electro Super-Jump Meteor Slam deals ZERO self-damage and triggers ZERO fall damage!");
  assert.equal(specialOps.electroJumpPhaseOf("human-1", now), "cooldown", "Super-Jump enters cooldown after slam");
  const cdSnap = matchApi.snapshotFor("human-1", now);
  assert.ok(
    (cdSnap.specialOps?.electroJumpCooldownMs ?? 0) > ELECTRO_SUPER_JUMP_CONFIG.cooldownMs * 0.4,
    `Super-Jump cooldown active (remaining=${cdSnap.specialOps?.electroJumpCooldownMs}ms, config=${ELECTRO_SUPER_JUMP_CONFIG.cooldownMs}ms)`,
  );
  assert.ok(
    !slamVictim.alive || injury.isDowned(slamVictim.id) || slamVictimHp.current < 100,
    `Meteor Slam blasted enemy near landing (alive=${slamVictim.alive}, downed=${injury.isDowned(slamVictim.id)}, hp=${slamVictimHp.current}, armor=${slamVictimArmor?.current})`,
  );
  assert.ok(
    capturedEvents.some((e) => e.event === "special:electro-jump" && e.payload.phase === "slam" && e.payload.entityId === "human-1"),
    "special:electro-jump slam event emitted",
  );

  // 9b-2. Choice 2: Open Parachute directly from Super-Jump free-flight!
  const parachuteSvc = host.services.get("parachute");
  now += 16_000;
  movement.teleport("human-1", { x: -200, y: 0, z: -200, angle: 0 });
  matchApi.handleInput("human-1", { electroJumpPressed: true }, now);
  for (let i = 0; i < 16; i += 1) {
    now += 50;
    matchApi.step(0.05, now);
  }
  matchApi.handleInput("human-1", { electroJumpReleased: true }, now);
  assert.equal(specialOps.electroJumpPhaseOf("human-1", now), "gliding", "In gliding phase before parachute handoff");
  matchApi.handleInput("human-1", { parachutePressed: true }, now);
  const paraStateAfter = parachuteSvc?.stateFor?.("human-1");
  assert.equal(paraStateAfter?.airborne, true, "Parachute opened seamlessly from Electro Super-Jump!");
  assert.equal(paraStateAfter?.deployed, true, "Parachute canopy deployed cleanly from Super-Jump!");
  // Land parachute cleanly before Choice 3
  const humanPara2 = host.components.get("human-1", "Parachute");
  if (humanPara2) { humanPara2.phase = "landed"; humanPara2.airborne = false; humanPara2.deployed = false; }

  // 9b-3. Choice 3: Just Fly & Land naturally across a long distance with ZERO fall damage!
  now += 16_000;
  movement.teleport("human-1", { x: -100, y: 0, z: 200, angle: 0 });
  humanHp.current = 800;
  matchApi.handleInput("human-1", { electroJumpPressed: true }, now);
  for (let i = 0; i < 30; i += 1) {
    now += 50;
    matchApi.step(0.05, now);
  }
  // Release boost at 1.5s to enter gliding, then ride ballistic flight all the way to natural landing
  matchApi.handleInput("human-1", { electroJumpReleased: true }, now);
  for (let i = 0; i < 160; i += 1) {
    now += 50;
    matchApi.step(0.05, now);
    if (specialOps.electroJumpPhaseOf("human-1", now) === "cooldown") break;
  }
  const glideLandPos = host.components.get("human-1", "Transform");
  const totalFlightDist = Math.hypot(glideLandPos.x - (-100), glideLandPos.z - 200);
  assert.ok(totalFlightDist >= 80, `Full Super-Jump arc flew VERY far forward (${totalFlightDist.toFixed(1)}m)!`);
  assert.equal(humanHp.current, 800, "Natural landing after long Super-Jump deals ZERO fall damage!");
  assert.ok(
    capturedEvents.some((e) => e.event === "special:electro-jump" && e.payload.phase === "land" && e.payload.entityId === "human-1"),
    "Natural safe landing emitted special:electro-jump land event",
  );

  // 9c. Test Max 1 Rival Electro-Lukashenko Boss cap + Rival Boss Super-Jump Slam & Rival Mini-Nuke!
  const rivalBoss = bandit;
  assert.equal(rivalBoss.electroLukashenko, true, "Rival bandit is wearing Electro-Lukashenko suit");
  const secondRichBandit = entities.all().find((e) => isStandingBot(e) && e.id !== rivalBoss.id && !e.electroLukashenko);
  if (secondRichBandit) {
    const sbPara = host.components.get(secondRichBandit.id, "Parachute");
    if (sbPara) { sbPara.phase = "landed"; sbPara.airborne = false; }
    shop.grantCash(secondRichBandit.id, 10_000, "rich-second-boss-test");
    movement.teleport(secondRichBandit.id, { x: shopStation.x + 1.0, y: 0, z: shopStation.z + 1.0, angle: 0 });
    now += 5000;
    specialOps.runRivalLateGameStep(now, { forceDirector: true });
    const aliveEnemyElectros = entities.all().filter((e) => e.alive && e.bot && !e.humanSquad && e.electroLukashenko).length;
    assert.equal(aliveEnemyElectros, 1, "Strictly at most ONE enemy Electro-Lukashenko boss active at a time!");
  }

  const bossVictim = entities.all().find((e) => isStandingBot(e) && Number(teams.teamOf(e.id)) !== Number(teams.teamOf(rivalBoss.id)));
  if (bossVictim) {
    const bvPara = host.components.get(bossVictim.id, "Parachute");
    if (bvPara) { bvPara.phase = "landed"; bvPara.airborne = false; }
    movement.teleport(rivalBoss.id, { x: -450, y: 0, z: -450, angle: 0 });
    movement.teleport(bossVictim.id, { x: -450, y: 0, z: -432, angle: 0 }); // 18m away -> triggers Boss Super-Jump!
    now += 16_000;
    specialOps.runRivalLateGameStep(now, { forceDirector: true });
    assert.equal(
      specialOps.electroJumpPhaseOf(rivalBoss.id, now),
      "rising",
      "Rival Electro-Lukashenko boss autonomously launches Electro Super-Jump toward hostile target!",
    );
  }

  // Test Rival Mini-Nuke launch at safe 235m distance (outside 185m blast radius!)
  const nukeBeforeRival = capturedEvents.filter((e) => e.event === "nuke:launched" && e.payload.bot).length;
  const nukeShooter = entities.all().find((e) => isStandingBot(e) && e.id !== rivalBoss.id);
  if (nukeShooter) {
    const nsPara = host.components.get(nukeShooter.id, "Parachute");
    if (nsPara) { nsPara.phase = "landed"; nsPara.airborne = false; }
    specialOps.grantNuke(nukeShooter.id, 10);
    movement.teleport(nukeShooter.id, { x: glideLandPos.x, y: 0, z: glideLandPos.z - 235, angle: 0 }); // 235m from human-1!
    now += 35_000;
    specialOps.runRivalLateGameStep(now, { forceDirector: true });
    const nukeAfterRival = capturedEvents.filter((e) => e.event === "nuke:launched" && e.payload.bot).length;
    assert.ok(nukeAfterRival > nukeBeforeRival, "Rival bot autonomously launched a Mini-Nuke at safe 235m distance!");
  }

  // Ensure snapshotFor includes complete specialOps block including electroJumpPhase
  const snap = matchApi.snapshotFor("human-1", now);
  assert.ok(snap.specialOps, "snapshotFor exposes specialOps");
  assert.equal(typeof snap.specialOps.mines, "number");
  assert.equal(typeof snap.specialOps.miniNukes, "number");
  assert.equal(typeof snap.specialOps.electroJumpPhase, "string");

  await game.close?.();
  console.log("[PASS] Live Battle Royale Special-Ops, Residence Bunker, Mines, 185m Mini-Nuke, Electro Super-Jump & Rival Boss AI tests!");
}

runPureUnitTests();
await runLiveIntegrationTests();
