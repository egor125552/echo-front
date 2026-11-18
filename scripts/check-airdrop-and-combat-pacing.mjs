import assert from "node:assert/strict";
import { test } from "node:test";
import { createEchoFrontGame } from "../src/server/game.js";
import {
  AIRDROP_ALTITUDE,
} from "../src/plugins/battle-royale-crate-generator/server.js";
import {
  AIRDROP_CASH_REWARD,
  BOUNTY_CASH_REWARD,
  JUGGERNAUT_CASH_REWARD,
  JUGGERNAUT_DROP_COST,
} from "../src/plugins/battle-royale-shop/server.js";
import { createAirdropBeaconBuffer } from "../public/client/plugins/battle-royale-audio.js";

const PLAYER = "11111111-2222-4333-8444-555555555555";

function groundEntity(game, id, position, now = Date.now()) {
  const c = game.host.components;
  const s = game.host.services;
  const parachute = c.get(id, "Parachute");
  const wasAirborne = Boolean(parachute && parachute.phase !== "landed");
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
  if (wasAirborne) {
    game.host.events.emit("parachute:landed", { entityId: id, now });
  }
}

function advanceDeployment(game, nowRef) {
  const br = game.host.services.get("battle-royale");
  while (!br.canAct(nowRef.now) || br.status(nowRef.now)?.deployment?.active) {
    nowRef.now += 250;
    game.api.step(0.05, nowRef.now);
  }
}

test("synthesized airdrop radio beacon buffer produces dual-pulse signal with silent interval", () => {
  const sampleRate = 44100;
  const mockAudioContext = {
    sampleRate,
    createBuffer(channels, length, rate) {
      const channelData = new Float32Array(length);
      return {
        numberOfChannels: channels,
        length,
        sampleRate: rate,
        duration: length / rate,
        getChannelData() {
          return channelData;
        },
      };
    },
  };

  const buffer = createAirdropBeaconBuffer(mockAudioContext);
  assert.equal(buffer.sampleRate, sampleRate);
  assert(Math.abs(buffer.duration - 1.5) < 0.01, "Beacon loop duration should be 1.5s");

  const data = buffer.getChannelData(0);
  let pulse1Peak = 0;
  for (let i = Math.floor(0.005 * sampleRate); i < Math.floor(0.12 * sampleRate); i += 1) {
    pulse1Peak = Math.max(pulse1Peak, Math.abs(data[i]));
  }
  let gapPeak = 0;
  for (let i = Math.floor(0.15 * sampleRate); i < Math.floor(0.18 * sampleRate); i += 1) {
    gapPeak = Math.max(gapPeak, Math.abs(data[i]));
  }
  let pulse2Peak = 0;
  for (let i = Math.floor(0.195 * sampleRate); i < Math.floor(0.35 * sampleRate); i += 1) {
    pulse2Peak = Math.max(pulse2Peak, Math.abs(data[i]));
  }
  let tailSilencePeak = 0;
  for (let i = Math.floor(0.45 * sampleRate); i < Math.floor(1.45 * sampleRate); i += 1) {
    tailSilencePeak = Math.max(tailSilencePeak, Math.abs(data[i]));
  }

  assert(pulse1Peak > 0.35, `Pulse 1 should have strong audible peak, got ${pulse1Peak}`);
  assert(gapPeak < 0.01, `Gap between pulses should be silent, got ${gapPeak}`);
  assert(pulse2Peak > 0.35, `Pulse 2 should have strong audible peak, got ${pulse2Peak}`);
  assert(tailSilencePeak < 0.01, `Tail interval should be silent for clean looping, got ${tailSilencePeak}`);
});

test("sky supply drop descends from altitude, lands with physics, appears in Карта, and grants full high-tier rewards without squadmate callouts", async () => {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  const nowRef = { now: Date.now() + 2000 };
  try {
    const joined = game.api.connectHuman(PLAYER, nowRef.now);
    const s = game.host.services;
    const allEnemies = s.get("entities").all().filter((e) => e.bot && e.alive && !e.humanSquad);
    const enemyIds = allEnemies.slice(0, 4).map((e) => e.id);
    const anchorEnemyId = allEnemies[4]?.id;
    const keepIds = new Set([PLAYER, ...joined.squadmates, ...enemyIds, ...(anchorEnemyId ? [anchorEnemyId] : [])]);
    for (const ent of [...s.get("entities").all()]) {
      if (ent.bot && !keepIds.has(ent.id)) s.get("entities").remove(ent.id);
    }
    groundEntity(game, PLAYER, { x: 10, y: 0, z: 10, angle: 0 }, nowRef.now);
    joined.squadmates.forEach((id, idx) => {
      groundEntity(game, id, { x: -10 - idx * 4, y: 0, z: 10, angle: 0 }, nowRef.now);
    });
    if (anchorEnemyId) {
      groundEntity(game, anchorEnemyId, { x: 260, y: 0, z: 260, angle: 0 }, nowRef.now);
    }
    const safeCorners = [
      { x: -180, z: -180 },
      { x: 180, z: -180 },
      { x: -180, z: 180 },
      { x: 180, z: 180 },
    ];
    enemyIds.forEach((id, idx) => {
      const corner = safeCorners[idx % safeCorners.length];
      if (s.get("entities").get(id)) {
        groundEntity(game, id, { x: corner.x, y: 0, z: corner.z, angle: 0 }, nowRef.now);
      }
    });
    advanceDeployment(game, nowRef);

    const generator = s.get("crate-generator");
    const navigation = s.get("navigation");
    const cratePhysics = s.get("crate-physics");
    const botInterest = s.get("bot-interest");

    groundEntity(game, PLAYER, { x: 10, y: 0, z: 10, angle: 0 }, nowRef.now);
    // Place enemy bots within airdrop interest radius
    enemyIds.forEach((id, idx) => {
      const corner = safeCorners[idx % safeCorners.length];
      if (s.get("entities").get(id)) {
        groundEntity(game, id, {
          x: 32 + (corner.x < 0 ? -95 : 95),
          y: 0,
          z: 24 + (corner.z < 0 ? -95 : 95),
          angle: 0,
        }, nowRef.now);
      }
    });

    game.drainEvents();
    const airdrop = generator.spawnAirdrop({
      x: 32,
      z: 24,
      altitude: 130,
      now: nowRef.now,
    });
    assert(airdrop, "spawnAirdrop must create an airdrop crate");
    assert.equal(airdrop.airdrop, true);
    assert.equal(airdrop.loot, "airdrop");
    assert.equal(airdrop.airdropPhase, "descending");
    assert.equal(airdrop.y, 130);

    const incomingEvents = game.drainEvents();
    assert(
      incomingEvents.some((e) => e.event === "crate:airdrop-incoming" && e.payload?.crateId === airdrop.id),
      "Must emit crate:airdrop-incoming when airdrop spawns in the sky",
    );
    assert.equal(
      incomingEvents.some((e) => e.event === "squad:callout"),
      false,
      "Squadmates must NOT announce airdrops via squad:callout",
    );

    // Enemy bots within radius should converge on the airdrop
    const convergingBots = enemyIds.filter((id) => botInterest.heardFor(id)?.key === "airdrop.beacon");
    assert(convergingBots.length >= 1, "Nearby enemy bots must converge on incoming airdrop");

    // While descending, navigation lists it as 'Груз снабжения (спускается)'
    const navDescending = navigation.availableTargets(PLAYER).find((t) => t.id === `airdrop:${airdrop.id}`);
    assert(navDescending, "Карта must list descending airdrop");
    assert.equal(navDescending.name, "Груз снабжения (спускается)");

    // Step until airdrop lands on the ground (130m at 26 m/s = 5.0s = 100 steps of 0.05s)
    let landedEvent = null;
    for (let i = 0; i < 115; i += 1) {
      nowRef.now += 50;
      game.api.step(0.05, nowRef.now);
      for (const packet of game.drainEvents()) {
        if (packet.event === "crate:airdrop-landed" && packet.payload?.crateId === airdrop.id) {
          landedEvent = packet;
        }
      }
      if (airdrop.airdropPhase === "landed") break;
    }

    assert(landedEvent, "Airdrop must emit crate:airdrop-landed upon reaching y=0");
    assert(Math.abs(airdrop.y) < 0.05, `Expected landed airdrop y near 0, got ${airdrop.y}`);
    assert.equal(airdrop.airdropPhase, "landed");
    assert(cratePhysics.crate(airdrop.id), "Landed airdrop must register a Rapier physics body");

    const navLanded = navigation.availableTargets(PLAYER).find((t) => t.id === `airdrop:${airdrop.id}`);
    assert.equal(navLanded?.name, "Груз снабжения");

    // Move player next to landed airdrop and open it with E
    groundEntity(game, PLAYER, { x: airdrop.x - 1.1, y: 0, z: airdrop.z, angle: Math.PI / 2 });
    game.drainEvents();
    game.api.handleInput(PLAYER, { interactPressed: true }, nowRef.now);

    assert.equal(airdrop.opened, true, "Landed airdrop must open on player interaction");
    const snap = game.api.snapshotFor(PLAYER, nowRef.now);
    const self = snap.entities.find((e) => e.id === PLAYER);
    assert(self.cash >= AIRDROP_CASH_REWARD, `Opening airdrop must award at least $${AIRDROP_CASH_REWARD}, got $${self.cash}`);
    assert.equal(self.armorSatchel, true, "Opening airdrop must grant armor satchel");
    assert.equal(self.armorReserveMax, 8, "Armor satchel must expand reserve plate capacity to 8");
    assert(self.armorReserve >= 5, `Opening airdrop must grant reserve armor plates, got ${self.armorReserve}`);
    assert(self.weapons.includes("sniper"), "Opening airdrop must grant sniper rifle");
    assert(self.weapons.includes("marksman"), "Opening airdrop must grant marksman rifle");
  } finally {
    await game.host.stop();
  }
});

test("combat-lull hunter convergence directs enemy bots toward grounded player without squadmate callouts, and bounty contract awards $1000", async () => {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  const nowRef = { now: Date.now() + 3000 };
  try {
    const joined = game.api.connectHuman(PLAYER, nowRef.now);
    const s = game.host.services;
    const entities = s.get("entities");
    const botInterest = s.get("bot-interest");
    const shop = s.get("shop");
    const navigation = s.get("navigation");

    const enemyBots = entities.all().filter((e) => e.bot && e.alive && !e.humanSquad).slice(0, 4);
    const keepIds = new Set([PLAYER, ...joined.squadmates, ...enemyBots.map((b) => b.id)]);
    for (const ent of [...entities.all()]) {
      if (ent.bot && !keepIds.has(ent.id)) entities.remove(ent.id);
    }
    groundEntity(game, PLAYER, { x: 0, y: 0, z: -24.5, angle: 0 });
    joined.squadmates.forEach((id, idx) => {
      groundEntity(game, id, { x: -12 - idx * 4, y: 0, z: -24.5, angle: 0 });
    });
    const safeCorners = [
      { x: -160, z: -160 },
      { x: 160, z: -160 },
      { x: -160, z: 160 },
      { x: 160, z: 160 },
    ];
    enemyBots.forEach((bot, idx) => {
      const corner = safeCorners[idx % safeCorners.length];
      groundEntity(game, bot.id, { x: corner.x, y: 0, z: corner.z, angle: 0 });
    });

    advanceDeployment(game, nowRef);

    groundEntity(game, PLAYER, { x: 0, y: 0, z: -24.5, angle: 0 });
    enemyBots.forEach((bot, idx) => {
      const corner = safeCorners[idx % safeCorners.length];
      groundEntity(game, bot.id, { x: corner.x * 0.6, y: 0, z: corner.z * 0.6, angle: 0 });
    });

    game.drainEvents();
    const dispatched = botInterest.directHuntersTowardAction(nowRef.now, { force: true });
    assert(dispatched >= 1, "directHuntersTowardAction must assign hunter bots toward grounded player");
    const eventsAfterHunt = game.drainEvents();
    assert.equal(
      eventsAfterHunt.some((e) => e.event === "squad:callout"),
      false,
      "Hunter dispatch must NOT trigger any squad:callout",
    );

    // Activate Bounty Hunt Contract at shop-center (0, 0, -26)
    const buyResult = shop.buy(PLAYER, { shopId: "shop-center", itemId: "bounty-contract" }, nowRef.now);
    assert.equal(buyResult.ok, true, "Bounty contract activation at shop must succeed");
    assert(buyResult.targetId, "Bounty contract must select an alive enemy target");

    const bountyNav = navigation.availableTargets(PLAYER).find((t) => t.kind === "bounty");
    assert(bountyNav, "Active bounty target must appear in Карта navigation menu");
    assert(bountyNav.name.includes("Цель охоты"), `Expected 'Цель охоты', got ${bountyNav.name}`);

    const cashBefore = shop.balanceOf(PLAYER);
    s.get("health").applyDamage(buyResult.targetId, 999, { attackerId: PLAYER, weaponId: "sniper", now: nowRef.now });
    const cashAfter = shop.balanceOf(PLAYER);
    assert(
      cashAfter >= cashBefore + BOUNTY_CASH_REWARD,
      `Eliminating bounty target must award at least $${BOUNTY_CASH_REWARD} (before=${cashBefore}, after=${cashAfter})`,
    );
  } finally {
    await game.host.stop();
  }
});

test("equal-footed enemy shooters spawn with primary rifles/snipers & stimulants, self-revive when downed, and converge on shop-purchased Juggernaut drop", async () => {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  const nowRef = { now: Date.now() + 4000 };
  try {
    const joined = game.api.connectHuman(PLAYER, nowRef.now);
    const s = game.host.services;
    const c = game.host.components;
    const entities = s.get("entities");
    const injury = s.get("injury");
    const stimulants = s.get("stimulants");
    const shop = s.get("shop");
    const navigation = s.get("navigation");
    const botInterest = s.get("bot-interest");

    const allEnemyBots = entities.all().filter((e) => e.bot && e.alive && !e.humanSquad);
    assert(allEnemyBots.length >= 6, "Must have enemy bots in match");

    // 1. Verify every enemy bot spawns with a primary firearm (rifle/marksman/sniper) and stimulants
    for (const bot of allEnemyBots.slice(0, 12)) {
      const inv = c.get(bot.id, "Weapons");
      const weaponIds = (inv?.items ?? []).map((item) => item.id);
      assert(
        weaponIds.includes("rifle") || weaponIds.includes("marksman") || weaponIds.includes("sniper"),
        `Enemy bot ${bot.id} must spawn with a primary firearm, got [${weaponIds.join(", ")}]`,
      );
      assert(
        stimulants.totalCount(bot.id) >= 2,
        `Enemy bot ${bot.id} must spawn with stimulants for equal-footed survival, got ${stimulants.totalCount(bot.id)}`,
      );
    }

    // Keep 2 enemy squads (4 enemy bots) + player squad for fast deterministic stepping
    const keptEnemies = allEnemyBots.slice(0, 4);
    const keepIds = new Set([PLAYER, ...joined.squadmates, ...keptEnemies.map((b) => b.id)]);
    for (const ent of [...entities.all()]) {
      if (ent.bot && !keepIds.has(ent.id)) entities.remove(ent.id);
    }

    groundEntity(game, PLAYER, { x: 0, y: 0, z: -24.5, angle: 0 }, nowRef.now);
    joined.squadmates.forEach((id, idx) => {
      groundEntity(game, id, { x: -12 - idx * 4, y: 0, z: -24.5, angle: 0 }, nowRef.now);
    });
    const enemyPositions = [
      { x: -140, z: -120 },
      { x: -165, z: -140 },
      { x: 140, z: 120 },
      { x: 155, z: 135 },
    ];
    keptEnemies.forEach((bot, idx) => {
      const pos = enemyPositions[idx % enemyPositions.length];
      groundEntity(game, bot.id, { x: pos.x, y: 0, z: pos.z, angle: 0 }, nowRef.now);
    });

    advanceDeployment(game, nowRef);

    groundEntity(game, PLAYER, { x: 0, y: 0, z: -24.5, angle: 0 }, nowRef.now);
    keptEnemies.forEach((bot, idx) => {
      const pos = enemyPositions[idx % enemyPositions.length];
      groundEntity(game, bot.id, { x: pos.x, y: 0, z: pos.z, angle: 0 }, nowRef.now);
    });

    // 2. Knock down an enemy bot and verify it enters downed state and self-revives with its stimulant
    const downedEnemy = keptEnemies[0];
    s.get("health").applyDamage(downedEnemy.id, 500, { attackerId: PLAYER, weaponId: "sniper", now: nowRef.now });
    assert.equal(injury.isDowned(downedEnemy.id), true, "Enemy squad bot must enter downed state instead of dying instantly");

    for (let i = 0; i < 165; i += 1) {
      nowRef.now += 50;
      game.api.step(0.05, nowRef.now);
      if (!injury.isDowned(downedEnemy.id)) break;
    }
    assert.equal(injury.isDowned(downedEnemy.id), false, "Downed enemy bot must self-revive using its stimulant");
    assert.equal(entities.get(downedEnemy.id)?.alive, true, "Revived enemy bot must be alive and standing");

    // 3. Purchase Juggernaut drop at shop-center (0, 0, -26)
    shop.grantCash(PLAYER, JUGGERNAUT_DROP_COST + 500, "test");
    game.drainEvents();
    const buyJug = shop.buy(PLAYER, { shopId: "shop-center", itemId: "juggernaut-drop" }, nowRef.now);
    assert.equal(buyJug.ok, true, "Buying juggernaut-drop at shop must succeed");
    assert(buyJug.crateId, "Buying juggernaut-drop must spawn a Juggernaut crate");

    const jugEvents = game.drainEvents();
    assert(
      jugEvents.some((e) => e.event === "crate:juggernaut-incoming" && e.payload?.crateId === buyJug.crateId),
      "Purchasing juggernaut-drop must emit crate:juggernaut-incoming",
    );
    assert.equal(
      jugEvents.some((e) => e.event === "squad:callout"),
      false,
      "Juggernaut drop must NOT trigger any squad:callout",
    );

    // Verify all enemy bots are rallied toward the Juggernaut drop
    const ralliedEnemies = keptEnemies.filter((b) => botInterest.heardFor(b.id)?.key === "airdrop.juggernaut");
    assert.equal(
      ralliedEnemies.length,
      keptEnemies.length,
      "All enemy bots across the map must rally toward the Juggernaut drop",
    );

    // Check navigation menu lists Груз Джаггернаут (спускается)
    const navJug = navigation.availableTargets(PLAYER).find((t) => t.id === `airdrop:${buyJug.crateId}`);
    assert(navJug, "Карта must list the Juggernaut drop");
    assert.equal(navJug.name, "Груз Джаггернаут (спускается)");

    // Step until the Juggernaut crate lands
    const mapCrate = s.get("map").crates.find((cr) => cr.id === buyJug.crateId);
    assert(mapCrate, "Juggernaut crate must exist in map.crates");
    for (let i = 0; i < 120; i += 1) {
      nowRef.now += 50;
      game.api.step(0.05, nowRef.now);
      if (mapCrate.airdropPhase === "landed") break;
    }
    assert.equal(mapCrate.airdropPhase, "landed", "Juggernaut crate must land on the ground");

    // 4. Player opens the landed Juggernaut crate and receives massive HP, armor, and stimulants
    groundEntity(game, PLAYER, { x: mapCrate.x - 1.0, y: 0, z: mapCrate.z, angle: Math.PI / 2 }, nowRef.now);
    const cashBeforeOpen = shop.balanceOf(PLAYER);
    game.api.handleInput(PLAYER, { interactPressed: true }, nowRef.now);

    assert.equal(mapCrate.opened, true, "Juggernaut crate must open on interaction");
    const snap = game.api.snapshotFor(PLAYER, nowRef.now);
    const self = snap.entities.find((e) => e.id === PLAYER);
    assert.equal(self.juggernaut, true, "Player must have juggernaut status");
    assert.equal(self.health, 700, `Juggernaut health must be 700, got ${self.health}`);
    assert.equal(self.healthMax, 700, `Juggernaut max health must be 700, got ${self.healthMax}`);
    assert.equal(self.armor, 600, `Juggernaut armor must be 600, got ${self.armor}`);
    assert.equal(self.armorMax, 600, `Juggernaut max armor must be 600, got ${self.armorMax}`);
    assert.equal(self.armorReserve, 12, `Juggernaut reserve armor plates must be 12, got ${self.armorReserve}`);
    assert.equal(self.stimulants, 6, `Juggernaut standard stimulants must be 6, got ${self.stimulants}`);
    assert.equal(self.fastStimulants, 5, `Juggernaut fast stimulants must be 5, got ${self.fastStimulants}`);
    assert.equal(self.turboStimulants, 4, `Juggernaut turbo stimulants must be 4, got ${self.turboStimulants}`);
    assert(
      self.cash >= cashBeforeOpen + JUGGERNAUT_CASH_REWARD,
      `Opening Juggernaut crate must grant $${JUGGERNAUT_CASH_REWARD} cash`,
    );
  } finally {
    await game.host.stop();
  }
});

test("full-lobby enemy squads distribute across diverse map routes, only a subset converges on Juggernaut drop, and TacticalCombatNet trains on simulated and live battles", async () => {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  const nowRef = { now: Date.now() + 6000 };
  try {
    const joined = game.api.connectHuman(PLAYER, nowRef.now);
    const s = game.host.services;
    const c = game.host.components;
    const entities = s.get("entities");
    const botInterest = s.get("bot-interest");
    const botCombat = s.get("bot-combat");
    const shop = s.get("shop");

    // 1. Verify TacticalCombatNet (20 inputs, 3 heads) is pre-trained on simulated battles
    const netSummaryBefore = botCombat.neuralNetSummary();
    assert.equal(netSummaryBefore.inputDimensions, 20, "TacticalCombatNet must use 20 input parameters");
    assert(
      netSummaryBefore.pretrainedEpisodes >= 480,
      `Expected >= 480 pretrained battle episodes, got ${netSummaryBefore.pretrainedEpisodes}`,
    );
    assert(
      netSummaryBefore.currentLoss < netSummaryBefore.initialLoss,
      `Expected neural net training loss to decrease (${netSummaryBefore.initialLoss} -> ${netSummaryBefore.currentLoss})`,
    );
    assert(
      netSummaryBefore.pretrainAccuracy >= 0.75,
      `Expected pretrained tactical accuracy >= 0.75, got ${netSummaryBefore.pretrainAccuracy}`,
    );
    assert(
      netSummaryBefore.pretrainFireAccuracy >= 0.72,
      `Expected pretrained fire-control accuracy >= 0.72, got ${netSummaryBefore.pretrainFireAccuracy}`,
    );
    assert(
      netSummaryBefore.pretrainParachuteAccuracy >= 0.72,
      `Expected pretrained parachute-timing accuracy >= 0.72, got ${netSummaryBefore.pretrainParachuteAccuracy}`,
    );

    const allEnemies = entities.all().filter((e) => e.bot && e.alive && !e.humanSquad);
    assert(allEnemies.length >= 24, `Expected at least 24 enemy bots in lobby, got ${allEnemies.length}`);

    // Ground the human player near the Warehouse and enemy bots across the map
    groundEntity(game, PLAYER, { x: 118, y: 0, z: -20, angle: 0 }, nowRef.now);
    joined.squadmates.forEach((id, idx) => {
      groundEntity(game, id, { x: 112 - idx * 3, y: 0, z: -20, angle: 0 }, nowRef.now);
    });
    allEnemies.forEach((bot, idx) => {
      const angle = (idx / allEnemies.length) * Math.PI * 2;
      const radius = 85 + (idx % 6) * 55;
      groundEntity(
        game,
        bot.id,
        {
          x: Math.cos(angle) * radius,
          y: 0,
          z: Math.sin(angle) * radius,
          angle: 0,
        },
        nowRef.now,
      );
    });

    advanceDeployment(game, nowRef);

    // Re-ground entities after deployment aircraft launch so they are on the ground
    groundEntity(game, PLAYER, { x: 118, y: 0, z: -20, angle: 0 }, nowRef.now);
    joined.squadmates.forEach((id, idx) => {
      groundEntity(game, id, { x: 112 - idx * 3, y: 0, z: -20, angle: 0 }, nowRef.now);
    });
    allEnemies.forEach((bot, idx) => {
      const angle = (idx / allEnemies.length) * Math.PI * 2;
      const radius = 85 + (idx % 6) * 55;
      groundEntity(
        game,
        bot.id,
        {
          x: Math.cos(angle) * radius,
          y: 0,
          z: Math.sin(angle) * radius,
          angle: 0,
        },
        nowRef.now,
      );
    });

    // Step a couple of ticks so free-roam / exploration routes are assigned across squads
    for (let i = 0; i < 4; i += 1) {
      nowRef.now += 250;
      game.api.step(0.05, nowRef.now);
    }

    // 2. Verify enemy squads have distributed route targets across the map (near buildings, mid-ring, and wide outer map)
    let nearWarehouseCount = 0;
    let midRingCount = 0;
    let wideMapCount = 0;
    const routeProfiles = new Set();
    for (const bot of allEnemies) {
      const botState = c.get(bot.id, "Bot");
      if (botState?.patrolActivity) routeProfiles.add(botState.patrolActivity);
      const explore = botInterest.targetFor(bot.id, { now: nowRef.now }) ?? botState?.patrolTarget;
      const expState = botInterest.explorationFor(bot.id);
      if (Number.isFinite(expState?.routeStyle)) routeProfiles.add(`style:${expState.routeStyle}`);
      if (!explore) continue;
      const distFromOrigin = Math.hypot(explore.x, explore.z);
      const distFromWarehouse = Math.hypot(explore.x - 140, explore.z - (-22));
      if (distFromWarehouse < 90) nearWarehouseCount += 1;
      if (distFromOrigin >= 110 && distFromOrigin < 230) midRingCount += 1;
      if (distFromOrigin >= 230) wideMapCount += 1;
    }
    assert(
      nearWarehouseCount < allEnemies.length * 0.55,
      `Enemy bots must not all crowd the warehouse (nearWarehouse=${nearWarehouseCount} / ${allEnemies.length})`,
    );
    assert(
      midRingCount >= 2 && wideMapCount >= 2,
      `Enemy routes must be spread across mid and wide map sectors (mid=${midRingCount}, wide=${wideMapCount})`,
    );
    assert(
      routeProfiles.size >= 3,
      `Expected multiple route styles/profiles across squads, got [${[...routeProfiles].join(", ")}]`,
    );

    // 3. Purchase a Juggernaut drop in a full lobby and verify ONLY a subset (~35%, <= 14) of enemy bots converge
    groundEntity(game, PLAYER, { x: 0, y: 0, z: -24.5, angle: 0 }, nowRef.now);
    shop.grantCash(PLAYER, JUGGERNAUT_DROP_COST + 500, "test");
    const buyJug = shop.buy(PLAYER, { shopId: "shop-center", itemId: "juggernaut-drop" }, nowRef.now);
    assert.equal(buyJug.ok, true, "Buying Juggernaut drop must succeed");

    const ralliedToJug = allEnemies.filter((b) => botInterest.heardFor(b.id)?.key === "airdrop.juggernaut");
    assert(
      ralliedToJug.length >= 4 && ralliedToJug.length <= 14,
      `Only a partial subset (4..14) of enemy bots should converge on Juggernaut drop in a full lobby, got ${ralliedToJug.length} of ${allEnemies.length}`,
    );
    assert(
      allEnemies.length - ralliedToJug.length >= 12,
      "Majority of enemy bots in the lobby must remain distributed on their own map routes",
    );

    // 4. Verify TacticalCombatNet selects neural tactics + fire mode and learns directly from the live human player
    const duelBot = allEnemies[0];
    const duelTarget = joined.squadmates[0];
    groundEntity(game, duelBot.id, { x: -80, y: 0, z: -80, angle: 0 }, nowRef.now);
    groundEntity(game, duelTarget, { x: -64, y: 0, z: -80, angle: Math.PI }, nowRef.now);

    for (let i = 0; i < 10; i += 1) {
      nowRef.now += 150;
      game.api.step(0.05, nowRef.now);
    }

    const botComp = c.get(duelBot.id, "Bot");
    assert(botComp?.lastNeuralAction, "Bot component must record lastNeuralAction chosen by TacticalCombatNet");
    assert(botComp?.lastNeuralFireMode, "Bot component must record lastNeuralFireMode (when/how to shoot)");

    // Simulate live human player parachute deployment and combat hit so the neural net learns from the human player
    game.host.events.emit("parachute:deployed", {
      entityId: PLAYER,
      groundDistance: 122,
      y: 122,
      verticalVelocity: -38,
      now: nowRef.now,
    });
    s.get("health").applyDamage(duelBot.id, 48, {
      attackerId: PLAYER,
      weaponId: "rifle",
      now: nowRef.now,
    });
    s.get("health").applyDamage(duelTarget, 45, {
      attackerId: duelBot.id,
      weaponId: "rifle",
      now: nowRef.now,
    });
    const netSummaryAfter = botCombat.neuralNetSummary();
    assert(
      netSummaryAfter.liveCombatUpdates > netSummaryBefore.liveCombatUpdates,
      `Expected liveCombatUpdates to increment after real combat damage (${netSummaryBefore.liveCombatUpdates} -> ${netSummaryAfter.liveCombatUpdates})`,
    );
    assert(
      netSummaryAfter.humanParachuteSamples > netSummaryBefore.humanParachuteSamples,
      "Neural net must learn from the live human player's parachute opening timing",
    );
    assert(
      netSummaryAfter.humanSamplesLearned >= netSummaryBefore.humanSamplesLearned + 2,
      "Neural net must accumulate live imitation samples from the human player's combat and parachute actions",
    );
  } finally {
    await game.host.stop();
  }
});


