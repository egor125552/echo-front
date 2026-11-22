import test from "node:test";
import assert from "node:assert/strict";
import { createEchoFrontGame } from "../src/server/game.js";
import { encodeSnapshotMessage, decodeSnapshotMessage } from "../public/client/snapshot-delta.js";
import { TacticalNodeGrid } from "../src/ai/tactical-node-grid.js";
import { setup as setupSpeechSettings } from "../public/client/plugins/speech-settings.js";

test("snapshot-delta recursively diffs nested id-bearing objects and crate arrays losslessly", () => {
  const cratesA = Array.from({ length: 36 }, (_, i) => ({
    id: `crate-${i}`,
    x: i * 12,
    y: 0,
    z: i === 0 ? 0 : -i * 5,
    loot: i % 2 === 0 ? "armor" : "rifle",
    opened: false,
    acousticOcclusion: 0.25,
    beacon: { active: true, radius: 18 },
  }));
  const cratesB = cratesA.map((c, i) => (i === 17 ? { ...c, opened: true } : { ...c }));

  const makeParachute = (alt, vy) => ({
    id: "para-p1",
    airborne: true,
    phase: "deployed",
    altitude: alt,
    verticalVelocity: vy,
    glideSpeed: 11.4,
    turnRate: 0.12,
    canopyHealth: 100,
    windX: 1.2,
    windZ: -0.4,
    groundDistance: alt - 0.5,
    clearance: { left: 25, right: 25, front: 25, back: 25, below: alt - 0.5 },
    telemetry: { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7, h: 8, i: 9, j: 10 },
  });

  const snap1 = {
    now: 1000,
    entities: [{ id: "p1", x: 10, y: 300, z: -20, parachute: makeParachute(300, -5.2) }],
    map: { crates: cratesA },
  };
  const snap2 = {
    now: 1050,
    entities: [{ id: "p1", x: 10.5, y: 299.7, z: -20, parachute: makeParachute(299.7, -5.1) }],
    map: { crates: cratesB },
  };

  const fullEncoded = encodeSnapshotMessage(snap1, null, 0, 0);
  const deltaEncoded = encodeSnapshotMessage(snap2, fullEncoded.next, fullEncoded.sequence, fullEncoded.message.length);

  assert.equal(deltaEncoded.full, false);
  assert.ok(
    deltaEncoded.message.length < fullEncoded.message.length * 0.2,
    `Expected >80% reduction, got delta=${deltaEncoded.message.length} vs full=${fullEncoded.message.length}`,
  );

  const d1 = decodeSnapshotMessage(JSON.parse(fullEncoded.message), null, 0);
  const d2 = decodeSnapshotMessage(JSON.parse(deltaEncoded.message), d1.snapshot, d1.sequence);
  assert.deepEqual(d2.snapshot, snap2);
});

test("developer-settings omits unchanged catalog across steady ticks and resends on reconnect", async () => {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  const api = game.api;
  const playerId = "dev-test-player";
  api.connectHuman(playerId, { name: "DevTester" });

  let now = 1_700_000_000_000;
  const s1 = api.snapshotFor(playerId, now);
  assert.ok(s1.developerSettings?.catalog && typeof s1.developerSettings.catalog === "object");

  // Advance 12 seconds without revision change: catalog must NOT be resent.
  now += 12_000;
  const s2 = api.snapshotFor(playerId, now);
  assert.equal(s2.developerSettings?.catalog, undefined);

  // Reconnect the same player: catalog MUST be sent again.
  api.connectHuman(playerId, { name: "DevTester" });
  now += 50;
  const s3 = api.snapshotFor(playerId, now);
  assert.ok(s3.developerSettings?.catalog && typeof s3.developerSettings.catalog === "object");
});

test("rapier-physics support fast-path matches Rapier raycast and isOpenSky guards boundaries and dynamic bodies", async () => {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  const physics = game.host.services.get("physics");
  const RAPIER = physics.RAPIER;

  const probes = [
    { x: 0, y: 120, z: 0 }, // open ground
    { x: 140, y: 40, z: -22 }, // over warehouse-east
    { x: 0, y: 20, z: -20 }, // near central warehouse
    { x: -300, y: 250, z: 300 }, // far open ground
  ];
  for (const origin of probes) {
    const fast = physics.raycastSupportWorld(origin, { x: 0, y: -1, z: 0 }, 300);
    const ray = new RAPIER.Ray(origin, { x: 0, y: -1, z: 0 });
    const raw = physics.world.castRay(
      ray,
      300,
      true,
      RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC | RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      undefined,
      undefined,
      (collider) => !physics.isCharacterCollider(collider) && !physics.isProjectileCollider(collider),
    );
    assert.ok(fast && raw, `Expected both hits at ${JSON.stringify(origin)}`);
    assert.ok(
      Math.abs(fast.distance - raw.timeOfImpact) < 1e-4,
      `Support raycast mismatch at ${JSON.stringify(origin)}: fast=${fast.distance} raw=${raw.timeOfImpact}`,
    );
  }

  // Open sky high above map center.
  assert.equal(physics.isOpenSky(0, 200, 0, 4), true);
  // Low altitude near building roofs must NOT claim open sky.
  assert.equal(physics.isOpenSky(0, 5, 0, 4), false);
  // Near world-boundary wall (extends up to y=640 at +-1000m) must NOT claim open sky.
  assert.equal(physics.isOpenSky(997, 200, 0, 4), false);
  assert.equal(physics.isOpenSky(0, 200, -997, 4), false);

  // Adding an unmanaged rigid body directly to physics.world (like ragdoll) must disable open-sky shortcut.
  const unmanaged = physics.world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 200, 0),
  );
  try {
    assert.equal(physics.isOpenSky(0, 200, 0, 4), false);
  } finally {
    physics.world.removeRigidBody(unmanaged);
  }
  assert.equal(physics.isOpenSky(0, 200, 0, 4), true);
});

test("vehicle fleet settles all unoccupied vehicles including supercars to sleep and wakes on drive", async () => {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  const api = game.api;
  const vehicles = game.host.services.get("vehicles");
  const physics = game.host.services.get("physics");

  api.connectHuman("driver-test", { name: "DriverTest" });
  let now = 1_700_000_000_000;
  for (let i = 0; i < 120; i += 1) {
    now += 50;
    api.step(0.05, now);
  }

  const summary = vehicles.summary();
  assert.equal(summary.sleepingExtras, 75);
  assert.equal(summary.activeExtraControllers, 0);

  // Verify navigationSnapshot matches snapshot on core navigation fields.
  const fullSnap = vehicles.snapshot();
  const navSnap = vehicles.navigationSnapshot();
  assert.equal(navSnap.length, fullSnap.length);
  const fullById = new Map(fullSnap.map((v) => [v.id, v]));
  for (const nv of navSnap) {
    const fv = fullById.get(nv.id);
    assert.ok(fv, `Missing ${nv.id} in full snapshot`);
    assert.equal(nv.kind, fv.kind);
    assert.equal(nv.driverId, fv.driverId);
    assert.equal(nv.occupied, fv.occupied);
    assert.ok(Math.abs(nv.x - fv.x) < 1e-6);
    assert.ok(Math.abs(nv.z - fv.z) < 1e-6);
  }

  // Wake and drive a sleeping supercar.
  const supercar = fullSnap.find((v) => v.kind === "supercar");
  assert.ok(supercar);
  assert.equal(physics.dynamicBody(supercar.id).isSleeping(), true);
  const movement = game.host.services.get("movement");
  const parachute = game.host.services.get("parachute");
  parachute?.forceLand?.("driver-test", now);
  movement.teleport("driver-test", { x: supercar.x + 1.5, y: 0, z: supercar.z, angle: 0 });
  const entered = vehicles.enter("driver-test", now, supercar.id);
  assert.equal(entered, true);
  assert.equal(physics.dynamicBody(supercar.id).isSleeping(), false);
  vehicles.setInput("driver-test", { forward: 1, strafe: 0, sprint: false, fireHeld: false });
  for (let i = 0; i < 20; i += 1) {
    now += 50;
    api.step(0.05, now);
  }
  const driven = vehicles.stateFor(supercar.id);
  assert.ok(driven.speedKph > 15, `Expected supercar to accelerate after waking, got ${driven.speedKph} km/h`);
});

test("TacticalNodeGrid caches building bounds and segmentHitsBuilding matches brute-force reference", () => {
  const grid = new TacticalNodeGrid({ halfSize: 1000, navigationBuildings: [] });
  const boundsRef1 = grid.buildingBoundsList();
  const boundsRef2 = grid.buildingBoundsList();
  assert.equal(boundsRef1, boundsRef2);

  // Brute-force reference matching original implementation.
  const referenceSegmentHits = (a, b, margin) => {
    const d = Math.hypot((a.x || 0) - (b.x || 0), (a.z || 0) - (b.z || 0));
    const steps = Math.max(4, Math.ceil(d / 4));
    for (let i = 1; i < steps; i += 1) {
      const t = i / steps;
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      if (grid.pointInsideAnyBuilding(x, z, margin)) return true;
    }
    return false;
  };

  let seed = 42;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
  for (let i = 0; i < 200; i += 1) {
    const a = { x: (rand() - 0.5) * 450, z: (rand() - 0.5) * 450 };
    const b = { x: (rand() - 0.5) * 450, z: (rand() - 0.5) * 450 };
    const margin = i % 3 === 0 ? 1.35 : i % 3 === 1 ? 4.5 : 9.5;
    assert.equal(
      grid.segmentHitsBuilding(a, b, margin),
      referenceSegmentHits(a, b, margin),
      `Mismatch on segment ${i}`,
    );
  }

  // Registering a custom blueprint invalidates cached bounds.
  grid.registerBuildingBlueprint({ id: "test-bunker", x: 500, z: 500, width: 20, depth: 20 });
  const boundsRef3 = grid.buildingBoundsList();
  assert.notEqual(boundsRef3, boundsRef1);
  assert.ok(boundsRef3.some((b) => b.id === "test-bunker"));

  // A* pathfinding + danger pruning work cleanly.
  const carPath = grid.findGraphPath({ x: -200, z: -200 }, { x: 200, z: 200 }, "car", 10_000);
  assert.ok(carPath.length >= 2);
  grid.recordFireDanger({ x: 0, z: 0 }, { x: 10, z: 10 }, 1.5, 10_000);
  assert.ok(grid.dangerScoreAt({ x: 10, z: 10 }, 10_500) > 1);
  assert.equal(grid.dangerScoreAt({ x: 10, z: 10 }, 15_000), 0);
  assert.equal(grid.dangerEvents.length, 0);
});

test("speech-settings memoizes updateVoiceSelect to avoid DOM churn on repeated refreshVoices", async () => {
  let replaceCalls = 0;
  const fakeSelect = {
    value: "",
    options: [],
    listeners: {},
    replaceChildren(...nodes) {
      replaceCalls += 1;
      this.options = [...nodes];
    },
    appendChild(node) {
      this.options.push(node);
      return node;
    },
    addEventListener(type, fn) {
      this.listeners[type] = fn;
    },
  };

  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  const prevStorage = globalThis.localStorage;
  const prevNav = globalThis.navigator;
  const prevSetTimeout = globalThis.setTimeout;
  const scheduledTimers = [];

  const voices = [
    { voiceURI: "ru-milena", name: "Milena", lang: "ru-RU", localService: true },
    { voiceURI: "ru-yuri", name: "Yuri", lang: "ru-RU", localService: true },
  ];
  const fakeSpeechSynthesis = {
    getVoices: () => voices,
    addEventListener() {},
  };

  globalThis.setTimeout = (fn, ms, ...args) => {
    const id = prevSetTimeout(fn, ms, ...args);
    scheduledTimers.push(id);
    return id;
  };
  const fakeGrid = { insertBefore() {} };
  globalThis.document = {
    getElementById(id) {
      return id === "speech-voice" ? fakeSelect : null;
    },
    querySelector(sel) {
      if (sel === "#settings-panel .settings-grid") return fakeGrid;
      if (sel === "#speech-voice") return fakeSelect;
      return null;
    },
    createElement(tag) {
      if (tag === "select") return fakeSelect;
      return { tag, value: "", textContent: "", setAttribute() {}, append() {}, appendChild() {} };
    },
    addEventListener() {},
    body: { appendChild() {} },
  };
  globalThis.window = {
    speechSynthesis: fakeSpeechSynthesis,
    SpeechSynthesisUtterance: class {},
    addEventListener() {},
  };
  globalThis.localStorage = { getItem: () => null, setItem() {} };
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { userAgent: "Mozilla/5.0" },
  });

  try {
    const provided = new Map();
    const ctx = {
      services: {
        get: () => null,
        provide: (name, svc) => provided.set(name, svc),
      },
      events: { emit() {}, on() {} },
    };

    await setupSpeechSettings(ctx);
    const service = provided.get("speech");
    assert.ok(service);
    const initialCalls = replaceCalls;
    assert.ok(initialCalls >= 1);

    // Repeating refreshVoices with identical voices must NOT rebuild the <select> DOM.
    service.refreshVoices("before-speak");
    service.refreshVoices("before-speak");
    service.refreshVoices("before-speak");
    assert.equal(replaceCalls, initialCalls);

    // Changing the available voices MUST rebuild the <select> DOM once.
    voices.push({ voiceURI: "ru-katya", name: "Katya", lang: "ru-RU", localService: true });
    service.refreshVoices("voiceschanged");
    assert.equal(replaceCalls, initialCalls + 1);
    service.refreshVoices("before-speak");
    assert.equal(replaceCalls, initialCalls + 1);
  } finally {
    for (const id of scheduledTimers) clearTimeout(id);
    globalThis.setTimeout = prevSetTimeout;
    globalThis.document = prevDoc;
    globalThis.window = prevWin;
    globalThis.localStorage = prevStorage;
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: prevNav });
  }
});
