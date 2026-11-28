// Independent multi-layer spatial destruction audio mixer (174 recorded layers).
// Consumes authoritative server building:material, building:collapse, and snapshot.destruction state.
export const manifest = {
  id: "building-destruction-audio",
  requires: ["spatial-audio-web", "cloudflare-session"],
};

const ROOT = "/assets/audio/destruction/";
const variants = (prefix, count) => Array.from({ length: count }, (_, i) => `${prefix}-${i + 1}`);

export const DESTRUCTION_AUDIO_ASSETS = Object.freeze({
  materials: {
    glass: {
      hit: variants("glass-hit", 7),
      fall: variants("glass-rain", 7),
      detail: variants("glass-detail", 3),
    },
    wood: {
      hit: variants("wood-crack", 5),
      fall: variants("wood-fall", 5),
      detail: variants("wood-detail", 3),
    },
    stone: {
      hit: variants("stone-hit", 6),
      fall: variants("stone-fall", 6),
      detail: variants("stone-detail", 3),
    },
    metal: {
      hit: variants("metal-hit", 6),
      fall: variants("metal-rattle", 7),
      strain: variants("metal-bend", 6),
      detail: variants("metal-detail", 4),
    },
    tile: {
      hit: variants("tile-break", 4),
      fall: variants("tile-fall", 4),
    },
  },
  elements: {
    window: { frame: variants("window-frame", 5) },
    door: { impact: variants("door-impact", 5), hinge: variants("door-hinge", 5) },
    floor: { creak: variants("floor-creak", 5), break: variants("floor-break", 5) },
    beam: { strain: variants("beam-strain", 5), fall: variants("beam-fall", 5) },
    stair: { hit: variants("stair-hit", 5), rattle: variants("stair-rattle", 5) },
    roof: { break: variants("roof-break", 5), fall: variants("roof-fall", 5) },
    wall: {
      heavy: variants("wall-heavy", 5),
      rubble: variants("wall-rubble", 5),
      detail: variants("wall-detail", 5),
    },
    chain: variants("chain", 5),
    metalStructure: variants("metal-structure", 5),
  },
  dust: variants("dust", 6),
  fireLow: ["fire-low", "fire-low-2"],
  fireCrackle: ["fire-crackle", "fire-crackle-2"],
  firePops: ["fire-pop", "fire-pop-2", "fire-pop-3"],
  crateLoops: ["crate-mass", "crate-scrape", "crate-grit"],
  crateEvents: ["crate-start", "crate-stop"],
});

const assets = DESTRUCTION_AUDIO_ASSETS.materials;
const elementAssets = DESTRUCTION_AUDIO_ASSETS.elements;
const dust = DESTRUCTION_AUDIO_ASSETS.dust;
const fireLow = DESTRUCTION_AUDIO_ASSETS.fireLow;
const fireCrackle = DESTRUCTION_AUDIO_ASSETS.fireCrackle;
const firePops = DESTRUCTION_AUDIO_ASSETS.firePops;
const crateKeys = DESTRUCTION_AUDIO_ASSETS.crateLoops;
const loopKeySet = new Set([...fireLow, ...fireCrackle, ...crateKeys]);

const STAGE_SPATIAL_PROFILES = Object.freeze({
  collapse: { radius: 680, referenceDistance: 85, rolloffFactor: 0.036, airAbsorptionMinHz: 1100 },
  break: { radius: 520, referenceDistance: 56, rolloffFactor: 0.052, airAbsorptionMinHz: 1400 },
  glass: { radius: 340, referenceDistance: 42, rolloffFactor: 0.068, airAbsorptionMinHz: 2400 },
  strain: { radius: 320, referenceDistance: 28, rolloffFactor: 0.095, airAbsorptionMinHz: 1700 },
  debris: { radius: 260, referenceDistance: 20, rolloffFactor: 0.12, airAbsorptionMinHz: 2100 },
});

const MAX_ACTIVE_VOICES = 64;
const COLD_CACHE_MAX_WAIT_MS = 1800;

export function assetUrlForKey(key) {
  return `${ROOT}${key}${loopKeySet.has(key) ? ".wav" : ".mp3"}`;
}

export function listAllDestructionAudioKeys() {
  const materialList = Object.values(assets).flatMap((group) => Object.values(group).flat());
  const elementList = [
    ...elementAssets.window.frame,
    ...elementAssets.door.impact,
    ...elementAssets.door.hinge,
    ...elementAssets.floor.creak,
    ...elementAssets.floor.break,
    ...elementAssets.beam.strain,
    ...elementAssets.beam.fall,
    ...elementAssets.stair.hit,
    ...elementAssets.stair.rattle,
    ...elementAssets.roof.break,
    ...elementAssets.roof.fall,
    ...elementAssets.wall.heavy,
    ...elementAssets.wall.rubble,
    ...elementAssets.wall.detail,
    ...elementAssets.chain,
    ...elementAssets.metalStructure,
  ];
  return [
    ...new Set([
      ...materialList,
      ...elementList,
      ...dust,
      ...fireLow,
      ...fireCrackle,
      ...firePops,
      ...crateKeys,
      ...DESTRUCTION_AUDIO_ASSETS.crateEvents,
    ]),
  ];
}

const hash = (s) => {
  let h = 2166136261;
  for (const c of String(s ?? "")) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
};

const limit = (x, a, b) => Math.max(a, Math.min(b, Number(x) || 0));

function choose(list, n) {
  return list[Math.abs(Math.floor(n)) % list.length];
}

function nowMs() {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

export async function setup(ctx) {
  const audio = ctx.services.get("audio");
  const network = ctx.services.get("network");
  const cache = new Map();
  const pending = new Map();
  const fires = new Map();
  const voices = new Set();
  const timers = new Set();
  const throttleBuckets = new Map();
  const all = listAllDestructionAudioKeys();

  let generation = 0;
  let warming = null;
  let nextRuinCreakAt = 0;
  let ruinCreakCounter = 0;

  function load(k) {
    if (cache.has(k)) return Promise.resolve(cache.get(k));
    if (pending.has(k)) return pending.get(k);
    const p = Promise.resolve()
      .then(() => audio.load(assetUrlForKey(k)))
      .then((b) => {
        if (!b) throw new Error(`Failed to decode destruction asset: ${k}`);
        cache.set(k, b);
        return b;
      })
      .finally(() => pending.delete(k));
    pending.set(k, p);
    return p;
  }

  // Warm a compact mobile-safe core set (1st variant of every material/element family + all loops)
  // using a 6-worker queue so iOS Safari never chokes on 174 simultaneous decodes.
  function warm() {
    if (warming) return warming;
    const ordered = [
      ...new Set([
        ...crateKeys,
        ...DESTRUCTION_AUDIO_ASSETS.crateEvents,
        ...fireLow,
        ...fireCrackle,
        ...Object.values(assets).flatMap((a) => [a.hit[0], a.fall[0], ...(a.strain ? [a.strain[0]] : []), ...(a.detail ? [a.detail[0]] : [])]),
        elementAssets.window.frame[0],
        elementAssets.door.impact[0],
        elementAssets.door.hinge[0],
        elementAssets.floor.creak[0],
        elementAssets.floor.break[0],
        elementAssets.beam.strain[0],
        elementAssets.beam.fall[0],
        elementAssets.stair.hit[0],
        elementAssets.stair.rattle[0],
        elementAssets.roof.break[0],
        elementAssets.roof.fall[0],
        elementAssets.wall.heavy[0],
        elementAssets.wall.rubble[0],
        elementAssets.wall.detail[0],
        elementAssets.chain[0],
        elementAssets.metalStructure[0],
        ...dust.slice(0, 2),
        ...firePops.slice(0, 2),
      ]),
    ];
    const results = new Array(ordered.length);
    let cursor = 0;
    warming = Promise.all(
      Array.from({ length: 6 }, async () => {
        while (cursor < ordered.length) {
          const i = cursor++;
          try {
            results[i] = { status: "fulfilled", value: await load(ordered[i]) };
          } catch (reason) {
            results[i] = { status: "rejected", reason };
          }
        }
      }),
    )
      .then(() => results)
      .finally(() => {
        warming = null;
      });
    return warming;
  }

  const warmAll = () => {
    const results = new Array(all.length);
    let cursor = 0;
    return Promise.all(
      Array.from({ length: 8 }, async () => {
        while (cursor < all.length) {
          const i = cursor++;
          try {
            results[i] = { status: "fulfilled", value: await load(all[i]) };
          } catch (reason) {
            results[i] = { status: "rejected", reason };
          }
        }
      }),
    ).then(() => results);
  };

  void warm();

  function schedule(delayMs, fn) {
    const token = generation;
    if (delayMs <= 0) {
      fn();
      return;
    }
    const id = setTimeout(() => {
      timers.delete(id);
      if (token !== generation) return;
      fn();
    }, delayMs);
    timers.add(id);
  }

  function allowBucket(bucketKey, cooldownMs) {
    const now = nowMs();
    const last = throttleBuckets.get(bucketKey) ?? -Infinity;
    if (now - last < cooldownMs) return false;
    throttleBuckets.set(bucketKey, now);
    if (throttleBuckets.size > 128) {
      for (const [k, ts] of throttleBuckets) {
        if (now - ts > 4000) throttleBuckets.delete(k);
      }
    }
    return true;
  }

  function select(keys, n) {
    const wanted = choose(keys, n);
    if (cache.has(wanted)) return wanted;
    // Lazily warm the desired variant in the background while immediately
    // playing an already-decoded sibling so there is zero audible delay.
    void load(wanted).catch(() => {});
    const loaded = keys.filter((k) => cache.has(k));
    return loaded.length ? choose(loaded, n) : wanted;
  }

  function playBuffer(b, p, g, profileKey = "break", extra = {}) {
    const profile = STAGE_SPATIAL_PROFILES[profileKey] ?? STAGE_SPATIAL_PROFILES.break;
    const radius = Math.max(profile.radius, Number(p?.radius) || 0, Number(extra.radius) || 0);
    const h = audio.playSpatialBuffer(b, p, {
      ...profile,
      radius,
      gain: g,
      occlusion: limit(p?.occlusion, 0, 1),
      ...extra,
    });
    if (h && !extra.loop) {
      voices.add(h);
      const cleanup = () => voices.delete(h);
      if (typeof h.source?.addEventListener === "function") {
        h.source.addEventListener("ended", cleanup, { once: true });
      }
      const rate = Math.max(0.5, Number(extra.playbackRate) || 1);
      const ttlMs = Math.min(14000, Math.max(3200, Math.round(((Number(b?.duration) || 3) / rate) * 1000) + 1200));
      schedule(ttlMs, cleanup);
    }
    return h;
  }

  function play(k, p, g, profileKey = "break", extra = {}) {
    const b = cache.get(k);
    if (b) return playBuffer(b, p, g, profileKey, extra);
    // Cold-cache recovery (critical on iOS Safari when AudioContext unlocks late):
    // decode immediately and still trigger playback if it finishes within the freshness window.
    const token = generation;
    const requestedAt = nowMs();
    void load(k)
      .then((decoded) => {
        if (token !== generation) return;
        if (!extra.loop && nowMs() - requestedAt > COLD_CACHE_MAX_WAIT_MS) return;
        if (!extra.loop && voices.size >= MAX_ACTIVE_VOICES) return;
        playBuffer(decoded, p, g, profileKey, extra);
      })
      .catch(() => {});
    return null;
  }

  function one(k, p, g, profileKey = "break", extra = {}) {
    if (voices.size >= MAX_ACTIVE_VOICES) return null;
    return play(k, p, g, profileKey, extra);
  }

  function styleFlags(style) {
    const s = String(style ?? "interior");
    return {
      industrial: s === "industrial" || s === "underground",
      timber: s === "timber" || s === "multi-level",
      interior: s === "interior",
    };
  }

  function scheduleElementLayers(p, n, baseGain, stage, profileKey, rate) {
    const element = p.element;
    const { industrial, timber } = styleFlags(p.style);
    const isCollapse = stage === "collapse";
    const heavyScale = isCollapse ? 1.18 : 1.0;

    if (stage === "strain") {
      if (element === "building-door") {
        schedule(25, () => one(select(elementAssets.door.hinge, n), p, baseGain * 0.56, "strain", { playbackRate: rate }));
      } else if (element === "building-floor") {
        schedule(20, () => one(select(elementAssets.floor.creak, n), p, baseGain * 0.62, "strain", { playbackRate: rate }));
      } else if (element === "building-stair") {
        schedule(25, () => one(select(elementAssets.stair.rattle, n), p, baseGain * 0.64, "strain", { playbackRate: rate }));
      }
      if ((element === "building-wall" || element === "building-floor") && timber) {
        schedule(55, () => one(select(elementAssets.beam.strain, n + 1), p, baseGain * 0.66, "strain", { playbackRate: rate * 0.96 }));
      }
      if (industrial && element !== "building-window") {
        schedule(70, () => one(select(elementAssets.metalStructure, n + 2), p, baseGain * 0.58, "strain", { playbackRate: rate * 0.95 }));
      }
      return;
    }

    if (stage === "debris") {
      if (element === "building-wall") {
        schedule(30, () => one(select(elementAssets.wall.detail, n), p, baseGain * 0.62, "debris", { playbackRate: 1.04 }));
      } else if (element === "building-stair") {
        schedule(35, () => one(select(elementAssets.chain, n), p, baseGain * 0.56, "debris", { playbackRate: 1.05 }));
      } else if (element === "building-parapet") {
        schedule(30, () => one(select(elementAssets.roof.fall, n), p, baseGain * 0.58, "debris", { playbackRate: 1.06 }));
      }
      return;
    }

    if (stage !== "break" && stage !== "collapse") return;

    if (element === "building-window") {
      schedule(32, () => one(select(elementAssets.window.frame, n), p, baseGain * 0.72, "glass", { playbackRate: rate }));
      return;
    }

    if (element === "building-door") {
      one(select(elementAssets.door.impact, n), p, baseGain * 0.88 * heavyScale, profileKey, { playbackRate: rate });
      schedule(68, () => one(select(elementAssets.door.hinge, n + 1), p, baseGain * 0.58, profileKey, { playbackRate: rate * 1.02 }));
      if (industrial) {
        schedule(135, () => one(select(elementAssets.chain, n + 2), p, baseGain * 0.52, profileKey, { playbackRate: 1.02 }));
      }
      return;
    }

    if (element === "building-floor") {
      one(select(elementAssets.floor.break, n), p, baseGain * 0.88 * heavyScale, profileKey, { playbackRate: rate * 0.95 });
      schedule(65, () => one(select(elementAssets.floor.creak, n + 1), p, baseGain * 0.54, profileKey, { playbackRate: rate }));
      if (timber) {
        schedule(165, () => one(select(elementAssets.beam.fall, n + 2), p, baseGain * 0.72 * heavyScale, profileKey, { playbackRate: rate * 0.93 }));
      }
      if (Number(p.y) > 3.2 || isCollapse) {
        schedule(225, () => one(select(elementAssets.roof.fall, n + 3), p, baseGain * 0.58 * heavyScale, profileKey, { playbackRate: rate * 0.96 }));
      }
      return;
    }

    if (element === "building-stair") {
      one(select(elementAssets.stair.hit, n), p, baseGain * 0.86 * heavyScale, profileKey, { playbackRate: rate });
      schedule(85, () => one(select(elementAssets.stair.rattle, n + 1), p, baseGain * 0.74, profileKey, { playbackRate: rate * 1.02 }));
      schedule(155, () => one(select(elementAssets.chain, n + 2), p, baseGain * 0.54, profileKey, { playbackRate: 1.04 }));
      return;
    }

    if (element === "building-parapet") {
      one(select(elementAssets.roof.break, n), p, baseGain * 0.84 * heavyScale, profileKey, { playbackRate: rate });
      schedule(125, () => one(select(elementAssets.roof.fall, n + 1), p, baseGain * 0.76 * heavyScale, profileKey, { playbackRate: rate * 0.96 }));
      if (industrial) {
        schedule(160, () => one(select(elementAssets.metalStructure, n + 2), p, baseGain * 0.62, profileKey, { playbackRate: rate * 0.94 }));
      }
      return;
    }

    if (element === "building-wall") {
      one(select(elementAssets.wall.heavy, n), p, baseGain * 0.9 * heavyScale, profileKey, { playbackRate: rate * 0.94 });
      schedule(115, () => one(select(elementAssets.wall.rubble, n + 1), p, baseGain * 0.76 * heavyScale, profileKey, { playbackRate: rate * 0.97 }));
      schedule(225, () => one(select(elementAssets.wall.detail, n + 2), p, baseGain * 0.52, "debris", { playbackRate: 1.03 }));
      if (timber) {
        schedule(75, () => one(select(elementAssets.beam.strain, n + 3), p, baseGain * 0.54, profileKey, { playbackRate: rate * 0.96 }));
        schedule(185, () => one(select(elementAssets.beam.fall, n + 4), p, baseGain * 0.68 * heavyScale, profileKey, { playbackRate: rate * 0.92 }));
      }
      if (industrial) {
        schedule(95, () => one(select(elementAssets.metalStructure, n + 3), p, baseGain * 0.68 * heavyScale, profileKey, { playbackRate: rate * 0.93 }));
      }
    }
  }

  function onMaterialEvent(p) {
    const material = p.material && assets[p.material] ? p.material : "stone";
    const a = assets[material];
    const stage = String(p.stage ?? "break");
    const intensity = limit(p.intensity, 0.15, 1);
    const n = hash(p.id) + Math.abs(Number(p.variant) || 0) * 17 + hash(stage) + hash(p.now ?? 0);
    const bucketKey = `${p.buildingId ?? "b"}:${p.element ?? "part"}:${material}:${stage}`;

    if (stage === "strain") {
      if (voices.size >= 34) return;
      if (!allowBucket(bucketKey, 240)) return;
      const g = 0.52 + 0.52 * intensity;
      const rate = 0.92 + (n % 3) * 0.05;
      one(select(a.strain ?? a.hit, n), p, g * 0.78, "strain", { playbackRate: rate });
      scheduleElementLayers(p, n, g, "strain", "strain", rate);
      return;
    }

    if (stage === "debris") {
      if (voices.size >= 40) return;
      if (!allowBucket(bucketKey, 180)) return;
      const g = 0.42 + 0.44 * intensity;
      one(select(a.detail ?? a.fall, n), p, g * 0.72, "debris", { playbackRate: 1.04 + (n % 3) * 0.04 });
      scheduleElementLayers(p, n, g, "debris", "debris", 1.04);
      return;
    }

    if (stage !== "break" && stage !== "collapse") return;

    const isGlass = material === "glass" || p.element === "building-window";
    const isCollapse = stage === "collapse";
    const cooldownMs = isCollapse ? 175 : isGlass ? 115 : 145;
    if (!allowBucket(bucketKey, cooldownMs)) return;

    const profileKey = isCollapse ? "collapse" : isGlass ? "glass" : "break";
    const majorBoost = p.major || isCollapse ? 1.18 : 1.0;
    const baseGain = (isCollapse ? 0.94 + 0.48 * intensity : 0.74 + 0.52 * intensity) * majorBoost;
    const rate = isCollapse ? 0.87 + (n % 3) * 0.035 : 0.93 + (n % 3) * 0.05;
    const { industrial, timber, interior } = styleFlags(p.style);

    // 1. Primary impact transient at t = 0ms
    one(select(a.hit, n), p, baseGain, profileKey, { playbackRate: rate });

    // 2. Specialized element layers (staggered internally)
    scheduleElementLayers(p, n, baseGain, stage, profileKey, rate);

    // 3. Secondary gravity fall & material scatter (staggered 85..150ms)
    const fallDelay = isGlass ? 78 : isCollapse ? 125 : 105;
    schedule(fallDelay, () => {
      one(select(a.fall, n + 1), p, baseGain * (isCollapse ? 0.92 : 0.82), profileKey, { playbackRate: rate * 0.97 });
    });

    if (isGlass && material !== "glass") {
      schedule(88, () => one(select(assets.glass.fall, n + 2), p, baseGain * 0.78, "glass", { playbackRate: 1.02 }));
    }
    if (p.element === "building-door" && material === "wood") {
      schedule(42, () => one(select(assets.wood.hit, n + 1), p, baseGain * 0.64, profileKey, { playbackRate: rate * 1.04 }));
    }
    if (p.element === "building-stair") {
      schedule(140, () => one(select(assets.metal.fall, n + 1), p, baseGain * 0.68, profileKey, { playbackRate: rate }));
    }
    if (industrial && material !== "metal") {
      schedule(135, () => one(select(assets.metal.fall, n + 2), p, baseGain * 0.56, profileKey, { playbackRate: rate * 0.96 }));
    }
    if (timber && material !== "wood" && !isGlass) {
      schedule(145, () => one(select(assets.wood.fall, n + 2), p, baseGain * 0.58, profileKey, { playbackRate: rate * 0.95 }));
    }
    if (interior && material === "stone" && p.element !== "building-floor") {
      schedule(155, () => one(select(assets.tile.fall, n + 2), p, baseGain * 0.48, profileKey, { playbackRate: 1.02 }));
    }

    // 4. Fine material detail & dust cloud settling (205..280ms)
    if (a.detail) {
      schedule(isGlass ? 175 : 210, () => {
        one(select(a.detail, n + 2), p, baseGain * 0.52, "debris", { playbackRate: 1.03 });
      });
    }
    if (p.element === "building-floor" || p.element === "building-wall" || p.element === "building-parapet" || isCollapse) {
      schedule(isCollapse ? 265 : 235, () => {
        one(select(dust, n), p, baseGain * (isCollapse ? 0.78 : 0.64), profileKey, { playbackRate: 0.94 + (n % 2) * 0.06 });
      });
    }
  }

  // Dedicated multi-phase cinematic collapse signature for whole-building breached / collapsed milestones.
  function onBuildingCollapse(p) {
    const full = p.stage === "collapsed";
    const n = hash(p.buildingId ?? p.buildingName ?? "building") + (full ? 31 : 7);
    const { industrial, timber } = styleFlags(p.style);
    const pos = {
      x: Number(p.x) || 0,
      y: Math.max(1.5, Number(p.y) || 2),
      z: Number(p.z) || 0,
      radius: Math.max(680, Number(p.radius) || 680),
      occlusion: limit(p.occlusion ?? 0.08, 0, 0.25),
    };
    const leadGain = full ? 1.62 : 1.32;

    // Phase 1 (0ms): Massive load-bearing wall & masonry impact
    one(select(elementAssets.wall.heavy, n), pos, leadGain, "collapse", { playbackRate: full ? 0.86 : 0.92 });
    schedule(45, () => one(select(assets.stone.hit, n + 1), pos, leadGain * 0.88, "collapse", { playbackRate: 0.9 }));

    // Phase 2 (135ms): Structural torsion — girders/metal for industrial/bunker, beams for timber/multi-level
    schedule(135, () => {
      if (industrial) {
        one(select(elementAssets.metalStructure, n), pos, leadGain * 0.82, "collapse", { playbackRate: 0.9 });
        one(select(assets.metal.strain, n + 1), pos, leadGain * 0.66, "collapse", { playbackRate: 0.88 });
      } else if (timber) {
        one(select(elementAssets.beam.strain, n), pos, leadGain * 0.84, "collapse", { playbackRate: 0.92 });
        one(select(elementAssets.floor.break, n + 1), pos, leadGain * 0.72, "collapse", { playbackRate: 0.91 });
      } else {
        one(select(elementAssets.floor.break, n), pos, leadGain * 0.78, "collapse", { playbackRate: 0.9 });
        one(select(assets.metal.strain, n + 1), pos, leadGain * 0.58, "collapse", { playbackRate: 0.92 });
      }
    });

    // Phase 3 (310ms): Primary rubble avalanche (stone-fall + wall-rubble)
    schedule(310, () => {
      one(select(assets.stone.fall, n), pos, leadGain * 0.96, "collapse", { playbackRate: full ? 0.88 : 0.95 });
      one(select(elementAssets.wall.rubble, n + 1), pos, leadGain * 0.86, "collapse", { playbackRate: 0.92 });
    });

    // Phase 4 (520ms): Roof cave-in & glass rain (full collapse)
    if (full) {
      schedule(520, () => {
        one(select(elementAssets.roof.fall, n + 2), pos, leadGain * 0.84, "collapse", { playbackRate: 0.93 });
        one(select(assets.glass.fall, n + 3), pos, leadGain * 0.68, "glass", { playbackRate: 0.96 });
      });

      // Phase 5 (770ms): Secondary heavy timber / steel beam collapse & chains
      schedule(770, () => {
        if (industrial) {
          one(select(assets.metal.fall, n + 2), pos, leadGain * 0.74, "collapse", { playbackRate: 0.92 });
          one(select(elementAssets.chain, n + 3), pos, leadGain * 0.54, "break", { playbackRate: 0.96 });
        } else {
          one(select(elementAssets.beam.fall, n + 2), pos, leadGain * 0.78, "collapse", { playbackRate: 0.9 });
          one(select(assets.wood.fall, n + 3), pos, leadGain * 0.64, "collapse", { playbackRate: 0.94 });
        }
      });
    }

    // Phase 6 (1080ms): Billowing dust plume & settling masonry chips
    schedule(full ? 1120 : 780, () => {
      one(select(dust, n + 4), pos, leadGain * 0.76, "collapse", { playbackRate: 0.92 });
      one(select(elementAssets.wall.detail, n + 5), pos, leadGain * 0.48, "debris", { playbackRate: 0.98 });
    });
  }

  function stopGroup(group, fade = 0.45) {
    for (const h of group?.handles ?? []) {
      try {
        h.fadeOut?.(fade);
        if (!h.fadeOut) h.source?.stop?.();
      } catch {}
    }
  }

  function updateFire(snapshot) {
    const items = snapshot?.destruction?.fires ?? [];
    const ids = new Set(items.map((f) => f.id));
    for (const [id, g] of fires) {
      if (!ids.has(id)) {
        stopGroup(g);
        fires.delete(id);
      }
    }
    const now = nowMs();
    for (const p of items) {
      let g = fires.get(p.id);
      if (!g) {
        g = {
          handles: [],
          p,
          nextPop: now + 1800,
          keys: [choose(fireLow, hash(p.id)), choose(fireCrackle, hash(`${p.id}:crackle`))],
        };
        fires.set(p.id, g);
      }
      g.p = p;
      if (now >= g.nextPop) {
        g.nextPop = now + 2600 + Math.random() * 2800;
        if (voices.size < 28) {
          one(
            select(firePops, hash(p.id) + Math.floor(now / 1000)),
            p,
            0.58 * limit(p.intensity, 0.25, 1),
            "debris",
            { radius: 75, referenceDistance: 6, rolloffFactor: 0.22 },
          );
        }
      }
      // Reattempt missing / out-of-range tracks on subsequent snapshots.
      for (const [i, k] of g.keys.entries()) {
        const gain = (i === 0 ? 0.62 : 0.82) * limit(p.intensity, 0.25, 1);
        if (!g.handles[i]) {
          g.handles[i] = play(k, p, gain, "debris", {
            radius: 115,
            referenceDistance: 7.5,
            rolloffFactor: 0.18,
            loop: true,
            channel: `fire:${p.id}:${i}`,
            replace: true,
          });
        }
        const h = g.handles[i];
        h?.update?.(p);
        h?.setGain?.(gain, 0.18);
        h?.updateOcclusion?.(limit(p.occlusion, 0, 0.55));
      }
    }
  }

  // Subtle spatial settling/creaking cues when standing near breached or collapsed ruins.
  function updateRuinAmbience(snapshot) {
    const buildings = snapshot?.destruction?.buildings;
    if (!Array.isArray(buildings) || !buildings.length) return;
    const now = nowMs();
    if (now < nextRuinCreakAt) return;
    if (voices.size >= 24) return;

    const listenerId = snapshot?.spectator?.active ? snapshot.spectator.targetId : network?.playerId;
    const entities = Array.isArray(snapshot?.entities) ? snapshot.entities : [];
    const players = Array.isArray(snapshot?.players) ? snapshot.players : [];
    const listener = entities.find((ent) => ent.id === listenerId)
      ?? players.find((pl) => pl.id === listenerId)
      ?? snapshot?.player
      ?? null;
    if (!listener || !Number.isFinite(Number(listener.x)) || !Number.isFinite(Number(listener.z))) return;

    let nearest = null;
    let nearestDist = 44;
    for (const b of buildings) {
      if (b.stage !== "breached" && b.stage !== "collapsed") continue;
      const dx = (Number(b.x) || 0) - Number(listener.x);
      const dz = (Number(b.z) || 0) - Number(listener.z);
      const dist = Math.hypot(dx, dz);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = b;
      }
    }
    if (!nearest) return;

    ruinCreakCounter += 1;
    nextRuinCreakAt = now + 3800 + ((hash(`${nearest.id}:${ruinCreakCounter}`) % 3400));

    const { industrial, timber } = styleFlags(nearest.style);
    const seed = hash(nearest.id) + ruinCreakCounter * 13;
    const jitterAngle = (seed % 360) * (Math.PI / 180);
    const jitterRadius = 2 + (seed % 5);
    const pos = {
      x: (Number(nearest.x) || 0) + Math.cos(jitterAngle) * jitterRadius,
      y: Math.max(0.8, Number(nearest.y) || 1.6),
      z: (Number(nearest.z) || 0) + Math.sin(jitterAngle) * jitterRadius,
      occlusion: 0.15,
    };

    const pool = industrial
      ? [
          ...elementAssets.metalStructure,
          ...assets.metal.strain,
          ...elementAssets.chain,
          ...elementAssets.wall.detail,
          ...dust,
        ]
      : timber
        ? [
            ...elementAssets.floor.creak,
            ...elementAssets.beam.strain,
            ...assets.wood.detail,
            ...elementAssets.wall.detail,
            ...dust,
          ]
        : [
            ...elementAssets.floor.creak,
            ...elementAssets.wall.detail,
            ...assets.glass.detail,
            ...assets.metal.strain,
            ...dust,
          ];

    const key = select(pool, seed);
    const gain = (nearest.stage === "collapsed" ? 0.36 : 0.28) * (1 - nearestDist / 54);
    one(key, pos, Math.max(0.14, gain), "debris", {
      radius: 72,
      referenceDistance: 8,
      rolloffFactor: 0.2,
      playbackRate: 0.88 + (seed % 4) * 0.04,
    });
  }

  // Crate audio is delegated to the existing interaction plugin, so its
  // generation counters and stop/fade handling remain authoritative.
  async function crateLoop(p, options) {
    const token = generation;
    const buffers = await Promise.all(crateKeys.map(load));
    if (token !== generation) return null;
    const hs = buffers
      .map((b, i) =>
        audio.playSpatialBuffer(b, p, {
          ...options,
          gain: options.gain * [0.57, 0.7, 0.36][i],
          channel: options.channel,
          replace: i === 0,
        }),
      )
      .filter(Boolean);
    if (!hs.length) return null;
    const apply = (fn, ...a) => {
      for (const h of hs) h[fn]?.(...a);
    };
    return {
      source: { stop: () => apply("stop") },
      update: (pos) => apply("update", pos),
      updateOcclusion: (o) => apply("updateOcclusion", o),
      setGain: (g, s) => hs.forEach((h, i) => h.setGain?.(g * [0.57, 0.7, 0.36][i], s)),
      fadeOut: (s) => apply("fadeOut", s),
      stop: () => apply("stop"),
    };
  }

  function reset() {
    generation += 1;
    for (const id of timers) clearTimeout(id);
    timers.clear();
    throttleBuckets.clear();
    nextRuinCreakAt = 0;
    for (const g of fires.values()) stopGroup(g, 0.15);
    fires.clear();
    for (const h of voices) {
      try {
        h.stop?.();
      } catch {}
    }
    voices.clear();
  }

  ctx.events.on("game:event", (packet) => {
    if (packet?.event === "building:material") onMaterialEvent(packet.payload ?? {});
    else if (packet?.event === "building:collapse") onBuildingCollapse(packet.payload ?? {});
  });
  ctx.events.on("game:snapshot", (s) => {
    if (s?.mode !== "battle-royale") {
      if (fires.size || timers.size) reset();
      return;
    }
    updateFire(s);
    updateRuinAmbience(s);
  });
  ctx.events.on("network:connected", () => {
    void warm();
  });
  ctx.events.on("network:disconnected", reset);

  ctx.services.provide("destruction-audio", {
    warm,
    warmAll,
    crateLoop,
    crateReady: () => crateKeys.every((k) => cache.has(k)),
    crateStart: (p, options) => play("crate-start", p, options.gain, "debris", options),
    crateStop: (p, options) => play("crate-stop", p, options.gain, "debris", options),
    assetCount: () => all.length,
  });
}
