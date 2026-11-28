import { legacyBuildingTopology } from "../battle-royale-building-navigation/server.js";
import {
  DESTRUCTION_KIND_SET,
  audibilityRadiusForStage,
  clamp,
  computeDebrisLaunchVelocity,
  computeDestructionDelayMs,
  distance3,
  evaluateBlastPartDamage,
  evaluateBuildingStage,
  findUnsupportedUpperParts,
  finite,
  floorBandForPart,
  materialMaxHp,
  normalizeMaterial,
} from "../../game/building-destruction-model.js";

// Authoritative Battle Royale building destruction plugin:
// - Full blast radius support (Mini-Nuke 185m + 270m glass shockwave, Smertonos 28..105m + wall piercing,
//   Mines, Electro-Lukashenko Meteor Slam, gunfire on glass/wood, high-speed vehicle crashes).
// - Real outward/upward Rapier rubble launches with angular spin.
// - Structural cascade collapse when lower load-bearing walls fail (upper floors/roofs fold down).
// - Map-wide spatial audio propagation (up to 600m) + building:collapse events for haptics & VoiceOver.

export const manifest = {
  id: "building-destruction",
  version: "2.0.0",
  requires: [
    "rapier-physics",
    "rapier-toggleable-colliders",
    "match-api",
    "battle-royale-building-factory",
    "battle-royale-special-ops",
    "battle-royale-building-navigation",
    "combat",
  ],
  capabilities: ["services.consume", "services.provide", "events.on", "events.emit", "components.read"],
};

const MAX_ACTIVE_RUBBLE = 48;
const MAX_ACTIVE_FIRES = 32;
const MAX_BREAKS_PER_TICK = 8;
const ENCLOSURE_TYPES = new Set(["building-wall", "building-window", "building-door"]);

const BUILDING_LABELS = Object.freeze({
  warehouse: "Склад",
  "two-storey-house": "Двухэтажный дом",
  "forest-hut": "Лесная хижина",
  "loot-house": "Дом с припасами",
  residence: "Резиденция",
  underground: "Бункер",
});

function hashString(input) {
  let h = 2166136261;
  for (const ch of String(input)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

export async function setup(ctx) {
  const physics = ctx.services.get("physics");
  const map = ctx.services.get("map");
  const api = ctx.services.get("match-api");
  const nav = ctx.services.get("building-navigation");
  const entities = ctx.services.get("entities");
  const combat = ctx.services.get("combat");
  const factory = ctx.services.get("building-factory");

  const parts = new Map();
  const partsByGroup = new Map();
  const groupNames = new Map();
  const groupStage = new Map();
  const debris = new Map();
  const fires = new Map();
  const changed = new Map();
  const enclosureCounts = new Map();
  const savedTopology = new Map((map.navigationBuildings ?? []).map((item) => [item.id, item]));
  const legacy = legacyBuildingTopology(map);
  if (legacy && !savedTopology.has(legacy.id)) savedTopology.set(legacy.id, legacy);
  const originalWallList = [...(map.walls ?? [])];

  let serial = 0;
  let revision = 0;
  let contactCursor = physics.contactForceCursor?.() ?? 0;
  let lastHeatAt = 0;
  let clock = 0;
  let ended = false;
  let hasBrokenSupport = false;

  function resolveBuildingName(group) {
    if (groupNames.has(group)) return groupNames.get(group);
    const known = BUILDING_LABELS[group];
    if (known) return known;
    const topology = savedTopology.get(group);
    if (topology?.name) return topology.name;
    return "Здание";
  }

  function register(collider, spec, row = null, door = null) {
    if (!collider || !DESTRUCTION_KIND_SET.has(spec?.kind) || parts.has(collider.handle)) return;
    const baseY = finite(spec.y);
    const group = String(spec.buildingId ?? door?.buildingId ?? (baseY < -2 ? "underground" : map.building?.id ?? "building"));
    if (spec.buildingName && !groupNames.has(group)) {
      groupNames.set(group, String(spec.buildingName));
    }
    const type = String(spec.kind);
    const height = type === "building-floor" ? 0 : finite(spec.height ?? spec.rise, 2);
    const pos = {
      x: finite(spec.x),
      y: baseY + height / 2,
      z: finite(spec.z),
    };
    const m = normalizeMaterial(spec.material ?? spec.surface ?? (type === "building-door" ? "wood" : "concrete"));
    const id = `part-${++serial}`;
    const underground = baseY < -2;
    // Protect underground outer containment & ground-level slabs so players never fall into the void.
    const protectedSupport = (underground && !/перегород|partition/i.test(spec.accessibleName ?? ""))
      || (type === "building-floor" && baseY <= 0.15);
    const maxHp = materialMaxHp(m, type);
    const style = underground
      ? "underground"
      : group === "warehouse"
        ? "industrial"
        : group === "two-storey-house"
          ? "multi-level"
          : group === "forest-hut"
            ? "timber"
            : "interior";
    const floorBand = floorBandForPart({ baseY, pos, type });
    const part = {
      id,
      group,
      type,
      m,
      baseY,
      height,
      floorBand,
      pos,
      collider,
      row,
      door,
      protectedSupport,
      maxHp,
      style,
      hp: maxHp,
      state: "intact",
      due: 0,
      cascaded: false,
      blastContext: null,
      seed: hashString(`${id}:${group}:${m}`),
      doorWasOpen: Boolean(door?.open),
      stairId: spec.stairId ?? row?.stairId ?? null,
    };
    parts.set(collider.handle, part);
    let groupList = partsByGroup.get(group);
    if (!groupList) {
      groupList = [];
      partsByGroup.set(group, groupList);
    }
    groupList.push(part);
    if (ENCLOSURE_TYPES.has(part.type)) {
      const count = enclosureCounts.get(group) ?? { total: 0, broken: 0 };
      count.total += 1;
      enclosureCounts.set(group, count);
    }
  }

  for (const w of originalWallList) register(w.collider, w, w);
  for (const d of map.doors ?? []) {
    register(d.collider, { ...physics.colliderInfo(d.collider)?.worldObject, ...d, kind: "building-door" }, null, d);
  }
  physics.world.forEachCollider?.((c) => {
    const info = physics.colliderInfo(c)?.worldObject;
    if (info && DESTRUCTION_KIND_SET.has(info.kind)) register(c, info);
  });

  function emitMaterialEvent(part, stage, intensity, at = part.pos, extra = {}) {
    const major = Boolean(extra.major ?? part.blastContext?.major);
    const radius = finite(extra.radius, audibilityRadiusForStage(stage, part.m, major));
    ctx.events.emit("building:material", {
      id: part.id,
      buildingId: part.group,
      buildingName: resolveBuildingName(part.group),
      material: part.m,
      style: part.style,
      element: part.type,
      stage,
      major,
      cascaded: Boolean(part.cascaded || extra.cascaded),
      variant: (part.seed + revision) % 3,
      intensity: clamp(intensity, 0.15, 1),
      x: Number(finite(at.x).toFixed(2)),
      y: Number(finite(at.y).toFixed(2)),
      z: Number(finite(at.z).toFixed(2)),
      radius,
      now: clock || Date.now(),
    });
  }

  function mark(part, state) {
    if (state === "broken" && part.state !== "broken" && ENCLOSURE_TYPES.has(part.type)) {
      const count = enclosureCounts.get(part.group);
      if (count) count.broken += 1;
    }
    if (state === "broken" && (part.type === "building-floor" || part.type === "building-stair")) {
      hasBrokenSupport = true;
    }
    part.state = state;
    revision += 1;
    changed.set(part.id, {
      id: part.id,
      buildingId: part.group,
      material: part.m,
      element: part.type,
      state,
      x: Number(part.pos.x.toFixed(2)),
      y: Number(part.pos.y.toFixed(2)),
      z: Number(part.pos.z.toFixed(2)),
    });
  }

  function snapFireY(pos) {
    const startY = Math.max(finite(pos.y) + 0.35, 0.5);
    const support = physics.raycastSupportWorld?.({ x: finite(pos.x), y: startY, z: finite(pos.z) }, { x: 0, y: -1, z: 0 }, 30);
    if (support) return Number(Math.max(0, startY - support.distance).toFixed(2));
    return Number(Math.max(0, finite(pos.y) - 0.5).toFixed(2));
  }

  function ignite(part, now, major) {
    if (part.type === "building-window" || part.m === "glass") return;
    const fireY = snapFireY(part.pos);
    const key = `${part.group}:${Math.round(part.pos.x / 6)}:${Math.round(fireY / 3)}:${Math.round(part.pos.z / 6)}`;
    const existing = fires.get(key);
    if (existing) {
      existing.until = Math.max(existing.until, now + 45000);
      existing.intensity = Math.max(existing.intensity, major ? 0.92 : 0.62);
      return;
    }
    if (fires.size >= MAX_ACTIVE_FIRES) {
      // Replace the oldest fire so fresh blast zones still burn.
      const oldestKey = fires.keys().next().value;
      if (oldestKey) fires.delete(oldestKey);
    }
    fires.set(key, {
      id: key,
      x: Number(part.pos.x.toFixed(2)),
      y: fireY,
      z: Number(part.pos.z.toFixed(2)),
      buildingId: part.group,
      intensity: major ? 0.9 : 0.6,
      until: now + (major ? 72000 : 55000),
    });
  }

  function queuePartBreak(part, now, delayMs, blastContext = null, { cascaded = false } = {}) {
    if (part.protectedSupport || part.state === "broken" || part.state === "queued") return false;
    part.cascaded = Boolean(cascaded);
    part.blastContext = blastContext;
    mark(part, "queued");
    part.due = now + Math.max(0, Math.round(delayMs));
    return true;
  }

  function checkStructuralCascade(group, now, major = false, blastContext = null) {
    const groupParts = partsByGroup.get(group);
    if (!groupParts?.length) return 0;
    const unsupported = findUnsupportedUpperParts(groupParts, { major });
    if (!unsupported.length) return 0;
    let queuedCount = 0;
    for (const upper of unsupported) {
      const delay = computeDestructionDelayMs({
        material: upper.m,
        major,
        cascaded: true,
        floorBand: upper.floorBand,
        seed: upper.seed,
      });
      if (queuePartBreak(upper, now, delay, blastContext, { cascaded: true })) {
        queuedCount += 1;
        if (upper.m !== "glass") {
          emitMaterialEvent(upper, "strain", major ? 0.92 : 0.72, upper.pos, { major, cascaded: true });
        }
      }
    }
    return queuedCount;
  }

  function updateBuildingMilestone(group, now, major = false) {
    const groupParts = partsByGroup.get(group);
    if (!groupParts?.length) return;
    const summary = evaluateBuildingStage(groupParts);
    const prev = groupStage.get(group) ?? "intact";
    if (summary.stage === prev) return;
    const rank = { intact: 0, damaged: 1, breached: 2, collapsed: 3 };
    if ((rank[summary.stage] ?? 0) <= (rank[prev] ?? 0)) return;
    groupStage.set(group, summary.stage);
    if (summary.stage === "breached" || summary.stage === "collapsed") {
      const style = groupParts[0]?.style ?? "interior";
      ctx.events.emit("building:collapse", {
        buildingId: group,
        buildingName: resolveBuildingName(group),
        style,
        stage: summary.stage,
        major: Boolean(major || summary.stage === "collapsed"),
        brokenCount: summary.broken,
        totalCount: summary.total,
        brokenRatio: summary.ratio,
        x: summary.center.x,
        y: summary.center.y,
        z: summary.center.z,
        radius: audibilityRadiusForStage("collapse", "stone", summary.stage === "collapsed"),
        now,
      });
    }
  }

  function applyBlastDamage(payload, { major = false, kind = "cannon" } = {}) {
    if (![payload?.x, payload?.y, payload?.z].every((v) => Number.isFinite(Number(v)))) return;
    const now = finite(payload.now, clock || Date.now());
    const defaultRadius = major ? 185 : kind === "mine" ? 14 : kind === "electro-slam" ? 22 : 48;
    const blastRadius = finite(payload.blastRadius, defaultRadius);
    const chargeRatio = clamp(finite(payload.chargeRatio, 0), 0, 1);
    const origin = { x: finite(payload.x), y: finite(payload.y), z: finite(payload.z) };
    const blastPower = major
      ? 2.8
      : kind === "electro-slam"
        ? 1.45
        : kind === "mine"
          ? 1.15
          : (1.25 + chargeRatio * 0.9 + clamp((blastRadius - 30) / 80, 0, 0.7));
    const blastContext = {
      origin,
      blastRadius,
      blastPower,
      major,
      kind,
      impulseDir: null,
    };

    const touchedGroups = new Set();
    for (const part of parts.values()) {
      if (part.state === "broken" || part.state === "queued") continue;
      const evalRes = evaluateBlastPartDamage(part, origin, {
        blastRadius,
        major,
        chargeRatio,
        kind,
      });
      if (!evalRes.hit) continue;
      touchedGroups.add(part.group);
      part.hp -= evalRes.damage;
      if (part.state === "intact") {
        mark(part, "damaged");
        if (part.m !== "glass" && (evalRes.damage >= 0.22 || major)) {
          emitMaterialEvent(part, "strain", clamp(evalRes.damage, 0.25, 1), part.pos, { major });
        }
      }
      if (evalRes.ignite) ignite(part, now, major);
      if (part.hp <= 0 && !part.protectedSupport) {
        const delayMs = computeDestructionDelayMs({
          distance: evalRes.distance,
          blastRadius,
          material: part.m,
          major,
          cascaded: false,
          floorBand: part.floorBand,
          seed: part.seed,
        });
        queuePartBreak(part, now, delayMs, blastContext, { cascaded: false });
      }
    }

    for (const group of touchedGroups) {
      checkStructuralCascade(group, now, major, blastContext);
    }
  }

  function applyWallPierce(payload = {}) {
    if (ended || ![payload?.x, payload?.y, payload?.z].every((v) => Number.isFinite(Number(v)))) return;
    const now = finite(payload.now, clock || Date.now());
    const origin = { x: finite(payload.x), y: finite(payload.y), z: finite(payload.z) };
    const impulseDir = {
      x: finite(payload.vx),
      y: finite(payload.vy),
      z: finite(payload.vz),
    };
    const blastRadius = finite(payload.blastRadius, 7.5);
    const blastContext = {
      origin,
      blastRadius,
      blastPower: 2.1 + clamp(finite(payload.chargeRatio, 0), 0, 1) * 0.6,
      major: false,
      kind: "cannon-pierce",
      impulseDir,
    };

    const touchedGroups = new Set();
    const directPart = Number.isFinite(Number(payload.colliderHandle))
      ? parts.get(Number(payload.colliderHandle))
      : null;
    if (directPart && !directPart.protectedSupport && directPart.state !== "broken" && directPart.state !== "queued") {
      directPart.hp = 0;
      touchedGroups.add(directPart.group);
      queuePartBreak(directPart, now, computeDestructionDelayMs({ directPierce: true, seed: directPart.seed }), blastContext);
    }

    for (const part of parts.values()) {
      if (part === directPart || part.state === "broken" || part.state === "queued") continue;
      const d = distance3(part.pos, origin);
      const localRadius = part.m === "glass" ? blastRadius * 1.45 : blastRadius * 0.72;
      if (d > localRadius) continue;
      const hitDamage = (part.m === "glass" ? 1.8 : 1.35) * (1 - d / (localRadius * 1.12));
      part.hp -= hitDamage;
      touchedGroups.add(part.group);
      if (part.state === "intact") mark(part, "damaged");
      if (part.hp <= 0 && !part.protectedSupport) {
        const delayMs = computeDestructionDelayMs({
          distance: d,
          blastRadius: localRadius,
          material: part.m,
          directPierce: d <= 3.2,
          seed: part.seed,
        });
        queuePartBreak(part, now, delayMs, blastContext);
      }
    }

    for (const group of touchedGroups) {
      checkStructuralCascade(group, now, false, blastContext);
    }
  }

  function applyProjectileImpact(payload = {}) {
    if (ended || payload.targetId || payload.vehicleId) return;
    if (![payload?.x, payload?.y, payload?.z].every((v) => Number.isFinite(Number(v)))) return;
    const now = finite(payload.now, clock || Date.now());
    const origin = { x: finite(payload.x), y: finite(payload.y), z: finite(payload.z) };
    const weaponId = String(payload.weaponId ?? "rifle");
    const isHeavy = weaponId === "sniper" || weaponId === "marksman" || weaponId === "electro-rifle";
    const chipPower = weaponId === "sniper" ? 0.55 : isHeavy ? 0.34 : 0.18;

    let closestPart = null;
    let closestDist = 2.6;
    for (const part of parts.values()) {
      if (part.protectedSupport || part.state === "broken" || part.state === "queued") continue;
      // Gunfire only shatters glass and chips wooden doors/walls/tiles (not whole concrete slabs).
      if (part.m !== "glass" && part.m !== "wood" && part.m !== "tile" && part.type !== "building-door") continue;
      const d = distance3(part.pos, origin);
      if (d < closestDist) {
        closestDist = d;
        closestPart = part;
      }
    }
    if (!closestPart) return;

    const damage = closestPart.m === "glass" ? 0.45 : chipPower;
    closestPart.hp -= damage;
    if (closestPart.state === "intact") {
      mark(closestPart, "damaged");
      if (closestPart.m !== "glass") {
        emitMaterialEvent(closestPart, "strain", clamp(damage * 1.1, 0.2, 0.55), origin, { radius: 95 });
      }
    }
    if (closestPart.hp <= 0) {
      const blastContext = {
        origin,
        blastRadius: 6,
        blastPower: isHeavy ? 0.95 : 0.65,
        major: false,
        kind: "projectile",
        impulseDir: null,
      };
      queuePartBreak(closestPart, now, 12, blastContext);
    }
  }

  function applyVehicleImpact(payload = {}) {
    if (ended || ![payload?.x, payload?.y, payload?.z].every((v) => Number.isFinite(Number(v)))) return;
    const severity = Math.max(
      finite(payload.crashSeverity),
      finite(payload.deltaSpeed) * 1.1,
      finite(payload.speedBefore) * 0.85,
    );
    if (severity < 9.5) return;
    const now = finite(payload.now, clock || Date.now());
    const origin = { x: finite(payload.x), y: finite(payload.y) + 0.9, z: finite(payload.z) };
    const radius = clamp(3.4 + (severity - 9.5) * 0.18, 3.4, 7.2);
    const hitPower = clamp(0.65 + (severity - 9.5) * 0.08, 0.65, 2.2);
    const blastContext = {
      origin,
      blastRadius: radius,
      blastPower: hitPower,
      major: false,
      kind: "vehicle-crash",
      impulseDir: payload.contactDirection
        ? { x: -finite(payload.contactDirection.x), y: 0.25, z: -finite(payload.contactDirection.z) }
        : null,
    };

    const touchedGroups = new Set();
    for (const part of parts.values()) {
      if (part.protectedSupport || part.state === "broken" || part.state === "queued") continue;
      if (part.type === "building-floor") continue;
      const d = distance3(part.pos, origin);
      if (d > radius) continue;
      const mult = part.m === "glass" ? 1.8 : part.m === "wood" || part.type === "building-door" ? 1.35 : 0.72;
      const dmg = hitPower * mult * (1 - d / (radius * 1.15));
      if (dmg < 0.2) continue;
      part.hp -= dmg;
      touchedGroups.add(part.group);
      if (part.state === "intact") {
        mark(part, "damaged");
        if (part.m !== "glass") emitMaterialEvent(part, "strain", clamp(dmg, 0.3, 0.85), part.pos);
      }
      if (part.hp <= 0) {
        queuePartBreak(part, now, 20 + (part.seed % 90), blastContext);
      }
    }
    for (const group of touchedGroups) {
      checkStructuralCascade(group, now, false, blastContext);
    }
  }

  ctx.events.on("cannon:impact", (payload) => applyBlastDamage(payload, { major: false, kind: "cannon" }));
  ctx.events.on("cannon:wall-pierce", (payload) => applyWallPierce(payload));
  ctx.events.on("mine:detonated", (payload) => applyBlastDamage(payload, { major: false, kind: "mine" }));
  ctx.events.on("nuke:detonated", (payload) => applyBlastDamage(payload, { major: true, kind: "nuke" }));
  ctx.events.on("special:electro-jump", (payload) => {
    if (payload?.phase === "slam") {
      applyBlastDamage(payload, { major: false, kind: "electro-slam" });
    }
  });
  ctx.events.on("projectile:impact", (payload) => applyProjectileImpact(payload));
  ctx.events.on("vehicle:impact", (payload) => applyVehicleImpact(payload));

  function rebuildNav(group) {
    const topology = savedTopology.get(group);
    if (!topology) return;
    const stairs = (partsByGroup.get(group) ?? []).filter((p) => p.state === "broken" && p.type === "building-stair");
    const destroyedStairs = new Set(stairs.filter((p) => p.stairId).map((p) => String(p.stairId)));
    const transitions = topology.transitions.filter((t) => !(
      t.kind === "stair"
      && (stairs.some((p) => !p.stairId) || destroyedStairs.has(String(t.id).replace(/:(bottom|top)$/, "")))
    ));
    nav.registerBuilding({ ...topology, transitions });
  }

  function evictOldestRubbleIfNeeded() {
    while (debris.size >= MAX_ACTIVE_RUBBLE) {
      const oldestId = debris.keys().next().value;
      if (!oldestId) break;
      physics.removeDynamicBody(oldestId);
      debris.delete(oldestId);
    }
  }

  function spawnRubbleForPart(part, now) {
    const major = Boolean(part.blastContext?.major);
    const chunkCount = part.m === "glass"
      ? 1
      : (major || part.cascaded || part.type === "building-floor") ? 2 : 1;

    for (let idx = 0; idx < chunkCount; idx += 1) {
      evictOldestRubbleIfNeeded();
      const bodyId = `building-rubble:${part.id}:${idx}`;
      const seed = part.seed + idx * 7919;
      const sizeScale = part.m === "glass"
        ? 0.08
        : part.type === "building-floor"
          ? 0.28 + (seed % 7) * 0.025
          : 0.20 + (seed % 9) * 0.024;
      const offsetX = idx === 0 ? 0 : (((seed % 11) - 5) * 0.14);
      const offsetY = idx === 0 ? 0.15 : 0.45;
      const offsetZ = idx === 0 ? 0 : ((((seed >>> 3) % 11) - 5) * 0.14);
      const spawnPos = {
        x: part.pos.x + offsetX,
        y: Math.max(0.35, part.pos.y + offsetY),
        z: part.pos.z + offsetZ,
      };
      const mass = part.m === "glass" ? 2.5 : part.m === "wood" ? 5.5 : 11;
      const body = physics.createDynamicCuboid(bodyId, {
        ...spawnPos,
        hx: sizeScale,
        hy: sizeScale * 0.62,
        hz: sizeScale * 0.88,
        mass,
        friction: 0.72,
        restitution: part.m === "metal" ? 0.22 : 0.12,
        linearDamping: 0.14,
        angularDamping: 0.26,
        metadata: {
          kind: "building-rubble",
          material: part.m,
          contactForceThreshold: 18,
        },
      });
      if (!body) continue;

      const launch = computeDebrisLaunchVelocity({
        partPos: spawnPos,
        blastOrigin: part.blastContext?.origin ?? null,
        blastPower: part.blastContext?.blastPower ?? 1,
        blastRadius: part.blastContext?.blastRadius ?? 45,
        material: part.m,
        impulseDir: part.blastContext?.impulseDir ?? null,
        cascaded: part.cascaded,
        seed,
      });
      physics.setDynamicBodyLinearVelocity?.(bodyId, launch.linvel, true);
      physics.setDynamicBodyAngularVelocity?.(bodyId, launch.angvel, true);

      debris.set(bodyId, {
        id: bodyId,
        part,
        until: now + 11000,
        lastImpactAt: now,
      });
    }
  }

  function breakPart(part, now) {
    if (part.state !== "queued" || part.protectedSupport) return;
    if (!physics.setWallEnabled(part.collider, false)) return;
    mark(part, "broken");
    if (part.row) part.row.destroyed = true;
    if (part.door) {
      part.door.destroyed = true;
      part.door.open = true;
    }

    const stage = part.cascaded ? "collapse" : "break";
    const intensity = part.cascaded ? 0.98 : (part.blastContext?.major ? 1.0 : 0.92);
    emitMaterialEvent(part, stage, intensity, part.pos, {
      major: Boolean(part.blastContext?.major),
      cascaded: part.cascaded,
    });

    if (part.m === "wood" && (part.blastContext?.major || part.blastContext?.kind === "cannon")) {
      ignite(part, now, Boolean(part.blastContext?.major));
    }
    if (part.type === "building-stair") rebuildNav(part.group);

    spawnRubbleForPart(part, now);

    // Re-check structural support as lower walls finish breaking so delayed cascades stay accurate.
    if (!part.cascaded && ENCLOSURE_TYPES.has(part.type)) {
      checkStructuralCascade(part.group, now, Boolean(part.blastContext?.major), part.blastContext);
    }
    updateBuildingMilestone(part.group, now, Boolean(part.blastContext?.major));
  }

  function reset() {
    physics.beginBatch?.();
    try {
      for (const part of parts.values()) {
        if (part.state === "broken") {
          physics.setWallEnabled(part.collider, part.door ? !part.doorWasOpen : true);
        }
        if (part.row) delete part.row.destroyed;
        if (part.door && part.door.destroyed) {
          delete part.door.destroyed;
          part.door.open = part.doorWasOpen;
        }
        part.hp = part.maxHp;
        part.state = "intact";
        part.due = 0;
        part.cascaded = false;
        part.blastContext = null;
      }
      for (const id of debris.keys()) physics.removeDynamicBody(id);
    } finally {
      physics.endBatch?.();
    }
    for (const t of savedTopology.values()) nav.registerBuilding(t);
    debris.clear();
    fires.clear();
    changed.clear();
    groupStage.clear();
    for (const c of enclosureCounts.values()) c.broken = 0;
    revision += 1;
    lastHeatAt = 0;
    hasBrokenSupport = false;
    ended = false;
  }

  ctx.events.on("battle-royale:started", reset);
  ctx.events.on("battle-royale:ended", () => {
    fires.clear();
    ended = true;
  });

  const originalStep = api.step.bind(api);
  api.step = (dt, now = Date.now()) => {
    clock = now;
    // Always finish draining already-queued structural collapses even if a blast ended the match
    // (e.g. player launched a 4m nuke inside a building) so collapse audio & physics play out cleanly.
    const due = [];
    for (const part of parts.values()) {
      if (part.state === "queued" && part.due <= now) {
        due.push(part);
      }
    }
    if (due.length) {
      due.sort((a, b) => a.due - b.due);
      const batch = due.slice(0, MAX_BREAKS_PER_TICK);
      physics.beginBatch?.();
      try {
        for (const part of batch) breakPart(part, now);
      } finally {
        physics.endBatch?.();
      }
    }

    const result = originalStep(dt, now);

    const contacts = physics.contactForces?.(128) ?? [];
    for (const contact of contacts) {
      if (contact.sequence <= contactCursor) continue;
      for (const obj of [contact.collider1?.worldObject, contact.collider2?.worldObject]) {
        const entry = debris.get(obj?.bodyId);
        if (!entry || now - entry.lastImpactAt < 260 || finite(contact.maxForceMagnitude) < 22) continue;
        const state = physics.dynamicBodyState(entry.id);
        if (state) {
          emitMaterialEvent(
            entry.part,
            "debris",
            clamp(finite(contact.maxForceMagnitude) / 950, 0.2, 0.78),
            state,
          );
          entry.lastImpactAt = now;
        }
      }
    }
    contactCursor = physics.contactForceCursor?.() ?? contactCursor;

    for (const [id, entry] of debris) {
      const state = physics.dynamicBodyState(id);
      if (!state || now >= entry.until || state.y < -40) {
        physics.removeDynamicBody(id);
        debris.delete(id);
      }
    }
    for (const [id, fire] of fires) {
      if (now >= fire.until) fires.delete(id);
    }
    if (now - lastHeatAt >= 1500 && fires.size) {
      lastHeatAt = now;
      for (const ent of entities.all()) {
        if (!ent.alive) continue;
        const transform = ctx.components.get(ent.id, "Transform");
        if (!transform) continue;
        if ([...fires.values()].some((fire) => distance3(fire, transform) < 2.5)) {
          combat.damage(ent.id, 3, { weaponId: "environment-fire", now });
        }
      }
    }
    return result;
  };

  const originalCreate = factory.createBuilding.bind(factory);
  factory.createBuilding = (spec) => {
    const result = originalCreate(spec);
    if (result?.id && result?.name) groupNames.set(result.id, result.name);
    if (result?.navigation) savedTopology.set(result.id, result.navigation);
    for (const w of map.walls ?? []) register(w.collider, w, w);
    for (const d of map.doors ?? []) {
      register(d.collider, { ...physics.colliderInfo(d.collider)?.worldObject, ...d, kind: "building-door" }, null, d);
    }
    return result;
  };

  function buildingIdAt(position, fallbackProfile = null) {
    const entry = factory.buildingAt?.(position);
    if (entry?.id) return entry.id;
    const b = map?.building;
    if (
      b
      && finite(position?.x) >= finite(b.minX) - 0.5
      && finite(position?.x) <= finite(b.maxX) + 0.5
      && finite(position?.z) >= finite(b.minZ) - 0.5
      && finite(position?.z) <= finite(b.maxZ) + 0.5
      && finite(position?.y) >= -1.5
    ) {
      return String(b.id ?? "warehouse");
    }
    if (String(fallbackProfile?.zone ?? "").startsWith("warehouse")) return "warehouse";
    return null;
  }

  function buildingStatesList() {
    const list = [];
    for (const [group, groupParts] of partsByGroup.entries()) {
      const evalSummary = evaluateBuildingStage(groupParts);
      const topo = savedTopology.get(group);
      const bounds = topo?.bounds
        ?? (group === "warehouse" && map?.building ? map.building : null);
      list.push({
        id: group,
        name: resolveBuildingName(group),
        style: groupParts[0]?.style ?? "interior",
        stage: groupStage.get(group) ?? evalSummary.stage,
        broken: evalSummary.broken,
        total: evalSummary.total,
        ratio: evalSummary.ratio,
        x: evalSummary.center.x,
        y: evalSummary.center.y,
        z: evalSummary.center.z,
        ...(bounds ? {
          bounds: {
            minX: finite(bounds.minX),
            maxX: finite(bounds.maxX),
            minZ: finite(bounds.minZ),
            maxZ: finite(bounds.maxZ),
          },
        } : {}),
      });
    }
    return list;
  }

  const baseProfile = map.acousticProfileAt?.bind(map);
  if (baseProfile) {
    map.acousticProfileAt = (position) => {
      const profile = baseProfile(position);
      const id = buildingIdAt(position, profile);
      if (!id || !profile) return profile;
      const enclosure = enclosureCounts.get(id);
      if (!enclosure?.total) return profile;
      const fraction = enclosure.broken / enclosure.total;
      return { ...profile, reverbMix: (Number(profile.reverbMix) || 0) * (1 - fraction * 0.92) };
    };
  }

  const baseLocationAt = map.locationAt?.bind(map);
  if (baseLocationAt) {
    map.locationAt = (position) => {
      const base = baseLocationAt(position);
      const id = buildingIdAt(position);
      if (!id) return base;
      const stage = groupStage.get(id);
      if (stage === "collapsed") {
        return `Руины: ${resolveBuildingName(id)}`;
      }
      if (stage === "breached" && base && !String(base).includes("разруш")) {
        return `${base} (разрушено частично)`;
      }
      return base;
    };
  }

  const baseSurfaceAt = map.surfaceAt?.bind(map);
  if (baseSurfaceAt) {
    map.surfaceAt = (position) => {
      const base = baseSurfaceAt(position);
      const id = buildingIdAt(position);
      if (!id) return base;
      const stage = groupStage.get(id);
      if (stage === "collapsed" || (stage === "breached" && base !== "metal")) {
        return "stone";
      }
      return base;
    };
  }

  const baseHeight = map.heightAt?.bind(map);
  if (baseHeight) {
    map.heightAt = (position) => {
      const base = baseHeight(position);
      if (!hasBrokenSupport) return base;
      const y = Math.max(finite(position?.y), finite(base)) + 0.12;
      const support = physics.raycastSupportWorld({ x: finite(position?.x), y, z: finite(position?.z) }, { x: 0, y: -1, z: 0 }, 50);
      return support ? y - support.distance : base;
    };
  }

  const originalSnapshot = api.snapshotFor.bind(api);
  api.snapshotFor = (id, now = Date.now()) => {
    const snapshot = originalSnapshot(id, now);
    const listener = ctx.components.get(snapshot.spectator?.active ? snapshot.spectator.targetId : id, "Transform");
    const localFires = [...fires.values()]
      .filter((fire) => listener && distance3(fire, listener) < 115)
      .sort((a, b) => distance3(a, listener) - distance3(b, listener))
      .slice(0, 6);
    const buildings = buildingStatesList().map(({ bounds: _bounds, ...rest }) => rest);
    snapshot.destruction = {
      revision,
      parts: [...changed.values()],
      buildings,
      fires: localFires.map((fire) => ({
        ...fire,
        occlusion: clamp(finite(map.acousticOcclusionBetween?.(listener, fire)), 0, 0.55),
      })),
    };
    return snapshot;
  };

  const originalEvents = api.eventsForPlayer.bind(api);
  api.eventsForPlayer = (id, packets = []) => {
    const base = originalEvents(id, packets);
    const seen = new Set(base);
    const listener = ctx.components.get(id, "Transform");
    const extras = [];
    for (const packet of packets) {
      if (seen.has(packet)) continue;
      if (packet.event !== "building:material" && packet.event !== "building:collapse") continue;
      if (!listener || !packet.payload) continue;
      const maxDist = finite(packet.payload.radius, 520);
      if (distance3(listener, packet.payload) >= maxDist) continue;
      const rawOcc = clamp(finite(map.acousticOcclusionBetween?.(listener, packet.payload)), 0, 1);
      const occ = packet.event === "building:collapse"
        ? Math.min(0.18, rawOcc * 0.45)
        : (packet.payload.stage === "break" || packet.payload.stage === "collapse")
          ? Math.min(0.32, rawOcc * 0.6)
          : Math.min(0.55, rawOcc);
      extras.push({
        ...packet,
        payload: {
          ...packet.payload,
          occlusion: occ,
        },
      });
    }
    return [...base, ...extras];
  };

  ctx.services.provide("building-destruction", {
    buildingStates: buildingStatesList,
    stageOf: (group) => groupStage.get(String(group)) ?? "intact",
    summary: () => ({
      parts: parts.size,
      changed: changed.size,
      broken: [...parts.values()].filter((p) => p.state === "broken").length,
      queued: [...parts.values()].filter((p) => p.state === "queued").length,
      fires: fires.size,
      debris: debris.size,
      buildings: Object.fromEntries(
        [...partsByGroup.entries()].map(([group, list]) => [group, evaluateBuildingStage(list)]),
      ),
    }),
  });
}
