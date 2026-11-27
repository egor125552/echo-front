import assert from "node:assert/strict";
import test from "node:test";
import { createEchoFrontGame } from "../src/server/game.js";
import {
  audibilityRadiusForStage,
  buildingsInBlastZone,
  computeDebrisLaunchVelocity,
  computeDestructionDelayMs,
  evaluateBlastPartDamage,
  evaluateBuildingStage,
  findUnsupportedUpperParts,
  floorBandForPart,
} from "../src/game/building-destruction-model.js";
import { detectNearbyCover } from "../src/game/crouch-squad-inventory.js";
import { hapticCueForGameEvent } from "../public/client/plugins/haptic-feedback.js";
import { encodeSnapshotMessage, decodeSnapshotMessage } from "../public/client/snapshot-delta.js";
import { setup as setupDestructionAudio } from "../public/client/plugins/building-destruction-audio.js";

test("pure destruction model: 185m Mini-Nuke reaches past 80m, glass overpressure shatters up to ~260m, debris flies outward, upper floors cascade, and aim blast-zone solver detects buildings", () => {
  const origin = { x: 0, y: 0, z: 0 };

  // 1. Building wall at 130m MUST take heavy damage from 185m Mini-Nuke (old code clamped at 80m!)
  const wall130 = { pos: { x: 130, y: 1.5, z: 0 }, type: "building-wall", m: "stone", hp: 1.15 };
  const hit130 = evaluateBlastPartDamage(wall130, origin, { blastRadius: 185, major: true, kind: "nuke" });
  assert.equal(hit130.hit, true, "185m Mini-Nuke must damage walls at 130m (no 80m clamp)");
  assert.ok(hit130.damage >= 1.15, `Wall at 130m should breach from 185m nuke, got ${hit130.damage}`);

  // 2. Glass window at 235m shatters from nuclear overpressure shockwave
  const glass235 = { pos: { x: 235, y: 1.6, z: 0 }, type: "building-window", m: "glass", hp: 0.28 };
  const glassHit = evaluateBlastPartDamage(glass235, origin, { blastRadius: 185, major: true, kind: "nuke" });
  assert.equal(glassHit.hit, true, "Glass at 235m must shatter from 185m nuke overpressure wave");
  assert.ok(glassHit.damage >= 0.28, `Glass overpressure damage expected >= 0.28, got ${glassHit.damage}`);

  // 3. Staggered timing: glass shatters on shockwave front, structural & cascade collapses ring out AFTER explosion peak
  const glassDelay = computeDestructionDelayMs({ distance: 40, blastRadius: 185, material: "glass", major: true, seed: 12 });
  const midWallDelay = computeDestructionDelayMs({ distance: 120, blastRadius: 185, material: "stone", major: true, seed: 12 });
  const cascadeDelay = computeDestructionDelayMs({ material: "stone", major: true, cascaded: true, floorBand: 1, seed: 12 });
  assert.ok(glassDelay < 420, `Close glass should shatter rapidly (<420ms), got ${glassDelay}ms`);
  assert.ok(midWallDelay > 1300, `Mid-range wall should collapse cleanly after main nuclear crack (>1300ms), got ${midWallDelay}ms`);
  assert.ok(cascadeDelay >= 1900, `2nd-floor cascade should roll out post-blast (>=1900ms), got ${cascadeDelay}ms`);

  // 4. Outward + upward ballistic launch velocity for blasted rubble
  const launch = computeDebrisLaunchVelocity({
    partPos: { x: 20, y: 2, z: 0 },
    blastOrigin: origin,
    blastPower: 2.6,
    blastRadius: 185,
    material: "stone",
    seed: 42,
  });
  assert.ok(launch.linvel.x > 6, `Rubble east of blast must fly east (+X), got vx=${launch.linvel.x}`);
  assert.ok(launch.linvel.y > 4, `Rubble must loft upward (+Y), got vy=${launch.linvel.y}`);
  const angSpeed = Math.hypot(launch.angvel.x, launch.angvel.y, launch.angvel.z);
  assert.ok(angSpeed > 2, `Rubble must tumble with angular velocity, got ${angSpeed}`);

  // 5. Structural cascade solver: breaking >=50% of 1st-floor walls collapses 2nd-floor slab, walls, and stairs
  const mockBuilding = [
    { id: "w1", type: "building-wall", baseY: 0, state: "broken", protectedSupport: false },
    { id: "w2", type: "building-wall", baseY: 0, state: "broken", protectedSupport: false },
    { id: "w3", type: "building-wall", baseY: 0, state: "intact", protectedSupport: false },
    { id: "gfloor", type: "building-floor", baseY: 0, state: "intact", protectedSupport: true },
    { id: "stair1", type: "building-stair", baseY: 0, state: "intact", protectedSupport: false },
    { id: "ufloor", type: "building-floor", baseY: 3.2, state: "intact", protectedSupport: false },
    { id: "uwall", type: "building-wall", baseY: 3.2, state: "intact", protectedSupport: false },
    { id: "roof", type: "building-parapet", baseY: 6.4, state: "intact", protectedSupport: false },
  ];
  assert.equal(floorBandForPart(mockBuilding[0]), 0);
  assert.equal(floorBandForPart(mockBuilding[5]), 1);
  assert.equal(floorBandForPart(mockBuilding[7]), 2);
  const unsupported = findUnsupportedUpperParts(mockBuilding);
  const unsupportedIds = new Set(unsupported.map((p) => p.id));
  assert.equal(unsupportedIds.has("ufloor"), true, "2nd floor slab must cascade when ground support fails");
  assert.equal(unsupportedIds.has("uwall"), true, "2nd floor wall must cascade");
  assert.equal(unsupportedIds.has("roof"), true, "Roof parapet must cascade");
  assert.equal(unsupportedIds.has("stair1"), true, "Stair from failed floor must cascade");
  assert.equal(unsupportedIds.has("gfloor"), false, "Protected ground slab must NEVER collapse into void");

  // 6. Audibility radii extend far past old 150m cutoff
  assert.ok(audibilityRadiusForStage("break", "stone", false) >= 400);
  assert.ok(audibilityRadiusForStage("collapse", "stone", true) >= 600);

  // 7. Blast-zone target helper returns hit buildings nearest-first
  const blastHits = buildingsInBlastZone(
    [
      { id: "warehouse", name: "Склад", x: 60, z: 0, bounds: { minX: 48, maxX: 72, minZ: -12, maxZ: 12 } },
      { id: "forest-hut", name: "Лесная хижина", x: -110, z: -75, bounds: { minX: -120, maxX: -100, minZ: -85, maxZ: -65 } },
      { id: "far-out", name: "Дальний дом", x: 600, z: 600, bounds: { minX: 590, maxX: 610, minZ: 590, maxZ: 610 } },
    ],
    { x: 55, z: 0 },
    185,
  );
  assert.equal(blastHits.length, 2);
  assert.equal(blastHits[0].id, "warehouse");
  assert.equal(blastHits[0].direct, true);
  assert.equal(blastHits[1].id, "forest-hut");

  // 8. Cover ignores destroyed walls & haptics fire for building:collapse
  const intactCover = detectNearbyCover({
    position: { x: 0, y: 0, z: 0 },
    obstacles: [{ id: "w-1", kind: "building-wall", x: 0.8, y: 0, z: 0, width: 0.4, depth: 3, height: 2.8 }],
  });
  assert.equal(intactCover.active, true);
  const brokenCover = detectNearbyCover({
    position: { x: 0, y: 0, z: 0 },
    obstacles: [{ id: "w-1", kind: "building-wall", destroyed: true, x: 0.8, y: 0, z: 0, width: 0.4, depth: 3, height: 2.8 }],
  });
  assert.equal(brokenCover.active, false, "Destroyed walls must NOT count as valid cover");

  const collapseCue = hapticCueForGameEvent(
    { event: "building:collapse", payload: { stage: "collapsed", x: 100, z: 0 } },
    "p1",
    { distanceToListener: 160 },
  );
  assert.ok(collapseCue && collapseCue.kind === "building:collapse", "Collapse at 160m should trigger rumble haptic");
  const summary = evaluateBuildingStage(mockBuilding);
  assert.equal(summary.stage, "breached");
});

test("live Battle Royale: 185m Mini-Nuke destroys building at 120m+, updates ruins location/surface, skips destroyed doors, preserves delta-v1 snapshots, and resets cleanly", async () => {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  const { host, api } = game;
  const destruction = host.services.get("building-destruction");
  const specialOps = host.services.get("special-ops");
  const physics = host.services.get("physics");
  const map = host.services.get("map");

  const playerId = "p1";
  let now0 = 50_000;
  api.connectHuman(playerId, now0);
  for (let i = 0; i < 65; i += 1) {
    now0 += 50;
    api.step(0.05, now0);
  }
  const para = host.components.get(playerId, "Parachute");
  if (para) {
    para.phase = "landed";
    para.airborne = false;
  }

  // Locate two-storey-house to verify multi-floor cascade & long-range nuke
  const initialSummary = destruction.summary();
  const houseCenter = initialSummary.buildings["two-storey-house"]?.center;
  assert.ok(houseCenter, "Battle Royale map must include two-storey-house");

  // Place player 220m away from the house (safe nuke distance!) to verify audibility beyond old 150m cutoff
  const listenerPos = { x: houseCenter.x - 220, y: 0, z: houseCenter.z };
  const transform = host.components.get(playerId, "Transform");
  transform.x = listenerPos.x;
  transform.y = listenerPos.y;
  transform.z = listenerPos.z;
  physics.teleport(playerId, listenerPos);

  api.step(0.05, now0 + 50);
  now0 += 50;
  const snapBefore = api.snapshotFor(playerId, now0);
  game.drainEvents();

  // Detonate a 185m Mini-Nuke 115m away from the two-storey house (beyond old 80m clamp!)
  const nukePos = {
    x: houseCenter.x + 115,
    y: 0,
    z: houseCenter.z,
  };
  host.events.emit("nuke:detonated", {
    ownerId: playerId,
    x: nukePos.x,
    y: nukePos.y,
    z: nukePos.z,
    blastRadius: 185,
    now: now0 + 50,
  });

  // Step 5.0 seconds of simulated time so wave + staggered post-blast cascade collapse fully unfold
  const receivedEvents = [];
  let maxRubbleSpeed = 0;
  for (let i = 1; i <= 100; i += 1) {
    api.step(0.05, now0 + 50 + i * 50);
    const packets = api.eventsForPlayer(playerId, game.drainEvents());
    receivedEvents.push(...packets);
    const stats = physics.stats();
    if (stats.dynamicBodies > 0) {
      const summary = destruction.summary();
      if (summary.debris > 0) {
        physics.world.forEachCollider?.((c) => {
          const info = physics.colliderInfo(c)?.worldObject;
          if (info?.kind === "building-rubble" && info.bodyId) {
            const st = physics.dynamicBodyState(info.bodyId);
            if (st) {
              const spd = Math.hypot(st.linvel.x, st.linvel.y, st.linvel.z);
              if (spd > maxRubbleSpeed) maxRubbleSpeed = spd;
            }
          }
        });
      }
    }
  }

  const afterNuke = destruction.summary();
  assert.ok(afterNuke.broken >= 12, `185m Mini-Nuke at 115m should break many panels, broke ${afterNuke.broken}`);
  const houseState = afterNuke.buildings["two-storey-house"];
  assert.ok(houseState && houseState.broken >= 6, `two-storey-house at 115m must be heavily damaged/collapsed, got ${JSON.stringify(houseState)}`);
  assert.ok(maxRubbleSpeed > 3.5, `Rubble must launch with real blast velocity (>3.5 m/s), got ${maxRubbleSpeed.toFixed(2)}`);

  const materialEvents = receivedEvents.filter((p) => p.event === "building:material");
  const collapseEvents = receivedEvents.filter((p) => p.event === "building:collapse");
  assert.ok(materialEvents.length >= 4, `Listener 220m away must receive building:material events, got ${materialEvents.length}`);
  assert.ok(collapseEvents.length >= 1, `Listener 220m away must receive building:collapse event, got ${collapseEvents.length}`);

  // Verify delta-v1 snapshot codec preserves snapshot.destruction (parts, buildings, fires)
  const snapAfter = api.snapshotFor(playerId, now0 + 5100);
  const encodedDelta = encodeSnapshotMessage(snapAfter, snapBefore, 0, JSON.stringify({ type: "snapshot", snapshot: snapBefore }).length);
  const decoded = decodeSnapshotMessage(JSON.parse(encodedDelta.message), snapBefore, 0);
  assert.ok(Array.isArray(decoded.snapshot.destruction?.buildings), "delta-v1 must preserve snapshot.destruction.buildings");
  assert.ok(decoded.snapshot.destruction.parts.length >= 12, "delta-v1 must preserve broken parts");
  const decodedHouse = decoded.snapshot.destruction.buildings.find((b) => b.id === "two-storey-house");
  assert.ok(decodedHouse && (decodedHouse.stage === "collapsed" || decodedHouse.stage === "breached"), "delta-v1 must preserve building collapse stage");

  for (const fire of snapAfter.destruction?.fires ?? []) {
    assert.ok(fire.y >= 0 && fire.y <= 7, `Fire y=${fire.y} should be snapped to a floor/ground surface`);
  }

  // Test real handleNukeAction aiming callout & direct warehouse collapse -> ruins location & rubble surface
  const warehouseCenter = initialSummary.buildings.warehouse?.center;
  assert.ok(warehouseCenter, "Battle Royale map must include warehouse");
  transform.x = warehouseCenter.x;
  transform.y = 0;
  transform.z = warehouseCenter.z;
  transform.angle = Math.PI / 2; // facing East into forest
  physics.teleport(playerId, { x: warehouseCenter.x, y: 0, z: warehouseCenter.z });
  specialOps.grantNuke(playerId, 2);
  game.drainEvents();

  // Aim at default 215m facing East from inside Warehouse -> warns player they are inside building & aiming into forest!
  specialOps.handleNukeAction(playerId, "nuke-aim", null, now0 + 5200);
  const aimEvents = game.drainEvents().filter((p) => p.event === "nuke:aiming");
  assert.equal(aimEvents.length, 1);
  assert.ok(
    aimEvents[0].payload.text.includes("4 или 115") || aimEvents[0].payload.targetBuildings?.length > 0,
    `nuke-aim inside building should warn or list target buildings, got: ${aimEvents[0].payload.text}`,
  );

  // Launch at 4m directly inside Warehouse (even if player dies, collapse MUST finish!)
  specialOps.handleNukeAction(playerId, "nuke-launch", 4, now0 + 5300);
  const launchEvents = game.drainEvents().filter((p) => p.event === "nuke:launched");
  assert.equal(launchEvents.length, 1);
  assert.ok(launchEvents[0].payload.targetBuildings.includes("Склад"), "4m launch inside Warehouse must report Склад in targetBuildings");

  for (let i = 1; i <= 160; i += 1) {
    api.step(0.05, now0 + 5300 + i * 50);
  }
  const afterWarehouseNuke = destruction.summary();
  assert.equal(afterWarehouseNuke.buildings.warehouse.stage, "collapsed", "Direct 4m nuke must completely collapse Warehouse");
  assert.equal(map.locationAt({ x: warehouseCenter.x, y: 0, z: warehouseCenter.z }), "Руины: Склад", "Collapsed warehouse must announce as Руины: Склад");
  assert.equal(map.surfaceAt({ x: warehouseCenter.x, y: 0, z: warehouseCenter.z }), "stone", "Collapsed warehouse must use crunchy stone rubble footsteps");

  // Destroyed door must NOT be toggleable or reported by map.interact
  const brokenDoor = (map.doors ?? []).find((d) => (d.buildingId ?? "warehouse") === "warehouse" && d.destroyed);
  assert.ok(brokenDoor, "Warehouse nuke should mark warehouse doors destroyed");
  const interactResult = map.interact({ entityId: playerId, x: brokenDoor.x, y: brokenDoor.y, z: brokenDoor.z, now: now0 + 14_000 });
  assert.notEqual(interactResult?.type, "door", "Destroyed door must be skipped by map.interact");

  // Test round reset restores everything cleanly
  host.events.emit("battle-royale:started", { now: now0 + 15_000 });
  const afterReset = destruction.summary();
  assert.equal(afterReset.broken, 0, "Round reset must restore all broken parts");
  assert.equal(afterReset.debris, 0, "Round reset must remove all dynamic rubble");
  assert.equal(afterReset.fires, 0, "Round reset must clear all fires");
  assert.notEqual(map.locationAt({ x: warehouseCenter.x, y: 0, z: warehouseCenter.z }), "Руины: Склад", "Reset must restore intact Warehouse location name");

  // Test wall-pierce, gunshot glass shatter, electro-slam & vehicle crash all break parts cleanly!
  const wallTarget = (map.walls ?? []).find((w) => w.buildingId === "two-storey-house" && w.kind === "building-wall");
  const windowTarget = (map.walls ?? []).find((w) => w.buildingId === "two-storey-house" && w.kind === "building-window");
  assert.ok(wallTarget, "two-storey-house should have a building-wall");
  assert.ok(windowTarget, "two-storey-house should have a building-window");

  host.events.emit("projectile:impact", {
    weaponId: "rifle",
    x: windowTarget.x,
    y: windowTarget.y + (windowTarget.height ?? 2) / 2,
    z: windowTarget.z,
    now: now0 + 15_100,
  });
  api.step(0.05, now0 + 15_160);
  assert.equal(windowTarget.destroyed, true, "Rifle bullet impact must shatter glass building-window");

  host.events.emit("cannon:wall-pierce", {
    ownerId: playerId,
    colliderHandle: wallTarget.collider.handle,
    x: wallTarget.x,
    y: wallTarget.y + 1.2,
    z: wallTarget.z,
    vx: 180,
    vy: 0,
    vz: 0,
    chargeRatio: 0.7,
    blastRadius: 7.5,
    now: now0 + 15_200,
  });
  for (let i = 1; i <= 6; i += 1) api.step(0.05, now0 + 15_200 + i * 50);
  assert.equal(wallTarget.destroyed, true, "Smertonos piercing wall hit must blast open the wall panel");

  const hutCenter = destruction.summary().buildings["forest-hut"]?.center;
  assert.ok(hutCenter, "Battle Royale map must include forest-hut");
  const beforeSlam = destruction.summary().broken;
  host.events.emit("special:electro-jump", {
    entityId: playerId,
    phase: "slam",
    x: hutCenter.x,
    y: 0,
    z: hutCenter.z,
    blastRadius: 22,
    now: now0 + 15_600,
  });
  for (let i = 1; i <= 30; i += 1) api.step(0.05, now0 + 15_600 + i * 50);
  assert.ok(destruction.summary().broken > beforeSlam, "Electro Meteor Slam must destroy nearby wooden building panels");

  const warehousePart = (map.walls ?? []).find((w) => (w.buildingId ?? "warehouse") === "warehouse" && !w.destroyed && w.kind === "building-window")
    ?? (map.walls ?? []).find((w) => (w.buildingId ?? "warehouse") === "warehouse" && !w.destroyed && w.kind === "building-wall");
  assert.ok(warehousePart, "Warehouse must have intact wall/window for vehicle crash test");
  const beforeCrash = destruction.summary().broken;
  host.events.emit("vehicle:impact", {
    vehicleId: "veh-test",
    driverId: playerId,
    crashSeverity: 24,
    speedBefore: 24,
    deltaSpeed: 18,
    x: warehousePart.x,
    y: warehousePart.y,
    z: warehousePart.z,
    now: now0 + 17_200,
  });
  for (let i = 1; i <= 10; i += 1) api.step(0.05, now0 + 17_200 + i * 50);
  assert.ok(destruction.summary().broken > beforeCrash, "High-speed vehicle crash must smash nearby building panel");
});

test("client building-destruction-audio recovers from cold iOS Safari cache and plays audible collapse layers instead of dropping", async () => {
  let allowLoad = false;
  const played = [];
  const listeners = new Map();
  const services = new Map();

  const fakeAudio = {
    load(url) {
      if (!allowLoad) return Promise.reject(new Error("AudioContext suspended before gesture"));
      return Promise.resolve({ url, duration: 2.5 });
    },
    playSpatialBuffer(buffer, pos, opts) {
      played.push({ url: buffer.url, pos, opts });
      return { source: { addEventListener() {}, stop() {} }, update() {}, setGain() {}, updateOcclusion() {}, fadeOut() {} };
    },
  };
  services.set("audio", fakeAudio);
  services.set("network", { playerId: "p1" });

  const ctx = {
    services: {
      get: (k) => services.get(k),
      provide: (k, v) => services.set(k, v),
    },
    events: {
      on(name, fn) {
        const list = listeners.get(name) ?? [];
        list.push(fn);
        listeners.set(name, list);
      },
      emit(name, payload) {
        for (const fn of listeners.get(name) ?? []) fn(payload);
      },
    },
  };

  await setupDestructionAudio(ctx);
  // Wait a tick for initial pre-gesture warm() rejections to settle
  await new Promise((r) => setTimeout(r, 20));

  // Now simulate iOS Safari unlocking audio right as the player enters a match,
  // even BEFORE warm() finishes — cold cache must decode & play instead of returning null!
  allowLoad = true;
  ctx.events.emit("game:event", {
    event: "building:collapse",
    payload: {
      buildingId: "warehouse",
      buildingName: "Склад",
      stage: "collapsed",
      x: 60,
      y: 2,
      z: 0,
      radius: 680,
      occlusion: 0.12,
    },
  });

  await new Promise((r) => setTimeout(r, 1300));
  assert.ok(played.length >= 4, `Cold-cache collapse must decode & play multi-layer sounds, got ${played.length}`);
  assert.ok(played.some((p) => p.opts.gain >= 1.4), "Full collapse primary layer must play with high gain (>=1.4) to cut through nuke tail");
  assert.ok(played.some((p) => p.url.includes("stone-fall")), "Full collapse must play recorded stone-fall collapse layer");
  ctx.events.emit("network:disconnected");
});

