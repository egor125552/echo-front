// Multi-Head Tactical Combat Neural Network (20 inputs -> 32 hidden1 -> 18 hidden2 -> 3 policy heads + value head)
// Heads:
//   1. Tactical Maneuver Head (6 actions: press, flank, hold, kite, reset, squad push)
//   2. Fire Control Head (4 modes: when & how to shoot — full auto, burst, precision tap, hold fire)
//   3. Parachute Timing Head (3 modes: when to open parachute — freefall dive, early glide open, combat low pull)
// Pre-trained on simulated combat + parachute episodes at startup and continually trained
// online via reinforcement learning AND live imitation learning directly from the human player.

export const COMBAT_NET_ACTIONS = [
  "press_aggressive",   // 0: Close distance rapidly and pressure target
  "flank_wide",         // 1: Wide lateral strafe / flank around target line of fire
  "hold_precision",     // 2: Hold cover / steady aim for marksman & sniper fire
  "kite_space",         // 3: Backpedal / open distance while returning fire
  "tactical_reset",     // 4: Break line of sight to apply armor plates or stimulant
  "squad_focus_push",   // 5: Synchronize with squadmate to pinch / focus same target
];

export const COMBAT_NET_FIRE_MODES = [
  "full_auto_suppression", // 0: Continuous automatic fire at close range with solid aim
  "controlled_burst",      // 1: Rhythmic 3-5 round bursts at medium range
  "precision_tap",         // 2: Single high-accuracy shots when aim is tightly aligned
  "hold_fire_acquire",     // 3: Hold trigger while acquiring aim, reloading, or closing range
];

export const COMBAT_NET_PARACHUTE_MODES = [
  "freefall_dive",     // 0: Keep diving in fast freefall toward drop point
  "glide_early_open",  // 1: Open canopy higher to glide across horizontal distance
  "combat_low_pull",   // 2: Late low-altitude tactical canopy pull for fastest landing
];

export const COMBAT_NET_INPUT_DIM = 20;
export const COMBAT_NET_HIDDEN1_DIM = 32;
export const COMBAT_NET_HIDDEN2_DIM = 18;
export const COMBAT_NET_OUTPUT_DIM = COMBAT_NET_ACTIONS.length;
export const COMBAT_NET_FIRE_DIM = COMBAT_NET_FIRE_MODES.length;
export const COMBAT_NET_PARACHUTE_DIM = COMBAT_NET_PARACHUTE_MODES.length;

function clamp(value, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return min;
  return Math.max(min, Math.min(max, num));
}

function createMulberry32(seed = 1337) {
  let t = seed >>> 0;
  return function nextRand() {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function leakyRelu(x) {
  return x >= 0 ? x : 0.08 * x;
}

function dLeakyRelu(y) {
  return y >= 0 ? 1 : 0.08;
}

function dTanh(y) {
  return 1 - y * y;
}

function softmax(logits) {
  let maxLogit = -Infinity;
  for (let i = 0; i < logits.length; i += 1) {
    if (logits[i] > maxLogit) maxLogit = logits[i];
  }
  const exps = new Float64Array(logits.length);
  let sum = 0;
  for (let i = 0; i < logits.length; i += 1) {
    const e = Math.exp(clamp(logits[i] - maxLogit, -30, 30));
    exps[i] = e;
    sum += e;
  }
  const probs = new Float64Array(logits.length);
  const inv = sum > 0 ? 1 / sum : 1 / logits.length;
  for (let i = 0; i < logits.length; i += 1) {
    probs[i] = exps[i] * inv;
  }
  return probs;
}

/**
 * Extracts normalized 20-dimensional feature vector from combat & parachute context.
 * Features:
 *  0: selfHealthRatio (0..1)
 *  1: selfArmorRatio (0..1)
 *  2: enemyDistanceNorm (0..1, normalized over 120m)
 *  3: visibleEnemyCountNorm (0..1, normalized over 4)
 *  4: standingAlliesNorm (0..1, normalized over 3)
 *  5: nearestAllyDistNorm (0..1, normalized over 80m)
 *  6: weaponRangeNorm (0..1, normalized over 110m)
 *  7: ammoRatio (0..1)
 *  8: targetArmorRatio (0..1)
 *  9: hasCoverOrBuilding (0 or 1)
 * 10: hasStimsOrPlates (0..1)
 * 11: elevationDiffNorm (-1..1, normalized over 12m)
 * 12: altitudeNorm (0..1, ground clearance over 420m)
 * 13: verticalSpeedNorm (0..1, downward fall speed over 52 m/s)
 * 14: landingDistNorm (0..1, horizontal distance to drop target over 240m)
 * 15: aimErrorNorm (0..1, angular aim error over 0.45 rad)
 * 16: targetSpeedNorm (0..1, enemy movement speed over 10 m/s)
 * 17: lineOfSightClear (0 or 1)
 * 18: targetIsHuman (0 or 1, whether current opponent is a live human player)
 * 19: humanAggressionIndex (0..1, learned aggression profile of the live human player)
 */
export function extractCombatFeatures(raw = {}) {
  const features = new Float64Array(COMBAT_NET_INPUT_DIM);
  features[0] = clamp(raw.selfHealthRatio ?? 1, 0, 1);
  features[1] = clamp(raw.selfArmorRatio ?? 0.5, 0, 1);
  features[2] = clamp((Number(raw.enemyDistance) || 25) / 120, 0, 1);
  features[3] = clamp((Number(raw.visibleEnemyCount) || 1) / 4, 0, 1);
  features[4] = clamp((Number(raw.standingAllies) || 0) / 3, 0, 1);
  features[5] = clamp((Number(raw.nearestAllyDistance) || 40) / 80, 0, 1);
  features[6] = clamp((Number(raw.weaponRange) || 55) / 110, 0, 1);
  features[7] = clamp(raw.ammoRatio ?? 1, 0, 1);
  features[8] = clamp(raw.targetArmorRatio ?? 0.5, 0, 1);
  features[9] = raw.hasCoverOrBuilding ? 1 : 0;
  features[10] = clamp(raw.hasStimsOrPlates ?? 0.5, 0, 1);
  features[11] = clamp((Number(raw.elevationDiff) || 0) / 12, -1, 1);
  features[12] = clamp((Number(raw.altitude) || 0) / 420, 0, 1);
  features[13] = clamp((Number(raw.verticalSpeed) || 0) / 52, 0, 1);
  features[14] = clamp((Number(raw.landingDistance) || 0) / 240, 0, 1);
  features[15] = clamp((Number(raw.aimError) || 0) / 0.45, 0, 1);
  features[16] = clamp((Number(raw.targetSpeed) || 0) / 10, 0, 1);
  features[17] = raw.lineOfSightClear === false ? 0 : 1;
  features[18] = raw.targetIsHuman ? 1 : 0;
  features[19] = clamp(raw.humanAggressionIndex ?? 0.55, 0, 1);
  return features;
}

/**
 * Evaluates simulated combat payoff for each tactical maneuver (Head 1).
 */
export function evaluateSimulatedBattlePayoffs(features) {
  const hp = features[0];
  const armor = features[1];
  const vitality = hp * 0.58 + armor * 0.42;
  const dist = features[2];
  const enemies = features[3];
  const allies = features[4];
  const allyDist = features[5];
  const weaponRange = features[6];
  const ammo = features[7];
  const targetArmor = features[8];
  const cover = features[9];
  const meds = features[10];
  const elev = features[11];
  const targetIsHuman = features[18];
  const humanAggro = features[19];

  const payoffs = new Float64Array(COMBAT_NET_OUTPUT_DIM);

  // 0: press_aggressive — strong when vitality is high, ammo is good, range is close-mid, and not outnumbered
  payoffs[0] = (vitality - 0.52) * 2.65
    + (0.42 - dist) * 2.15
    + (0.62 - weaponRange) * 1.15
    + (ammo - 0.25) * 0.85
    - Math.max(0, enemies - 0.3) * 2.1
    - (targetArmor - armor) * 0.75;

  // 1: flank_wide — strong in mid-range 1v1 / 2v2 and especially effective against aggressive human players
  const midRangeScore = 1.0 - Math.abs(dist - 0.34) * 2.7;
  payoffs[1] = midRangeScore * 1.65
    + (vitality - 0.42) * 1.15
    + (targetArmor * 0.55)
    + (1 - cover) * 0.4
    + (ammo - 0.25) * 0.45
    + targetIsHuman * humanAggro * 0.45;

  // 2: hold_precision — strong with marksman/sniper, long range, cover or high ground
  payoffs[2] = (weaponRange - 0.56) * 2.95
    + (dist - 0.26) * 2.05
    + cover * 0.75
    + Math.max(0, elev) * 0.9
    + (ammo - 0.2) * 0.45;

  // 3: kite_space — strong when enemy is too close for weapon or outnumbered
  payoffs[3] = (weaponRange - dist) * 1.6
    + Math.max(0, enemies - 0.32) * 1.85
    + (0.5 - vitality) * 1.25
    + (0.28 - dist) * 1.05;

  // 4: tactical_reset — strong when vitality is damaged (< 55%) and bot has meds/plates or cover
  payoffs[4] = (0.54 - vitality) * 3.6
    + (vitality < 0.55 ? meds * 1.65 : -0.4)
    + cover * 0.75
    + (0.35 - ammo) * 0.95;

  // 5: squad_focus_push — strong when allies are alive & at coordinated pinch range (8m..40m) against active threats
  const pinchWindow = 1.0 - Math.abs(allyDist - 0.22) * 2.6;
  payoffs[5] = (allies > 0.1 ? 0.85 + pinchWindow * 1.05 : -1.2)
    + (enemies >= 0.45 && allies > 0.1 ? 1.1 : 0)
    + (vitality - 0.45) * 0.85
    + targetIsHuman * (allies > 0.1 ? 0.5 : 0)
    - Math.max(0, 0.18 - dist) * 1.1;

  return payoffs;
}

/**
 * Evaluates simulated fire-control payoffs (Head 2: when & how to shoot).
 */
export function evaluateSimulatedFirePayoffs(features) {
  const dist = features[2]; // 0..1 (0..120m)
  const weaponRange = features[6]; // ~0.33 pistol, ~0.5 rifle, ~0.71 marksman, ~0.95 sniper
  const ammo = features[7];
  const aimError = features[15]; // 0 = dead on, 1 = off by >= 0.45 rad
  const targetSpeed = features[16];
  const los = features[17];

  const payoffs = new Float64Array(COMBAT_NET_FIRE_DIM);

  // 0: full_auto_suppression — close range (< 26m), automatic/rifle weapon, clear LOS, aim reasonably aligned
  payoffs[0] = (0.24 - dist) * 3.1
    + (0.65 - weaponRange) * 1.6
    + (0.35 - aimError) * 2.2
    + (ammo - 0.25) * 1.1
    + (los - 0.5) * 2.5;

  // 1: controlled_burst — mid range (18m..58m), rifle/marksman, moderate aim error, moving or stationary target
  const midDistScore = 1.0 - Math.abs(dist - 0.32) * 2.8;
  payoffs[1] = midDistScore * 2.2
    + (0.45 - aimError) * 1.85
    + (0.8 - weaponRange) * 0.75
    + targetSpeed * 0.55
    + (los - 0.5) * 2.4;

  // 2: precision_tap — long range or sniper/marksman, tight aim alignment (< 0.12 rad)
  payoffs[2] = (weaponRange - 0.55) * 2.8
    + (dist - 0.25) * 1.9
    + (0.22 - aimError) * 3.2
    + (los - 0.5) * 2.5;

  // 3: hold_fire_acquire — when LOS is blocked, aim error is large, ammo is nearly empty, or target is beyond weapon range
  payoffs[3] = (aimError - 0.36) * 3.6
    + (1 - los) * 4.2
    + Math.max(0, dist - weaponRange * 0.98) * 3.5
    + (0.12 - ammo) * 2.4;

  return payoffs;
}

/**
 * Evaluates simulated parachute deployment timing payoffs (Head 3: when to open parachute).
 */
export function evaluateSimulatedParachutePayoffs(features) {
  const altitude = features[12]; // 0..1 (0..420m)
  const verticalSpeed = features[13]; // 0..1 (0..52 m/s)
  const landingDist = features[14]; // 0..1 (0..240m)

  const payoffs = new Float64Array(COMBAT_NET_PARACHUTE_DIM);

  // Ratio of horizontal distance left vs current altitude
  const glideRatio = landingDist / Math.max(0.08, altitude);

  // 0: freefall_dive — stay in fast freefall while high above ground (> 145m) and not needing a long glide
  payoffs[0] = (altitude - 0.35) * 3.8
    + (0.72 - glideRatio) * 2.1
    - (altitude < 0.25 ? 3.5 : 0);

  // 1: glide_early_open — open canopy earlier when horizontal distance to target is large relative to altitude
  payoffs[1] = (glideRatio - 0.68) * 3.4
    + (1.0 - Math.abs(altitude - 0.52) * 2.2) * 1.25
    - (altitude > 0.85 ? 1.8 : 0);

  // 2: combat_low_pull — tactical low-altitude pull (95m..145m) when already close horizontally to the drop point
  const lowPullWindow = 1.0 - Math.abs(altitude - 0.27) * 4.2;
  payoffs[2] = lowPullWindow * 3.1
    + (0.45 - landingDist) * 1.85
    + verticalSpeed * 0.9
    + (altitude <= 0.24 ? 2.6 : 0);

  return payoffs;
}

export class TacticalCombatNet {
  constructor({ seed = 20261118, learningRate = 0.026 } = {}) {
    this.seed = seed;
    this.learningRate = learningRate;
    const rand = createMulberry32(seed);

    const initMatrix = (rows, cols, scale) => {
      const arr = new Float64Array(rows * cols);
      for (let i = 0; i < arr.length; i += 1) {
        arr[i] = (rand() * 2 - 1) * scale;
      }
      return arr;
    };

    this.w1 = initMatrix(COMBAT_NET_HIDDEN1_DIM, COMBAT_NET_INPUT_DIM, Math.sqrt(2 / COMBAT_NET_INPUT_DIM));
    this.b1 = new Float64Array(COMBAT_NET_HIDDEN1_DIM);

    this.w2 = initMatrix(COMBAT_NET_HIDDEN2_DIM, COMBAT_NET_HIDDEN1_DIM, Math.sqrt(2 / COMBAT_NET_HIDDEN1_DIM));
    this.b2 = new Float64Array(COMBAT_NET_HIDDEN2_DIM);

    // Head 1: Tactical Maneuver (6 outputs)
    this.wOut = initMatrix(COMBAT_NET_OUTPUT_DIM, COMBAT_NET_HIDDEN2_DIM, Math.sqrt(1.5 / COMBAT_NET_HIDDEN2_DIM));
    this.bOut = new Float64Array(COMBAT_NET_OUTPUT_DIM);

    // Head 2: Fire Control / When to Shoot (4 outputs)
    this.wFire = initMatrix(COMBAT_NET_FIRE_DIM, COMBAT_NET_HIDDEN2_DIM, Math.sqrt(1.5 / COMBAT_NET_HIDDEN2_DIM));
    this.bFire = new Float64Array(COMBAT_NET_FIRE_DIM);

    // Head 3: Parachute Deployment Timing (3 outputs)
    this.wParachute = initMatrix(COMBAT_NET_PARACHUTE_DIM, COMBAT_NET_HIDDEN2_DIM, Math.sqrt(1.5 / COMBAT_NET_HIDDEN2_DIM));
    this.bParachute = new Float64Array(COMBAT_NET_PARACHUTE_DIM);

    // Head 4: Value Critic (1 scalar output)
    this.wVal = initMatrix(1, COMBAT_NET_HIDDEN2_DIM, Math.sqrt(1 / COMBAT_NET_HIDDEN2_DIM));
    this.bVal = 0;

    this.pretrainedEpisodes = 0;
    this.initialLoss = null;
    this.currentLoss = null;
    this.pretrainAccuracy = 0;
    this.pretrainFireAccuracy = 0;
    this.pretrainParachuteAccuracy = 0;
    this.liveCombatUpdates = 0;
    this.humanSamplesLearned = 0;
    this.humanParachuteSamples = 0;
    this.humanCombatUpdates = 0;
    this.rollingReward = 0;

    this.actionCounts = new Array(COMBAT_NET_OUTPUT_DIM).fill(0);
    this.fireModeCounts = new Array(COMBAT_NET_FIRE_DIM).fill(0);
    this.parachuteModeCounts = new Array(COMBAT_NET_PARACHUTE_DIM).fill(0);

    // Learned profile of the live human player
    this.humanStyleProfile = {
      aggressionIndex: 0.58,
      preferredEngageDistance: 24,
      preferredDeployAltitude: 118,
      burstDiscipline: 0.65,
      observedShots: 0,
      observedHits: 0,
      observedParachuteDrops: 0,
      lastObservedAction: null,
      lastObservedFireMode: null,
      lastObservedParachuteMode: null,
    };

    this.replayBuffer = [];
    this.humanReplayBuffer = [];
    this.maxReplaySize = 256;
    this.activeBotStates = new Map();
  }

  forward(inputFeatures) {
    const x = inputFeatures instanceof Float64Array
      ? inputFeatures
      : extractCombatFeatures(inputFeatures);

    const h1 = new Float64Array(COMBAT_NET_HIDDEN1_DIM);
    for (let i = 0; i < COMBAT_NET_HIDDEN1_DIM; i += 1) {
      let sum = this.b1[i];
      const rowOffset = i * COMBAT_NET_INPUT_DIM;
      for (let j = 0; j < COMBAT_NET_INPUT_DIM; j += 1) {
        sum += this.w1[rowOffset + j] * x[j];
      }
      h1[i] = leakyRelu(sum);
    }

    const h2 = new Float64Array(COMBAT_NET_HIDDEN2_DIM);
    for (let i = 0; i < COMBAT_NET_HIDDEN2_DIM; i += 1) {
      let sum = this.b2[i];
      const rowOffset = i * COMBAT_NET_HIDDEN1_DIM;
      for (let j = 0; j < COMBAT_NET_HIDDEN1_DIM; j += 1) {
        sum += this.w2[rowOffset + j] * h1[j];
      }
      h2[i] = Math.tanh(sum);
    }

    const logits = new Float64Array(COMBAT_NET_OUTPUT_DIM);
    for (let i = 0; i < COMBAT_NET_OUTPUT_DIM; i += 1) {
      let sum = this.bOut[i];
      const rowOffset = i * COMBAT_NET_HIDDEN2_DIM;
      for (let j = 0; j < COMBAT_NET_HIDDEN2_DIM; j += 1) {
        sum += this.wOut[rowOffset + j] * h2[j];
      }
      logits[i] = sum;
    }

    const fireLogits = new Float64Array(COMBAT_NET_FIRE_DIM);
    for (let i = 0; i < COMBAT_NET_FIRE_DIM; i += 1) {
      let sum = this.bFire[i];
      const rowOffset = i * COMBAT_NET_HIDDEN2_DIM;
      for (let j = 0; j < COMBAT_NET_HIDDEN2_DIM; j += 1) {
        sum += this.wFire[rowOffset + j] * h2[j];
      }
      fireLogits[i] = sum;
    }

    const parachuteLogits = new Float64Array(COMBAT_NET_PARACHUTE_DIM);
    for (let i = 0; i < COMBAT_NET_PARACHUTE_DIM; i += 1) {
      let sum = this.bParachute[i];
      const rowOffset = i * COMBAT_NET_HIDDEN2_DIM;
      for (let j = 0; j < COMBAT_NET_HIDDEN2_DIM; j += 1) {
        sum += this.wParachute[rowOffset + j] * h2[j];
      }
      parachuteLogits[i] = sum;
    }

    let value = this.bVal;
    for (let j = 0; j < COMBAT_NET_HIDDEN2_DIM; j += 1) {
      value += this.wVal[j] * h2[j];
    }

    const probs = softmax(logits);
    let bestIdx = 0;
    for (let i = 1; i < probs.length; i += 1) {
      if (probs[i] > probs[bestIdx]) bestIdx = i;
    }

    const fireProbs = softmax(fireLogits);
    let bestFireIdx = 0;
    for (let i = 1; i < fireProbs.length; i += 1) {
      if (fireProbs[i] > fireProbs[bestFireIdx]) bestFireIdx = i;
    }

    const parachuteProbs = softmax(parachuteLogits);
    let bestParachuteIdx = 0;
    for (let i = 1; i < parachuteProbs.length; i += 1) {
      if (parachuteProbs[i] > parachuteProbs[bestParachuteIdx]) bestParachuteIdx = i;
    }

    return {
      x,
      h1,
      h2,
      logits,
      probs,
      fireLogits,
      fireProbs,
      parachuteLogits,
      parachuteProbs,
      value,
      actionIndex: bestIdx,
      action: COMBAT_NET_ACTIONS[bestIdx],
      confidence: Number(probs[bestIdx].toFixed(3)),
      fireModeIndex: bestFireIdx,
      fireMode: COMBAT_NET_FIRE_MODES[bestFireIdx],
      fireConfidence: Number(fireProbs[bestFireIdx].toFixed(3)),
      parachuteModeIndex: bestParachuteIdx,
      parachuteMode: COMBAT_NET_PARACHUTE_MODES[bestParachuteIdx],
      parachuteConfidence: Number(parachuteProbs[bestParachuteIdx].toFixed(3)),
    };
  }

  /**
   * Backpropagates target distributions across any active heads (tactical, fire, parachute)
   * and target value estimate through the shared 20-32-18 backbone.
   */
  trainSample(
    inputFeatures,
    targetProbs,
    targetValue,
    lr = this.learningRate,
    { targetFireProbs = null, targetParachuteProbs = null } = {},
  ) {
    const fwd = this.forward(inputFeatures);
    const { x, h1, h2, probs, fireProbs, parachuteProbs, value } = fwd;

    const dH2 = new Float64Array(COMBAT_NET_HIDDEN2_DIM);
    let totalLoss = 0;

    if (targetProbs) {
      let ceLoss = 0;
      for (let i = 0; i < COMBAT_NET_OUTPUT_DIM; i += 1) {
        const targetP = clamp(targetProbs[i] ?? 0, 0, 1);
        if (targetP > 0) {
          ceLoss -= targetP * Math.log(Math.max(1e-9, probs[i]));
        }
        const gradOut = probs[i] - targetP;
        this.bOut[i] -= lr * gradOut;
        const rowOffset = i * COMBAT_NET_HIDDEN2_DIM;
        for (let j = 0; j < COMBAT_NET_HIDDEN2_DIM; j += 1) {
          dH2[j] += this.wOut[rowOffset + j] * gradOut;
          this.wOut[rowOffset + j] -= lr * (gradOut * h2[j] + 1e-4 * this.wOut[rowOffset + j]);
        }
      }
      totalLoss += ceLoss;
    }

    if (targetFireProbs) {
      let fireLoss = 0;
      for (let i = 0; i < COMBAT_NET_FIRE_DIM; i += 1) {
        const targetP = clamp(targetFireProbs[i] ?? 0, 0, 1);
        if (targetP > 0) {
          fireLoss -= targetP * Math.log(Math.max(1e-9, fireProbs[i]));
        }
        const gradFire = (fireProbs[i] - targetP) * 0.85;
        this.bFire[i] -= lr * gradFire;
        const rowOffset = i * COMBAT_NET_HIDDEN2_DIM;
        for (let j = 0; j < COMBAT_NET_HIDDEN2_DIM; j += 1) {
          dH2[j] += this.wFire[rowOffset + j] * gradFire;
          this.wFire[rowOffset + j] -= lr * (gradFire * h2[j] + 1e-4 * this.wFire[rowOffset + j]);
        }
      }
      totalLoss += fireLoss * 0.5;
    }

    if (targetParachuteProbs) {
      let paraLoss = 0;
      for (let i = 0; i < COMBAT_NET_PARACHUTE_DIM; i += 1) {
        const targetP = clamp(targetParachuteProbs[i] ?? 0, 0, 1);
        if (targetP > 0) {
          paraLoss -= targetP * Math.log(Math.max(1e-9, parachuteProbs[i]));
        }
        const gradPara = (parachuteProbs[i] - targetP) * 0.85;
        this.bParachute[i] -= lr * gradPara;
        const rowOffset = i * COMBAT_NET_HIDDEN2_DIM;
        for (let j = 0; j < COMBAT_NET_HIDDEN2_DIM; j += 1) {
          dH2[j] += this.wParachute[rowOffset + j] * gradPara;
          this.wParachute[rowOffset + j] -= lr * (gradPara * h2[j] + 1e-4 * this.wParachute[rowOffset + j]);
        }
      }
      totalLoss += paraLoss * 0.45;
    }

    if (Number.isFinite(targetValue)) {
      const valDiff = clamp(value - targetValue, -4, 4);
      const valueLoss = 0.5 * valDiff * valDiff;
      totalLoss += 0.25 * valueLoss;
      const gradVal = 0.35 * valDiff;
      this.bVal -= lr * gradVal;
      for (let j = 0; j < COMBAT_NET_HIDDEN2_DIM; j += 1) {
        dH2[j] += this.wVal[j] * gradVal;
        this.wVal[j] -= lr * (gradVal * h2[j] + 1e-4 * this.wVal[j]);
      }
    }

    const dH1 = new Float64Array(COMBAT_NET_HIDDEN1_DIM);
    for (let i = 0; i < COMBAT_NET_HIDDEN2_DIM; i += 1) {
      const grad2 = dH2[i] * dTanh(h2[i]);
      this.b2[i] -= lr * grad2;
      const rowOffset = i * COMBAT_NET_HIDDEN1_DIM;
      for (let j = 0; j < COMBAT_NET_HIDDEN1_DIM; j += 1) {
        dH1[j] += this.w2[rowOffset + j] * grad2;
        this.w2[rowOffset + j] -= lr * (grad2 * h1[j] + 1e-4 * this.w2[rowOffset + j]);
      }
    }

    for (let i = 0; i < COMBAT_NET_HIDDEN1_DIM; i += 1) {
      const grad1 = dH1[i] * dLeakyRelu(h1[i]);
      this.b1[i] -= lr * grad1;
      const rowOffset = i * COMBAT_NET_INPUT_DIM;
      for (let j = 0; j < COMBAT_NET_INPUT_DIM; j += 1) {
        this.w1[rowOffset + j] -= lr * (grad1 * x[j] + 1e-4 * this.w1[rowOffset + j]);
      }
    }

    if (this.initialLoss === null) this.initialLoss = totalLoss;
    this.currentLoss = this.currentLoss === null
      ? totalLoss
      : this.currentLoss * 0.92 + totalLoss * 0.08;

    return totalLoss;
  }

  /**
   * Pre-trains all 3 policy heads (tactical maneuver, fire control, parachute deployment)
   * on simulated engagements before matches begin.
   */
  pretrainOnSimulatedBattles(episodes = 480) {
    const rand = createMulberry32(this.seed + 99);
    const weaponRanges = [0.33, 0.5, 0.71, 0.95];
    let correctTactical = 0;
    let correctFire = 0;
    let correctParachute = 0;
    let totalRecent = 0;

    for (let ep = 0; ep < episodes; ep += 1) {
      const features = new Float64Array(COMBAT_NET_INPUT_DIM);
      features[0] = clamp(0.12 + rand() * 0.88, 0, 1); // selfHealthRatio
      features[1] = clamp(rand(), 0, 1); // selfArmorRatio
      features[2] = clamp(0.04 + rand() * 0.92, 0, 1); // enemyDistanceNorm
      features[3] = clamp((1 + Math.floor(rand() * 3.4)) / 4, 0, 1); // visibleEnemyCountNorm
      features[4] = clamp(Math.floor(rand() * 3.2) / 3, 0, 1); // standingAlliesNorm
      features[5] = features[4] > 0 ? clamp(0.06 + rand() * 0.85, 0, 1) : 1.0; // nearestAllyDistNorm
      features[6] = weaponRanges[Math.floor(rand() * weaponRanges.length)]; // weaponRangeNorm
      features[7] = clamp(0.08 + rand() * 0.92, 0, 1); // ammoRatio
      features[8] = clamp(rand(), 0, 1); // targetArmorRatio
      features[9] = rand() > 0.55 ? 1 : 0; // hasCoverOrBuilding
      features[10] = clamp(rand(), 0, 1); // hasStimsOrPlates
      features[11] = clamp((rand() * 2 - 1) * 0.85, -1, 1); // elevationDiff
      features[12] = clamp(0.14 + rand() * 0.82, 0, 1); // altitudeNorm
      features[13] = clamp(0.2 + rand() * 0.8, 0, 1); // verticalSpeedNorm
      features[14] = clamp(0.04 + rand() * 0.92, 0, 1); // landingDistNorm
      features[15] = clamp(rand() * 0.85, 0, 1); // aimErrorNorm
      features[16] = clamp(rand() * 0.85, 0, 1); // targetSpeedNorm
      features[17] = rand() > 0.14 ? 1 : 0; // lineOfSightClear
      features[18] = rand() > 0.65 ? 1 : 0; // targetIsHuman
      features[19] = clamp(0.35 + rand() * 0.55, 0, 1); // humanAggressionIndex

      const payoffs = evaluateSimulatedBattlePayoffs(features);
      let bestOracleIdx = 0;
      for (let i = 1; i < payoffs.length; i += 1) {
        if (payoffs[i] > payoffs[bestOracleIdx]) bestOracleIdx = i;
      }

      const firePayoffs = evaluateSimulatedFirePayoffs(features);
      let bestFireOracle = 0;
      for (let i = 1; i < firePayoffs.length; i += 1) {
        if (firePayoffs[i] > firePayoffs[bestFireOracle]) bestFireOracle = i;
      }

      const paraPayoffs = evaluateSimulatedParachutePayoffs(features);
      let bestParaOracle = 0;
      for (let i = 1; i < paraPayoffs.length; i += 1) {
        if (paraPayoffs[i] > paraPayoffs[bestParaOracle]) bestParaOracle = i;
      }

      const scaleArray = (arr, temp) => {
        const out = new Float64Array(arr.length);
        for (let i = 0; i < arr.length; i += 1) out[i] = arr[i] / temp;
        return softmax(out);
      };

      const targetProbs = scaleArray(payoffs, 0.3);
      const targetFireProbs = scaleArray(firePayoffs, 0.28);
      const targetParachuteProbs = scaleArray(paraPayoffs, 0.28);
      const targetValue = clamp(payoffs[bestOracleIdx] * 0.5, -2, 2);

      const lr = this.learningRate * (1 - (ep / (episodes * 1.45)));
      for (let pass = 0; pass < 3; pass += 1) {
        this.trainSample(features, targetProbs, targetValue, lr, {
          targetFireProbs,
          targetParachuteProbs,
        });
      }

      if (ep >= episodes - 100) {
        const pred = this.forward(features);
        if (pred.actionIndex === bestOracleIdx) correctTactical += 1;
        if (pred.fireModeIndex === bestFireOracle) correctFire += 1;
        if (pred.parachuteModeIndex === bestParaOracle) correctParachute += 1;
        totalRecent += 1;
      }
      this.pretrainedEpisodes += 1;
    }

    this.pretrainAccuracy = totalRecent > 0 ? Number((correctTactical / totalRecent).toFixed(3)) : 0;
    this.pretrainFireAccuracy = totalRecent > 0 ? Number((correctFire / totalRecent).toFixed(3)) : 0;
    this.pretrainParachuteAccuracy = totalRecent > 0 ? Number((correctParachute / totalRecent).toFixed(3)) : 0;

    return this.summary();
  }

  /**
   * Predicts tactical maneuver + when/how to shoot for a bot in combat.
   */
  decideForBot(botId, rawContext = {}, now = Date.now()) {
    const enriched = {
      ...rawContext,
      humanAggressionIndex: rawContext.humanAggressionIndex ?? this.humanStyleProfile.aggressionIndex,
    };
    const features = extractCombatFeatures(enriched);
    const out = this.forward(features);
    this.actionCounts[out.actionIndex] = (this.actionCounts[out.actionIndex] ?? 0) + 1;
    this.fireModeCounts[out.fireModeIndex] = (this.fireModeCounts[out.fireModeIndex] ?? 0) + 1;
    if (botId) {
      this.activeBotStates.set(botId, {
        features,
        actionIndex: out.actionIndex,
        action: out.action,
        fireModeIndex: out.fireModeIndex,
        fireMode: out.fireMode,
        value: out.value,
        targetIsHuman: Boolean(rawContext.targetIsHuman),
        at: now,
      });
    }
    return out;
  }

  /**
   * Predicts when a bot should open its parachute during airborne drop.
   */
  decideParachuteForBot(botId, rawContext = {}, now = Date.now()) {
    const enriched = {
      ...rawContext,
      humanAggressionIndex: this.humanStyleProfile.aggressionIndex,
    };
    const features = extractCombatFeatures(enriched);
    const out = this.forward(features);
    this.parachuteModeCounts[out.parachuteModeIndex] = (this.parachuteModeCounts[out.parachuteModeIndex] ?? 0) + 1;
    const shouldOpenNow = out.parachuteMode === "glide_early_open" || out.parachuteMode === "combat_low_pull";
    return {
      ...out,
      shouldOpenNow,
      learnedHumanDeployAltitude: this.humanStyleProfile.preferredDeployAltitude,
      at: now,
    };
  }

  /**
   * Live imitation learning directly from the human player's parachute opening & landing.
   */
  learnFromHumanParachute(observation = {}, now = Date.now()) {
    const altitude = clamp(Number(observation.altitude) || 120, 20, 420);
    const verticalSpeed = clamp(Math.abs(Number(observation.verticalVelocity ?? observation.verticalSpeed) || 35), 0, 52);
    const landingDistance = clamp(Number(observation.landingDistance) || 35, 0, 240);

    // Update rolling learned human parachute deploy altitude
    this.humanStyleProfile.preferredDeployAltitude = Number(
      (this.humanStyleProfile.preferredDeployAltitude * 0.72 + altitude * 0.28).toFixed(1),
    );
    this.humanStyleProfile.observedParachuteDrops += 1;

    const features = extractCombatFeatures({
      altitude,
      verticalSpeed,
      landingDistance,
      targetIsHuman: true,
      humanAggressionIndex: this.humanStyleProfile.aggressionIndex,
    });

    // Infer whether the human player executed a combat low-pull or an early glide opening
    const chosenModeIdx = altitude <= 155 ? 2 : 1; // 2 = combat_low_pull, 1 = glide_early_open
    this.humanStyleProfile.lastObservedParachuteMode = COMBAT_NET_PARACHUTE_MODES[chosenModeIdx];

    const targetParachuteProbs = new Float64Array(COMBAT_NET_PARACHUTE_DIM);
    targetParachuteProbs[0] = 0.04;
    targetParachuteProbs[1] = chosenModeIdx === 1 ? 0.88 : 0.08;
    targetParachuteProbs[2] = chosenModeIdx === 2 ? 0.88 : 0.08;

    this.trainSample(features, null, 1.1, this.learningRate * 1.15, {
      targetParachuteProbs,
    });

    this.humanParachuteSamples += 1;
    this.humanSamplesLearned += 1;
    this.liveCombatUpdates += 1;
    return {
      learnedMode: COMBAT_NET_PARACHUTE_MODES[chosenModeIdx],
      preferredDeployAltitude: this.humanStyleProfile.preferredDeployAltitude,
      humanParachuteSamples: this.humanParachuteSamples,
      at: now,
    };
  }

  /**
   * Live imitation learning directly from the human player's combat actions (movement, shooting, hits, knockdowns).
   */
  learnFromHumanCombat(rawContext = {}, humanAction = {}, now = Date.now()) {
    const dist = clamp(Number(rawContext.enemyDistance) || 22, 1, 140);
    const forward = Number(humanAction.forward) || 0;
    const strafe = Number(humanAction.strafe) || 0;
    const sprint = Boolean(humanAction.sprint);
    const weaponId = String(humanAction.weaponId || "rifle");
    const aimError = clamp(Number(rawContext.aimError) || 0.06, 0, 0.45);
    const hitScored = Boolean(humanAction.hitScored);
    const rewardBoost = clamp(Number(humanAction.reward) || 0.9, 0.3, 2.2);

    // Update rolling human player combat profile
    const moveAggro = clamp((forward > 0.3 ? 0.78 : forward < -0.2 ? 0.28 : 0.52) + (sprint ? 0.15 : 0), 0.1, 0.98);
    this.humanStyleProfile.aggressionIndex = Number(
      (this.humanStyleProfile.aggressionIndex * 0.85 + moveAggro * 0.15).toFixed(3),
    );
    this.humanStyleProfile.preferredEngageDistance = Number(
      (this.humanStyleProfile.preferredEngageDistance * 0.85 + dist * 0.15).toFixed(1),
    );
    this.humanStyleProfile.observedShots += 1;
    if (hitScored) this.humanStyleProfile.observedHits += 1;

    const features = extractCombatFeatures({
      ...rawContext,
      aimError,
      targetIsHuman: true,
      humanAggressionIndex: this.humanStyleProfile.aggressionIndex,
    });

    // Infer the human player's tactical maneuver from their real movement & positioning
    let tacticalIdx = 0; // press_aggressive
    if ((Number(rawContext.selfHealthRatio) || 1) + (Number(rawContext.selfArmorRatio) || 0.5) < 0.7 && forward <= 0) {
      tacticalIdx = 4; // tactical_reset
    } else if (forward < -0.25) {
      tacticalIdx = 3; // kite_space
    } else if (Math.abs(strafe) >= 0.45 && dist >= 14) {
      tacticalIdx = 1; // flank_wide
    } else if ((weaponId === "sniper" || weaponId === "marksman") && Math.abs(forward) < 0.35 && dist >= 22) {
      tacticalIdx = 2; // hold_precision
    } else if ((Number(rawContext.standingAllies) || 0) >= 1 && (Number(rawContext.nearestAllyDistance) || 40) <= 28 && dist >= 12) {
      tacticalIdx = 5; // squad_focus_push
    } else {
      tacticalIdx = 0; // press_aggressive
    }

    // Infer the human player's fire discipline mode
    let fireIdx = 1; // controlled_burst
    if (weaponId === "sniper" || (weaponId === "marksman" && dist >= 26)) {
      fireIdx = 2; // precision_tap
    } else if (dist <= 20 && aimError <= 0.16) {
      fireIdx = 0; // full_auto_suppression
    } else if (aimError > 0.32) {
      fireIdx = 3; // hold_fire_acquire
    }

    this.humanStyleProfile.lastObservedAction = COMBAT_NET_ACTIONS[tacticalIdx];
    this.humanStyleProfile.lastObservedFireMode = COMBAT_NET_FIRE_MODES[fireIdx];

    const targetProbs = new Float64Array(COMBAT_NET_OUTPUT_DIM).fill(0.03);
    targetProbs[tacticalIdx] = 0.85;

    const targetFireProbs = new Float64Array(COMBAT_NET_FIRE_DIM).fill(0.04);
    targetFireProbs[fireIdx] = 0.88;

    const targetValue = clamp(0.75 * rewardBoost, -2, 2);
    this.trainSample(features, targetProbs, targetValue, this.learningRate * 0.95, {
      targetFireProbs,
    });

    this.humanReplayBuffer.push({
      features: new Float64Array(features),
      targetProbs,
      targetFireProbs,
      targetValue,
    });
    if (this.humanReplayBuffer.length > 96) {
      this.humanReplayBuffer.shift();
    }

    this.humanSamplesLearned += 1;
    this.humanCombatUpdates += 1;
    this.liveCombatUpdates += 1;
    this.rollingReward = Number((this.rollingReward * 0.9 + rewardBoost * 0.1).toFixed(4));

    return {
      learnedTactic: COMBAT_NET_ACTIONS[tacticalIdx],
      learnedFireMode: COMBAT_NET_FIRE_MODES[fireIdx],
      humanSamplesLearned: this.humanSamplesLearned,
      at: now,
    };
  }

  /**
   * Online reinforcement learning step from real match combat events (damage dealt/taken, knockdowns, kills, revives).
   * Engagements involving the live human player carry a higher learning weight.
   */
  recordCombatOutcome(botId, rewardSignal, now = Date.now(), { involvesHuman = false } = {}) {
    const state = this.activeBotStates.get(botId);
    if (!state || now - state.at > 12_000) return false;

    const humanMultiplier = (involvesHuman || state.targetIsHuman) ? 1.85 : 1.0;
    const reward = clamp(rewardSignal * humanMultiplier, -2.5, 2.5);
    this.rollingReward = Number((this.rollingReward * 0.9 + reward * 0.1).toFixed(4));

    const fwd = this.forward(state.features);
    const targetProbs = new Float64Array(fwd.probs);
    const targetFireProbs = new Float64Array(fwd.fireProbs);
    const idx = state.actionIndex;
    const fireIdx = state.fireModeIndex ?? 0;
    const advantage = clamp(reward - fwd.value * 0.35, -2.0, 2.0);

    if (advantage >= 0) {
      targetProbs[idx] = clamp(targetProbs[idx] + 0.38 * advantage, 0.05, 0.96);
      targetFireProbs[fireIdx] = clamp(targetFireProbs[fireIdx] + 0.32 * advantage, 0.05, 0.96);
    } else {
      targetProbs[idx] = clamp(targetProbs[idx] * Math.exp(advantage * 0.65), 0.02, 0.9);
      const oraclePayoffs = evaluateSimulatedBattlePayoffs(state.features);
      let bestAlt = 0;
      for (let i = 1; i < oraclePayoffs.length; i += 1) {
        if (oraclePayoffs[i] > oraclePayoffs[bestAlt]) bestAlt = i;
      }
      targetProbs[bestAlt] = clamp(targetProbs[bestAlt] + 0.28 * Math.abs(advantage), 0.05, 0.95);

      const oracleFire = evaluateSimulatedFirePayoffs(state.features);
      let bestFireAlt = 0;
      for (let i = 1; i < oracleFire.length; i += 1) {
        if (oracleFire[i] > oracleFire[bestFireAlt]) bestFireAlt = i;
      }
      targetFireProbs[bestFireAlt] = clamp(targetFireProbs[bestFireAlt] + 0.25 * Math.abs(advantage), 0.05, 0.95);
    }

    const normalizeProbs = (arr) => {
      let s = 0;
      for (let i = 0; i < arr.length; i += 1) s += arr[i];
      if (s > 0) {
        for (let i = 0; i < arr.length; i += 1) arr[i] /= s;
      }
    };
    normalizeProbs(targetProbs);
    normalizeProbs(targetFireProbs);

    const targetValue = clamp(fwd.value * 0.5 + reward * 0.5, -2, 2);
    const stepLr = this.learningRate * ((involvesHuman || state.targetIsHuman) ? 0.92 : 0.55);
    this.trainSample(state.features, targetProbs, targetValue, stepLr, {
      targetFireProbs,
    });

    this.replayBuffer.push({
      features: new Float64Array(state.features),
      targetProbs,
      targetFireProbs,
      targetValue,
    });
    if (this.replayBuffer.length > this.maxReplaySize) {
      this.replayBuffer.shift();
    }

    // Prioritize rehearsing human player demonstrations during experience replay
    if (this.humanReplayBuffer.length > 0 && this.liveCombatUpdates % 2 === 0) {
      const hIdx = (this.liveCombatUpdates * 5) % this.humanReplayBuffer.length;
      const hSample = this.humanReplayBuffer[hIdx];
      this.trainSample(hSample.features, hSample.targetProbs, hSample.targetValue, this.learningRate * 0.5, {
        targetFireProbs: hSample.targetFireProbs,
      });
    } else if (this.replayBuffer.length >= 4 && this.liveCombatUpdates % 3 === 0) {
      const replayIdx = (this.liveCombatUpdates * 7) % this.replayBuffer.length;
      const sample = this.replayBuffer[replayIdx];
      this.trainSample(sample.features, sample.targetProbs, sample.targetValue, this.learningRate * 0.35, {
        targetFireProbs: sample.targetFireProbs,
      });
    }

    if (involvesHuman || state.targetIsHuman) {
      this.humanCombatUpdates += 1;
    }
    this.liveCombatUpdates += 1;
    return true;
  }

  summary() {
    return {
      architecture: `${COMBAT_NET_INPUT_DIM}-${COMBAT_NET_HIDDEN1_DIM}-${COMBAT_NET_HIDDEN2_DIM}-(${COMBAT_NET_OUTPUT_DIM}+${COMBAT_NET_FIRE_DIM}+${COMBAT_NET_PARACHUTE_DIM})`,
      inputDimensions: COMBAT_NET_INPUT_DIM,
      pretrainedEpisodes: this.pretrainedEpisodes,
      liveCombatUpdates: this.liveCombatUpdates,
      humanSamplesLearned: this.humanSamplesLearned,
      humanParachuteSamples: this.humanParachuteSamples,
      humanCombatUpdates: this.humanCombatUpdates,
      initialLoss: this.initialLoss !== null ? Number(this.initialLoss.toFixed(4)) : null,
      currentLoss: this.currentLoss !== null ? Number(this.currentLoss.toFixed(4)) : null,
      pretrainAccuracy: this.pretrainAccuracy,
      pretrainFireAccuracy: this.pretrainFireAccuracy,
      pretrainParachuteAccuracy: this.pretrainParachuteAccuracy,
      rollingReward: this.rollingReward,
      humanStyleProfile: { ...this.humanStyleProfile },
      actionDistribution: Object.fromEntries(
        COMBAT_NET_ACTIONS.map((name, i) => [name, this.actionCounts[i] ?? 0]),
      ),
      fireModeDistribution: Object.fromEntries(
        COMBAT_NET_FIRE_MODES.map((name, i) => [name, this.fireModeCounts[i] ?? 0]),
      ),
      parachuteModeDistribution: Object.fromEntries(
        COMBAT_NET_PARACHUTE_MODES.map((name, i) => [name, this.parachuteModeCounts[i] ?? 0]),
      ),
    };
  }
}

let sharedTacticalCombatNet = null;

export function getSharedTacticalCombatNet() {
  if (!sharedTacticalCombatNet) {
    sharedTacticalCombatNet = new TacticalCombatNet();
    sharedTacticalCombatNet.pretrainOnSimulatedBattles(480);
  }
  return sharedTacticalCombatNet;
}
