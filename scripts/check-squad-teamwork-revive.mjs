import assert from "node:assert/strict";
import { test } from "node:test";
import { createEchoFrontGame } from "../src/server/game.js";
import { TEAM_REVIVE_DURATION_MS } from "../src/plugins/battle-royale-injury/server.js";
import { injuryMessage } from "../public/client/plugins/injury-feedback.js";

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

test("connectHuman creates a 4-member squad with friendly-fire protection", async () => {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  const s = game.host.services;
  const c = game.host.components;
  let now = Date.now() + 1000;
  try {
    const joined = game.api.connectHuman(PLAYER);
    assert.equal(joined.squadmates.length, 3, "Human player must receive 3 bot squadmates (squad of 4)");
    const teams = s.get("teams");
    const combat = s.get("combat");
    const myTeam = teams.teamOf(PLAYER);
    assert(myTeam >= 100_000);

    groundEntity(game, PLAYER, { x: 0, y: 0, z: 0, angle: 0 });
    for (let i = 0; i < joined.squadmates.length; i += 1) {
      const mateId = joined.squadmates[i];
      assert.equal(teams.teamOf(mateId), myTeam, "Squadmate must share the player's team");
      groundEntity(game, mateId, { x: 3 + i * 2, y: 0, z: 0, angle: 0 });
    }

    const mate0 = joined.squadmates[0];
    const mateHpBefore = c.get(mate0, "Health").current;
    const ffResult = combat.damage(mate0, 85, { attackerId: PLAYER, weaponId: "rifle", now });
    assert.equal(ffResult.friendProtected, true, "Player must not damage squadmates");
    assert.equal(ffResult.applied, 0);
    assert.equal(c.get(mate0, "Health").current, mateHpBefore);

    const playerHpBefore = c.get(PLAYER, "Health").current;
    const botFfResult = combat.damage(PLAYER, 85, { attackerId: mate0, weaponId: "rifle", now });
    assert.equal(botFfResult.friendProtected, true, "Squadmate bots must not damage the player");
    assert.equal(botFfResult.applied, 0);
    assert.equal(c.get(PLAYER, "Health").current, playerHpBefore);
  } finally {
    await game.host.stop();
  }
});

test("teammates can revive each other infinitely and revive timer does not reset when interrupted", async () => {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  const s = game.host.services;
  const c = game.host.components;
  let now = Date.now() + 2000;
  try {
    const joined = game.api.connectHuman(PLAYER);
    const [mate1] = joined.squadmates;
    // Remove non-squad bots except one distant enemy so match stays active
    const keepIds = new Set([PLAYER, ...joined.squadmates, "br-bot-5"]);
    for (const ent of [...s.get("entities").all()]) {
      if (ent.bot && !keepIds.has(ent.id)) s.get("entities").remove(ent.id);
    }
    groundEntity(game, PLAYER, { x: 20, y: 0, z: 20, angle: 0 });
    groundEntity(game, mate1, { x: 21.5, y: 0, z: 20, angle: 0 });
    groundEntity(game, joined.squadmates[1], { x: 60, y: 0, z: 60, angle: 0 });
    groundEntity(game, joined.squadmates[2], { x: 62, y: 0, z: 60, angle: 0 });
    groundEntity(game, "br-bot-5", { x: -300, y: 0, z: -300, angle: 0 });

    const injury = s.get("injury");
    const health = s.get("health");
    const snapEntity = (id) => game.api.snapshotFor(PLAYER, now).entities.find((e) => e.id === id);

    // Repeat knockdown + team revive 3 times to prove infinite revives without using stimulants
    const startStims = snapEntity(PLAYER).stimulants;
    for (let cycle = 1; cycle <= 3; cycle += 1) {
      const res = health.applyDamage(mate1, 999, { attackerId: "br-bot-5", weaponId: "rifle", now });
      assert.equal(res.killed, false, `Cycle ${cycle}: squad bot with standing teammate must be downed, not killed`);
      assert.equal(injury.isDowned(mate1), true);

      // Start reviving mate1 for 2000ms (out of 3500ms)
      assert.equal(injury.startTeamRevive(PLAYER, mate1, now), true);
      for (let i = 0; i < 40; i += 1) {
        now += 50;
        injury.tick(now);
      }
      const progressMid = injury.describe(mate1).reviveProgressMs;
      assert(progressMid >= 1950 && progressMid <= 2050, `Expected ~2000ms progress, got ${progressMid}`);
      assert.equal(injury.isDowned(mate1), true);

      // Interrupt the revive (e.g. player fires weapon)
      game.api.handleInput(PLAYER, { firePressed: true }, now);
      assert.equal(injury.isRevivingTeammate(PLAYER), false, "Firing must pause active team revive");
      const progressPaused = injury.describe(mate1).reviveProgressMs;
      assert.equal(progressPaused, progressMid, "Paused revive timer must NOT reset");

      // Advance 1000ms while paused — progress must remain saved
      for (let i = 0; i < 20; i += 1) {
        now += 50;
        injury.tick(now);
      }
      assert.equal(injury.describe(mate1).reviveProgressMs, progressPaused, "Saved progress must persist while paused");

      // Resume revive — only remaining ~1500ms is needed!
      assert.equal(injury.startTeamRevive(PLAYER, mate1, now), true);
      for (let i = 0; i < 32; i += 1) {
        now += 50;
        injury.tick(now);
      }
      assert.equal(injury.isDowned(mate1), false, `Cycle ${cycle}: mate1 must be revived after completing remaining time`);
      assert.equal(c.get(mate1, "Health").current, 100, "Post-revive HP must be 100");
      assert.equal(c.get(mate1, "Health").maximum, 200, "Post-revive max HP must be 200");
      assert.equal(injury.describe(mate1).reviveProgressMs, 0, "Completed revive resets progress for future knockdowns");
    }
    assert.equal(snapEntity(PLAYER).stimulants, startStims, "Team revives must not consume player stimulants");
  } finally {
    await game.host.stop();
  }
});

test("tactical squad AI splits into medic and cover, pauses on enemy rush, ignores downed enemy, and finishes revive", async () => {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  const s = game.host.services;
  const c = game.host.components;
  let now = Date.now() + 5000;
  try {
    const joined = game.api.connectHuman(PLAYER);
    const [mate1, mate2, mate3] = joined.squadmates;
    const enemy1 = "br-bot-5"; // team 3
    const enemy2 = "br-bot-6"; // team 3 (gives enemy1 a standing teammate so enemy1 can be downed)

    const keepIds = new Set([PLAYER, mate1, mate2, mate3, enemy1, enemy2]);
    for (const ent of [...s.get("entities").all()]) {
      if (ent.bot && !keepIds.has(ent.id)) s.get("entities").remove(ent.id);
    }

    // Ground everyone in an open area
    groundEntity(game, PLAYER, { x: -120, y: 0, z: -120, angle: 0 });
    groundEntity(game, mate1, { x: -124, y: 0, z: -122, angle: 0 });
    groundEntity(game, mate2, { x: -119, y: 0, z: -120, angle: 0 }); // close to PLAYER -> medic
    groundEntity(game, mate3, { x: -112, y: 0, z: -108, angle: 0 }); // closer to enemy1 -> cover
    groundEntity(game, enemy1, { x: -102, y: 0, z: -100, angle: Math.PI }); // 21m from mate2, 12.8m from mate3
    groundEntity(game, enemy2, { x: -300, y: 0, z: -300, angle: 0 });
    s.get("weapons").grant(enemy1, "rifle");

    const health = s.get("health");
    const injury = s.get("injury");

    // Knock down both PLAYER and mate1 (simulating 2 squadmates downed in a heavy firefight)
    health.applyDamage(PLAYER, 999, { attackerId: enemy1, weaponId: "rifle", now });
    health.applyDamage(mate1, 999, { attackerId: enemy1, weaponId: "rifle", now });
    assert.equal(injury.isDowned(PLAYER), true);
    assert.equal(injury.isDowned(mate1), true);

    // Step 20 ticks (1s): mate2 (closest to PLAYER with no enemy within 14m) acts as medic for PLAYER,
    // while mate3 acts as cover engaging enemy1!
    for (let i = 0; i < 20; i += 1) {
      now += 50;
      game.api.step(0.05, now);
    }
    const state2 = c.get(mate2, "Bot");
    const state3 = c.get(mate3, "Bot");
    assert.equal(state2.squadRoleActive, "medic", "Closest safe bot must take medic role");
    assert.equal(state3.squadRoleActive, "cover", "Second standing bot must take cover role against standing enemy");
    const progressBeforeRush = injury.describe(PLAYER).reviveProgressMs;
    assert(progressBeforeRush > 400, `Medic bot must accumulate revive progress on player (got ${progressBeforeRush})`);

    // Now enemy1 rushes within 8m of medic mate2!
    const t2 = c.get(mate2, "Transform");
    groundEntity(game, enemy1, { x: t2.x + 6, y: 0, z: t2.z, angle: -Math.PI / 2 });
    for (let i = 0; i < 4; i += 1) {
      now += 50;
      game.api.step(0.05, now);
    }
    assert.equal(state2.squadRoleActive, "medic-defending", "Medic must pause revive and defend when enemy rushes within 14m");
    assert.equal(injury.isRevivingTeammate(mate2), false, "Revive must be paused during rush defense");
    const savedProgress = injury.describe(PLAYER).reviveProgressMs;
    assert(savedProgress >= progressBeforeRush, "Revive timer must not reset when medic pauses to fight");

    // Medic knocks down rushing enemy1 (enemy1 enters downed state because enemy2 is alive on its team)
    health.applyDamage(enemy1, 999, { attackerId: mate2, weaponId: "rifle", now });
    assert.equal(injury.isDowned(enemy1), true, "Rushing enemy is knocked into downed state");

    // With enemy1 now downed right next to mate2 (6m away), mate2 must recognize a downed enemy cannot act
    // and immediately resume reviving PLAYER from savedProgress until PLAYER is back on their feet!
    for (let i = 0; i < Math.ceil((TEAM_REVIVE_DURATION_MS - savedProgress + 600) / 50); i += 1) {
      now += 50;
      game.api.step(0.05, now);
      if (!injury.isDowned(PLAYER)) break;
    }
    assert.equal(injury.isDowned(PLAYER), false, "Medic must ignore downed enemy and finish reviving the player");
    assert.equal(c.get(PLAYER, "Health").current, 100);
  } finally {
    await game.host.stop();
  }
});

test("Engine Lab: downed teammates appear in Map (Карта) at 15-20m, prompt at 2m without auto-starting, and revive on 1-finger tap", async () => {
  const { EngineLab } = await import("../src/server/engine-lab.js");
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  const lab = new EngineLab(game, {
    mode: "battle-royale",
    room: "squad-revive-engine-lab",
    watch: [PLAYER],
  });
  const s = game.host.services;
  let now = Date.now() + 8000;
  try {
    const prep = await lab.prepare([
      { command: "service.call", args: { service: "match-api", method: "connectHuman", arguments: [PLAYER] } },
    ]);
    assert(prep.results.every((r) => r.ok));
    const joined = prep.results[0].result;
    const [mate1] = joined.squadmates;
    const keepIds = new Set([PLAYER, ...joined.squadmates, "br-bot-5"]);
    for (const ent of [...s.get("entities").all()]) {
      if (ent.bot && !keepIds.has(ent.id)) s.get("entities").remove(ent.id);
    }

    // Place PLAYER at (0,0,0) and mate1 18m away (within 15-20m)
    groundEntity(game, PLAYER, { x: 0, y: 0, z: 0, angle: 0 });
    groundEntity(game, mate1, { x: 0, y: 0, z: -18, angle: 0 });
    groundEntity(game, joined.squadmates[1], { x: 80, y: 0, z: 80, angle: 0 });
    groundEntity(game, joined.squadmates[2], { x: 82, y: 0, z: 80, angle: 0 });
    groundEntity(game, "br-bot-5", { x: -300, y: 0, z: -300, angle: 0 });
    game.host.events.emit("parachute:landed", { entityId: PLAYER, now });
    lab.start();

    // Down mate1 at 18m
    s.get("health").applyDamage(mate1, 999, { attackerId: "br-bot-5", weaponId: "rifle", now });
    assert.equal(s.get("injury").isDowned(mate1), true);

    const snapshot = game.api.snapshotFor(PLAYER, now);
    const mapItem = snapshot.navigation?.items?.find((item) => item.id === `teammate:${mate1}`);
    assert(mapItem, "Downed teammate at 18m must appear in snapshot.navigation.items (Карта)");
    assert.equal(mapItem.kind, "teammate");
    assert.equal(mapItem.name, "Лежащий напарник 1");
    assert(Math.abs(mapItem.distance - 18) < 0.5);

    // Player selects downed teammate from Map and activates route
    game.api.handleInput(PLAYER, {
      navigationSelectTargetId: `teammate:${mate1}`,
      navigationActivateSelected: true,
    }, now);
    const navState = s.get("navigation").stateFor(PLAYER, now);
    assert.equal(navState.active, true);
    assert.equal(navState.target?.id, `teammate:${mate1}`);

    // Move player to 2.0m from downed mate1 and step in Engine Lab — must emit prompt but NOT auto-start revive
    const capturedInjuryEvents = [];
    game.host.events.on("*", (packet) => {
      if (packet.event.startsWith("injury:")) capturedInjuryEvents.push(packet);
    });
    groundEntity(game, PLAYER, { x: 0, y: 0, z: -16.0, angle: 0 });
    await lab.advance({ steps: 2, sampleEvery: 1 });
    assert.equal(s.get("injury").isRevivingTeammate(PLAYER), false, "Must NOT auto-start revive just by standing at 2m");
    const playerEvents = game.api.eventsForPlayer(PLAYER, capturedInjuryEvents);
    const nearbyEvent = playerEvents.find((e) => e.event === "injury:downed-teammate-nearby");
    assert(nearbyEvent, "Approaching within 2m of downed teammate must emit injury:downed-teammate-nearby");
    assert.equal(
      injuryMessage(nearbyEvent.event, nearbyEvent.payload, PLAYER),
      "Лежащий напарник рядом. Можно поднять касанием одним пальцем или клавишей E.",
    );

    // Now simulate 1-finger tap on iPhone (which sends interactPressed: true)
    game.api.handleInput(PLAYER, { interactPressed: true }, lab.now);
    assert.equal(s.get("injury").isRevivingTeammate(PLAYER), true, "1-finger tap (interactPressed) must start reviving teammate");
    await lab.advance({ steps: 75, sampleEvery: 15 });
    assert.equal(s.get("injury").isDowned(mate1), false, "Teammate must be revived after 3.5s via Engine Lab");
    const report = lab.finish();
    assert(report.simulatedMs >= 3500);
  } finally {
    await game.host.stop();
  }
});

test("Engine Lab full jump: squadmates skydive and land beside player on foot, engage nearby enemy squads, and never get hijacked into solo cars", async () => {
  const { EngineLab } = await import("../src/server/engine-lab.js");
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  const lab = new EngineLab(game, {
    mode: "battle-royale",
    room: "squad-jump-engine-lab",
    watch: [PLAYER],
  });
  const s = game.host.services;
  const c = game.host.components;
  try {
    const prep = await lab.prepare([
      { command: "service.call", args: { service: "match-api", method: "connectHuman", arguments: [PLAYER] } },
    ]);
    assert(prep.results.every((r) => r.ok));
    const joined = prep.results[0].result;
    assert.equal(joined.squadmates.length, 3);

    let squadCombatHits = 0;
    const teams = s.get("teams");
    const playerTeam = teams.teamOf(PLAYER);
    game.host.events.on("combat:damage", ({ attackerId, targetId }) => {
      if (teams.teamOf(attackerId) === playerTeam || teams.teamOf(targetId) === playerTeam) {
        squadCombatHits += 1;
      }
    });

    lab.start();

    // Advance 15 seconds (3 * 100 steps * 50ms) for freefall + canopy landing
    for (let i = 0; i < 3; i += 1) {
      await lab.advance({ steps: 100, sampleEvery: 20 });
    }
    const playerTransform = c.get(PLAYER, "Transform");
    const playerParachute = c.get(PLAYER, "Parachute");
    assert.equal(Boolean(playerParachute?.airborne), false, "Player must have landed by 15s");

    const botVehicles = s.get("bot-vehicles");
    for (const mateId of joined.squadmates) {
      const mateTransform = c.get(mateId, "Transform");
      const mateParachute = c.get(mateId, "Parachute");
      assert.equal(Boolean(mateParachute?.airborne), false, `Squadmate ${mateId} must land with player by 15s`);
      const dist = Math.hypot(mateTransform.x - playerTransform.x, mateTransform.z - playerTransform.z);
      assert(dist <= 20, `Squadmate ${mateId} must land near player (dist=${dist.toFixed(1)}m)`);
      assert.equal(botVehicles.stateFor(mateId), null, `Squadmate ${mateId} must not be hijacked into a solo car`);
    }

    // Advance another 15 seconds for on-foot squad combat around landing zone
    for (let i = 0; i < 3; i += 1) {
      await lab.advance({ steps: 100, sampleEvery: 20 });
    }
    assert(squadCombatHits > 10, `Player squad and nearby enemy squads must actively engage on foot (hits=${squadCombatHits})`);
    assert.equal(
      s.get("dropzone-vehicle").summary().placements,
      0,
      "No vehicles may be artificially spawned/teleported next to landing bots or player",
    );
    const allBots = s.get("entities").all().filter((e) => e.bot && e.alive);
    const nearbyDrivers = allBots.filter((b) => {
      const bt = c.get(b.id, "Transform");
      const pt = c.get(PLAYER, "Transform");
      return Math.hypot(bt.x - pt.x, bt.z - pt.z) <= 200 && botVehicles.stateFor(b.id) != null;
    });
    assert.equal(nearbyDrivers.length, 0, "No bots within 200m of player may grab cars during landing/combat");
    for (const mateId of joined.squadmates) {
      assert.equal(botVehicles.stateFor(mateId), null, `Squadmate ${mateId} must remain on foot with the squad`);
    }
  } finally {
    await game.host.stop();
  }
});

test("Engine Lab warehouse exit: squadmates inside warehouse (upper floor, behind stair, ground floor) never get trapped and exit through doorway when player leaves", async () => {
  const { EngineLab } = await import("../src/server/engine-lab.js");
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  const lab = new EngineLab(game, {
    mode: "battle-royale",
    room: "squad-warehouse-exit-lab",
    watch: [PLAYER],
  });
  const s = game.host.services;
  const c = game.host.components;
  try {
    const prep = await lab.prepare([
      { command: "service.call", args: { service: "match-api", method: "connectHuman", arguments: [PLAYER] } },
    ]);
    const joined = prep.results[0].result;
    const [mate1, mate2, mate3] = joined.squadmates;
    const now = Date.now() + 2000;
    s.get("battle-royale").arm(now);

    // Move unrelated bots far away so we test pure warehouse exit navigation
    let idx = 0;
    for (const ent of s.get("entities").all()) {
      if ([PLAYER, mate1, mate2, mate3].includes(ent.id)) continue;
      idx += 1;
      groundEntity(game, ent.id, { x: -450 - (idx % 20) * 6, y: 0, z: -450 - Math.floor(idx / 20) * 6 });
    }

    // Place squadmates in the hardest spots inside the warehouse:
    // mate1: upper floor (y=3.2, x=62, z=2)
    // mate2: ground floor west of the staircase (y=0, x=56, z=-3)
    // mate3: ground floor near inner wall (y=0, x=71, z=5)
    // Player walks outside warehouse door to x=83, z=0
    groundEntity(game, mate1, { x: 62, y: 3.2, z: 2, angle: 0 });
    groundEntity(game, mate2, { x: 56, y: 0, z: -3, angle: 0 });
    groundEntity(game, mate3, { x: 71, y: 0, z: 5, angle: 0 });
    groundEntity(game, PLAYER, { x: 83, y: 0, z: 0, angle: Math.PI / 2 });
    game.host.events.emit("parachute:landed", { entityId: PLAYER, now });

    lab.start();
    for (let i = 0; i < 3; i += 1) {
      await lab.advance({ steps: 100, sampleEvery: 20 });
    }

    const buildingNav = s.get("building-navigation");
    for (const mateId of [mate1, mate2, mate3]) {
      const mt = c.get(mateId, "Transform");
      const inside = Boolean(buildingNav.locationFor(mt)?.building);
      const dist = Math.hypot(mt.x - 83, mt.z - 0);
      assert.equal(inside, false, `Squadmate ${mateId} must exit the warehouse (pos=${JSON.stringify(mt)})`);
      assert(dist <= 12, `Squadmate ${mateId} must join player outside warehouse (dist=${dist.toFixed(1)}m)`);
    }
  } finally {
    await game.host.stop();
  }
});

test("Engine Lab warehouse ascent: squadmates outside, behind stair, and on ground floor climb stairs to join player on upper floor", async () => {
  const { EngineLab } = await import("../src/server/engine-lab.js");
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  const lab = new EngineLab(game, {
    mode: "battle-royale",
    room: "squad-warehouse-ascent-lab",
    watch: [PLAYER],
  });
  const s = game.host.services;
  const c = game.host.components;
  try {
    const prep = await lab.prepare([
      { command: "service.call", args: { service: "match-api", method: "connectHuman", arguments: [PLAYER] } },
    ]);
    const joined = prep.results[0].result;
    const [mate1, mate2, mate3] = joined.squadmates;
    const now = Date.now() + 2000;
    s.get("battle-royale").arm(now);

    let idx = 0;
    for (const ent of s.get("entities").all()) {
      if ([PLAYER, mate1, mate2, mate3].includes(ent.id)) continue;
      idx += 1;
      groundEntity(game, ent.id, { x: -450 - (idx % 20) * 6, y: 0, z: -450 - Math.floor(idx / 20) * 6 });
    }

    groundEntity(game, PLAYER, { x: 64, y: 3.2, z: 3, angle: 0 });
    groundEntity(game, mate1, { x: 80, y: 0, z: 0, angle: 0 });
    groundEntity(game, mate2, { x: 56, y: 0, z: -4, angle: 0 });
    groundEntity(game, mate3, { x: 71, y: 0, z: 6, angle: 0 });
    game.host.events.emit("parachute:landed", { entityId: PLAYER, now });

    lab.start();
    for (let i = 0; i < 5; i += 1) {
      await lab.advance({ steps: 100, sampleEvery: 20 });
    }

    for (const mateId of [mate1, mate2, mate3]) {
      const mt = c.get(mateId, "Transform");
      const dist = Math.hypot(mt.x - 64, mt.z - 3);
      assert(mt.y >= 3.0, `Squadmate ${mateId} must reach warehouse upper floor (pos=${JSON.stringify(mt)})`);
      assert(dist <= 10, `Squadmate ${mateId} must regroup near upper-floor player (dist=${dist.toFixed(1)}m)`);
    }
  } finally {
    await game.host.stop();
  }
});

test("Squadmate Self-Revive Stimulant: when the entire player squad is knocked down, a squadmate uses their stimulant to self-revive and then revives the player", async () => {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  const s = game.host.services;
  const c = game.host.components;
  try {
    const joined = s.get("match-api").connectHuman(PLAYER);
    const [mate1, mate2, mate3] = joined.squadmates;
    let now = Date.now() + 2000;
    s.get("battle-royale").arm(now);

    // Move unrelated bots far away
    let idx = 0;
    for (const ent of s.get("entities").all()) {
      if ([PLAYER, mate1, mate2, mate3].includes(ent.id)) continue;
      idx += 1;
      groundEntity(game, ent.id, { x: -450 - (idx % 20) * 6, y: 0, z: -450 - Math.floor(idx / 20) * 6 });
    }

    groundEntity(game, PLAYER, { x: 10, y: 0, z: 10, angle: 0 });
    groundEntity(game, mate1, { x: 11.4, y: 0, z: 10, angle: 0 });
    groundEntity(game, mate2, { x: 10, y: 0, z: 11.4, angle: 0 });
    groundEntity(game, mate3, { x: 8.6, y: 0, z: 10, angle: 0 });

    const stimulants = s.get("stimulants");
    const injury = s.get("injury");
    const health = s.get("health");

    for (const mateId of [mate1, mate2, mate3]) {
      assert.equal(stimulants.count(mateId), 1, `Squadmate ${mateId} must start with 1 stimulant like the player`);
    }

    // Knock down the entire squad (player + all 3 squadmates)
    for (const id of [PLAYER, mate1, mate2, mate3]) {
      c.get(id, "Transform").spawnProtectedUntil = 0;
      const armor = c.get(id, "Armor");
      if (armor) armor.current = 0;
      const res = health.applyDamage(id, 500, { attackerId: "br-bot-5", weaponId: "rifle", now });
      assert.equal(res.downed, true, `${id} must enter downed state even when the rest of the squad is downed`);
      assert.equal(injury.isDowned(id), true);
    }

    let selfReviveStarted = false;
    let selfRevivedBotId = null;
    let playerRevivedByMate = false;
    game.host.events.on("injury:stim-started", ({ entityId, downed }) => {
      if ([mate1, mate2, mate3].includes(entityId) && downed) {
        selfReviveStarted = true;
      }
    });
    game.host.events.on("injury:stim-completed", ({ entityId, revived }) => {
      if ([mate1, mate2, mate3].includes(entityId) && revived) {
        selfRevivedBotId = entityId;
      }
    });
    game.host.events.on("injury:team-revive-completed", ({ entityId, reviverId }) => {
      if (entityId === PLAYER && [mate1, mate2, mate3].includes(reviverId)) {
        playerRevivedByMate = true;
      }
    });

    // Step 11 seconds (6s for stimulant self-revive + 3.5s for reviving the player)
    for (let step = 0; step < 220; step += 1) {
      now += 50;
      s.get("match-api").step(0.05, now);
    }

    assert.equal(selfReviveStarted, true, "Downed squadmate must trigger stimulant self-revive when whole squad is downed");
    assert(selfRevivedBotId != null, "Squadmate must complete 6s stimulant self-revive");
    assert.equal(injury.isDowned(selfRevivedBotId), false, "Self-revived squadmate must be standing");
    assert.equal(stimulants.count(selfRevivedBotId), 0, "Self-revived squadmate must consume their 1 stimulant");
    assert.equal(playerRevivedByMate, true, "Self-revived squadmate must then revive the downed player");
    assert.equal(injury.isDowned(PLAYER), false, "Player must be standing after squadmate revives them");
  } finally {
    await game.host.stop();
  }
});

test("Living Squad Goals: squad building loot run opens crates, squad vehicle raid to Two-Storey House, building ambush, outnumbered callout, and calm post-knockdown looting", async () => {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  const s = game.host.services;
  const c = game.host.components;
  try {
    s.get("match-api").connectHuman(PLAYER);
    let now = Date.now() + 2000;
    s.get("battle-royale").arm(now);

    const entities = s.get("entities");
    const map = s.get("map");
    const weapons = s.get("weapons");
    const armorService = s.get("armor");
    const injury = s.get("injury");
    const health = s.get("health");
    const botVehicles = s.get("bot-vehicles");
    const vehicles = s.get("vehicles");

    // Move all bots to a far staging area first, keeping our test bots separated so they don't fight before their scenario
    const reservedTestBots = new Set([
      "br-bot-5", "br-bot-6", "br-bot-7", "br-bot-8",
      "br-bot-9", "br-bot-10", "br-bot-11", "br-bot-12",
      "br-bot-13", "br-bot-14", "br-bot-15", "br-bot-16",
    ]);
    let idx = 0;
    let rIdx = 0;
    for (const ent of entities.all()) {
      if (reservedTestBots.has(ent.id)) {
        rIdx += 1;
        groundEntity(game, ent.id, {
          x: -900 + rIdx * 220,
          y: 0,
          z: 750 + (rIdx % 2) * 240,
        });
        continue;
      }
      idx += 1;
      groundEntity(game, ent.id, { x: -450 - (idx % 20) * 6, y: 0, z: -450 - Math.floor(idx / 20) * 6 });
    }

    // 1. Squad Building Loot Objective & Opening Crates:
    // Place squad (br-bot-5 & br-bot-6) near Warehouse entrance with pistols only; verify they choose warehouse, walk to unopened crates, and open them.
    const warehouseCrate = map.crates.find((cr) => !cr.opened && cr.x >= map.building.minX && cr.x <= map.building.maxX);
    assert(warehouseCrate, "Warehouse must have an unopened loot crate");
    const inv5 = c.get("br-bot-5", "Weapons");
    inv5.items = [{ id: "pistol", ammo: 12, reserve: 36 }];
    inv5.selected = 0;
    groundEntity(game, "br-bot-5", { x: warehouseCrate.x + 1.6, y: warehouseCrate.y ?? 0, z: warehouseCrate.z + 0.8, angle: Math.PI });
    groundEntity(game, "br-bot-6", { x: warehouseCrate.x + 6.0, y: warehouseCrate.y ?? 0, z: warehouseCrate.z + 2.0, angle: Math.PI });

    const openedEvents = [];
    game.host.events.on("loot:opened", (ev) => openedEvents.push(ev));

    for (let step = 0; step < 30; step += 1) {
      now += 50;
      s.get("match-api").step(0.05, now);
    }
    assert.equal(warehouseCrate.opened, true, "Squad bot must physically open the warehouse loot crate");
    assert(openedEvents.some((e) => e.crateId === warehouseCrate.id && e.entityId === "br-bot-5"), "loot:opened event must be emitted for bot crate open");
    assert.equal(c.get("br-bot-6", "Bot").squadLootBuildingId, "warehouse", "Squadmates must share the warehouse loot objective");

    // 2. Squad Vehicle Raid to Two-Storey House (driver + passenger board car together):
    const availableCar = vehicles.snapshot().find((v) => !v.occupied && v.id !== "vehicle-1" && Math.hypot(v.x + 450, v.z + 450) > 180)
      ?? vehicles.snapshot().find((v) => !v.occupied && v.id !== "vehicle-1");
    assert(availableCar, "Must have an available vehicle for squad raid");
    groundEntity(game, "br-bot-7", { x: availableCar.x + 1.8, y: 0, z: availableCar.z + 1.2, angle: 0 });
    groundEntity(game, "br-bot-8", { x: availableCar.x + 2.4, y: 0, z: availableCar.z - 1.2, angle: 0 });
    const assignedRaid = botVehicles.assignSquadRaid("br-bot-7", availableCar.id, "two-storey-house", now);
    assert.equal(assignedRaid, true, "Squad must accept vehicle raid assignment to two-storey-house");

    for (let step = 0; step < 25; step += 1) {
      now += 50;
      s.get("match-api").step(0.05, now);
    }
    assert.equal(vehicles.isDriving("br-bot-7"), true, "Squad leader br-bot-7 must be driving the raid vehicle");
    assert.equal(vehicles.isPassenger("br-bot-8"), true, "Squad partner br-bot-8 must board the same vehicle as a passenger");
    assert.equal(c.get("br-bot-7", "Bot").squadLootBuildingId, "two-storey-house");
    assert.equal(c.get("br-bot-8", "Bot").squadLootBuildingId, "two-storey-house");

    // Move them away after testing vehicle boarding so they don't interfere with ambush test
    vehicles.exit("br-bot-8", now, "test-cleanup");
    vehicles.exit("br-bot-7", now, "test-cleanup");
    groundEntity(game, "br-bot-7", { x: -420, y: 0, z: -420 });
    groundEntity(game, "br-bot-8", { x: -425, y: 0, z: -420 });

    // 3. Building Ambush ("крыса в углу"):
    // Place br-bot-9 inside Warehouse ground floor while enemy br-bot-11 approaches outside the door.
    const whDoor = map.doors.find((d) => d.x >= map.building.minX - 2 && d.x <= map.building.maxX + 2) ?? { x: 76, y: 0, z: 0 };
    groundEntity(game, "br-bot-9", { x: whDoor.x - 3.0, y: 0, z: whDoor.z + 0.5, angle: 0 });
    groundEntity(game, "br-bot-11", { x: whDoor.x + 14.0, y: 0, z: whDoor.z + 1.0, angle: -Math.PI / 2 });
    c.get("br-bot-9", "Bot").nextThinkAt = 0;

    for (let step = 0; step < 20; step += 1) {
      now += 50;
      s.get("match-api").step(0.05, now);
    }
    assert.equal(
      c.get("br-bot-9", "Bot").squadRoleActive,
      "ambush",
      "Bot inside building detecting enemy outside must set up a doorway corner ambush ('крыса в углу')",
    );

    // 4. Outnumbered Callout & Regroup ("их много, стягиваемся"):
    // Place br-bot-9 where it sees TWO standing enemies (br-bot-11 and br-bot-12) while partner br-bot-10 is 28m away.
    groundEntity(game, "br-bot-9", { x: 180, y: 0, z: 180, angle: 0 });
    groundEntity(game, "br-bot-10", { x: 152, y: 0, z: 180, angle: Math.PI / 2 });
    groundEntity(game, "br-bot-11", { x: 180, y: 0, z: 168, angle: Math.PI });
    groundEntity(game, "br-bot-12", { x: 183, y: 0, z: 168, angle: Math.PI });
    c.get("br-bot-9", "Bot").nextThinkAt = 0;
    c.get("br-bot-10", "Bot").nextThinkAt = 0;

    let outnumberedEvents = 0;
    game.host.events.on("bot:squad-callout", (ev) => {
      if (ev.botId === "br-bot-9" && ev.kind === "outnumbered") outnumberedEvents += 1;
    });

    const initialPartnerDist = Math.hypot(
      c.get("br-bot-10", "Transform").x - 180,
      c.get("br-bot-10", "Transform").z - 180,
    );
    for (let step = 0; step < 30; step += 1) {
      now += 50;
      s.get("match-api").step(0.05, now);
    }
    const afterPartnerDist = Math.hypot(
      c.get("br-bot-10", "Transform").x - 180,
      c.get("br-bot-10", "Transform").z - 180,
    );
    assert(outnumberedEvents >= 1, "Bot spotting >=2 enemies must emit outnumbered squad callout");
    assert(c.get("br-bot-10", "Bot").outnumberedCallout != null, "Squadmate must receive outnumbered callout");
    assert(afterPartnerDist < initialPartnerDist - 2.0, "Squadmate must converge toward outnumbered partner");

    // Move br-bot-9..12 away before testing post-knockdown calm looting
    for (const id of ["br-bot-9", "br-bot-10", "br-bot-11", "br-bot-12"]) {
      groundEntity(game, id, { x: -410, y: 0, z: -410 });
    }

    // 5. Calm Post-Knockdown Looting & Armor Plating:
    // Place br-bot-13 next to downed enemy br-bot-15 (who has standing teammate br-bot-16 far away so br-bot-15 stays downed),
    // give br-bot-13 damaged armor + reserve plates and an unopened crate 2m away.
    // Verify br-bot-13 does NOT shoot the downed enemy, and instead calmly opens the crate and puts on armor plates!
    groundEntity(game, "br-bot-13", { x: 240, y: 0, z: 240, angle: 0 });
    groundEntity(game, "br-bot-15", { x: 240, y: 0, z: 234, angle: 0 });
    groundEntity(game, "br-bot-16", { x: 350, y: 0, z: 350, angle: 0 }); // keeps team 15/16 alive when 15 is downed

    c.get("br-bot-15", "Transform").spawnProtectedUntil = 0;
    const armor15 = c.get("br-bot-15", "Armor");
    if (armor15) armor15.current = 0;
    health.applyDamage("br-bot-15", 500, { attackerId: "br-bot-13", weaponId: "rifle", now });
    assert.equal(injury.isDowned("br-bot-15"), true, "Enemy br-bot-15 must be knocked down");

    const armor13 = c.get("br-bot-13", "Armor");
    armor13.current = 20;
    armor13.reservePlates = 2;
    const postKnockCrate = { id: "post-knockdown-test-crate", x: 241.2, y: 0, z: 240.5, loot: "rifle", opened: false };
    map.crates.push(postKnockCrate);
    c.get("br-bot-13", "Bot").nextThinkAt = 0;

    let shotsAtDowned = 0;
    game.host.events.on("combat:damage", ({ attackerId, targetId, weaponId }) => {
      if (attackerId === "br-bot-13" && targetId === "br-bot-15" && weaponId !== "bleed-out") {
        shotsAtDowned += 1;
      }
    });

    for (let step = 0; step < 15; step += 1) {
      now += 50;
      s.get("match-api").step(0.05, now);
    }

    assert.equal(shotsAtDowned, 0, "Bot must ignore harmless downed enemy and not execute them while looting/plating");
    assert.equal(c.get("br-bot-13", "Bot").squadRoleActive, "post-knockdown-loot");
    assert.equal(postKnockCrate.opened, true, "Bot must calmly open the nearby crate while the enemy is knocked down");
    assert.equal(armorService.isPlating("br-bot-13"), true, "Bot must calmly start putting on armor plates after knocking down the threat");

    // 6. Active Safe-Zone Patrol When No Target Exists:
    // Place squad br-bot-11 and br-bot-12 in open terrain inside the safe zone with no enemies and no unopened crates nearby.
    // Verify they continuously move and patrol instead of bunching up at (0, 0) or standing still!
    const roamStart11 = { x: -160, y: 0, z: -140, angle: 0 };
    const roamStart12 = { x: -156, y: 0, z: -140, angle: 0 };
    groundEntity(game, "br-bot-11", roamStart11);
    groundEntity(game, "br-bot-12", roamStart12);
    c.get("br-bot-11", "Bot").lastKnownTargetId = null;
    c.get("br-bot-12", "Bot").lastKnownTargetId = null;
    c.get("br-bot-11", "Bot").outnumberedCallout = null;
    c.get("br-bot-12", "Bot").outnumberedCallout = null;
    c.get("br-bot-11", "Bot").freeRoamWaypoint = null;
    c.get("br-bot-12", "Bot").freeRoamWaypoint = null;
    c.get("br-bot-11", "Bot").nextThinkAt = 0;
    c.get("br-bot-12", "Bot").nextThinkAt = 0;

    for (let step = 0; step < 60; step += 1) {
      now += 50;
      s.get("match-api").step(0.05, now);
    }

    const roamEnd11 = c.get("br-bot-11", "Transform");
    const roamEnd12 = c.get("br-bot-12", "Transform");
    const moved11 = Math.hypot(roamEnd11.x - roamStart11.x, roamEnd11.z - roamStart11.z);
    const moved12 = Math.hypot(roamEnd12.x - roamStart12.x, roamEnd12.z - roamStart12.z);
    assert(moved11 >= 6, `Targetless bot br-bot-11 inside safe zone must actively patrol (moved ${moved11.toFixed(2)}m)`);
    assert(moved12 >= 6, `Targetless squadmate br-bot-12 inside safe zone must actively patrol (moved ${moved12.toFixed(2)}m)`);
  } finally {
    await game.host.stop();
  }
});

test("Player squad follows closely, boards player's vehicle with announcements, self-revives quietly under covering fire, and emits combat callouts", async () => {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  const s = game.host.services;
  const c = game.host.components;
  try {
    const joined = s.get("match-api").connectHuman(PLAYER);
    const [mate1, mate2, mate3] = joined.squadmates;
    let now = Date.now() + 3000;
    s.get("battle-royale").arm(now);

    const entities = s.get("entities");
    const vehicles = s.get("vehicles");
    const health = s.get("health");
    const injury = s.get("injury");

    // Remove unrelated bots and park br-bot-5 & br-bot-6 (team 3) safely inside zone until step 3
    const enemy1 = "br-bot-5";
    const enemy2 = "br-bot-6";
    const keepIds = new Set([PLAYER, mate1, mate2, mate3, enemy1, enemy2]);
    for (const ent of [...entities.all()]) {
      if (ent.bot && !keepIds.has(ent.id)) entities.remove(ent.id);
    }
    groundEntity(game, enemy1, { x: -200, y: 0, z: -200 });
    groundEntity(game, enemy2, { x: -204, y: 0, z: -200 });

    // 1. Eager following on foot: move player ahead and confirm squadmates sprint to stay tight
    groundEntity(game, PLAYER, { x: 10, y: 0, z: 10, angle: 0 });
    groundEntity(game, mate1, { x: 12, y: 0, z: 14, angle: 0 });
    groundEntity(game, mate2, { x: 8, y: 0, z: 14, angle: 0 });
    groundEntity(game, mate3, { x: 10, y: 0, z: 16, angle: 0 });
    for (let step = 0; step < 80; step += 1) {
      now += 50;
      game.api.handleInput(PLAYER, { forward: 1, sprint: false }, now);
      game.api.step(0.05, now);
    }
    game.api.handleInput(PLAYER, {}, now);
    const playerAfterWalk = c.get(PLAYER, "Transform");
    for (const mateId of [mate1, mate2, mate3]) {
      const mt = c.get(mateId, "Transform");
      const dist = Math.hypot(mt.x - playerAfterWalk.x, mt.z - playerAfterWalk.z);
      assert(dist <= 9.5, `Squadmate ${mateId} must keep tight pace while player walks (dist=${dist.toFixed(2)}m)`);
    }

    // 2. Whole squad boards player's vehicle + passenger events carry teammate names
    const car = vehicles.snapshot().find((v) => !v.occupied);
    assert(car, "Need an available vehicle for squad boarding test");
    groundEntity(game, PLAYER, { x: car.x + 1.5, y: 0, z: car.z, angle: 0 });
    groundEntity(game, mate1, { x: car.x + 3.2, y: 0, z: car.z + 1.2, angle: 0 });
    groundEntity(game, mate2, { x: car.x - 2.6, y: 0, z: car.z + 1.8, angle: 0 });
    groundEntity(game, mate3, { x: car.x + 1.0, y: 0, z: car.z - 3.0, angle: 0 });
    game.drainEvents();

    assert.equal(vehicles.enter(PLAYER, now, car.id), true, "Player must enter vehicle");
    for (let step = 0; step < 45; step += 1) {
      now += 50;
      game.api.step(0.05, now);
    }
    for (const mateId of [mate1, mate2, mate3]) {
      assert.equal(vehicles.isPassenger(mateId), true, `Squadmate ${mateId} must board player's vehicle`);
    }
    assert.equal(vehicles.stateFor(car.id).passengerIds.length, 3, "All 3 squadmates fit as passengers");

    const boardPackets = game.api.eventsForPlayer(PLAYER, game.drainEvents());
    const passengerEnters = boardPackets.filter((p) => p.event === "vehicle:passenger-entered");
    assert(passengerEnters.some((p) => p.payload.entityName === "Напарник 2"), "Player must receive boarding notice for Напарник 2");
    assert(passengerEnters.some((p) => p.payload.entityName === "Напарник 3"), "Player must receive boarding notice for Напарник 3");

    assert.equal(vehicles.exit(PLAYER, now, "interact"), true, "Player exits vehicle");
    for (const mateId of [mate1, mate2, mate3]) {
      assert.equal(vehicles.isPassenger(mateId), false, `Squadmate ${mateId} must exit vehicle when player exits`);
    }

    // 3. Callouts & quiet self-revive under covering fire while enemy focuses standing survivor:
    // Place mate2 & mate3 far away so only PLAYER (standing, shooting) and mate1 (downed) face enemy1/enemy2.
    groundEntity(game, mate2, { x: -300, y: 0, z: 300 });
    groundEntity(game, mate3, { x: -305, y: 0, z: 300 });
    groundEntity(game, PLAYER, { x: 180, y: 0, z: 180, angle: 0 });
    groundEntity(game, mate1, { x: 188, y: 0, z: 175, angle: 0 });
    groundEntity(game, enemy1, { x: 180, y: 0, z: 168, angle: Math.PI }); // 12m from standing PLAYER, 10.6m from downed mate1
    groundEntity(game, enemy2, { x: 183, y: 0, z: 165, angle: Math.PI });
    s.get("weapons").grant(enemy1, "rifle");

    game.drainEvents();
    c.get(mate1, "Transform").spawnProtectedUntil = 0;
    const armor1 = c.get(mate1, "Armor");
    if (armor1) armor1.current = 0;
    health.applyDamage(mate1, 500, { attackerId: enemy1, weaponId: "rifle", now });
    assert.equal(injury.isDowned(mate1), true);

    const mateDownEvents = game.api.eventsForPlayer(PLAYER, game.drainEvents());
    const mateDownPacket = mateDownEvents.find((p) => p.event === "injury:downed" && p.payload.entityId === mate1);
    assert(mateDownPacket, "Player must receive injury:downed for teammate");
    assert.equal(injuryMessage(mateDownPacket.event, mateDownPacket.payload, PLAYER), "Напарник ранен.");

    let shotsAtDownedMate = 0;
    let mateSelfReviveStarted = false;
    let mateSelfRevived = false;
    game.host.events.on("combat:damage", ({ targetId, weaponId }) => {
      if (targetId === mate1 && weaponId !== "bleed-out") shotsAtDownedMate += 1;
    });
    game.host.events.on("injury:stim-started", ({ entityId, downed }) => {
      if (entityId === mate1 && downed) mateSelfReviveStarted = true;
    });
    game.host.events.on("injury:stim-completed", ({ entityId, revived }) => {
      if (entityId === mate1 && revived) mateSelfRevived = true;
    });

    // Keep player standing & healthy during firefight while mate1 quietly self-revives (~7.5s total)
    for (let step = 0; step < 155; step += 1) {
      now += 50;
      const php = c.get(PLAYER, "Health");
      if (php) php.current = php.maximum;
      game.api.step(0.05, now);
      if (mateSelfRevived) break;
    }
    assert.equal(shotsAtDownedMate, 0, "Enemies must keep shooting the standing survivor instead of executing downed mate");
    assert.equal(mateSelfReviveStarted, true, "Downed teammate must start quiet self-revive promptly while ally draws fire");
    assert.equal(mateSelfRevived, true, "Downed teammate must complete quiet self-revive");
    assert.equal(injury.isDowned(mate1), false, "Self-revived teammate must be back on their feet");

    // 4. Verify remaining callouts: "Он ранен.", "Моего напарника там убили.", "Напарник умер."
    game.drainEvents();
    c.get(enemy1, "Transform").spawnProtectedUntil = 0;
    const armorE1 = c.get(enemy1, "Armor");
    if (armorE1) armorE1.current = 0;
    health.applyDamage(enemy1, 500, { attackerId: PLAYER, weaponId: "rifle", now });
    assert.equal(injury.isDowned(enemy1), true);
    const enemyDownPackets = game.api.eventsForPlayer(PLAYER, game.drainEvents());
    assert(
      enemyDownPackets.some((p) => p.event === "squad:callout" && p.payload.text === "Он ранен."),
      "Knocking down an enemy must deliver 'Он ранен.' callout",
    );

    health.applyDamage(enemy1, 500, { attackerId: PLAYER, weaponId: "rifle", now });
    const enemyKillPackets = game.api.eventsForPlayer(PLAYER, game.drainEvents());
    assert(
      enemyKillPackets.some((p) => p.event === "squad:callout" && p.payload.text === "Моего напарника там убили."),
      "Killing an enemy whose partner is alive must deliver 'Моего напарника там убили.'",
    );

    health.applyDamage(mate1, 999, { attackerId: enemy2, weaponId: "rifle", now });
    if (injury.isDowned(mate1)) {
      health.applyDamage(mate1, 999, { attackerId: enemy2, weaponId: "rifle", now });
    }
    const mateKillPackets = game.api.eventsForPlayer(PLAYER, game.drainEvents());
    assert(
      mateKillPackets.some((p) => p.event === "squad:callout" && p.payload.text === "Напарник умер."),
      "Losing a squadmate must deliver 'Напарник умер.' callout",
    );
  } finally {
    await game.host.stop();
  }
});





