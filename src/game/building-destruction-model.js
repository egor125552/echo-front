// Pure structural destruction model for Echo Front Battle Royale.
// Keeps blast attenuation, glass overpressure, shockwave timing, debris
// ballistic launch vectors, and cascading floor collapse 100% deterministic
// and unit-testable without a physics world.

export const DESTRUCTION_KINDS = Object.freeze([
  "building-wall",
  "building-door",
  "building-floor",
  "building-stair",
  "building-parapet",
  "building-window",
]);

export const DESTRUCTION_KIND_SET = new Set(DESTRUCTION_KINDS);

export const BUILDING_DESTRUCTION_RADII = Object.freeze({
  glass: 230,
  strain: 280,
  debris: 220,
  break: 460,
  collapse: 600,
});

export const MAX_BLAST_RADIUS_METERS = 320;
export const GLASS_OVERPRESSURE_MULTIPLIER = 1.48;
export const SHOCKWAVE_SPEED_MPS = 265;
export const DEFAULT_COLLAPSE_SUPPORT_THRESHOLD = 0.5;
export const MAJOR_COLLAPSE_SUPPORT_THRESHOLD = 0.42;

export function clamp(value, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return min;
  return Math.min(max, Math.max(min, num));
}

export function finite(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export function distance3(a, b) {
  return Math.hypot(
    finite(a?.x) - finite(b?.x),
    finite(a?.y) - finite(b?.y),
    finite(a?.z) - finite(b?.z),
  );
}

export function normalizeMaterial(raw) {
  const text = String(raw ?? "");
  if (/glass/i.test(text)) return "glass";
  if (/metal|steel|iron/i.test(text)) return "metal";
  if (/wood|timber|plank/i.test(text)) return "wood";
  if (/tile|ceramic|brick/i.test(text)) return "tile";
  return "stone";
}

export function materialMaxHp(material, elementType = "building-wall") {
  const mat = normalizeMaterial(material);
  if (elementType === "building-window" || mat === "glass") return 0.28;
  if (elementType === "building-door") {
    return mat === "metal" ? 0.92 : 0.62;
  }
  if (elementType === "building-parapet") {
    return mat === "wood" ? 0.72 : 0.95;
  }
  if (elementType === "building-stair") {
    return mat === "wood" ? 0.9 : 1.25;
  }
  if (elementType === "building-floor") {
    return mat === "wood" ? 1.0 : 1.35;
  }
  if (mat === "wood") return 0.82;
  if (mat === "tile") return 0.78;
  if (mat === "metal") return 1.32;
  return 1.15;
}

export function floorBandForPart(part) {
  const baseY = Number.isFinite(Number(part?.baseY))
    ? Number(part.baseY)
    : finite(part?.pos?.y) - (part?.type === "building-floor" ? 0 : 1.3);
  if (baseY < -1.5) return -1;
  if (baseY < 1.8) return 0;
  if (baseY < 5.0) return 1;
  return Math.min(4, Math.floor((baseY + 0.6) / 3.2));
}

export function audibilityRadiusForStage(stage, material = "stone", major = false) {
  const base = stage === "collapse"
    ? BUILDING_DESTRUCTION_RADII.collapse
    : stage === "break"
      ? (material === "glass" ? BUILDING_DESTRUCTION_RADII.glass : BUILDING_DESTRUCTION_RADII.break)
      : stage === "strain"
        ? BUILDING_DESTRUCTION_RADII.strain
        : BUILDING_DESTRUCTION_RADII.debris;
  return major ? Math.round(base * 1.18) : base;
}

/**
 * Evaluates structural blast damage against a single building part.
 * Supports full Mini-Nuke (185m), Charged Smertonos (105m), Mines, and Electro Slam
 * without artificial 80m clamps, plus extended overpressure glass blowout.
 */
export function evaluateBlastPartDamage(part, blastOrigin, options = {}) {
  const radius = clamp(finite(options.blastRadius, 14), 2, MAX_BLAST_RADIUS_METERS);
  const major = Boolean(options.major);
  const chargeRatio = clamp(finite(options.chargeRatio, 0), 0, 1);
  const kind = String(options.kind ?? (major ? "nuke" : "cannon"));
  const dist = distance3(part?.pos, blastOrigin);

  const isGlass = part?.type === "building-window" || part?.m === "glass";
  const effectiveRadius = isGlass
    ? Math.min(MAX_BLAST_RADIUS_METERS, radius * (major ? GLASS_OVERPRESSURE_MULTIPLIER : 1.32))
    : radius;

  if (dist > effectiveRadius) {
    return {
      hit: false,
      damage: 0,
      shatterNow: false,
      ignite: false,
      isGlassWave: false,
      distance: dist,
      normalizedDistance: dist / Math.max(1, effectiveRadius),
    };
  }

  const normalized = clamp(dist / Math.max(1, effectiveRadius), 0, 1);
  // Nuke and heavy cannon carry strong overpressure deep into the radius (smooth power curve).
  const falloff = major
    ? Math.pow(1 - normalized * 0.88, 0.72)
    : Math.pow(1 - normalized * 0.92, 0.88);

  let basePower = major
    ? 2.85
    : kind === "mine"
      ? 1.12
      : kind === "electro-slam"
        ? 1.28
        : kind === "cannon-pierce"
          ? 2.2
          : (1.28 + chargeRatio * 0.72 + clamp((radius - 30) / 90, 0, 0.55));

  if (isGlass) {
    basePower *= 1.65;
  } else if (part?.m === "wood" || part?.m === "tile") {
    basePower *= 1.2;
  } else if (part?.type === "building-door") {
    basePower *= 1.3;
  } else if (part?.m === "metal") {
    basePower *= 0.88;
  }

  const damage = Number((basePower * falloff).toFixed(4));
  const isGlassWave = isGlass && dist > radius * 0.85;
  const directCore = normalized <= (major ? 0.42 : 0.34);
  const ignite = !isGlass && (
    (major && normalized <= 0.78 && damage >= 0.42)
    || (part?.m === "wood" && damage >= 0.34)
    || (!major && chargeRatio >= 0.45 && normalized <= 0.55 && damage >= 0.55)
  );

  return {
    hit: damage > 0.04,
    damage,
    shatterNow: directCore && (isGlass || damage >= finite(part?.hp, 1)),
    ignite,
    isGlassWave,
    distance: dist,
    normalizedDistance: normalized,
  };
}

/**
 * Computes realistic shockwave + staggered post-blast collapse timing so
 * players hear glass shatter along the blast front and walls/floors collapse
 * in a rolling 0.6s-3.1s cascade AFTER the main explosion transient instead of
 * being masked by the blast peak.
 */
export function computeDestructionDelayMs({
  distance = 0,
  blastRadius = 50,
  material = "stone",
  major = false,
  cascaded = false,
  floorBand = 0,
  directPierce = false,
  seed = 0,
} = {}) {
  const safeDist = Math.max(0, finite(distance));
  const safeRadius = Math.max(4, finite(blastRadius, 50));
  const jitter = Math.abs(Math.floor(finite(seed))) % 1000;

  if (directPierce) {
    return 15 + (jitter % 55);
  }

  if (cascaded) {
    const bandDelay = Math.max(0, Math.floor(finite(floorBand))) * 460;
    const base = major ? 1550 : 880;
    return Math.round(base + bandDelay + (jitter % 1350));
  }

  // Acoustic/blast wave arrival from epicenter (~265 m/s)
  const waveMs = Math.min(920, Math.round((safeDist / SHOCKWAVE_SPEED_MPS) * 1000));

  if (material === "glass") {
    // Glass blows out right on the shockwave front with crisp high-frequency shatter!
    return Math.round(55 + waveMs * 0.85 + (jitter % 180));
  }

  const norm = clamp(safeDist / safeRadius, 0, 1);
  if (major) {
    // Mini-Nuke: core panels blow at 0.52..1.35s right after the initial nuclear crack,
    // mid/outer structures fold in a dramatic 1.35s..3.35s wave as thunder opens up!
    if (norm <= 0.28) {
      return Math.round(520 + waveMs * 0.65 + (jitter % 420));
    }
    return Math.round(1150 + waveMs * 0.9 + norm * 1050 + (jitter % 760));
  }

  // Cannon / Mine / Electro-Slam: punchy breach + audible rubble follow-through
  if (norm <= 0.35) {
    return Math.round(160 + waveMs * 0.6 + (jitter % 280));
  }
  return Math.round(460 + waveMs + norm * 680 + (jitter % 520));
}

/**
 * Computes outward + upward blast velocity and tumbling angular velocity
 * for dynamic Rapier rubble chunks so debris blasts outward instead of
 * dropping straight down with zero velocity.
 */
export function computeDebrisLaunchVelocity({
  partPos,
  blastOrigin,
  blastPower = 1,
  blastRadius = 50,
  material = "stone",
  impulseDir = null,
  cascaded = false,
  seed = 0,
} = {}) {
  const s = Math.abs(Math.floor(finite(seed)));
  const randA = ((s % 97) / 97) - 0.5;
  const randB = (((s >>> 4) % 89) / 89) - 0.5;
  const randC = (((s >>> 9) % 83) / 83) - 0.5;

  const lightness = material === "glass"
    ? 1.38
    : material === "wood" || material === "tile"
      ? 1.18
      : material === "metal"
        ? 0.85
        : 0.96;

  if (cascaded || !blastOrigin) {
    // Gravity-driven collapse scatter: slight outward spread, downward drop, lively tumble
    const spread = (1.8 + Math.abs(randA) * 3.4) * lightness;
    const angle = (s % 360) * (Math.PI / 180);
    return {
      linvel: {
        x: Number((Math.cos(angle) * spread).toFixed(2)),
        y: Number((-1.2 + Math.abs(randB) * 2.4).toFixed(2)),
        z: Number((Math.sin(angle) * spread).toFixed(2)),
      },
      angvel: {
        x: Number((randA * 8.5).toFixed(2)),
        y: Number((randB * 7.5).toFixed(2)),
        z: Number((randC * 8.5).toFixed(2)),
      },
    };
  }

  let dirX = 0;
  let dirY = 0;
  let dirZ = 0;

  if (impulseDir && Math.hypot(finite(impulseDir.x), finite(impulseDir.y), finite(impulseDir.z)) > 0.05) {
    const len = Math.hypot(finite(impulseDir.x), finite(impulseDir.y), finite(impulseDir.z));
    dirX = finite(impulseDir.x) / len;
    dirY = finite(impulseDir.y) / len;
    dirZ = finite(impulseDir.z) / len;
  } else {
    const dx = finite(partPos?.x) - finite(blastOrigin?.x);
    const dy = finite(partPos?.y) - finite(blastOrigin?.y);
    const dz = finite(partPos?.z) - finite(blastOrigin?.z);
    const horiz = Math.hypot(dx, dz);
    if (horiz > 0.15) {
      dirX = dx / horiz;
      dirZ = dz / horiz;
      dirY = clamp(dy / Math.max(3, horiz), -0.15, 0.45);
    } else {
      const angle = (s % 360) * (Math.PI / 180);
      dirX = Math.cos(angle);
      dirZ = Math.sin(angle);
      dirY = 0.55;
    }
  }

  const dist = distance3(partPos, blastOrigin);
  const safeRadius = Math.max(6, finite(blastRadius, 50));
  const proximity = clamp(1 - dist / (safeRadius * 1.15), 0.18, 1);
  const power = clamp(finite(blastPower, 1), 0.35, 3.2);
  const speed = clamp((6.5 + power * 10.5 * proximity) * lightness, 4.5, 32);
  const loft = clamp((3.2 + power * 6.2 * proximity) * lightness + Math.abs(randB) * 2.5, 2.5, 19);

  return {
    linvel: {
      x: Number((dirX * speed + randA * 3.5).toFixed(2)),
      y: Number((Math.max(1.5, dirY * speed * 0.45 + loft)).toFixed(2)),
      z: Number((dirZ * speed + randC * 3.5).toFixed(2)),
    },
    angvel: {
      x: Number((randA * (9 + power * 4)).toFixed(2)),
      y: Number((randB * (8 + power * 3.5)).toFixed(2)),
      z: Number((randC * (9 + power * 4)).toFixed(2)),
    },
  };
}

const LOAD_BEARING_TYPES = new Set(["building-wall", "building-window", "building-door"]);

/**
 * Structural cascade solver: groups a building's parts by floor band.
 * If load-bearing vertical panels on a lower band cross the collapse threshold,
 * all non-protected upper floors, upper walls, roof parapets, and stairs leading
 * upward lose structural support and are returned for cascading collapse.
 */
export function findUnsupportedUpperParts(buildingParts = [], options = {}) {
  if (!Array.isArray(buildingParts) || !buildingParts.length) return [];
  const threshold = clamp(
    finite(options.collapseThreshold, options.major ? MAJOR_COLLAPSE_SUPPORT_THRESHOLD : DEFAULT_COLLAPSE_SUPPORT_THRESHOLD),
    0.25,
    0.9,
  );

  const bands = new Map();
  for (const part of buildingParts) {
    if (!part) continue;
    const band = Number.isFinite(Number(part.floorBand))
      ? Number(part.floorBand)
      : floorBandForPart(part);
    if (band < 0) continue; // Underground containment is never collapsed by surface cascade.
    let bucket = bands.get(band);
    if (!bucket) {
      bucket = { loadTotal: 0, loadLost: 0, parts: [] };
      bands.set(band, bucket);
    }
    bucket.parts.push(part);
    if (LOAD_BEARING_TYPES.has(part.type) && !part.protectedSupport) {
      bucket.loadTotal += 1;
      if (part.state === "broken" || part.state === "queued") {
        bucket.loadLost += 1;
      }
    }
  }

  let lowestFailedBand = Infinity;
  for (const [band, bucket] of bands.entries()) {
    if (bucket.loadTotal < 2) continue;
    if (bucket.loadLost / bucket.loadTotal >= threshold) {
      if (band < lowestFailedBand) lowestFailedBand = band;
    }
  }

  if (!Number.isFinite(lowestFailedBand)) return [];

  const unsupported = [];
  for (const [band, bucket] of [...bands.entries()].sort((a, b) => a[0] - b[0])) {
    for (const part of bucket.parts) {
      if (part.protectedSupport || part.state === "broken" || part.state === "queued") continue;
      if (band > lowestFailedBand) {
        unsupported.push(part);
      } else if (band === lowestFailedBand && part.type === "building-stair") {
        // Stairs anchoring from a collapsed floor also fail.
        unsupported.push(part);
      }
    }
  }
  return unsupported;
}

/**
 * Evaluates aggregate building structural integrity for collapse events,
 * haptics, and VoiceOver callouts.
 */
export function evaluateBuildingStage(buildingParts = []) {
  let total = 0;
  let broken = 0;
  let damaged = 0;
  let sumX = 0;
  let sumY = 0;
  let sumZ = 0;
  let countPos = 0;

  for (const part of buildingParts) {
    if (!part || part.protectedSupport) continue;
    total += 1;
    if (part.state === "broken") broken += 1;
    else if (part.state === "damaged" || part.state === "queued") damaged += 1;
    if (part.pos) {
      sumX += finite(part.pos.x);
      sumY += finite(part.pos.y);
      sumZ += finite(part.pos.z);
      countPos += 1;
    }
  }

  const ratio = total > 0 ? broken / total : 0;
  const stage = ratio >= 0.45
    ? "collapsed"
    : broken >= 2 || ratio >= 0.14
      ? "breached"
      : damaged > 0 || broken > 0
        ? "damaged"
        : "intact";

  return {
    total,
    broken,
    damaged,
    ratio: Number(ratio.toFixed(3)),
    stage,
    center: countPos > 0
      ? {
        x: Number((sumX / countPos).toFixed(2)),
        y: Number((sumY / countPos).toFixed(2)),
        z: Number((sumZ / countPos).toFixed(2)),
      }
      : { x: 0, y: 1.5, z: 0 },
  };
}

/**
 * Computes which buildings lie within a blast radius from an aim/impact point,
 * sorted nearest-first so blind players receive exact building targets before launch.
 */
export function buildingsInBlastZone(buildings = [], blastOrigin = null, blastRadius = 185) {
  if (!Array.isArray(buildings) || !blastOrigin) return [];
  const radius = Math.max(1, finite(blastRadius, 185));
  const ox = finite(blastOrigin.x);
  const oz = finite(blastOrigin.z);
  const hits = [];

  for (const b of buildings) {
    if (!b || b.id === "underground") continue;
    const minX = finite(b.bounds?.minX, finite(b.x) - 10);
    const maxX = finite(b.bounds?.maxX, finite(b.x) + 10);
    const minZ = finite(b.bounds?.minZ, finite(b.z) - 10);
    const maxZ = finite(b.bounds?.maxZ, finite(b.z) + 10);
    const clampedX = clamp(ox, minX, maxX);
    const clampedZ = clamp(oz, minZ, maxZ);
    const edgeDist = Math.hypot(ox - clampedX, oz - clampedZ);
    if (edgeDist > radius) continue;
    const centerX = finite(b.x, (minX + maxX) / 2);
    const centerZ = finite(b.z, (minZ + maxZ) / 2);
    const centerDist = Math.hypot(ox - centerX, oz - centerZ);
    hits.push({
      id: String(b.id ?? "building"),
      name: String(b.name ?? b.id ?? "Здание"),
      stage: String(b.stage ?? "intact"),
      edgeDistance: Math.round(edgeDist),
      centerDistance: Math.round(centerDist),
      direct: edgeDist <= 12 || centerDist <= radius * 0.45,
    });
  }

  return hits.sort((a, b) => a.edgeDistance - b.edgeDistance || a.centerDistance - b.centerDistance);
}

