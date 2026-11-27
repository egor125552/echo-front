const SOUNDS = {
  "weapon.pistol": "/assets/audio/core/pistol-shot.mp3",
  "weapon.rifle": "/assets/audio/core/automatic-shot.mp3",
  "weapon.marksman": "/assets/aistudio/single-shot-m-1-rifle_c09ae09f.mp3",
  "weapon.sniper": "/assets/aistudio/precise-booming-shot-from-a-short-barreled-weapon_4606b104.mp3",
  "weapon.cannon": "/assets/aistudio/shot-from-an-antique-gun_1f6e6664.mp3",
  "footstep.forest.1": "/assets/audio/footsteps/forest/forest-step-1.mp3",
  "footstep.forest.2": "/assets/audio/footsteps/forest/forest-step-2.mp3",
  "footstep.forest.3": "/assets/audio/footsteps/forest/forest-step-3.mp3",
  "hit.enemy": "/assets/audio/core/hit-enemy.mp3",
  "hit.player": "/assets/audio/core/hit-player.mp3",
  "armor.hit1": "/assets/audio/core/armor-hit-1.mp3",
  "armor.hit2": "/assets/audio/core/armor-hit-2.mp3",
  "armor.break": "/assets/audio/core/armor-break.mp3",
  "armor.self-break": "/assets/audio/core/armor-break.mp3",
  "enemy.killed": "/assets/audio/core/enemy-killed.mp3",
  "death.full": "/assets/audio/core/death-full.mp3",
  "bomb.nuke": "/assets/aistudio/dropped-a-bomb-and-it-exploded_188d696e.mp3",
  "bomb.mine": "/assets/aistudio/bomb-drop-and-explosion_424c5b6a.mp3",
  "cannon.impact": "/assets/aistudio/bomb-drop-and-explosion_424c5b6a.mp3",
  "cannon.pierce": "/assets/aistudio/bomb-drop-and-explosion_424c5b6a.mp3",
};

function numbered(prefix, count) {
  return Array.from({ length: count }, (_, index) => `${prefix}${index + 1}.mp3`);
}

const FOOTSTEP_SETS = {
  forest: {
    walk: numbered("/assets/audio/footsteps/forest/forest-step-", 3),
    run: numbered("/assets/audio/footsteps/forest/forest-step-", 3),
  },
  concrete: {
    walk: numbered("/assets/audio/footsteps/library/open-esport-concrete/walk-", 8),
    run: numbered("/assets/audio/footsteps/library/open-esport-concrete/run-", 8),
  },
  metal: {
    walk: numbered("/assets/audio/footsteps/library/scp/metal-walk-", 8),
    run: numbered("/assets/audio/footsteps/library/scp/metal-run-", 8),
  },
  stone: {
    walk: [
      "/assets/audio/footsteps/library/fps-asset-kit/stone-left-1.mp3",
      "/assets/audio/footsteps/library/fps-asset-kit/stone-right-1.mp3",
      "/assets/audio/footsteps/library/fps-asset-kit/stone-left-2.mp3",
      "/assets/audio/footsteps/library/fps-asset-kit/stone-right-2.mp3",
      "/assets/audio/footsteps/library/fps-asset-kit/stone-left-3.mp3",
      "/assets/audio/footsteps/library/fps-asset-kit/stone-right-3.mp3",
    ],
  },
  sand: {
    walk: [
      "/assets/audio/footsteps/library/fps-asset-kit/sand-left-1.mp3",
      "/assets/audio/footsteps/library/fps-asset-kit/sand-right-1.mp3",
      "/assets/audio/footsteps/library/fps-asset-kit/sand-left-2.mp3",
      "/assets/audio/footsteps/library/fps-asset-kit/sand-right-2.mp3",
      "/assets/audio/footsteps/library/fps-asset-kit/sand-left-3.mp3",
      "/assets/audio/footsteps/library/fps-asset-kit/sand-right-3.mp3",
    ],
  },
  default: {
    walk: Array.from({ length: 9 }, (_, index) => `/assets/audio/footsteps/library/zacjoffe/step-${index}.mp3`),
  },
};
FOOTSTEP_SETS.stone.run = FOOTSTEP_SETS.stone.walk;
FOOTSTEP_SETS.sand.run = FOOTSTEP_SETS.sand.walk;
FOOTSTEP_SETS.default.run = FOOTSTEP_SETS.default.walk;

export const SPATIAL_SOUND_PROFILES = {
  footstep: { gain: 0.95, referenceDistance: 2.2, rolloffFactor: 0.55, airAbsorptionMinHz: 6500 },
  "weapon.pistol": { gain: 1, referenceDistance: 2.5, rolloffFactor: 0.32, airAbsorptionMinHz: 3200 },
  "weapon.rifle": { gain: 1.05, referenceDistance: 3, rolloffFactor: 0.28, airAbsorptionMinHz: 2800 },
  "weapon.marksman": { gain: 1.12, referenceDistance: 4, rolloffFactor: 0.24, airAbsorptionMinHz: 2600 },
  "weapon.sniper": { gain: 1.25, referenceDistance: 5.5, rolloffFactor: 0.19, airAbsorptionMinHz: 2200 },
  "weapon.cannon": { gain: 1.55, referenceDistance: 36, rolloffFactor: 0.075, airAbsorptionMinHz: 1100 },
  "cannon.impact": { gain: 1.38, referenceDistance: 58, rolloffFactor: 0.048, airAbsorptionMinHz: 850 },
  "cannon.pierce": { gain: 1.32, referenceDistance: 48, rolloffFactor: 0.055, airAbsorptionMinHz: 1100 },
  "bomb.nuke": { gain: 1.65, referenceDistance: 85, rolloffFactor: 0.028, airAbsorptionMinHz: 680 },
  "bomb.mine": { gain: 1.25, referenceDistance: 12, rolloffFactor: 0.18, airAbsorptionMinHz: 1900 },
  default: { gain: 1, referenceDistance: 2, rolloffFactor: 0.5, airAbsorptionMinHz: 4200 },
};

const WEAPON_SOUND_KEYS = Object.freeze({
  pistol: "weapon.pistol",
  rifle: "weapon.rifle",
  "electro-rifle": "weapon.rifle",
  marksman: "weapon.marksman",
  sniper: "weapon.sniper",
  cannon: "weapon.cannon",
});

const WEAPON_HOLD_INTERVAL_MS = Object.freeze({
  rifle: 100,
  "electro-rifle": 90,
  pistol: 200,
  marksman: 255,
});

export function spatialProfileForKey(key) {
  if (String(key).startsWith("footstep.")) return SPATIAL_SOUND_PROFILES.footstep;
  return SPATIAL_SOUND_PROFILES[key] ?? SPATIAL_SOUND_PROFILES.default;
}

export function resolveSoundUrl(payload = {}) {
  if (String(payload.key ?? "").startsWith("footstep.")) {
    const surface = String(payload.surface ?? "forest").toLowerCase();
    const gait = payload.gait === "run" ? "run" : "walk";
    const set = FOOTSTEP_SETS[surface]?.[gait] ?? FOOTSTEP_SETS.default[gait];
    const variant = Math.max(1, Math.floor(Number(payload.variant) || 1));
    return set[(variant - 1) % set.length];
  }
  return SOUNDS[payload.key] ?? null;
}

function createHumanThreatPingBuffer(context) {
  const sampleRate = Math.max(8000, Number(context?.sampleRate) || 44100);
  const duration = 0.145;
  const length = Math.max(1, Math.floor(sampleRate * duration));
  const buffer = context.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    const t = i / sampleRate;
    let sample = 0;
    // Pulse 1: crisp 640 Hz tactical lock tone (0.000s .. 0.046s)
    if (t <= 0.046) {
      const p = t / 0.046;
      const env = Math.sin(Math.PI * p) * Math.exp(-t * 10);
      sample += (Math.sin(2 * Math.PI * 640 * t) * 0.72 + Math.sin(2 * Math.PI * 1280 * t) * 0.18) * env;
    }
    // Pulse 2: descending 460 Hz confirmation pulse (0.082s .. 0.140s)
    if (t >= 0.082 && t <= 0.140) {
      const lt = t - 0.082;
      const p = lt / 0.058;
      const env = Math.sin(Math.PI * p) * Math.exp(-lt * 11);
      sample += (Math.sin(2 * Math.PI * 460 * lt) * 0.76 + Math.sin(2 * Math.PI * 920 * lt) * 0.16) * env;
    }
    data[i] = Math.max(-0.92, Math.min(0.92, sample * 0.85));
  }
  return buffer;
}

function createHumanPresenceBlipBuffer(context) {
  const sampleRate = Math.max(8000, Number(context?.sampleRate) || 44100);
  const duration = 0.046;
  const length = Math.max(1, Math.floor(sampleRate * duration));
  const buffer = context.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    const t = i / sampleRate;
    const p = t / duration;
    const env = Math.sin(Math.PI * p);
    data[i] = (Math.sin(2 * Math.PI * 520 * t) * 0.75 + Math.sin(2 * Math.PI * 1040 * t) * 0.12) * env * 0.65;
  }
  return buffer;
}

function createHumanFriendPingBuffer(context) {
  const sampleRate = Math.max(8000, Number(context?.sampleRate) || 44100);
  const duration = 0.14;
  const length = Math.max(1, Math.floor(sampleRate * duration));
  const buffer = context.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    const t = i / sampleRate;
    let sample = 0;
    if (t <= 0.055) {
      const env = Math.sin(Math.PI * (t / 0.055));
      sample += Math.sin(2 * Math.PI * 523.25 * t) * env * 0.65;
    }
    if (t >= 0.07 && t <= 0.135) {
      const lt = t - 0.07;
      const env = Math.sin(Math.PI * (lt / 0.065));
      sample += Math.sin(2 * Math.PI * 659.25 * lt) * env * 0.68;
    }
    data[i] = Math.max(-0.9, Math.min(0.9, sample));
  }
  return buffer;
}

export const manifest = {
  id: "core-sound-pack",
  requires: ["spatial-audio-web", "cloudflare-session", "keyboard-input"],
};

export async function setup(ctx) {
  const audio = ctx.services.get("audio");
  const network = ctx.services.get("network");
  let selfState = { weapon: null, ammo: null, alive: false, canFire: true, team: 0, x: 0, y: 0, z: 0 };
  let selfAcousticZone = "outdoor";
  let automaticTimer = null;
  let lastOwnShotAt = { marksman: -Infinity, sniper: -Infinity };
  const activeTrajectories = new Set();
  let trajectoryTimer = null;
  let humanThreatPingBuffer = null;
  let humanPresenceBlipBuffer = null;
  let humanFriendPingBuffer = null;
  let cannonballRoarBuffer = null;
  let cannonLaunchPunchBuffer = null;
  let cannonImpactBuffer = null;
  let cannonPierceBuffer = null;
  const cannonballLoops = new Map();
  let cannonChargeNodes = null;
  let lastCannonImpactAudioAt = -Infinity;
  const lastHumanThreatPingAt = new Map();
  const lastHumanPresenceAt = new Map();

  function createCannonballRoarBuffer(audioContext) {
    const sampleRate = Math.max(8000, Number(audioContext?.sampleRate) || 44100);
    const duration = 1.6;
    const length = Math.max(1, Math.floor(sampleRate * duration));
    const buffer = audioContext.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    // Generate extra tail for seamless crossfade across the loop seam
    const fadeLen = Math.min(Math.floor(sampleRate * 0.14), Math.floor(length / 4));
    const totalLen = length + fadeLen;
    const raw = new Float32Array(totalLen);
    let lpSub = 0;
    let lpBody = 0;
    let lpAir = 0;
    // Exact integer cycle counts over 1.6s so tonal/modulation layers loop with zero clicks
    const fSub = 80 / duration;
    const fLow = 124 / duration;
    const fMid = 184 / duration;
    const fChop1 = 15 / duration;
    const fChop2 = 30 / duration;
    for (let i = 0; i < totalLen; i += 1) {
      const t = i / sampleRate;
      const white = Math.random() * 2 - 1;
      // Multi-band turbulent wind & air-displacement roar (heavy low-mid body, no high mosquito squeak)
      lpSub = lpSub * 0.986 + white * 0.014;
      lpBody = lpBody * 0.945 + white * 0.055;
      lpAir = lpAir * 0.84 + white * 0.16;
      const bandMid = lpBody - lpSub;
      const bandAir = lpAir - lpBody;
      const rumble = Math.sin(2 * Math.PI * fSub * t) * 0.34
        + Math.sin(2 * Math.PI * fLow * t) * 0.28
        + Math.sin(2 * Math.PI * fMid * t) * 0.14;
      const spinChop = 0.76 + 0.16 * Math.sin(2 * Math.PI * fChop1 * t) + 0.08 * Math.sin(2 * Math.PI * fChop2 * t);
      const turbulent = lpSub * 3.6 + bandMid * 2.5 + bandAir * 0.72;
      const mixed = (rumble * 0.65 + turbulent * 0.95) * spinChop;
      raw[i] = Math.tanh(mixed * 1.45) * 0.86;
    }
    for (let i = 0; i < length; i += 1) {
      if (i < fadeLen) {
        const w = 0.5 - 0.5 * Math.cos((Math.PI * i) / fadeLen);
        data[i] = raw[i] * w + raw[length + i] * (1 - w);
      } else {
        data[i] = raw[i];
      }
    }
    return buffer;
  }

  function createCannonLaunchPunchBuffer(audioContext) {
    const sampleRate = Math.max(8000, Number(audioContext?.sampleRate) || 44100);
    const duration = 0.95;
    const length = Math.max(1, Math.floor(sampleRate * duration));
    const buffer = audioContext.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    let phaseSub = 0;
    let phaseCrack = 0;
    let lpNoise = 0;
    let lpSubNoise = 0;
    for (let i = 0; i < length; i += 1) {
      const t = i / sampleRate;
      // Seismic sub-drop: 96 Hz -> 27 Hz
      const subFreq = 27 + 69 * Math.exp(-t * 10.5);
      phaseSub += (2 * Math.PI * subFreq) / sampleRate;
      const subEnv = Math.min(1, t / 0.005) * Math.exp(-t * 3.8);
      const subWave = Math.sin(phaseSub) * subEnv * 0.95;

      // Cast-iron breech slam & pressure transient (first 60ms)
      const crackFreq = 46 + 150 * Math.exp(-t * 48);
      phaseCrack += (2 * Math.PI * crackFreq) / sampleRate;
      const crackEnv = Math.min(1, t / 0.002) * Math.exp(-t * 28);
      const ironRing = (Math.sin(2 * Math.PI * 138 * t) * 0.45 + Math.sin(2 * Math.PI * 214 * t) * 0.25)
        * Math.exp(-t * 14);

      // Pressurized blast roar
      const white = Math.random() * 2 - 1;
      lpNoise = lpNoise * 0.91 + white * 0.09;
      lpSubNoise = lpSubNoise * 0.975 + white * 0.025;
      const blastEnv = Math.min(1, t / 0.004) * Math.exp(-t * 4.6);
      const blast = (lpNoise * 1.9 + lpSubNoise * 2.8) * blastEnv;

      const tailFade = t > duration - 0.08 ? Math.max(0, (duration - t) / 0.08) : 1;
      const sample = (subWave + Math.sin(phaseCrack) * crackEnv * 0.65 + ironRing * 0.35 + blast * 0.78) * tailFade;
      data[i] = Math.tanh(sample * 1.4) * 0.9;
    }
    return buffer;
  }

  function createCannonImpactBuffer(audioContext) {
    const sampleRate = Math.max(8000, Number(audioContext?.sampleRate) || 44100);
    const duration = 2.15;
    const length = Math.max(1, Math.floor(sampleRate * duration));
    const buffer = audioContext.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    let phaseSub = 0;
    let lpDeep = 0;
    let lpMid = 0;
    let lpGravel = 0;
    for (let i = 0; i < length; i += 1) {
      const t = i / sampleRate;
      // Ground-shaking seismic shockwave (82 Hz -> 22 Hz)
      const subFreq = 22 + 60 * Math.exp(-t * 5.8);
      phaseSub += (2 * Math.PI * subFreq) / sampleRate;
      const subEnv = Math.min(1, t / 0.004) * Math.exp(-t * 2.4);
      const sub = Math.sin(phaseSub) * subEnv * 1.05;

      // Dense rolling blast & distant artillery thunder tail
      const white = Math.random() * 2 - 1;
      lpDeep = lpDeep * 0.985 + white * 0.015;
      lpMid = lpMid * 0.935 + white * 0.065;
      lpGravel = lpGravel * 0.82 + white * 0.18;
      const attackCrack = (lpGravel - lpMid) * Math.exp(-t * 22) * 2.2;
      const blastBody = (lpMid - lpDeep) * Math.min(1, t / 0.01) * Math.exp(-t * 2.25) * 2.5;
      const rollingThunder = lpDeep * Math.min(1, t / 0.03) * Math.exp(-t * 1.15)
        * (0.82 + 0.18 * Math.sin(2 * Math.PI * 5.2 * t)) * 4.2;

      const tailFade = t > duration - 0.18 ? Math.max(0, (duration - t) / 0.18) : 1;
      const sample = (sub + attackCrack + blastBody + rollingThunder) * tailFade;
      data[i] = Math.tanh(sample * 1.35) * 0.92;
    }
    return buffer;
  }

  function createCannonPierceBuffer(audioContext) {
    const sampleRate = Math.max(8000, Number(audioContext?.sampleRate) || 44100);
    const duration = 0.9;
    const length = Math.max(1, Math.floor(sampleRate * duration));
    const buffer = audioContext.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    let phaseThud = 0;
    let lpLow = 0;
    let lpMid = 0;
    for (let i = 0; i < length; i += 1) {
      const t = i / sampleRate;
      const thudFreq = 36 + 108 * Math.exp(-t * 14);
      phaseThud += (2 * Math.PI * thudFreq) / sampleRate;
      const thud = Math.sin(phaseThud) * Math.min(1, t / 0.002) * Math.exp(-t * 5.2) * 0.95;

      // Steel/concrete tearing resonance
      const crunchTone = (
        Math.sin(2 * Math.PI * 285 * t) * 0.42
        + Math.sin(2 * Math.PI * 465 * t) * 0.30
        + Math.sin(2 * Math.PI * 710 * t) * 0.18
      ) * Math.exp(-t * 11.5);

      const white = Math.random() * 2 - 1;
      lpLow = lpLow * 0.965 + white * 0.035;
      lpMid = lpMid * 0.85 + white * 0.15;
      const shred = ((lpMid - lpLow) * 2.1 * Math.exp(-t * 8.5) + lpLow * 3.1 * Math.exp(-t * 3.2));

      const tailFade = t > duration - 0.1 ? Math.max(0, (duration - t) / 0.1) : 1;
      data[i] = Math.tanh((thud + crunchTone * 0.55 + shred * 0.85) * 1.4) * 0.9 * tailFade;
    }
    return buffer;
  }

  function playCannonLaunchPunch(position, { isSelf = false, modeId = "standard", chargeRatio = 0 } = {}) {
    if (!audio?.context) return;
    cannonLaunchPunchBuffer ??= createCannonLaunchPunchBuffer(audio.context);
    const charge = Math.max(0, Math.min(1, Number(chargeRatio) || 0));
    const modeRate = modeId === "piercing"
      ? 1.12
      : modeId === "shrapnel"
        ? 1.06
        : modeId === "charged"
          ? Math.max(0.76, 0.98 - charge * 0.2)
          : 0.94;
    if (isSelf && typeof audio.playCenteredBuffer === "function") {
      try {
        audio.playCenteredBuffer(cannonLaunchPunchBuffer, {
          gain: 0.9 + charge * 0.34,
          playbackRate: modeRate,
          channel: "own-cannon-punch",
        });
      } catch {}
      return;
    }
    if (position && typeof audio.playSpatialBuffer === "function") {
      try {
        audio.playSpatialBuffer(cannonLaunchPunchBuffer, position, {
          radius: 920,
          gain: 1.25 + charge * 0.4,
          referenceDistance: 40,
          rolloffFactor: 0.065,
          airAbsorptionMinHz: 950,
          playbackRate: modeRate,
        });
      } catch {}
    }
  }

  let nukeShockwaveBuffer = null;

  function createNukeShockwaveBuffer(audioContext) {
    const sampleRate = Math.max(8000, Number(audioContext?.sampleRate) || 44100);
    const duration = 4.2;
    const length = Math.max(1, Math.floor(sampleRate * duration));
    const buffer = audioContext.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    let phaseSub = 0;
    let phaseSub2 = 0;
    let lpSub = 0;
    let lpRumble = 0;
    let lpRoar = 0;
    for (let i = 0; i < length; i += 1) {
      const t = i / sampleRate;
      // 1. Massive seismic ground-wave sweep (68 Hz -> 19 Hz)
      const subFreq = 19 + 49 * Math.exp(-t * 2.2);
      phaseSub += (2 * Math.PI * subFreq) / sampleRate;
      const subEnv = Math.min(1, t / 0.008) * Math.exp(-t * 0.95);
      const sub = Math.sin(phaseSub) * subEnv * 1.1;

      // Secondary harmonic chest-thump (115 Hz -> 34 Hz)
      const sub2Freq = 34 + 81 * Math.exp(-t * 4.5);
      phaseSub2 += (2 * Math.PI * sub2Freq) / sampleRate;
      const sub2 = Math.sin(phaseSub2) * Math.min(1, t / 0.005) * Math.exp(-t * 2.1) * 0.55;

      // 2. Pressure front crack + expanding nuclear wall + rolling atmospheric thunder
      const white = Math.random() * 2 - 1;
      lpSub = lpSub * 0.992 + white * 0.008;
      lpRumble = lpRumble * 0.962 + white * 0.038;
      lpRoar = lpRoar * 0.86 + white * 0.14;

      const flashCrack = (lpRoar - lpRumble) * Math.exp(-t * 16) * 2.1;
      const pressureWall = (lpRumble - lpSub) * Math.min(1, t / 0.035) * Math.exp(-t * 1.05) * 3.1;
      const thunderTail = lpSub * Math.min(1, t / 0.09) * Math.exp(-t * 0.58)
        * (0.78 + 0.22 * Math.sin(2 * Math.PI * 2.8 * t)) * 6.4;

      const tailFade = t > duration - 0.35 ? Math.max(0, (duration - t) / 0.35) : 1;
      const sample = (sub + sub2 + flashCrack + pressureWall + thunderTail) * tailFade;
      data[i] = Math.tanh(sample * 1.25) * 0.88;
    }
    return buffer;
  }

  function playNukeShockwave(payload = {}) {
    if (!audio?.context || typeof audio.playSpatialBuffer !== "function") return;
    nukeShockwaveBuffer ??= createNukeShockwaveBuffer(audio.context);
    const pos = {
      x: Number(payload.x) || 0,
      y: Number(payload.y) || 0,
      z: Number(payload.z) || 0,
    };
    const dist = Math.hypot(pos.x - selfState.x, pos.y - selfState.y, pos.z - selfState.z);
    // Subtle speed-of-sound delay on the distant seismic arrival so faraway nukes feel massive and physical
    const arrivalDelayMs = dist > 55 ? Math.min(550, Math.round((dist - 55) * 1.25)) : 0;
    const fireWave = () => {
      try {
        audio.playSpatialBuffer(nukeShockwaveBuffer, pos, {
          radius: 1650,
          gain: 1.48,
          referenceDistance: 120,
          rolloffFactor: 0.022,
          airAbsorptionMinHz: 520,
          playbackRate: 0.94,
        });
      } catch {}
    };
    if (arrivalDelayMs > 0) {
      setTimeout(fireWave, arrivalDelayMs);
    } else {
      fireWave();
    }
  }

  function playCannonImpactShockwave(payload = {}) {
    if (!audio?.context || typeof audio.playSpatialBuffer !== "function") return;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const rapidFollowup = now - lastCannonImpactAudioAt < 110;
    lastCannonImpactAudioAt = now;

    const pierced = Boolean(payload.pierced);
    const charge = Math.max(0, Math.min(1, Number(payload.chargeRatio) || 0));
    const blastRadius = Math.max(12, Number(payload.blastRadius) || 50);
    const scaleFactor = Math.max(0.75, Math.min(1.45, blastRadius / 56));
    const buffer = pierced
      ? (cannonPierceBuffer ??= createCannonPierceBuffer(audio.context))
      : (cannonImpactBuffer ??= createCannonImpactBuffer(audio.context));
    const pos = {
      x: Number(payload.x) || 0,
      y: Number(payload.y) || 0,
      z: Number(payload.z) || 0,
    };
    const baseGain = pierced ? 1.12 : Math.min(1.52, (1.16 + charge * 0.34) * (0.88 + scaleFactor * 0.14));
    const gain = rapidFollowup ? baseGain * 0.48 : baseGain;
    const playbackRate = pierced
      ? 1.04
      : Math.max(0.68, Math.min(1.06, 1.04 - charge * 0.22 - (scaleFactor - 1) * 0.16));
    try {
      audio.playSpatialBuffer(buffer, pos, {
        radius: 1250,
        gain,
        referenceDistance: pierced ? 54 : Math.round(68 * scaleFactor),
        rolloffFactor: pierced ? 0.052 : 0.042,
        airAbsorptionMinHz: 780,
        playbackRate,
      });
    } catch {}
  }

  function stopAllCannonballLoops() {
    for (const ballId of cannonballLoops.keys()) {
      audio.stopChannel?.(`cannonball:${ballId}`);
    }
    cannonballLoops.clear();
  }

  function stopCannonChargeHum() {
    if (!cannonChargeNodes) return;
    try { cannonChargeNodes.osc1.stop(); } catch {}
    try { cannonChargeNodes.osc2.stop(); } catch {}
    try { cannonChargeNodes.gain.disconnect(); } catch {}
    cannonChargeNodes = null;
  }

  function syncCannonChargeHum(charging, chargeRatio = 0) {
    if (!charging || !audio?.context) {
      stopCannonChargeHum();
      return;
    }
    const ratio = Math.max(0, Math.min(1, Number(chargeRatio) || 0));
    const ctxAudio = audio.context;
    if (!cannonChargeNodes) {
      try {
        const osc1 = ctxAudio.createOscillator();
        const osc2 = ctxAudio.createOscillator();
        const gain = ctxAudio.createGain();
        osc1.type = "sawtooth";
        osc2.type = "triangle";
        osc1.frequency.setValueAtTime(72, ctxAudio.currentTime);
        osc2.frequency.setValueAtTime(144, ctxAudio.currentTime);
        gain.gain.setValueAtTime(0.06, ctxAudio.currentTime);
        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctxAudio.destination);
        osc1.start();
        osc2.start();
        cannonChargeNodes = { osc1, osc2, gain };
      } catch {
        cannonChargeNodes = null;
        return;
      }
    }
    try {
      const nowT = ctxAudio.currentTime;
      cannonChargeNodes.osc1.frequency.setTargetAtTime(72 + ratio * 210, nowT, 0.04);
      cannonChargeNodes.osc2.frequency.setTargetAtTime(144 + ratio * 420, nowT, 0.04);
      cannonChargeNodes.gain.gain.setTargetAtTime(0.07 + ratio * 0.14, nowT, 0.04);
    } catch {}
  }

  function cannonballPlaybackRate(ball, distToSelf) {
    const charge = Math.max(0, Math.min(1, Number(ball?.chargeRatio) || 0));
    const modeId = String(ball?.modeId ?? "standard");
    const baseRate = modeId === "piercing"
      ? 1.16
      : modeId === "shrapnel"
        ? 1.08
        : modeId === "charged"
          ? Math.max(0.76, 0.96 - charge * 0.2)
          : 0.94;
    const doppler = 1 - Math.min(0.22, Math.max(0, distToSelf) / 1500);
    return Math.max(0.68, Math.min(1.45, baseRate * doppler));
  }

  function syncCannonballLoops(snapshot) {
    const balls = Array.isArray(snapshot?.cannonballs) ? snapshot.cannonballs : [];
    if (!balls.length || !audio?.context || typeof audio.playSpatialBuffer !== "function") {
      if (cannonballLoops.size) stopAllCannonballLoops();
      return;
    }
    cannonballRoarBuffer ??= createCannonballRoarBuffer(audio.context);

    // Cap active flight loops to the 3 closest balls so 7-ball shrapnel & 5-ball salvo stay dense without clipping
    const rankedBalls = balls
      .filter((b) => b?.id)
      .map((ball) => {
        const bx = Number(ball.x) || 0;
        const by = Number(ball.y) || 0;
        const bz = Number(ball.z) || 0;
        const dist = Math.hypot(bx - selfState.x, by - selfState.y, bz - selfState.z);
        return { ball, pos: { x: bx, y: by, z: bz }, dist };
      })
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 3);

    const activeIds = new Set(rankedBalls.map((entry) => entry.ball.id));
    for (const ballId of [...cannonballLoops.keys()]) {
      if (!activeIds.has(ballId)) {
        audio.stopChannel?.(`cannonball:${ballId}`);
        cannonballLoops.delete(ballId);
      }
    }

    const multiAtten = rankedBalls.length > 1 ? 0.8 : 1;
    for (const { ball, pos, dist } of rankedBalls) {
      const charge = Math.max(0, Math.min(1, Number(ball.chargeRatio) || 0));
      const rate = cannonballPlaybackRate(ball, dist);
      const gain = (1.16 + charge * 0.44) * multiAtten;
      const existing = cannonballLoops.get(ball.id);
      if (existing) {
        try { existing.update?.(pos); } catch {}
        try { existing.setGain?.(gain, 0.08); } catch {}
        try { existing.setPlaybackRate?.(rate, 0.12); } catch {}
        continue;
      }
      const handle = audio.playSpatialBuffer(cannonballRoarBuffer, pos, {
        radius: 960,
        gain,
        referenceDistance: 38,
        rolloffFactor: 0.07,
        airAbsorptionMinHz: 1100,
        playbackRate: rate,
        loop: true,
        channel: `cannonball:${ball.id}`,
        replace: true,
      });
      if (handle) cannonballLoops.set(ball.id, handle);
    }
  }

  function ensureHumanAudioBuffers() {
    if (!audio?.context) return false;
    humanThreatPingBuffer ??= createHumanThreatPingBuffer(audio.context);
    humanPresenceBlipBuffer ??= createHumanPresenceBlipBuffer(audio.context);
    humanFriendPingBuffer ??= createHumanFriendPingBuffer(audio.context);
    return true;
  }

  function isFriendlyHuman(entityId, entityTeam = 0) {
    if (!entityId || entityId === network.playerId) return true;
    const ownTeam = Number(selfState.team) || 0;
    const otherTeam = Number(entityTeam) || 0;
    if (ownTeam > 0 && otherTeam > 0 && ownTeam === otherTeam) return true;
    const socialProfile = ctx.services.has("social-profile") ? ctx.services.get("social-profile") : null;
    if (socialProfile?.isFriend?.(entityId)) return true;
    return false;
  }

  function playHuman3DPing(buffer, position, { radius = 160, gain = 0.62, referenceDistance = 12, rolloffFactor = 0.3 } = {}) {
    if (!buffer || !position || typeof audio.playSpatialBuffer !== "function") return;
    try {
      audio.playSpatialBuffer(buffer, {
        x: Number(position.x) || 0,
        y: Number(position.y) || 0,
        z: Number(position.z) || 0,
      }, {
        radius,
        gain,
        referenceDistance,
        rolloffFactor,
        airAbsorptionMinHz: 9500,
        loop: false,
      });
    } catch {}
  }

  function sampleTrajectoryPosition(traj, nowMs) {
    const duration = Math.max(100, Number(traj.flightMs) || 2150);
    const t = Math.max(0, Math.min(1, (nowMs - traj.startedAt) / duration));
    const x = traj.startX + (traj.endX - traj.startX) * t;
    const z = traj.startZ + (traj.endZ - traj.startZ) * t;
    const baseY = traj.startY + (traj.endY - traj.startY) * t;
    const arcY = 4 * traj.arcHeight * t * (1 - t);
    return { x, y: baseY + arcY, z };
  }

  function tickActiveTrajectories() {
    if (!activeTrajectories.size) {
      if (trajectoryTimer) {
        clearInterval(trajectoryTimer);
        trajectoryTimer = null;
      }
      return;
    }
    const nowMs = typeof performance !== "undefined" ? performance.now() : Date.now();
    for (const entry of [...activeTrajectories]) {
      const pos = sampleTrajectoryPosition(entry, nowMs);
      try {
        entry.handle.update(pos);
      } catch {
        activeTrajectories.delete(entry);
      }
    }
  }

  function trackTrajectoryHandle(handle, traj) {
    if (!handle || typeof handle.update !== "function") return;
    const entry = {
      handle,
      startX: Number(traj.startX) || 0,
      startY: Number(traj.startY) || 0,
      startZ: Number(traj.startZ) || 0,
      endX: Number(traj.endX) || 0,
      endY: Number(traj.endY) || 0,
      endZ: Number(traj.endZ) || 0,
      arcHeight: Math.max(0, Number(traj.arcHeight) || 0),
      flightMs: Math.max(100, Number(traj.flightMs) || 2150),
      startedAt: typeof performance !== "undefined" ? performance.now() : Date.now(),
    };
    activeTrajectories.add(entry);
    handle.source?.addEventListener?.("ended", () => {
      activeTrajectories.delete(entry);
      if (!activeTrajectories.size && trajectoryTimer) {
        clearInterval(trajectoryTimer);
        trajectoryTimer = null;
      }
    }, { once: true });
    if (!trajectoryTimer) {
      trajectoryTimer = setInterval(tickActiveTrajectories, 33);
    }
  }

  function stopAutomatic() {
    if (automaticTimer) clearInterval(automaticTimer);
    automaticTimer = null;
  }

  async function playOwnShot() {
    if (!selfState.alive || !selfState.weapon || !selfState.canFire) return;
    if (selfState.weapon === "cannon") return;
    if (Number.isFinite(selfState.ammo) && selfState.ammo <= 0) return;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (selfState.weapon === "sniper" && now - lastOwnShotAt.sniper < 1040) return;
    if (selfState.weapon === "marksman" && now - lastOwnShotAt.marksman < 215) return;
    const key = WEAPON_SOUND_KEYS[selfState.weapon] ?? "weapon.pistol";
    const url = SOUNDS[key];
    if (!url) return;
    if (selfState.weapon === "sniper") lastOwnShotAt.sniper = now;
    if (selfState.weapon === "marksman") lastOwnShotAt.marksman = now;
    if (Number.isFinite(selfState.ammo)) selfState.ammo = Math.max(0, selfState.ammo - 1);
    const gain = selfState.weapon === "sniper" ? 1.05 : selfState.weapon === "marksman" ? 0.98 : 0.9;
    try { await audio.playCentered(url, { gain, channel: "own-weapon" }); }
    catch (error) { console.error("Echo Front local weapon audio error", error); }
  }

  function startAutomaticIfNeeded() {
    stopAutomatic();
    const intervalMs = WEAPON_HOLD_INTERVAL_MS[selfState.weapon];
    if (!intervalMs) return;
    automaticTimer = setInterval(() => { void playOwnShot(); }, intervalMs);
  }

  async function playFeedback(key, url) {
    if (key === "death.full") {
      stopAutomatic();
      audio.stopChannel("own-weapon");
      audio.stopChannel("feedback-received");
      await audio.playCentered(url, { gain: 1.15, channel: "death", replace: true });
      return;
    }
    if (key === "hit.player") return audio.playCentered(url, { gain: 1, channel: "feedback-received", replace: true });
    if (key === "hit.enemy") return audio.playCentered(url, { gain: 1.3, channel: "feedback-flesh", replace: true });
    if (key === "armor.hit1" || key === "armor.hit2") return audio.playCentered(url, { gain: 1.25, channel: "feedback-armor-hit", replace: true });
    if (key === "armor.break" || key === "armor.self-break") {
      setTimeout(() => {
        audio.playCentered(url, {
          gain: key === "armor.self-break" ? 1.5 : 1.4,
          channel: "feedback-armor-break",
          replace: true,
        }).catch((error) => console.error("Armor break audio", error));
      }, 65);
      return;
    }
    if (key === "enemy.killed") return audio.playCentered(url, { gain: 1.35, channel: "feedback-kill", replace: true });
    return audio.playCentered(url);
  }

  ctx.events.on("game:snapshot", (snapshot) => {
    const self = snapshot?.entities?.find((entity) => entity.id === network.playerId);
    if (!self) return;
    const battleRoyale = snapshot.mode === "battle-royale" || snapshot.match?.mode === "battle-royale";
    selfState = {
      weapon: self.weapon,
      ammo: self.ammo,
      alive: Boolean(self.alive),
      canFire: !battleRoyale || snapshot.match?.phase === "active",
      team: Number(self.team) || 0,
      x: Number(self.x) || 0,
      y: Number(self.y) || 0,
      z: Number(self.z) || 0,
    };
    selfAcousticZone = self.acousticZone ?? "outdoor";
    syncCannonballLoops(snapshot);
    syncCannonChargeHum(
      Boolean(selfState.alive && snapshot?.specialOps?.cannonCharging),
      snapshot?.specialOps?.cannonChargeRatio ?? 0,
    );
    if (!selfState.alive) {
      stopAutomatic();
      stopCannonChargeHum();
      audio.stopChannel("own-weapon");
      return;
    }
    if (network.tutorial || !selfState.canFire || !ensureHumanAudioBuffers()) return;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    for (const entity of snapshot.entities ?? []) {
      if (!entity || entity.id === network.playerId || entity.bot || !entity.alive) continue;
      const dx = selfState.x - (Number(entity.x) || 0);
      const dz = selfState.z - (Number(entity.z) || 0);
      const dist = Math.hypot(dx, dz);
      if (dist < 2.5 || dist > 125) continue;
      const pos = { x: entity.x, y: entity.y ?? 0, z: entity.z };
      if (isFriendlyHuman(entity.id, entity.team)) {
        const lastFriendAt = lastHumanPresenceAt.get(entity.id) ?? -Infinity;
        if (now - lastFriendAt >= 4800) {
          lastHumanPresenceAt.set(entity.id, now);
          playHuman3DPing(humanFriendPingBuffer, pos, {
            radius: 130,
            gain: 0.34,
            referenceDistance: 10,
            rolloffFactor: 0.35,
          });
        }
        continue;
      }
      // Enemy human player: check if they are aiming directly in our direction
      const angle = Number(entity.angle) || 0;
      const aimDot = (dx * Math.sin(angle) + dz * -Math.cos(angle)) / Math.max(0.001, dist);
      const aimingAtUs = aimDot >= 0.945; // within ~19 degrees cone
      if (aimingAtUs) {
        const lastThreatAt = lastHumanThreatPingAt.get(entity.id) ?? -Infinity;
        if (now - lastThreatAt >= 1900) {
          lastHumanThreatPingAt.set(entity.id, now);
          lastHumanPresenceAt.set(entity.id, now);
          playHuman3DPing(humanThreatPingBuffer, pos, {
            radius: 180,
            gain: 0.64,
            referenceDistance: 12,
            rolloffFactor: 0.28,
          });
        }
      } else if (dist <= 115) {
        const lastBlipAt = lastHumanPresenceAt.get(entity.id) ?? -Infinity;
        if (now - lastBlipAt >= 4200) {
          lastHumanPresenceAt.set(entity.id, now);
          playHuman3DPing(humanPresenceBlipBuffer, pos, {
            radius: 125,
            gain: 0.38,
            referenceDistance: 10,
            rolloffFactor: 0.36,
          });
        }
      }
    }
  });

  ctx.events.on("game:event", (packet) => {
    const payload = packet.payload ?? {};
    if (packet.event === "weapon:selected" && payload.entityId === network.playerId) selfState.weapon = payload.weaponId;
    if (
      packet.event === "weapon:fired"
      && payload.shooterIsHuman
      && payload.entityId !== network.playerId
      && selfState.alive
      && !network.tutorial
      && !isFriendlyHuman(payload.entityId, payload.shooterTeam)
      && ensureHumanAudioBuffers()
    ) {
      const dx = selfState.x - (Number(payload.x) || 0);
      const dz = selfState.z - (Number(payload.z) || 0);
      const dist = Math.hypot(dx, dz);
      let aimedTowardUs = payload.assistedTargetId === network.playerId || dist <= 32;
      if (!aimedTowardUs && dist <= 220 && Number.isFinite(payload.directionX) && Number.isFinite(payload.directionZ)) {
        const dirLen = Math.hypot(payload.directionX, payload.directionZ) || 1;
        const dot = (dx * payload.directionX + dz * payload.directionZ) / (Math.max(0.001, dist) * dirLen);
        aimedTowardUs = dot >= 0.78; // within ~38 degrees toward listener
      }
      if (aimedTowardUs) {
        const now = typeof performance !== "undefined" ? performance.now() : Date.now();
        const lastAt = lastHumanThreatPingAt.get(payload.entityId) ?? -Infinity;
        if (now - lastAt >= 750) {
          lastHumanThreatPingAt.set(payload.entityId, now);
          lastHumanPresenceAt.set(payload.entityId, now);
          playHuman3DPing(humanThreatPingBuffer, payload, {
            radius: 230,
            gain: 0.74,
            referenceDistance: 14,
            rolloffFactor: 0.25,
          });
        }
      }
    }
  });
  ctx.events.on("input:fire-start", () => { void playOwnShot(); startAutomaticIfNeeded(); });
  ctx.events.on("input:fire-stop", () => stopAutomatic());

  ctx.events.on("game:event", async (packet) => {
    const payload = packet.payload ?? {};
    if (packet.event === "entity:respawned" && payload.entityId === network.playerId) {
      audio.stopChannel("death");
      return;
    }
    if (packet.event === "cannon:impact") {
      playCannonImpactShockwave(payload);
      return;
    }
    if (packet.event === "nuke:detonated") {
      playNukeShockwave(payload);
      return;
    }
    const url = resolveSoundUrl(payload);
    if (!url) return;
    const isFootstep = payload.key.startsWith("footstep.");
    try {
      if (packet.event === "feedback:sound") {
        if (payload.recipientId !== network.playerId) return;
        await playFeedback(payload.key, url);
        return;
      }
      if (packet.event !== "sound:spatial") return;
      const isBombSound = payload.key === "bomb.nuke"
        || payload.key === "bomb.mine"
        || payload.key === "cannon.impact"
        || payload.key === "cannon.pierce";
      const offset = Number.isFinite(Number(payload.offset))
        ? Number(payload.offset)
        : (payload.key === "bomb.mine" ? 1.45 : (payload.key === "cannon.impact" || payload.key === "cannon.pierce" ? 1.42 : 0));
      if (payload.entityId === network.playerId && !isBombSound) {
        if (payload.key === "weapon.cannon") {
          const charge = Math.max(0, Math.min(1, Number(payload.chargeRatio) || 0));
          playCannonLaunchPunch(null, { isSelf: true, modeId: payload.modeId, chargeRatio: charge });
          await audio.playCentered(url, { gain: 1.38 + charge * 0.24, channel: "own-weapon" });
          return;
        }
        if (Object.values(WEAPON_SOUND_KEYS).includes(payload.key)) return;
        await audio.playCentered(url, { gain: isFootstep ? 0.45 : 0.85, offset });
        return;
      }
      const profile = spatialProfileForKey(payload.key);
      const sourceZone = payload.acousticZone ?? "outdoor";
      const crossBoundary = sourceZone !== selfAcousticZone;
      const fallbackOcclusion = crossBoundary
        ? (sourceZone === "outdoor" || selfAcousticZone === "outdoor" ? 0.68 : 0.45)
        : 0;
      const physicalOcclusion = Number(payload.occlusion);
      const occlusion = isBombSound
        ? Math.min(0.45, Number.isFinite(physicalOcclusion) ? Math.max(0, physicalOcclusion) : 0)
        : (Number.isFinite(physicalOcclusion)
          ? Math.max(0, Math.min(1, physicalOcclusion))
          : fallbackOcclusion);
      const trajectory = payload.trajectory && typeof payload.trajectory === "object"
        ? payload.trajectory
        : null;
      const initialPos = trajectory
        ? {
          x: Number(trajectory.startX) || 0,
          y: Number(trajectory.startY) || 0,
          z: Number(trajectory.startZ) || 0,
        }
        : { x: payload.x, y: payload.y ?? 0, z: payload.z };
      if (payload.key === "weapon.cannon") {
        playCannonLaunchPunch(initialPos, {
          isSelf: false,
          modeId: payload.modeId,
          chargeRatio: payload.chargeRatio,
        });
      }
      const handle = await audio.playSpatial(url, initialPos, {
        radius: trajectory ? Math.max(payload.radius ?? 650, 1200) : (payload.radius ?? 40),
        gain: profile.gain,
        referenceDistance: profile.referenceDistance,
        rolloffFactor: profile.rolloffFactor,
        airAbsorptionMinHz: profile.airAbsorptionMinHz,
        occlusion,
        offset,
      });
      if (handle && trajectory) {
        trackTrajectoryHandle(handle, trajectory);
      }
    } catch (error) {
      console.error("Echo Front audio error", error);
    }
  });

  ctx.services.provide("sound-pack", {
    sounds: SOUNDS,
    footstepSets: FOOTSTEP_SETS,
    spatialProfiles: SPATIAL_SOUND_PROFILES,
    resolveSoundUrl,
    async warmEssential() {
      const urls = [
        ...Object.values(SOUNDS).filter((url) => !url.includes("footsteps")),
        ...FOOTSTEP_SETS.forest.walk,
      ];
      const warming = Promise.allSettled(
        [...new Set(urls)].map((url) => audio.load(url).catch(() => null)),
      );
      await Promise.race([
        warming,
        new Promise((resolve) => setTimeout(resolve, 4000)),
      ]);
    },
  });
}
