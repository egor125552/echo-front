import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createEchoFrontGame } from "../src/server/game.js";
import {
  CANNON_CONFIG,
  CANNON_MODES,
  cannonModeById,
  computeCannonChargeProfile,
  evaluateCannonImpact,
  nextCannonMode,
} from "../src/game/special-ops-arsenal.js";
import { hapticCueForGameEvent } from "../public/client/plugins/haptic-feedback.js";
import { SPATIAL_SOUND_PROFILES } from "../public/client/plugins/core-sound-pack.js";

test("pure cannon modes, charge scaling, cover defense & haptics", () => {
  assert.equal(CANNON_CONFIG.range, 700, "Cannon range must be 700m");
  assert.equal(CANNON_MODES.length, 5, "Cannon must have exactly 5 modes");
  assert.deepEqual(
    CANNON_MODES.map((m) => m.id),
    ["standard", "shrapnel", "piercing", "charged", "salvo"],
  );

  let mode = cannonModeById("standard");
  const seen = [mode.id];
  for (let i = 0; i < 4; i += 1) {
    mode = nextCannonMode(mode.id);
    seen.push(mode.id);
  }
  assert.deepEqual(seen, ["standard", "shrapnel", "piercing", "charged", "salvo"]);
  assert.equal(nextCannonMode("salvo").id, "standard", "Modes cycle cleanly back to standard");

  const lowCharge = computeCannonChargeProfile(0.15);
  const fullCharge = computeCannonChargeProfile(1.0);
  assert.ok(fullCharge.speed > lowCharge.speed + 50, "Full charge flies much faster");
  assert.ok(fullCharge.blastRadius > lowCharge.blastRadius + 15, "Full charge blast radius scales massively");
  assert.ok(fullCharge.maxDamage > lowCharge.maxDamage + 200, "Full charge damage scales massively");
  assert.ok(fullCharge.vehicleUp > lowCharge.vehicleUp + 18, "Full charge launches cars much higher");
  assert.equal(fullCharge.heavyRecoil, true, "Full charge triggers heavy standing recoil");

  const openHit = evaluateCannonImpact({
    distance: 10,
    blastRadius: 24,
    maxDamage: 290,
    ragdollUp: 21,
    ragdollOut: 24,
    targetBlockedByCover: false,
  });
  const coverHit = evaluateCannonImpact({
    distance: 10,
    blastRadius: 24,
    maxDamage: 290,
    ragdollUp: 21,
    ragdollOut: 24,
    targetBlockedByCover: true,
    piercing: false,
  });
  assert.equal(coverHit.mitigatedByCover, true, "Solid cover mitigates non-piercing shockwave");
  assert.ok(coverHit.damage < openHit.damage * 0.5, "Solid cover slashes shockwave damage by >50%");
  assert.ok(coverHit.ragdollUp < openHit.ragdollUp * 0.5, "Solid cover slashes upward launch");

  const piercingThroughCover = evaluateCannonImpact({
    distance: 10,
    blastRadius: 13,
    maxDamage: 340,
    ragdollUp: 16,
    ragdollOut: 28,
    targetBlockedByCover: true,
    piercing: true,
  });
  assert.equal(piercingThroughCover.mitigatedByCover, false, "Piercing mode ignores cover mitigation");

  const electroGlancing = evaluateCannonImpact({
    distance: 12,
    blastRadius: 42,
    maxDamage: 530,
    targetElectro: true,
  });
  assert.ok(electroGlancing.damage <= CANNON_CONFIG.electroMaxShockwaveDamage, "Electro-Lukashenko survives glancing blast");

  const cannonHaptic = hapticCueForGameEvent(
    { event: "weapon:fired", payload: { entityId: "p1", weaponId: "cannon", chargeRatio: 0.9 } },
    "p1",
  );
  assert.equal(cannonHaptic?.kind, "weapon:cannon");
  assert.ok(cannonHaptic.gamepad.duration >= 450, "Charged cannon shot produces strong long DualSense rumble");

  const impactHaptic700m = hapticCueForGameEvent(
    { event: "cannon:impact", payload: { ownerId: "p1", traveled: 700, chargeRatio: 0.8, hitCount: 0, launchedVehicles: 0 } },
    "p1",
  );
  assert.equal(impactHaptic700m?.kind, "cannon:impact");
  assert.ok(impactHaptic700m.gamepad.duration >= 220, "700m detonation still triggers heavy DualSense rumble for shooter");
  assert.ok(impactHaptic700m.gamepad.strong >= 0.6, "700m detonation keeps strong motor punch");

  const nearbyImpactHaptic = hapticCueForGameEvent(
    { event: "cannon:impact", payload: { ownerId: "enemy1", traveled: 200, chargeRatio: 0.5 } },
    "p1",
    { distanceToListener: 45 },
  );
  assert.equal(nearbyImpactHaptic?.kind, "cannon:impact");
  assert.ok(nearbyImpactHaptic.gamepad.strong >= 0.5, "Nearby enemy cannon impact shakes DualSense");

  for (const key of ["weapon.cannon", "cannon.impact", "cannon.pierce"]) {
    const profile = SPATIAL_SOUND_PROFILES[key];
    assert.ok(profile, `Spatial audio profile exists for ${key}`);
    assert.ok(profile.referenceDistance >= 30, `${key} has long referenceDistance (${profile.referenceDistance})`);
    assert.ok(profile.rolloffFactor <= 0.08, `${key} has shallow rolloffFactor (${profile.rolloffFactor}) for 700m audibility`);
  }

  const assetPath = path.resolve("public/assets/aistudio/shot-from-an-antique-gun_1f6e6664.mp3");
  assert.equal(fs.existsSync(assetPath), true, "Uploaded antique cannon MP3 asset exists");
});

test("Battle Royale integration: exclusive unlocks, heavy handling, crouch brace, 700m physical flight, 5 modes & vehicle sky-launch", async () => {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  const { services, components, events } = game.host;
  const matchApi = game.api;
  const entities = services.get("entities");
  const weapons = services.get("weapons");
  const movement = services.get("movement");
  const vehicles = services.get("vehicles");
  const shop = services.get("shop");
  const specialOps = services.get("special-ops");
  const ragdoll = services.get("ragdoll");

  let now = 50_000;
  const stepSim = (frames = 10, dt = 0.05) => {
    for (let i = 0; i < frames; i += 1) {
      now += Math.round(dt * 1000);
      matchApi.step(dt, now);
    }
  };

  // Join human player and advance through deployment so match is active
  const playerId = "p1";
  matchApi.connectHuman(playerId, now);
  stepSim(65, 0.05);

  // Land player directly near Central Shop (0, 0, -26)
  const para = components.get(playerId, "Parachute");
  if (para) {
    para.phase = "landed";
    para.airborne = false;
  }
  movement.teleport(playerId, { x: 0, y: 0, z: -26, angle: 0 });
  stepSim(2, 0.05);

  // 1. Exclusive Shop Purchase
  shop.grantCash(playerId, 3000, "test");
  const shopDescBefore = shop.describeFor(playerId);
  assert.equal(shopDescBefore.cannonOwned, false);
  assert.equal(shopDescBefore.prices.cannon, 1800);
  const buyRes = shop.buy(playerId, { shopId: "shop-center", itemId: "cannon" }, now);
  assert.equal(buyRes.ok, true, "Player can buy exclusive Smertonos cannon at Buy Station");
  assert.equal(weapons.has(playerId, "cannon"), true);
  assert.equal(weapons.selected(playerId)?.id, "cannon", "Bought cannon is auto-selected");

  // 2. Heavy clumsy handling (slower walk, no sprint, slower turn) vs pistol
  movement.teleport(playerId, { x: -300, y: 0, z: -300, angle: 0 });
  matchApi.handleInput(playerId, { forward: 1, sprint: true, turn: 1 }, now);
  stepSim(20, 0.05); // 1.0s holding cannon
  const tCannon = components.get(playerId, "Transform");
  const distCannon = Math.hypot(tCannon.x - (-300), tCannon.z - (-300));
  const angleCannon = Math.abs(tCannon.angle);

  weapons.selectById(playerId, "pistol");
  movement.teleport(playerId, { x: -300, y: 0, z: -300, angle: 0 });
  matchApi.handleInput(playerId, { forward: 1, sprint: true, turn: 1 }, now);
  stepSim(20, 0.05); // 1.0s holding pistol sprinting
  const tPistol = components.get(playerId, "Transform");
  const distPistol = Math.hypot(tPistol.x - (-300), tPistol.z - (-300));
  const anglePistol = Math.abs(tPistol.angle);

  assert.ok(distCannon < distPistol * 0.55, `Cannon sprint/walk (${distCannon.toFixed(2)}m) must be much slower than pistol sprint (${distPistol.toFixed(2)}m)`);
  assert.ok(angleCannon < anglePistol * 0.72, `Cannon turn (${angleCannon.toFixed(2)}) must be sluggish vs pistol (${anglePistol.toFixed(2)})`);

  // 3. Standing recoil vs Crouched brace
  weapons.selectById(playerId, "cannon");
  matchApi.handleInput(playerId, { forward: 0, strafe: 0, turn: 0, sprint: false }, now);
  const recoilEvents = [];
  events.on("cannon:recoil-unbraced", (p) => recoilEvents.push(p));

  movement.teleport(playerId, { x: -300, y: 0, z: -300, angle: 0 });
  const tPlayer = components.get(playerId, "Transform");
  tPlayer.crouching = false;
  now += 1500;
  matchApi.handleInput(playerId, { firePressed: true }, now);
  const zAfterStandingShot = components.get(playerId, "Transform").z;
  assert.equal(recoilEvents.length, 1, "Standing shot triggers unbraced recoil event");
  assert.ok(zAfterStandingShot > -298, `Standing recoil pushes shooter backward (z=${zAfterStandingShot.toFixed(2)})`);

  // Crouched shot stays planted!
  movement.teleport(playerId, { x: -300, y: 0, z: -300, angle: 0 });
  components.get(playerId, "Transform").crouching = true;
  now += 1500;
  matchApi.handleInput(playerId, { firePressed: true }, now);
  const zAfterCrouchShot = components.get(playerId, "Transform").z;
  assert.equal(recoilEvents.length, 1, "Crouched shot produces zero unbraced recoil");
  assert.ok(Math.abs(zAfterCrouchShot - (-300)) < 0.25, "Crouched shooter stays braced in place");

  // 4. Physical 700m cannonball flight (NOT instant hitscan) + snapshot exposure
  const snapInFlight = matchApi.snapshotFor(playerId, now);
  assert.ok(snapInFlight.cannonballs.length >= 1, "Flying cannonball is exposed in snapshot for 3D audio");
  const firstBallId = snapInFlight.cannonballs[snapInFlight.cannonballs.length - 1].id;
  const startZ = snapInFlight.cannonballs[snapInFlight.cannonballs.length - 1].z;
  stepSim(10, 0.05); // 0.5s flight (~77m)
  const snapMidFlight = matchApi.snapshotFor(playerId, now);
  const midBall = snapMidFlight.cannonballs.find((b) => b.id === firstBallId);
  assert.ok(midBall, "Cannonball is still physically flying after 0.5s (not instant hitscan!)");
  assert.ok(startZ - midBall.z > 55, `Cannonball physically traveled forward (${(startZ - midBall.z).toFixed(1)}m in 0.5s)`);

  // Wait for clear sky flight to finish
  stepSim(110, 0.05);

  // 5. Vehicle sky-launch + crowd enemy ragdoll launch!
  // Primary jeep is at ~(94, 1.25, 24)
  const jeepBefore = vehicles.stateFor(vehicles.vehicleId);
  assert.ok(jeepBefore, "Primary jeep exists");
  const shooterX = jeepBefore.x;
  const shooterZ = jeepBefore.z + 32; // 32m south of jeep, facing north (angle = 0)
  movement.teleport(playerId, { x: shooterX, y: 0, z: shooterZ, angle: 0 });
  components.get(playerId, "Transform").crouching = true;

  // Place 3 enemy bots clustered right beside the jeep!
  const enemyBots = entities.all().filter((e) => e.bot && e.alive && !e.humanSquad).slice(0, 3);
  assert.ok(enemyBots.length >= 2, "At least 2 enemy bots exist in Battle Royale");
  enemyBots.forEach((bot, idx) => {
    const bp = components.get(bot.id, "Parachute");
    if (bp) { bp.phase = "landed"; bp.airborne = false; }
    movement.teleport(bot.id, { x: jeepBefore.x + (idx - 1) * 4, y: 0, z: jeepBefore.z + 2, angle: Math.PI });
  });

  const vehicleLaunchEvents = [];
  events.on("vehicle:launched", (p) => vehicleLaunchEvents.push(p));

  // Ensure loaded ammo & fire!
  weapons.restock(playerId, "cannon", 40);
  const inv = components.get(playerId, "Weapons");
  const cannonSlot = inv.items.find((w) => w.id === "cannon");
  cannonSlot.ammo = 5;
  cannonSlot.reloadUntil = 0;

  now += 2000;
  matchApi.handleInput(playerId, { firePressed: true }, now);
  stepSim(25, 0.05); // 1.25s: cannonball hits jeep & enemies and sends them flying!

  const jeepAfter = vehicles.stateFor(vehicles.vehicleId);
  assert.ok(vehicleLaunchEvents.length >= 1, "Jeep received vehicle:launched event from cannon blast");
  const jeepMoved = Math.hypot(jeepAfter.x - jeepBefore.x, jeepAfter.z - jeepBefore.z);
  const jeepLifted = jeepAfter.y - jeepBefore.y;
  assert.ok(
    jeepLifted > 3.5 || jeepMoved > 8,
    `Jeep was visibly launched into the sky/away (dy=${jeepLifted.toFixed(2)}m, horiz=${jeepMoved.toFixed(2)}m)`,
  );
  const launchedBots = enemyBots.filter((b) => ragdoll?.isActive?.(b.id) || !b.alive || (components.get(b.id, "Transform")?.y ?? 0) > 1.5);
  assert.ok(launchedBots.length >= 2, "Multiple enemies around blast were hit/launched into ragdoll");

  // 6. Mode 2: Shrapnel spawns 7 cannonballs!
  specialOps.setCannonMode(playerId, "shrapnel", now);
  movement.teleport(playerId, { x: -350, y: 0, z: -350, angle: 0 });
  components.get(playerId, "Transform").crouching = true;
  cannonSlot.ammo = 5;
  cannonSlot.reloadUntil = 0;
  now += 2000;
  const launchedShrapnel = [];
  const shrapnelListener = (p) => { if (p.modeId === "shrapnel") launchedShrapnel.push(p); };
  events.on("cannon:launched", shrapnelListener);
  matchApi.handleInput(playerId, { firePressed: true }, now);
  assert.equal(launchedShrapnel.length, 7, "Shrapnel mode launches 7 physical cannonballs in a fan");

  // 7. Mode 4: Charged mode (hold fireHeld -> charges -> release fires scaled ball; weapon switch cancels!)
  specialOps.setCannonMode(playerId, "charged", now);
  cannonSlot.ammo = 5;
  cannonSlot.reloadUntil = 0;
  now += 2000;
  matchApi.handleInput(playerId, { fireHeld: true, firePressed: true }, now);
  const snapCharging = matchApi.snapshotFor(playerId, now + 2000);
  assert.equal(snapCharging.specialOps.cannonCharging, true, "Holding fireHeld starts cannon charge");
  assert.ok(snapCharging.specialOps.cannonChargeRatio > 0.5, "Charge ratio rises smoothly over time");

  // Cancel test: switching weapon cancels charge without firing!
  const beforeCancelCount = specialOps.activeCannonballs.length;
  weapons.selectById(playerId, "pistol");
  assert.equal(matchApi.snapshotFor(playerId, now + 2100).specialOps.cannonCharging, false, "Switching weapon cancels charge");
  assert.equal(specialOps.activeCannonballs.length, beforeCancelCount, "Cancelled charge does not fire");

  // Full hold-and-release fire test!
  weapons.selectById(playerId, "cannon");
  now += 3000;
  const chargedShots = [];
  events.on("cannon:launched", (p) => { if (p.modeId === "charged") chargedShots.push(p); });
  matchApi.handleInput(playerId, { fireHeld: true, firePressed: true }, now);
  stepSim(45, 0.05); // hold for 2.25s (~64% charge)
  matchApi.handleInput(playerId, { fireHeld: false, firePressed: false }, now);
  assert.equal(chargedShots.length, 1, "Releasing fireHeld fires charged cannonball");
  assert.ok(chargedShots[0].chargeRatio >= 0.55, `Charged shot captured charge ratio (${chargedShots[0].chargeRatio})`);

  // 8. Mode 5: Salvo fires 5 sequential cannonballs!
  specialOps.setCannonMode(playerId, "salvo", now);
  cannonSlot.ammo = 5;
  cannonSlot.reloadUntil = 0;
  now += 2500;
  const salvoShots = [];
  events.on("cannon:launched", (p) => { if (p.modeId === "salvo") salvoShots.push(p); });
  matchApi.handleInput(playerId, { firePressed: true }, now);
  stepSim(20, 0.05); // 1.0s drains all 5 salvo shells
  assert.equal(salvoShots.length, 5, "Salvo mode launches 5 sequential heavy cannonballs");

  // 9. Electro-Lukashenko & Juggernaut exclusive grant
  const p2 = "p2";
  matchApi.connectHuman(p2, now);
  assert.equal(weapons.has(p2, "cannon"), false, "Fresh player does not start with exclusive cannon");
  events.emit("loot:opened", { entityId: p2, loot: "juggernaut", now });
  assert.equal(weapons.has(p2, "cannon"), true, "Juggernaut drop grants exclusive Smertonos cannon");

  const p3 = "p3";
  matchApi.connectHuman(p3, now);
  specialOps.equipElectroLukashenko(p3, now, "test");
  assert.equal(weapons.has(p3, "cannon"), true, "Electro-Lukashenko drop grants exclusive Smertonos cannon");
});

test("50m vehicle piercing & standard hits stay at chassis height and pierce through to targets behind (with 4.5 deg blind aim offset)", async () => {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  const { services, components, events } = game.host;
  const matchApi = game.api;
  const entities = services.get("entities");
  const weapons = services.get("weapons");
  const movement = services.get("movement");
  const vehicles = services.get("vehicles");
  const specialOps = services.get("special-ops");

  let now = 80_000;
  const stepSim = (frames = 10, dt = 0.05) => {
    for (let i = 0; i < frames; i += 1) {
      now += Math.round(dt * 1000);
      matchApi.step(dt, now);
    }
  };

  const playerId = "p1";
  matchApi.connectHuman(playerId, now);
  stepSim(65, 0.05);
  const para = components.get(playerId, "Parachute");
  if (para) { para.phase = "landed"; para.airborne = false; }

  specialOps.grantExclusiveCannon(playerId, { select: true });
  weapons.restock(playerId, "cannon", 50);

  // Pick a live vehicle from the fleet (e.g. primary jeep) and stand 50m south of it, 4.5 degrees off-angle!
  const allVehicles = vehicles.snapshot();
  assert.ok(allVehicles.length >= 2, "Multiple vehicles exist in Battle Royale");
  const jeep = vehicles.stateFor(vehicles.vehicleId);
  const offsetAngleRad = (4.5 * Math.PI) / 180; // ~3.9m lateral offset at 50m!
  movement.teleport(playerId, { x: jeep.x, y: 0, z: jeep.z + 50, angle: offsetAngleRad });
  components.get(playerId, "Transform").crouching = true;

  // Put an enemy bot 35m BEHIND the jeep (85m from shooter) in line with the shot!
  const behindBot = entities.all().find((e) => e.bot && e.alive && !e.humanSquad);
  assert.ok(behindBot, "Enemy bot exists");
  const bPara = components.get(behindBot.id, "Parachute");
  if (bPara) { bPara.phase = "landed"; bPara.airborne = false; }
  movement.teleport(behindBot.id, { x: jeep.x, y: 0, z: jeep.z - 35, angle: Math.PI });
  const botHpBefore = components.get(behindBot.id, "Health")?.current ?? 100;

  // Test Piercing mode at 50m
  specialOps.setCannonMode(playerId, "piercing", now);
  const inv = components.get(playerId, "Weapons");
  const cannonSlot = inv.items.find((w) => w.id === "cannon");
  cannonSlot.ammo = 5;
  cannonSlot.reloadUntil = 0;

  const launchedEvents = [];
  const impactEvents = [];
  const spatialBooms = [];
  events.on("vehicle:launched", (p) => launchedEvents.push(p));
  events.on("cannon:impact", (p) => impactEvents.push(p));
  events.on("sound:spatial", (p) => {
    if (p.key === "cannon.pierce" || p.key === "cannon.impact") spatialBooms.push(p);
  });

  now += 2000;
  matchApi.handleInput(playerId, { firePressed: true }, now);

  // Track cannonball height at ~50m flight
  let heightNear50m = null;
  for (let i = 0; i < 30; i += 1) {
    now += 50;
    matchApi.step(0.05, now);
    const snap = matchApi.snapshotFor(playerId, now);
    const ball = snap.cannonballs[0];
    if (ball && heightNear50m === null && (jeep.z + 50 - ball.z) >= 35) {
      heightNear50m = ball.y;
    }
  }

  assert.ok(
    heightNear50m !== null && heightNear50m >= 0.7 && heightNear50m <= 1.85,
    `Piercing cannonball stays at chassis height near 50m (y=${heightNear50m?.toFixed(2)}m, never sailing over car roof!)`,
  );
  assert.ok(
    launchedEvents.some((e) => e.vehicleId === vehicles.vehicleId),
    "Piercing cannonball hit and launched the vehicle at 50m even with 4.5 deg aim offset",
  );
  assert.ok(
    impactEvents.some((e) => e.pierced === true && e.launchedVehicles >= 1),
    "Piercing vehicle hit emits cannon:impact with pierced=true for announcer confirmation",
  );
  assert.ok(
    spatialBooms.length >= 1 && spatialBooms.every((b) => (b.radius ?? 0) >= 850),
    "Piercing vehicle hit emits long-range audible 3D boom (radius >= 850m) at the car's position",
  );
  const botHpAfter = components.get(behindBot.id, "Health")?.current ?? 0;
  assert.ok(
    !behindBot.alive || botHpAfter < botHpBefore,
    `Piercing cannonball continued THROUGH the 50m vehicle and hit the enemy 35m behind it (hp ${botHpBefore} -> ${botHpAfter})`,
  );

  // Also test Standard mode at 50m on a second vehicle (e.g. a supercar/extra vehicle)!
  const secondVeh = allVehicles.find((v) => v.id !== vehicles.vehicleId);
  assert.ok(secondVeh, "Second vehicle exists in fleet");
  const secondBefore = vehicles.stateFor(secondVeh.id);
  movement.teleport(playerId, { x: secondBefore.x, y: 0, z: secondBefore.z + 50, angle: -offsetAngleRad });
  components.get(playerId, "Transform").crouching = true;
  specialOps.setCannonMode(playerId, "standard", now);
  cannonSlot.ammo = 5;
  cannonSlot.reloadUntil = 0;

  const launchedCountBefore = launchedEvents.length;
  now += 2000;
  matchApi.handleInput(playerId, { firePressed: true }, now);
  stepSim(25, 0.05);

  const secondLaunched = launchedEvents.slice(launchedCountBefore).some((e) => e.vehicleId === secondVeh.id);
  const secondAfter = vehicles.stateFor(secondVeh.id);
  const secondMoved = Math.hypot(secondAfter.x - secondBefore.x, secondAfter.z - secondBefore.z);
  const secondLifted = secondAfter.y - secondBefore.y;
  assert.equal(secondLaunched, true, "Standard cannonball hits and launches second vehicle at 50m with -4.5 deg aim offset");
  assert.ok(
    secondLifted > 2.5 || secondMoved > 5,
    `Second fleet vehicle physically launched into the air/away (dy=${secondLifted.toFixed(2)}m, horiz=${secondMoved.toFixed(2)}m)`,
  );
});

test("Smertonos full 700m crouched flight, 980m impact audibility, and aerodynamic shockwave wake", async () => {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  const { services, components, events } = game.host;
  const matchApi = game.api;
  const entities = services.get("entities");
  const weapons = services.get("weapons");
  const movement = services.get("movement");
  const specialOps = services.get("special-ops");
  const ragdoll = services.get("ragdoll");

  let now = 90_000;
  const stepSim = (frames = 10, dt = 0.05) => {
    for (let i = 0; i < frames; i += 1) {
      now += Math.round(dt * 1000);
      matchApi.step(dt, now);
    }
  };

  const playerId = "p1";
  matchApi.connectHuman(playerId, now);
  stepSim(65, 0.05);
  const para = components.get(playerId, "Parachute");
  if (para) { para.phase = "landed"; para.airborne = false; }

  specialOps.grantExclusiveCannon(playerId, { select: true });
  weapons.restock(playerId, "cannon", 50);
  specialOps.setCannonMode(playerId, "standard", now);

  // Unobstructed outer-edge corridor along x = -920, firing south (angle = Math.PI) from z = 150 -> z = 850 (700m clear)
  movement.teleport(playerId, { x: -920, y: 0, z: 150, angle: Math.PI });
  components.get(playerId, "Transform").crouching = true;

  // Shot 1: clear corridor — move all bots away so we verify pure 700m crouched flight & 980m impact sound
  const bots = entities.all().filter((e) => e.bot && e.alive && !e.humanSquad);
  assert.ok(bots.length >= 1, "Enemy bot exists for shockwave wake test");
  const wakeBot = bots[0];
  bots.forEach((b, idx) => {
    movement.teleport(b.id, { x: 680 + (idx % 10) * 14, y: 0, z: -680 - Math.floor(idx / 10) * 14, angle: 0 });
  });

  const inv = components.get(playerId, "Weapons");
  const cannonSlot = inv.items.find((w) => w.id === "cannon");
  cannonSlot.ammo = 5;
  cannonSlot.reloadUntil = 0;

  const impacts = [];
  const impactSounds = [];
  events.on("cannon:impact", (p) => impacts.push(p));
  events.on("sound:spatial", (p) => { if (p.key === "cannon.impact") impactSounds.push(p); });

  now += 2000;
  matchApi.handleInput(playerId, { firePressed: true }, now);
  stepSim(95, 0.05); // 4.75s -> full 700m flight at 162 m/s (~4.32s)

  const finalImpact = impacts.find((e) => !e.pierced);
  assert.ok(finalImpact, "Cannonball detonated at end of 700m flight");
  assert.ok(
    (finalImpact.traveled ?? 0) >= 685,
    `Crouched standard cannonball flew full ~700m range without premature ground graze (traveled=${finalImpact.traveled}m)`,
  );
  assert.ok(
    impactSounds.some((s) => (s.radius ?? 0) >= 900),
    "Final detonation emits cannon.impact spatial sound with radius >= 900m so 700m shot is heard clearly",
  );

  // Shot 2: aerodynamic shockwave wake — place wakeBot 10m downrange (z=160) and 4.2m right (22.8 deg off-axis: outside aim-assist & 2.4m body, inside 5.6m wake!)
  const wPara = components.get(wakeBot.id, "Parachute");
  if (wPara) { wPara.phase = "landed"; wPara.airborne = false; }
  movement.teleport(wakeBot.id, { x: -920 + 4.2, y: 0, z: 160, angle: 0 });
  const wakeHpBefore = components.get(wakeBot.id, "Health")?.current ?? 100;
  const impactsBeforeShot2 = impacts.length;

  cannonSlot.ammo = 5;
  cannonSlot.reloadUntil = 0;
  now += 2000;
  matchApi.handleInput(playerId, { firePressed: true }, now);
  stepSim(8, 0.05); // 0.4s (~65m downrange — well past wakeBot at 10m!)

  const wakeHpAfter = components.get(wakeBot.id, "Health")?.current ?? 0;
  assert.ok(
    !wakeBot.alive || wakeHpAfter < wakeHpBefore || ragdoll?.isActive?.(wakeBot.id),
    `Near-miss enemy 4.2m off flight line was slammed by cannonball shockwave wake (hp ${wakeHpBefore} -> ${wakeHpAfter})`,
  );
  assert.equal(
    impacts.length,
    impactsBeforeShot2,
    "Cannonball did not prematurely detonate on near-miss wake enemy and kept flying downrange",
  );
});

test("Server forwards cannon:* and vehicle:launched events to clients, ignores sky-high targets, and chain-detonates mines in 64m blast", async () => {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  const { services, components } = game.host;
  const matchApi = game.api;
  const entities = services.get("entities");
  const weapons = services.get("weapons");
  const movement = services.get("movement");
  const vehicles = services.get("vehicles");
  const specialOps = services.get("special-ops");

  let now = 120_000;
  const stepSim = (frames = 10, dt = 0.05) => {
    for (let i = 0; i < frames; i += 1) {
      now += Math.round(dt * 1000);
      matchApi.step(dt, now);
    }
  };

  const playerId = "p1";
  matchApi.connectHuman(playerId, now);
  stepSim(65, 0.05);
  const para = components.get(playerId, "Parachute");
  if (para) { para.phase = "landed"; para.airborne = false; }

  specialOps.grantExclusiveCannon(playerId, { select: true });
  weapons.restock(playerId, "cannon", 50);
  specialOps.setCannonMode(playerId, "standard", now);
  game.drainEvents(); // clear deployment events

  // 1. High-altitude bot at y=86m right ahead must NOT pull cannon aim upward into the sky!
  const skyBot = entities.all().find((e) => e.bot && e.alive && !e.humanSquad);
  assert.ok(skyBot, "Enemy bot available");
  movement.teleport(playerId, { x: -500, y: 0, z: -500, angle: 0 });
  components.get(playerId, "Transform").crouching = true;
  movement.teleport(skyBot.id, { x: -500, y: 86, z: -560, angle: 0 });

  const inv = components.get(playerId, "Weapons");
  const cannonSlot = inv.items.find((w) => w.id === "cannon");
  cannonSlot.ammo = 5;
  cannonSlot.reloadUntil = 0;

  now += 2000;
  matchApi.handleInput(playerId, { firePressed: true }, now);
  const afterLaunchEvents = game.drainEvents();
  const forwardedLaunch = afterLaunchEvents.find((p) => p.event === "cannon:launched");
  assert.ok(forwardedLaunch, "game.drainEvents() forwards cannon:launched over network!");
  assert.ok(
    Math.abs(forwardedLaunch.payload.vy) < 16,
    `Cannon did not pitch wildly skyward at y=86m bot (vy=${forwardedLaunch.payload.vy.toFixed(2)})`,
  );

  // 2. Fire at primary jeep + plant a mine 45m from impact -> verify vehicle:launched, cannon:impact, and mine chain detonation all forward!
  const jeep = vehicles.stateFor(vehicles.vehicleId);
  assert.ok(jeep, "Primary jeep exists");
  specialOps.grantMines(playerId, 2);
  movement.teleport(playerId, { x: jeep.x + 42, y: 0, z: jeep.z, angle: 0 });
  matchApi.handleInput(playerId, { minePressed: true }, now);
  const chainMine = specialOps.plantedMines[specialOps.plantedMines.length - 1];
  assert.equal(chainMine.detonated, false);

  movement.teleport(playerId, { x: jeep.x, y: 0, z: jeep.z + 35, angle: 0 });
  components.get(playerId, "Transform").crouching = false; // standing to also verify cannon:recoil-unbraced forwards!
  cannonSlot.ammo = 5;
  cannonSlot.reloadUntil = 0;
  game.drainEvents();

  now += 2000;
  matchApi.handleInput(playerId, { firePressed: true }, now);
  stepSim(20, 0.05);
  const netEvents = game.drainEvents();
  const names = new Set(netEvents.map((p) => p.event));
  assert.ok(names.has("cannon:launched"), "Network forwards cannon:launched");
  assert.ok(names.has("cannon:recoil-unbraced"), "Network forwards cannon:recoil-unbraced");
  assert.ok(names.has("cannon:impact"), "Network forwards cannon:impact");
  assert.ok(names.has("vehicle:launched"), "Network forwards vehicle:launched");
  assert.equal(chainMine.detonated, true, "64m Smertonos cannon blast chain-detonates mine 42m away!");
  const impactEvt = netEvents.find((p) => p.event === "cannon:impact");
  assert.equal(impactEvt.payload.blastRadius, 64, "Standard Smertonos blastRadius is 64m");
});



