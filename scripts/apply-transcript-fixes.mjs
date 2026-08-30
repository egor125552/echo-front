import fs from "node:fs";

function replaceOnce(path, from, to) {
  const input = fs.readFileSync(path, "utf8");
  if (!input.includes(from)) {
    throw new Error(`Pattern not found in ${path}: ${from.slice(0, 120)}`);
  }
  const output = input.replace(from, to);
  fs.writeFileSync(path, output);
}

// 1) Crates should stop a player who is simply holding forward. Rapier's
// normal wall sliding is useful for walls, but it made a blind player believe
// they had walked straight through a loot crate. Manual strafe/turn still lets
// the player deliberately go around it.
replaceOnce(
  "src/plugins/movement/server.js",
  'const NAVIGABLE_SUPPORT_KINDS = new Set(["ground", "building-floor", "building-stair"]);',
  'const NAVIGABLE_SUPPORT_KINDS = new Set(["ground", "building-floor", "building-stair"]);\nconst STICKY_OBSTACLE_KINDS = new Set(["crate", "loot-crate"]);',
);
replaceOnce(
  "src/plugins/movement/server.js",
  '  version: "2.2.1",',
  '  version: "2.3.0",',
);
replaceOnce(
  "src/plugins/movement/server.js",
  'function blockageKey(blockage) {\n  return [\n    blockage?.kind ?? "unknown",\n    blockage?.objectId ?? blockage?.colliderHandle ?? blockage?.speech ?? "",\n  ].join(":");\n}\n',
  'function blockageKey(blockage) {\n  return [\n    blockage?.kind ?? "unknown",\n    blockage?.objectId ?? blockage?.colliderHandle ?? blockage?.speech ?? "",\n  ].join(":");\n}\n\nfunction hasStickyObstacleCollision(moved = {}) {\n  return (moved.collisions ?? []).some((collision) =>\n    STICKY_OBSTACLE_KINDS.has(String(collision?.worldObject?.kind ?? "")));\n}\n',
);
replaceOnce(
  "src/plugins/movement/server.js",
  '          const dy = verticalVelocity * safeDt;\n          const moved = physics.move(entityId, dx, dz, dy);\n          transform.grounded = Boolean(moved.grounded);\n          transform.verticalVelocity = moved.grounded ? 0 : verticalVelocity;\n\n          const pos = physics.position(entityId);',
  '          const dy = verticalVelocity * safeDt;\n          const beforeMove = { x: transform.x, y: transform.y, z: transform.z };\n          let moved = physics.move(entityId, dx, dz, dy);\n\n          // Do not let Rapier silently slide a human around loot crates when the\n          // player only asked to walk straight. Preserve vertical correction, but\n          // cancel the horizontal slide. A deliberate strafe still works.\n          if (!entity.bot\n            && Math.abs(rawStrafe) <= 0.08\n            && Math.hypot(dx, dz) > 0.01\n            && hasStickyObstacleCollision(moved)) {\n            const current = physics.position(entityId);\n            physics.teleport(entityId, {\n              x: beforeMove.x,\n              y: current?.y ?? beforeMove.y,\n              z: beforeMove.z,\n            });\n            moved = { ...moved, x: 0, z: 0 };\n          }\n\n          transform.grounded = Boolean(moved.grounded);\n          transform.verticalVelocity = moved.grounded ? 0 : verticalVelocity;\n\n          const pos = physics.position(entityId);',
);

// 2) Location speech should say the most specific place first: "второй этаж,
// Двухэтажный дом" rather than "Двухэтажный дом, второй этаж". This is generic
// for every declarative building, room, floor and stair.
replaceOnce(
  "src/plugins/battle-royale-building-factory/server.js",
  '  version: "1.0.0",',
  '  version: "1.1.0",',
);
replaceOnce(
  "src/plugins/battle-royale-building-factory/server.js",
  '    if (stair) return `${entry.name}, ${stair.spec.name ?? "лестница"}`;\n    const floor = floorAt(entry, position);\n    const room = roomAt(entry, floor, position);\n    if (room) return `${entry.name}, ${room.name ?? room.id}`;\n    if (floor) return `${entry.name}, ${floor.name ?? floor.id}`;',
  '    if (stair) return `${stair.spec.name ?? "лестница"}, ${entry.name}`;\n    const floor = floorAt(entry, position);\n    const room = roomAt(entry, floor, position);\n    if (room) return `${room.name ?? room.id}, ${entry.name}`;\n    if (floor) return `${floor.name ?? floor.id}, ${entry.name}`;',
);

// 3) Never generate giant detours around the world boundary, and reject any
// single detour candidate that is wildly longer than the direct remaining leg.
replaceOnce(
  "src/plugins/battle-royale-navigation/server.js",
  'const MAX_VISIBLE_VEHICLE_TARGETS = 5;\n',
  'const MAX_VISIBLE_VEHICLE_TARGETS = 5;\nconst NON_DETOUR_OBSTACLE_KINDS = new Set(["world-boundary"]);\n',
);
replaceOnce(
  "src/plugins/battle-royale-navigation/server.js",
  '  version: "1.3.0",',
  '  version: "1.3.1",',
);
replaceOnce(
  "src/plugins/battle-royale-navigation/server.js",
  '    const kind = String(object.kind ?? "");\n    const clearance = options.mode === "vehicle"',
  '    const kind = String(object.kind ?? "");\n    if (NON_DETOUR_OBSTACLE_KINDS.has(kind)) return [];\n    const clearance = options.mode === "vehicle"',
);
replaceOnce(
  "src/plugins/battle-royale-navigation/server.js",
  '      const projectedDistance = distance3(from, p) + distance3(p, target.position);\n      if (candidate.semantic) {',
  '      const projectedDistance = distance3(from, p) + distance3(p, target.position);\n      const genericLimit = directDistance + Math.max(\n        options.mode === "vehicle" ? 100 : 60,\n        directDistance * (options.mode === "vehicle" ? 1.25 : 1.0),\n      );\n      if (projectedDistance > genericLimit) continue;\n      if (candidate.semantic) {',
);

// 4) Crash-ejection had a separate, nearly non-spinning profile from manual
// jump-out. Make crash rotation coherent and speed-scaled too, while keeping it
// a little less extreme than a deliberate high-speed jump-out.
replaceOnce(
  "src/plugins/battle-royale-ragdoll-tuning/server.js",
  '  version: "1.7.0",',
  '  version: "1.8.0",',
);
replaceOnce(
  "src/plugins/battle-royale-ragdoll-tuning/server.js",
  '  "vehicle-crash": Object.freeze({\n    ...BASE_PHYSICS,\n    x: 0.70, y: 0.12, z: 0.54,\n    speedMode: "none", scaleStartKph: 0, scaleSpanKph: 100, scaleMaxExtra: 0,\n  }),',
  '  "vehicle-crash": Object.freeze({\n    linearDamping: 0.016,\n    angularDamping: 0.011,\n    headAngularDamping: 0.016,\n    friction: 0.32,\n    x: 3.6, y: 0.40, z: 3.0,\n    speedMode: "horizontal", scaleStartKph: 20, scaleSpanKph: 90, scaleMaxExtra: 2.5,\n  }),',
);

// Keep more of the vehicle's real momentum in a crash ejection. The ragdoll
// stability layer still caps unsafe centre-of-mass and angular velocities.
replaceOnce(
  "src/plugins/battle-royale-parkour-ragdoll/server.js",
  '  version: "1.1.0",',
  '  version: "1.2.0",',
);
replaceOnce(
  "src/plugins/battle-royale-parkour-ragdoll/server.js",
  '      const carrySpeed = Math.min(18, impact.speedBefore * 0.78);',
  '      const carrySpeed = Math.min(55, impact.speedBefore * 0.62);',
);

// 5) Preserve already-epic hard impacts, but make medium vehicle-ragdoll hits
// take a little more HP. This targets exactly the "good throw, barely any HP"
// cases from the journal without multiplying lethal impacts.
replaceOnce(
  "src/plugins/battle-royale-ragdoll/server.js",
  '  version: "1.2.0",',
  '  version: "1.3.0",',
);
replaceOnce(
  "src/plugins/battle-royale-ragdoll/server.js",
  '  function impactDamage(impact) {\n    const excess = Math.max(0, Number(impact?.severity) - 3.6);\n    return Math.min(90, Math.round(excess * excess * 1.25));\n  }',
  '  function impactDamage(impact, reason = "default") {\n    const severity = Math.max(0, Number(impact?.severity) || 0);\n    const excess = Math.max(0, severity - 3.6);\n    let damage = excess * excess * 1.25;\n    if (reason === "vehicle-eject" || reason === "vehicle-crash" || reason === "vehicle-hit") {\n      // Boost only moderate impacts. Very hard impacts keep the old curve, so an\n      // already-epic crash does not suddenly become an unavoidable one-shot.\n      const moderateBoost = clamp((8 - severity) / 4, 0, 1);\n      damage += excess * 3 * moderateBoost;\n    }\n    return Math.min(90, Math.round(damage));\n  }',
);
replaceOnce(
  "src/plugins/battle-royale-ragdoll/server.js",
  '      const damage = impactDamage(impact);',
  '      const damage = impactDamage(impact, entry.reason);',
);

console.log("Applied transcript-driven gameplay fixes.");
