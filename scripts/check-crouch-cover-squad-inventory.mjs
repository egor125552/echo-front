import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createEchoFrontGame } from "../src/server/game.js";
import {
  buildGroupedInventory,
  detectNearbyCover,
  evaluateCoverProtection,
  normalizeSquadOrder,
  planBatchTransfer,
  selectBotStimulantKind,
  validateDropRequest,
} from "../src/game/crouch-squad-inventory.js";

test("pure cover detection distinguishes vehicle, wall, roof parapet, and floor height", () => {
  const nearCar = detectNearbyCover({
    position: { x: 10, y: 0, z: 12.2 },
    vehicles: [{ id: "car-1", x: 10, y: 0, z: 10, width: 2.1, length: 4.4, angle: 0 }],
  });
  assert.equal(nearCar.active, true);
  assert.equal(nearCar.kind, "vehicle");
  assert.equal(nearCar.label, "за машиной");

  const groundWallFromRoof = detectNearbyCover({
    position: { x: 0, y: 6.4, z: 0.6 },
    obstacles: [{ id: "w1", kind: "building-wall", x: 0, y: 0, z: 0, width: 4, depth: 0.4, height: 2.9 }],
  });
  assert.equal(groundWallFromRoof.active, false);

  const roofParapet = detectNearbyCover({
    position: { x: 0, y: 6.4, z: 0.6 },
    obstacles: [{ id: "p1", kind: "building-parapet", parapet: true, x: 0, y: 6.4, z: 0, width: 4, depth: 0.4, height: 0.72 }],
  });
  assert.equal(roofParapet.active, true);
  assert.equal(roofParapet.kind, "roof-parapet");
  assert.equal(roofParapet.label, "за парапетом крыши");
});

test("pure cover combat protection blocks shots behind cover and mitigates landed damage", () => {
  const standing = evaluateCoverProtection({
    targetTransform: { x: 0, y: 0, z: 0, crouching: false },
    shooterTransform: { x: 0, y: 0, z: 20 },
  });
  assert.equal(standing.blockedByCover, false);
  assert.equal(standing.damageScale, 1);

  const behindCar = evaluateCoverProtection({
    targetTransform: { x: 0, y: 0, z: 0, crouching: true, inCover: true, coverKind: "vehicle", coverX: 0, coverZ: 1.5 },
    shooterTransform: { x: 0, y: 0, z: 25 },
    rng: () => 0.3,
  });
  assert.equal(behindCar.blockedByCover, true);
  assert.equal(behindCar.damageScale, 0);
  assert.equal(behindCar.ricochetMaterial, "metal");

  const landedBehindCar = evaluateCoverProtection({
    targetTransform: { x: 0, y: 0, z: 0, crouching: true, inCover: true, coverKind: "vehicle", coverX: 0, coverZ: 1.5 },
    shooterTransform: { x: 0, y: 0, z: 25 },
    rng: () => 0.9,
  });
  assert.equal(landedBehindCar.blockedByCover, false);
  assert.equal(landedBehindCar.damageScale, 0.7);
});

test("pure inventory grouping and batch transfers strictly forbid money and split evenly", () => {
  const grouped = buildGroupedInventory({
    armorReserve: 4,
    stimulants: { standard: 2, fast: 1, turbo: 2 },
    weapons: [{ id: "rifle", reserve: 90 }],
  });
  assert.equal(grouped.moneyTransferAllowed, false);
  assert.deepEqual(grouped.categories.map((c) => c.id), ["armor", "stimulants", "ammo"]);
  assert.equal(grouped.items.some((item) => item.id === "cash" || item.id === "money"), false);

  const moneyDrop = validateDropRequest({ itemId: "cash", quantity: 500, senderStock: { cash: 5000 } });
  assert.equal(moneyDrop.ok, false);
  assert.equal(moneyDrop.reason, "forbidden-money");

  const moneyTransfer = planBatchTransfer({
    senderStock: { "armor-plate": 4, cash: 5000 },
    items: [{ itemId: "money", quantity: 100 }],
    recipientIds: ["mate-1"],
  });
  assert.equal(moneyTransfer.ok, false);
  assert.equal(moneyTransfer.reason, "forbidden-money");

  const batch = planBatchTransfer({
    senderStock: { "armor-plate": 4, "stim-turbo": 2 },
    items: [
      { itemId: "armor-plate", quantity: 4 },
      { itemId: "stim-turbo", quantity: 2 },
    ],
    recipientIds: ["mate-1", "mate-2", "mate-1"], // duplicate id must be deduplicated
    recipientCapacities: {
      "mate-1": { "armor-plate": 6, "stim-turbo": 4 },
      "mate-2": { "armor-plate": 6, "stim-turbo": 4 },
    },
  });
  assert.equal(batch.ok, true);
  assert.equal(batch.transfers.length, 2);
  assert.deepEqual(batch.totalSentByItem, { "armor-plate": 4, "stim-turbo": 2 });
  const m1 = batch.transfers.find((t) => t.recipientId === "mate-1");
  const m2 = batch.transfers.find((t) => t.recipientId === "mate-2");
  assert.equal(m1.items.find((i) => i.itemId === "armor-plate").quantity, 2);
  assert.equal(m2.items.find((i) => i.itemId === "armor-plate").quantity, 2);
  assert.equal(m1.items.find((i) => i.itemId === "stim-turbo").quantity, 1);
  assert.equal(m2.items.find((i) => i.itemId === "stim-turbo").quantity, 1);
});

test("normalizeSquadOrder computes forward point for move orders within map bounds", () => {
  const order = normalizeSquadOrder(
    { order: "move", distance: 30 },
    { x: 10, y: 0, z: 20, angle: Math.PI / 2 },
    { mapBounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 }, now: 1000 },
  );
  assert.equal(order.type, "move");
  assert.ok(Math.abs(order.point.x - 40) < 0.05);
  assert.ok(Math.abs(order.point.z - 20) < 0.05);
});

let game;
const PLAYER_ID = "77777777-7777-4777-8777-777777777777";
let now = Date.now() + 5000;

function landEntity(id) {
  const para = game.host.components.get(id, "Parachute");
  if (para) {
    Object.assign(para, {
      phase: "landed",
      airborne: false,
      simulatedVerticalVelocity: 0,
      inflation: 0,
      glideSpeed: 0,
      airSpeed: 0,
    });
  }
}

before(async () => {
  game = await createEchoFrontGame({ mode: "battle-royale" });
  game.api.connectHuman(PLAYER_ID, now);
  landEntity(PLAYER_ID);
  const entities = game.host.services.get("entities");
  const teams = game.host.services.get("teams");
  const myTeam = teams.teamOf(PLAYER_ID);
  const movement = game.host.services.get("movement");
  let keptEnemy = false;
  for (const entity of [...entities.all()]) {
    if (entity.id === PLAYER_ID) continue;
    if (teams.teamOf(entity.id) === myTeam) {
      landEntity(entity.id);
    } else if (!keptEnemy) {
      keptEnemy = true;
      landEntity(entity.id);
      movement.teleport(entity.id, { x: -320, y: 0, z: -320 });
    } else {
      entities.remove(entity.id);
    }
  }
  game.api.step(0.05, now + 50);
  now += 100;
});

after(async () => {
  await game?.host.stop();
});

test("live BR: Circle/KeyC crouches behind car cover, shoots cleanly, and stands back up", () => {
  const vehicles = game.host.services.get("vehicles");
  const movement = game.host.services.get("movement");
  const tactics = game.host.services.get("tactics-inventory");
  const car = vehicles.snapshot()[0];
  assert.ok(car, "Battle Royale must have at least one vehicle");

  movement.teleport(PLAYER_ID, { x: car.x + 2.1, y: car.y, z: car.z, angle: -Math.PI / 2 });
  now += 50;
  game.api.step(0.05, now);
  game.drainEvents();

  // Circle/B or KeyC on ground sends posePressed -> toggles crouch/cover!
  now += 50;
  game.api.handleInput(PLAYER_ID, { posePressed: true }, now);
  game.api.step(0.05, now);

  const stance = tactics.stanceFor(PLAYER_ID);
  assert.equal(stance.crouching, true);
  assert.equal(stance.inCover, true);
  assert.equal(stance.coverKind, "vehicle");
  assert.equal(stance.coverLabel, "за машиной");

  const snap = game.api.snapshotFor(PLAYER_ID, now);
  const snapSelf = snap.entities.find((entity) => entity.id === PLAYER_ID);
  assert.ok(snapSelf, "snapshotFor must include player entity");
  assert.equal(snapSelf.crouching, true);
  assert.equal(snapSelf.inCover, true);
  assert.equal(snapSelf.coverLabel, "за машиной");

  // Shooting from cover works cleanly
  now += 50;
  game.api.handleInput(PLAYER_ID, { firePressed: true }, now);
  game.api.step(0.05, now);
  const events = game.drainEvents();
  assert.ok(events.some((e) => e.event === "weapon:fired" && e.payload.entityId === PLAYER_ID),
    "Player must be able to shoot from behind car cover");

  // Press crouch again to stand up
  now += 50;
  game.api.handleInput(PLAYER_ID, { crouchPressed: true }, now);
  game.api.step(0.05, now);
  assert.equal(tactics.stanceFor(PLAYER_ID).crouching, false);
});

test("live BR: two-storey-house roof supports parapet cover and clean jump-off to ground", () => {
  const movement = game.host.services.get("movement");
  const tactics = game.host.services.get("tactics-inventory");
  const health = game.host.components.get(PLAYER_ID, "Health");
  tactics.setCrouch(PLAYER_ID, false, { now, silent: true, reason: "test-reset" });

  // Place player on the new roof of two-storey-house (x: 135, z: 120, y: 6.4) next to north-west parapet
  movement.teleport(PLAYER_ID, { x: 129, y: 6.45, z: 113.8, angle: 0 });
  now += 50;
  game.api.step(0.05, now);
  const onRoof = game.host.components.get(PLAYER_ID, "Transform");
  assert.ok(Math.abs(onRoof.y - 6.4) < 0.25, `Player should stand on roof (y≈6.4), got y=${onRoof.y}`);

  // Crouch behind roof parapet
  now += 50;
  game.api.handleInput(PLAYER_ID, { crouchPressed: true }, now);
  game.api.step(0.05, now);
  assert.equal(tactics.stanceFor(PLAYER_ID).inCover, true);
  assert.equal(tactics.stanceFor(PLAYER_ID).coverKind, "roof-parapet");

  // Stand up and jump off through the wide centered north roof opening (x: 135, z: 113)
  now += 50;
  game.api.handleInput(PLAYER_ID, { crouchPressed: true }, now);
  movement.teleport(PLAYER_ID, { x: 135, y: 6.45, z: 113.8, angle: 0 });
  now += 50;
  game.api.handleInput(PLAYER_ID, { forward: 1, jumpPressed: true }, now);
  for (let i = 0; i < 100; i += 1) {
    now += 50;
    game.api.handleInput(PLAYER_ID, { forward: 1 }, now);
    game.api.step(0.05, now);
    const pos = game.host.components.get(PLAYER_ID, "Transform");
    if (i > 20 && pos && pos.y < 0.25 && pos.z < 112.5) break;
  }
  const landed = game.host.components.get(PLAYER_ID, "Transform");
  assert.ok(landed.z < 112.5, `Player must clear roof opening onto ground, got z=${landed.z}`);
  assert.ok(landed.y < 0.5, `Player must land on ground after jumping off roof, got y=${landed.y}`);
  assert.ok(health.current > 0, "Jumping off a 2-storey house roof must not instantly kill a healthy player");
});

test("live BR: squad orders command alive teammates and inventory drop/batch-transfer works without money", () => {
  const movement = game.host.services.get("movement");
  const armor = game.host.services.get("armor");
  const stimulants = game.host.services.get("stimulants");
  const map = game.host.services.get("map");
  const tactics = game.host.services.get("tactics-inventory");

  movement.teleport(PLAYER_ID, { x: 20, y: 0, z: 20, angle: Math.PI / 2 });
  const mates = tactics.aliveSquadmatesOf(PLAYER_ID);
  assert.ok(mates.length >= 2, `Expected at least 2 alive squadmates, got ${mates.length}`);
  for (let i = 0; i < mates.length; i += 1) {
    movement.teleport(mates[i].id, { x: 22 + i * 2, y: 0, z: 20, angle: 0 });
  }

  // Give player test items: 6 armor plates, 3 standard stims, 2 turbo stims
  armor.grantPlates(PLAYER_ID, 6);
  stimulants.grant(PLAYER_ID, 3);
  stimulants.grantTransfer(PLAYER_ID, "turbo", 2);
  now += 50;
  game.api.step(0.05, now);

  const beforeSnap = game.api.snapshotFor(PLAYER_ID, now);
  assert.equal(beforeSnap.squadMenu.moneyTransferAllowed, false);
  assert.ok(beforeSnap.squadMenu.inventory.categories.some((c) => c.id === "armor"));
  assert.ok(beforeSnap.squadMenu.inventory.categories.some((c) => c.id === "stimulants"));
  assert.ok(beforeSnap.squadMenu.inventory.items.every((item) => item.id !== "cash" && item.id !== "money"));

  // 1. Issue squad order: "cover"
  game.drainEvents();
  now += 50;
  game.api.handleInput(PLAYER_ID, { squadOrder: { order: "cover" } }, now);
  game.api.step(0.05, now);
  const orderEvents = game.drainEvents();
  assert.ok(orderEvents.some((e) => e.event === "tactics:squad-order" && e.payload.ok && e.payload.order === "cover"));
  assert.equal(tactics.squadOrderFor(mates[0].id, now)?.type, "cover");

  // 2. Reject dropping money
  now += 50;
  game.api.handleInput(PLAYER_ID, { inventoryAction: { type: "drop", itemId: "cash", quantity: 100 } }, now);
  const moneyEvents = game.drainEvents();
  assert.ok(moneyEvents.some((e) => e.event === "inventory:failed" && e.payload.reason === "forbidden-money"));

  // 3. Drop 2 armor plates on ground and pick them back up with interactPressed
  const platesBeforeDrop = armor.describe(PLAYER_ID).reservePlates;
  now += 50;
  game.api.handleInput(PLAYER_ID, { inventoryAction: { type: "drop", itemId: "armor-plate", quantity: 2 } }, now);
  const dropEvents = game.drainEvents();
  const dropped = dropEvents.find((e) => e.event === "inventory:dropped");
  assert.ok(dropped, "inventory:dropped event must fire");
  assert.equal(armor.describe(PLAYER_ID).reservePlates, platesBeforeDrop - 2);
  const droppedCrate = map.crates.find((c) => c.id === dropped.payload.crateId);
  assert.ok(droppedCrate && !droppedCrate.opened);

  now += 50;
  game.api.handleInput(PLAYER_ID, { interactPressed: true }, now);
  game.api.step(0.05, now);
  assert.equal(droppedCrate.opened, true);
  assert.equal(armor.describe(PLAYER_ID).reservePlates, platesBeforeDrop);

  // 4. Multi-item batch transfer to 2 squadmates simultaneously
  const m0ArmorBefore = armor.describe(mates[0].id).reservePlates;
  const m1ArmorBefore = armor.describe(mates[1].id).reservePlates;
  const m0TurboBefore = stimulants.turboCount(mates[0].id);
  const m1TurboBefore = stimulants.turboCount(mates[1].id);
  const senderPlatesBefore = armor.describe(PLAYER_ID).reservePlates;
  const senderTurboBefore = stimulants.turboCount(PLAYER_ID);

  now += 50;
  game.api.handleInput(PLAYER_ID, {
    inventoryAction: {
      type: "transfer",
      items: [
        { itemId: "armor-plate", quantity: 2 },
        { itemId: "stim-turbo", quantity: 2 },
      ],
      recipientIds: [mates[0].id, mates[1].id],
    },
  }, now);
  const transferEvents = game.drainEvents();
  const transferOk = transferEvents.find((e) => e.event === "inventory:transferred");
  assert.ok(transferOk, "inventory:transferred event must fire");
  assert.equal(armor.describe(PLAYER_ID).reservePlates, senderPlatesBefore - 2);
  assert.equal(stimulants.turboCount(PLAYER_ID), senderTurboBefore - 2);
  assert.equal(armor.describe(mates[0].id).reservePlates, m0ArmorBefore + 1);
  assert.equal(armor.describe(mates[1].id).reservePlates, m1ArmorBefore + 1);
  assert.equal(stimulants.turboCount(mates[0].id), m0TurboBefore + 1);
  assert.equal(stimulants.turboCount(mates[1].id), m1TurboBefore + 1);
});

test("pure selectBotStimulantKind chooses turbo boost, combat fast stim, calm standard stim, and downed priority cleanly", () => {
  // 1. Healthy 200 HP squadmate given Turbo -> boosts immediately to 600 HP tank
  assert.equal(selectBotStimulantKind({
    downed: false, health: 200, maxHealth: 200, standardCount: 1, turboCount: 1,
    enemiesVisible: false, recentlyDamaged: false,
  }), "turbo");

  // 2. Already boosted 600 HP squadmate at 590 HP -> must NOT waste 2nd Turbo
  assert.equal(selectBotStimulantKind({
    downed: false, health: 590, maxHealth: 600, standardCount: 1, turboCount: 1,
    enemiesVisible: false, recentlyDamaged: false,
  }), null);

  // 3. Calm out-of-sight heal at 50% HP -> saves Fast & Turbo, picks Standard
  assert.equal(selectBotStimulantKind({
    downed: false, health: 100, maxHealth: 200, standardCount: 1, fastCount: 2, turboCount: 0,
    minReserveStims: 1, enemiesVisible: false, enemiesNearby: false,
  }), "standard");

  // 4. Urgent out-of-sight heal with enemies nearby -> picks 1-sec Fast stim
  assert.equal(selectBotStimulantKind({
    downed: false, health: 100, maxHealth: 200, standardCount: 1, fastCount: 1, turboCount: 0,
    minReserveStims: 1, enemiesVisible: false, enemiesNearby: true,
  }), "fast");

  // 5. Active firefight in cover at 40% HP -> picks 1-sec Fast stim (not slow Standard)
  assert.equal(selectBotStimulantKind({
    downed: false, health: 80, maxHealth: 200, standardCount: 2, fastCount: 1, turboCount: 0,
    enemiesVisible: true, inCover: true, recentlyDamaged: false,
  }), "fast");

  // 6. Actively taking hits right now -> returns null to prevent cancel-loop
  assert.equal(selectBotStimulantKind({
    downed: false, health: 70, maxHealth: 200, standardCount: 1, fastCount: 1, turboCount: 1,
    enemiesVisible: true, inCover: true, recentlyDamaged: true,
  }), null);

  // 7. Downed: Fast first -> Turbo when enemies nearby -> Standard when safe
  assert.equal(selectBotStimulantKind({
    downed: true, standardCount: 1, fastCount: 1, turboCount: 1, enemiesNearby: true,
  }), "fast");
  assert.equal(selectBotStimulantKind({
    downed: true, standardCount: 1, fastCount: 0, turboCount: 1, enemiesNearby: true,
  }), "turbo");
  assert.equal(selectBotStimulantKind({
    downed: true, standardCount: 1, fastCount: 0, turboCount: 1, enemiesNearby: false,
  }), "standard");
});

test("live BR: squadmate automatically injects received Turbo stim to 600 HP and announces callout", () => {
  const stimulants = game.host.services.get("stimulants");
  const tactics = game.host.services.get("tactics-inventory");
  const mates = tactics.aliveSquadmatesOf(PLAYER_ID);
  assert.ok(mates.length >= 1, "Need an alive squadmate");
  const mate = mates[0];
  const mateHp = game.host.components.get(mate.id, "Health");

  // Ensure mate starts at normal 200 HP with a Turbo stim in stock (from previous transfer or fresh grant)
  mateHp.maximum = 200;
  mateHp.current = 200;
  if (stimulants.turboCount(mate.id) <= 0) {
    stimulants.grantTransfer(mate.id, "turbo", 1);
  }
  const turboBefore = stimulants.turboCount(mate.id);
  assert.ok(turboBefore >= 1, "Squadmate should hold at least 1 turbo stim");

  game.drainEvents();
  let turboCallout = null;
  // Step 1.8s (36 ticks at 50ms) so bot thinks, starts 1s turbo stim, and completes it
  for (let i = 0; i < 36; i += 1) {
    now += 50;
    game.api.step(0.05, now);
    for (const ev of game.drainEvents()) {
      if (ev.event === "squad:callout" && ev.payload?.kind === "squad-turbo-stim" && ev.payload?.speakerId === mate.id) {
        turboCallout = ev.payload;
      }
    }
    if (mateHp.current >= 600 && turboCallout) break;
  }

  assert.equal(mateHp.maximum, 600, `Squadmate max HP should boost to 600, got ${mateHp.maximum}`);
  assert.equal(mateHp.current, 600, `Squadmate current HP should boost to 600, got ${mateHp.current}`);
  assert.equal(stimulants.turboCount(mate.id), turboBefore - 1, "One turbo stim must be consumed");
  assert.ok(turboCallout, "Squadmate must emit Russian squad:callout when turbo boost finishes");
  assert.match(turboCallout.text, /турбо-стимулятор/i);
});

