import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setup as setupRagdollTuning } from "../battle-royale-ragdoll-tuning/server.js";
import { setup as setupDeveloperSettings } from "./server.js";

const isolationTargets = [
  "src/server/match-room.js",
  "public/client/plugins/network.js",
  "src/plugins/battle-royale-parkour-ragdoll/server.js",
  "src/plugins/battle-royale-parachute/server.js",
  "src/plugins/battle-royale-parachute-dynamics/server.js",
  "src/plugins/battle-royale-parachute-rapier-flight/server.js",
];

for (const file of isolationTargets) {
  const source = await readFile(new URL("../../../" + file, import.meta.url), "utf8");
  assert.equal(
    source.includes("developer-settings") || source.includes("developerSettings"),
    false,
    file + " contains developer-mode code; the temporary module is no longer isolated",
  );
}

function createEventBus() {
  const handlers = new Map();
  return {
    on(name, handler) {
      const list = handlers.get(name) ?? [];
      list.push(handler);
      handlers.set(name, list);
    },
    emit(name, payload) {
      for (const handler of handlers.get(name) ?? []) handler(payload);
    },
  };
}

function createServiceRegistry(initial = {}) {
  const services = new Map(Object.entries(initial));
  return {
    get(name) {
      if (!services.has(name)) throw new Error("Missing test service: " + name);
      return services.get(name);
    },
    has(name) {
      return services.has(name);
    },
    provide(name, value) {
      services.set(name, value);
    },
    raw: services,
  };
}

function fakeWorld() {
  return {
    createRigidBody() {
      throw new Error("createRigidBody is not expected in catalog self-check");
    },
  };
}

const events = createEventBus();
const registry = createServiceRegistry({
  physics: { world: fakeWorld() },
});

await setupRagdollTuning({
  services: registry,
  events,
});

const tuning = registry.get("ragdoll-tuning");
const baseline = tuning.profiles();

const tuningCases = {
  linearDamping: 0.071,
  angularDamping: 0.123,
  headAngularDamping: 0.177,
  friction: 0.63,
  x: 7.25,
  y: 1.45,
  z: 6.35,
  speedMode: "vertical",
  scaleStartKph: 37,
  scaleSpanKph: 143,
  scaleMaxExtra: 2.35,
};

for (const reason of tuning.reasons()) {
  const changed = tuning.configureReason(reason, tuningCases);
  assert.equal(changed.reason, reason, reason + ": configure returned wrong reason");
  for (const [field, expected] of Object.entries(tuningCases)) {
    assert.equal(
      changed.profile[field],
      expected,
      reason + ": " + field + " did not reach ragdoll-tuning",
    );
  }

  const current = tuning.currentReason(reason);
  assert.deepEqual(
    current.profile,
    changed.profile,
    reason + ": currentReason differs from configured profile",
  );

  const reset = tuning.resetReason(reason);
  assert.deepEqual(
    reset.profile,
    baseline[reason],
    reason + ": resetReason did not restore defaults",
  );
}

const matchApi = {
  handleInput() {
    return "gameplay-input";
  },
  snapshotFor(playerId) {
    return {
      playerId,
      social: { isHost: true },
    };
  },
};

const physics = { world: fakeWorld() };
const parachute = {
  prepareMovement() {},
  stateFor() { return null; },
};
let selfCollisionEnabled = true;
const stability = {
  setSelfCollisionEnabled(enabled) {
    const next = Boolean(enabled);
    const changed = selfCollisionEnabled !== next;
    selfCollisionEnabled = next;
    return changed;
  },
  isSelfCollisionEnabled() {
    return selfCollisionEnabled;
  },
  summary() {
    return {
      selfCollisionEnabled,
      activeGroups: 0,
      groupedBodies: 0,
      active: [],
      history: [],
      energyLimits: {},
    };
  },
};
let lastRagdollActivation = null;
const ragdollService = {
  isActive() { return false; },
  activate(entityId, options, now) {
    lastRagdollActivation = { entityId, options, now };
    return true;
  },
};
const parkour = {
  summary() {
    return { thresholds: { parkourFlipSpeed: 8.8 } };
  },
};
const entities = {
  all() { return []; },
  get(id) {
    return id === "developer-self-check"
      ? { id, alive: true, bot: false, kind: "human" }
      : null;
  },
};
const components = {
  get(id, name) {
    if (id !== "developer-self-check") return null;
    if (name === "Transform") return { x: 10, y: 2, z: -4, angle: 0 };
    return null;
  },
};
registry.raw.set("social", { isHost: () => true });
registry.raw.set("match-api", matchApi);
registry.raw.set("rapier-physics", physics);
registry.raw.set("physics", physics);
registry.raw.set("parachute", parachute);
registry.raw.set("ragdoll-stability", stability);
registry.raw.set("ragdoll", ragdollService);
registry.raw.set("parkour-ragdoll", parkour);
registry.raw.set("entities", entities);

await setupDeveloperSettings({
  services: registry,
  events,
  components,
});

const developer = registry.get("developer-settings");
const playerId = "developer-self-check";
const catalog = developer.catalog(playerId);
const ragdoll = catalog.categories.find((category) => category.id === "ragdoll");
assert.ok(ragdoll, "Ragdoll category is missing");

const expectedReasons = tuning.reasons();
assert.deepEqual(ragdoll.reasons, expectedReasons, "Developer reason list differs from tuning service");

const genericFields = [
  "linearDamping",
  "angularDamping",
  "headAngularDamping",
  "friction",
  "x",
  "y",
  "z",
  "speedMode",
  "scaleStartKph",
  "scaleSpanKph",
  "scaleMaxExtra",
];

for (const reason of expectedReasons) {
  const visible = ragdoll.effectiveFieldsByReason[reason] ?? [];
  if (reason === "parkour-pose") {
    assert.deepEqual(
      visible,
      [
        "linearDamping",
        "angularDamping",
        "headAngularDamping",
        "friction",
        "parkourSpinMultiplier",
      ],
      "parkour-pose exposes fields that the dev module cannot honestly control",
    );
  } else {
    for (const field of genericFields) {
      assert.ok(visible.includes(field), reason + ": missing effective field " + field);
    }
  }
}

developer.execute(playerId, {
  action: "set-ragdoll-profile",
  reason: "vehicle-eject",
  patch: tuningCases,
});
const ejectAfter = developer.catalog(playerId)
  .categories.find((category) => category.id === "ragdoll")
  .profiles["vehicle-eject"];
for (const [field, expected] of Object.entries(tuningCases)) {
  assert.equal(ejectAfter[field], expected, "Developer transport lost field " + field);
}

developer.execute(playerId, {
  action: "set-ragdoll-profile",
  reason: "parkour-pose",
  patch: {
    linearDamping: 0.041,
    angularDamping: 0.052,
    headAngularDamping: 0.063,
    friction: 0.44,
    parkourSpinMultiplier: 2.4,
  },
});
const parkourAfter = developer.catalog(playerId)
  .categories.find((category) => category.id === "ragdoll")
  .profiles["parkour-pose"];
assert.equal(parkourAfter.linearDamping, 0.041);
assert.equal(parkourAfter.angularDamping, 0.052);
assert.equal(parkourAfter.headAngularDamping, 0.063);
assert.equal(parkourAfter.friction, 0.44);
assert.equal(parkourAfter.parkourSpinMultiplier, 2.4);

developer.execute(playerId, { action: "reset-all-ragdoll" });
const afterReset = developer.catalog(playerId)
  .categories.find((category) => category.id === "ragdoll");
for (const reason of expectedReasons) {
  const expected = baseline[reason];
  const actual = afterReset.profiles[reason];
  for (const field of genericFields) {
    assert.equal(actual[field], expected[field], reason + ": reset-all failed for " + field);
  }
}
assert.equal(
  afterReset.profiles["parkour-pose"].parkourSpinMultiplier,
  1,
  "reset-all did not restore parkour spin multiplier",
);

const testLaunch = developer.execute(playerId, {
  action: "test-ragdoll",
  reason: "vehicle-eject",
  height: 9,
  speed: 7,
});
assert.equal(testLaunch.reason, "vehicle-eject");
assert.equal(testLaunch.height, 9);
assert.equal(testLaunch.speed, 7);
assert.equal(lastRagdollActivation.entityId, playerId);
assert.equal(lastRagdollActivation.options.position.x, 10);
assert.equal(lastRagdollActivation.options.position.y, 11);
assert.equal(lastRagdollActivation.options.position.z, -4);
assert.equal(lastRagdollActivation.options.velocity.x, 0);
assert.equal(lastRagdollActivation.options.velocity.z, -7);

const stabilityCategory = developer.catalog(playerId)
  .categories.find((category) => category.id === "ragdoll-stability");
assert.ok(stabilityCategory, "Ragdoll stability category is missing");
assert.equal(stabilityCategory.values.selfCollisionEnabled, true);

developer.execute(playerId, {
  action: "set-ragdoll-stability",
  patch: { selfCollisionEnabled: false },
});
assert.equal(
  developer.catalog(playerId)
    .categories.find((category) => category.id === "ragdoll-stability")
    .values.selfCollisionEnabled,
  false,
  "Developer stability setting did not disable self collision",
);

developer.execute(playerId, { action: "reset-ragdoll-stability" });
assert.equal(
  developer.catalog(playerId)
    .categories.find((category) => category.id === "ragdoll-stability")
    .values.selfCollisionEnabled,
  true,
  "Developer stability reset did not restore self collision",
);

const parachuteCategory = developer.catalog(playerId)
  .categories.find((category) => category.id === "parachute");
assert.ok(parachuteCategory, "Parachute category is missing");

const parachutePatch = {
  canopyGlideMultiplier: 1.75,
  freefallControlMultiplier: 0.45,
  windMultiplier: 2.2,
  descentMultiplier: 0.65,
};
developer.execute(playerId, { action: "set-parachute", patch: parachutePatch });
const parachuteChanged = developer.catalog(playerId)
  .categories.find((category) => category.id === "parachute");
for (const [field, expected] of Object.entries(parachutePatch)) {
  assert.equal(
    parachuteChanged.values[field],
    expected,
    "Parachute developer setting lost field " + field,
  );
}

developer.execute(playerId, { action: "reset-parachute" });
const parachuteReset = developer.catalog(playerId)
  .categories.find((category) => category.id === "parachute");
for (const field of Object.keys(parachutePatch)) {
  assert.equal(
    parachuteReset.values[field],
    1,
    "Parachute reset failed for " + field,
  );
}

console.log(
  "Developer settings self-check OK:",
  expectedReasons.length,
  "ragdoll reasons,",
  genericFields.length,
  "generic fields, controlled ragdoll test, parkour overlay, ragdoll stability, parachute overlay, resets and core isolation verified.",
);
