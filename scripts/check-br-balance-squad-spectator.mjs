import test from "node:test";
import assert from "node:assert/strict";

import { createEchoFrontGame } from "../src/server/game.js";
import { evaluateBattleRoyaleSurvivors } from "../src/plugins/battle-royale/server.js";
import { createBotLoadout } from "../src/plugins/battle-royale-bot-loadouts/server.js";
import { computeDistanceDamageMultiplier } from "../src/plugins/rapier-projectiles/server.js";
import { computeArmorAbsorption } from "../src/plugins/armor/server.js";
import { formatBattleRoyaleEndAnnouncement } from "../public/client/plugins/announcer.js";
import { shouldShowNewMatchButton } from "../public/client/plugins/game-hud.js";

const PLAYER = "11111111-1111-4111-8111-111111111111";

function groundEntity(game, entityId, pos) {
  const parachute = game.host.components.get(entityId, "Parachute");
  if (parachute) {
    parachute.phase = "landed";
    parachute.airborne = false;
    parachute.simulatedVerticalVelocity = 0;
    parachute.inflation = 0;
    parachute.glideSpeed = 0;
    parachute.airSpeed = 0;
  }
  game.host.services.get("movement").teleport(entityId, pos);
}

test("squad victory evaluation and Russian announcement handle squadmates alive, fallen human, and pure solo", () => {
  const human = { id: PLAYER, bot: false, kind: "human", team: 100001 };
  const mate1 = { id: "br-bot-91", bot: true, kind: "bot", team: 100001 };
  const mate2 = { id: "br-bot-92", bot: true, kind: "bot", team: 100001 };

  // 1. Human + squadmates win together
  const together = evaluateBattleRoyaleSurvivors([human, mate1, mate2], {
    teamOf: (id) => (id === PLAYER || id.startsWith("br-bot-9") ? 100001 : 0),
    teamSizeOf: () => 4,
  });
  assert.equal(together.ended, true);
  assert.equal(together.squadVictory, true);
  assert.equal(together.winnerId, PLAYER);
  assert.equal(together.winnerTeam, 100001);
  assert.equal(
    formatBattleRoyaleEndAnnouncement(together, PLAYER, 100001),
    "Победа. Ваш отряд победил",
  );

  // 2. Human died earlier, surviving squadmates finish the win
  const matesCarried = evaluateBattleRoyaleSurvivors([mate1, mate2], {
    teamOf: () => 100001,
    teamSizeOf: () => 4,
  });
  assert.equal(matesCarried.ended, true);
  assert.equal(matesCarried.squadVictory, true);
  assert.equal(matesCarried.winnerTeam, 100001);
  assert.equal(
    formatBattleRoyaleEndAnnouncement(matesCarried, PLAYER, 100001),
    "Победа. Ваш отряд победил",
  );

  // 3. Human was in a squad, squadmates fell, human clutches the win
  const squadClutch = evaluateBattleRoyaleSurvivors([human], {
    teamOf: () => 100001,
    teamSizeOf: () => 4,
  });
  assert.equal(squadClutch.ended, true);
  assert.equal(squadClutch.squadVictory, true);
  assert.equal(
    formatBattleRoyaleEndAnnouncement(squadClutch, PLAYER, 100001),
    "Победа. Ваш отряд победил",
  );

  // 4. Genuine solo (team size 1, e.g. tutorial) keeps last-survivor line
  const pureSolo = evaluateBattleRoyaleSurvivors([human], {
    teamOf: () => 100001,
    teamSizeOf: () => 1,
  });
  assert.equal(pureSolo.ended, true);
  assert.equal(pureSolo.squadVictory, false);
  assert.equal(
    formatBattleRoyaleEndAnnouncement(pureSolo, PLAYER, 100001),
    "Победа. Вы последний выживший",
  );

  // 5. Another team won
  assert.equal(
    formatBattleRoyaleEndAnnouncement({ winnerId: "enemy-1", winnerTeam: 7, squadVictory: false }, PLAYER, 100001),
    "Королевская битва завершена",
  );
});

test("distance damage falloff stays 1.0x up close and drops smoothly with range", () => {
  // Close range remains exact 1.0x
  assert.equal(computeDistanceDamageMultiplier(8, "pistol", 28), 1);
  assert.equal(computeDistanceDamageMultiplier(10, "pistol", 28), 1);
  assert.equal(computeDistanceDamageMultiplier(12, "rifle", 28), 1);
  assert.equal(computeDistanceDamageMultiplier(20, "marksman", 92), 1);
  assert.equal(computeDistanceDamageMultiplier(25, "sniper", 155), 1);

  // Monotonic falloff with distance
  const sniper30 = computeDistanceDamageMultiplier(30, "sniper", 155);
  const sniper70 = computeDistanceDamageMultiplier(70, "sniper", 155);
  const sniper120 = computeDistanceDamageMultiplier(120, "sniper", 155);
  const sniper155 = computeDistanceDamageMultiplier(155, "sniper", 155);
  assert(sniper30 < 1 && sniper30 > sniper70);
  assert(sniper70 > sniper120 && sniper120 > sniper155);
  assert(sniper155 <= 0.36 && sniper155 >= 0.34);

  const marksman20 = computeDistanceDamageMultiplier(20, "marksman", 92);
  const marksman60 = computeDistanceDamageMultiplier(60, "marksman", 92);
  const marksman90 = computeDistanceDamageMultiplier(90, "marksman", 92);
  assert(marksman20 === 1 && marksman60 < 0.75 && marksman90 < 0.45);
});

test("Juggernaut heavy armor resists sniper and never shatters 600 armor in one hit", () => {
  // Standard armor at close range still shatters cleanly on sniper
  const standardClose = computeArmorAbsorption({
    armorCurrent: 150,
    armorMaximum: 150,
    incomingDamage: 165,
    armorMultiplier: 2.2,
    shattersArmor: true,
    isJuggernaut: false,
    distanceMultiplier: 1,
  });
  assert.equal(standardClose.brokenArmor, 150);
  assert.equal(standardClose.armorBroke, true);
  assert.equal(standardClose.armorAfter, 0);

  // Standard armor at extreme sniper distance (145m, mult ~0.4 -> incoming ~66) takes weakened armor damage
  const standardFar = computeArmorAbsorption({
    armorCurrent: 150,
    armorMaximum: 150,
    incomingDamage: 66,
    armorMultiplier: 2.2,
    shattersArmor: true,
    isJuggernaut: false,
    distanceMultiplier: 0.4,
  });
  assert(standardFar.brokenArmor < 150, `Expected far sniper hit not to shatter full 150 armor (${standardFar.brokenArmor})`);
  assert.equal(standardFar.armorBroke, false);

  // Juggernaut 600 armor vs close sniper: NEVER one-shots 600 armor, zero HP bleed-through while plates hold
  const jugClose = computeArmorAbsorption({
    armorCurrent: 600,
    armorMaximum: 600,
    incomingDamage: 165,
    armorMultiplier: 2.2,
    shattersArmor: true,
    isJuggernaut: true,
    distanceMultiplier: 1,
  });
  assert(jugClose.brokenArmor <= 120, `Close sniper stripped too much Juggernaut armor: ${jugClose.brokenArmor}`);
  assert(jugClose.armorAfter >= 480, `Juggernaut should keep >= 480/600 armor after 1 close sniper shot, got ${jugClose.armorAfter}`);
  assert.equal(jugClose.armorBroke, false);
  assert.equal(jugClose.remainingDamage, 0);

  // Juggernaut 600 armor vs long-range sniper (~120m, mult ~0.525 -> incoming ~87)
  const jugFar = computeArmorAbsorption({
    armorCurrent: 600,
    armorMaximum: 600,
    incomingDamage: 87,
    armorMultiplier: 2.2,
    shattersArmor: true,
    isJuggernaut: true,
    distanceMultiplier: 0.525,
  });
  assert(jugFar.brokenArmor < jugClose.brokenArmor, "Far sniper shot must deal less Juggernaut armor damage than close shot");
  assert(jugFar.brokenArmor <= 65, `Far sniper stripped too much Juggernaut armor: ${jugFar.brokenArmor}`);
  assert.equal(jugFar.armorBroke, false);
});

test("enemy bot initial loadouts are pistols by default with only 2 rare bots starting with marksman or rifle (and zero snipers)", () => {
  let marksmanCount = 0;
  let rifleCount = 0;
  let pistolOnlyCount = 0;
  for (let serial = 1; serial <= 120; serial += 1) {
    const loadout = createBotLoadout(serial, Math.ceil(serial / 2));
    assert(!loadout.weapons.includes("sniper"), `Enemy bot ${serial} unexpectedly spawned with sniper: ${loadout.weapons}`);
    for (const weaponId of loadout.weapons) {
      assert(["marksman", "rifle", "pistol"].includes(weaponId), `Unexpected drop weapon: ${weaponId}`);
    }
    if (loadout.weapons.includes("marksman")) marksmanCount += 1;
    else if (loadout.weapons.includes("rifle")) rifleCount += 1;
    else {
      assert.deepEqual(loadout.weapons, ["pistol"], `Default enemy bot ${serial} should start with pistol only`);
      pistolOnlyCount += 1;
    }
  }
  assert.equal(marksmanCount, 1, "Exactly one rare enemy bot should start with a marksman rifle");
  assert.equal(rifleCount, 1, "Exactly one rare enemy bot should start with an assault rifle");
  assert.equal(pistolOnlyCount, 118, "All other enemy bots should start with pistol only");
});

test("New Match button visibility toggles properly when eliminated, spectating, redeployed, or ended", () => {
  assert.equal(
    shouldShowNewMatchButton({ isBr: true, tutorial: false, self: { alive: true }, spectator: null, match: { ended: false } }),
    false,
  );
  assert.equal(
    shouldShowNewMatchButton({ isBr: true, tutorial: false, self: { alive: false }, spectator: { active: true, targetName: "Напарник 1" }, match: { ended: false } }),
    true,
  );
  assert.equal(
    shouldShowNewMatchButton({ isBr: true, tutorial: false, self: { alive: true }, spectator: null, match: { ended: true } }),
    true,
  );
  assert.equal(
    shouldShowNewMatchButton({ isBr: true, tutorial: true, self: { alive: false }, spectator: null, match: { ended: false } }),
    false,
  );
  assert.equal(
    shouldShowNewMatchButton({ isBr: false, tutorial: false, self: { alive: false }, spectator: null, match: { ended: false } }),
    false,
  );
});

test("live Battle Royale: zero enemy bots spawn with snipers, squad win emits squadVictory, and distant projectiles weaken on Juggernaut", async () => {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  try {
    const s = game.host.services;
    const entities = s.get("entities");
    const teams = s.get("teams");
    const armor = s.get("armor");
    const projectiles = s.get("projectiles");
    const health = s.get("health");

    const joined = game.api.connectHuman(PLAYER);
    assert(joined.squadmates.length === 3, `Expected 3 squadmates, got ${joined.squadmates.length}`);

    // 1. Verify enemy bots start with pistols (at most 2 rare enemies with marksman/rifle, zero snipers)
    // and player's 3 squadmates start armed with their primary weapons selected
    const enemyBots = entities.all().filter((e) => e.bot && teams.teamOf(e.id) !== joined.team);
    assert(enemyBots.length > 50, "Expected enemy bots in Battle Royale");
    let enemyUpgraded = 0;
    for (const bot of enemyBots) {
      const inv = game.host.components.get(bot.id, "Weapons");
      const ids = inv?.items?.map((w) => w.id) ?? [];
      assert(!ids.includes("sniper"), `Enemy bot ${bot.id} dropped with sniper rifle: ${ids.join(",")}`);
      if (ids.includes("marksman") || ids.includes("rifle")) {
        enemyUpgraded += 1;
      } else {
        assert.deepEqual(ids, ["pistol"], `Enemy bot ${bot.id} should drop with pistol only, got ${ids.join(",")}`);
      }
    }
    assert(enemyUpgraded >= 1 && enemyUpgraded <= 2, `Expected 1-2 rare enemy bots with rifle/marksman, got ${enemyUpgraded}`);

    const expectedMatePrimaries = ["rifle", "marksman", "sniper"];
    joined.squadmates.forEach((mateId, idx) => {
      const mateInv = game.host.components.get(mateId, "Weapons");
      const activeId = mateInv?.items?.[mateInv.selected]?.id;
      assert.equal(activeId, expectedMatePrimaries[idx], `Squadmate ${idx + 1} should start holding ${expectedMatePrimaries[idx]}, got ${activeId}`);
    });

    // 2. Live projectile falloff + Juggernaut sniper durability check
    const shooterId = enemyBots[0].id;
    const keepIds = new Set([PLAYER, shooterId, ...joined.squadmates]);
    for (const ent of [...entities.all()]) {
      if (ent.bot && !keepIds.has(ent.id)) entities.remove(ent.id);
    }

    // Equip player as Juggernaut (600 armor, 700 HP)
    const playerEntity = entities.get(PLAYER);
    playerEntity.juggernaut = true;
    const hpComp = game.host.components.get(PLAYER, "Health");
    hpComp.maximum = 700;
    hpComp.current = 700;
    armor.grantJuggernautArmor(PLAYER);

    let now = Date.now() + 2000;
    groundEntity(game, PLAYER, { x: 0, y: 0, z: 0, angle: 0 });
    groundEntity(game, shooterId, { x: 0, y: 0, z: -100, angle: Math.PI });
    for (const mateId of joined.squadmates) {
      groundEntity(game, mateId, { x: -300, y: 0, z: -300, angle: 0 });
    }

    // Fire sniper projectile from 100m away toward Juggernaut
    const armorComp = game.host.components.get(PLAYER, "Armor");
    const armorBeforeFar = armorComp.current;
    projectiles.spawn({
      shooterId,
      weaponId: "sniper",
      damage: 165,
      speed: 560,
      range: 155,
      origin: { x: 0, y: 1, z: -100 },
      direction: { x: 0, y: 0, z: 1 },
      now,
    });
    for (let i = 0; i < 30 && armorComp.current === armorBeforeFar; i += 1) {
      now += 1000 / 60;
      game.api.step(1 / 60, now);
    }
    const farDamage = armorBeforeFar - armorComp.current;
    assert(farDamage > 0, "Expected 100m sniper projectile to hit Juggernaut");
    assert(farDamage <= 80, `Expected 100m sniper hit on Juggernaut to deal <= 80 armor damage, got ${farDamage}`);
    assert.equal(hpComp.current, 700, "Juggernaut HP must stay untouched while heavy armor holds");

    // Reset armor and fire sniper projectile from 15m away
    armorComp.current = 600;
    const armorBeforeClose = armorComp.current;
    projectiles.spawn({
      shooterId,
      weaponId: "sniper",
      damage: 165,
      speed: 560,
      range: 155,
      origin: { x: 0, y: 1, z: -15 },
      direction: { x: 0, y: 0, z: 1 },
      now,
    });
    for (let i = 0; i < 20 && armorComp.current === armorBeforeClose; i += 1) {
      now += 1000 / 60;
      game.api.step(1 / 60, now);
    }
    const closeDamage = armorBeforeClose - armorComp.current;
    assert(closeDamage > farDamage, `Expected 15m sniper (${closeDamage}) to deal strictly more armor damage than 100m sniper (${farDamage})`);
    assert(armorComp.current >= 450, `Juggernaut must survive close sniper with >= 450/600 armor, got ${armorComp.current}`);

    // 3. Eliminate human first (knockdown + finish), then eliminate last enemy -> surviving squadmates still win for the human's squad!
    game.drainEvents();
    armorComp.current = 0;
    health.applyDamage(PLAYER, 1000, { attackerId: shooterId, weaponId: "rifle", now });
    if (entities.get(PLAYER)?.alive) {
      health.applyDamage(PLAYER, 1000, { attackerId: shooterId, weaponId: "rifle", now: now + 20 });
    }
    assert.equal(entities.get(PLAYER)?.alive, false, "Player should be eliminated");
    const snapWhileDead = game.api.snapshotFor(PLAYER, now + 25);
    assert.equal(snapWhileDead.spectator?.active, true, "Eliminated player should spectate surviving squadmate");
    assert.equal(snapWhileDead.match?.ended, false, "Match must stay active while squadmates and enemy remain");

    const enemyArmor = game.host.components.get(shooterId, "Armor");
    if (enemyArmor) enemyArmor.current = 0;
    health.applyDamage(shooterId, 1000, { attackerId: joined.squadmates[0], weaponId: "rifle", now: now + 50 });
    if (entities.get(shooterId)?.alive) {
      health.applyDamage(shooterId, 1000, { attackerId: joined.squadmates[0], weaponId: "rifle", now: now + 70 });
    }

    const endEvents = game.drainEvents().filter((e) => e.event === "battle-royale:ended");
    assert.equal(endEvents.length, 1, "Expected battle-royale:ended event when squadmates defeat last enemy");
    assert.equal(endEvents[0].payload.squadVictory, true);
    assert.equal(endEvents[0].payload.winnerTeam, joined.team);
    assert.equal(
      formatBattleRoyaleEndAnnouncement(endEvents[0].payload, PLAYER, joined.team),
      "Победа. Ваш отряд победил",
    );
  } finally {
    await game.host.stop();
  }
});
