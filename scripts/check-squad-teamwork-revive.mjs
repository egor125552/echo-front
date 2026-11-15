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

test("downed teammates appear in the Map (Карта) at 15-20m and trigger proximity prompt at 2m", async () => {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  const s = game.host.services;
  let now = Date.now() + 8000;
  try {
    const joined = game.api.connectHuman(PLAYER);
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

    // Down mate1 at 18m
    s.get("health").applyDamage(mate1, 999, { attackerId: "br-bot-5", weaponId: "rifle", now });
    assert.equal(s.get("injury").isDowned(mate1), true);

    const snapshot = game.api.snapshotFor(PLAYER, now);
    const mapItem = snapshot.navigation?.items?.find((item) => item.id === `teammate:${mate1}`);
    assert(mapItem, "Downed teammate at 18m must appear in snapshot.navigation.items (Карта)");
    assert.equal(mapItem.kind, "teammate");
    assert.equal(mapItem.name, "Лежащий напарник 1");
    assert(Math.abs(mapItem.distance - 18) < 0.5);

    // Player can select downed teammate from Map and activate route
    game.api.handleInput(PLAYER, {
      navigationSelectTargetId: `teammate:${mate1}`,
      navigationActivateSelected: true,
    }, now);
    const navState = s.get("navigation").stateFor(PLAYER, now);
    assert.equal(navState.active, true);
    assert.equal(navState.target?.id, `teammate:${mate1}`);

    // Move player to 2.0m from downed mate1 and step — must emit injury:downed-teammate-nearby
    game.drainEvents();
    groundEntity(game, PLAYER, { x: 0, y: 0, z: -16.0, angle: 0 });
    now += 50;
    game.api.step(0.05, now);
    const playerEvents = game.api.eventsForPlayer(PLAYER, game.drainEvents());
    const nearbyEvent = playerEvents.find((e) => e.event === "injury:downed-teammate-nearby");
    assert(nearbyEvent, "Approaching within 2m of downed teammate must emit injury:downed-teammate-nearby");
    assert.equal(
      injuryMessage(nearbyEvent.event, nearbyEvent.payload, PLAYER),
      "Лежащий напарник рядом. Можно поднять клавишей E.",
    );
  } finally {
    await game.host.stop();
  }
});
