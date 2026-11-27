function finite(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, finite(value, min)));
}

export const ELECTRO_RIFLE_MODES = Object.freeze([
  Object.freeze({
    id: "shock",
    label: "Шокер (пробитие брони и сильный подброс)",
    shortLabel: "Шокер",
    damageMultiplier: 1.35,
    armorMultiplier: 3.6,
    knockbackUp: 11.5,
    knockbackPush: 15.5,
    chainTargets: 0,
    chainRadius: 0,
    officialBonus: 2.5,
  }),
  Object.freeze({
    id: "chain",
    label: "Цепной разряд (бьёт ближайших врагов и подбрасывает)",
    shortLabel: "Цепной разряд",
    damageMultiplier: 1.2,
    armorMultiplier: 3.2,
    knockbackUp: 8.0,
    knockbackPush: 11.0,
    chainTargets: 3,
    chainRadius: 16,
    officialBonus: 2.6,
  }),
  Object.freeze({
    id: "overload",
    label: "Перегрузка (максимальный урон и мощный подброс)",
    shortLabel: "Перегрузка",
    damageMultiplier: 1.9,
    armorMultiplier: 4.4,
    knockbackUp: 15.5,
    knockbackPush: 20.0,
    chainTargets: 0,
    chainRadius: 0,
    officialBonus: 3.2,
  }),
]);

export const ELECTRO_SUPER_JUMP_CONFIG = Object.freeze({
  cooldownMs: 3_000,
  boostDurationMs: 15_000,
  launchApexOffset: 600,
  bunkerApexOffset: 2.5,
  riseSpeed: 42,
  riseSpeedStart: 32,
  riseSpeedMax: 52,
  forwardBoostSpeed: 54,
  forwardBoostStart: 36,
  forwardBoostMax: 84,
  glideGravity: 14,
  maxFallSpeed: 58,
  glideDrag: 0.08,
  airTurnSpeed: 2.6,
  diveSpeed: 95,
  botBoostDurationMs: 1200,
  botApexOffset: 24,
  botForwardSpeed: 20,
  slamRadius: 28,
  slamCoreRadius: 12,
  slamMaxDamage: 420,
  slamMinEdgeDamage: 140,
  knockbackPush: 16,
  knockbackUp: 11,
});

export const ELECTRO_LUKASHENKO_STATS = Object.freeze({
  maxHealth: 800,
  maxArmor: 800,
  internalStimIntervalMs: 12_000,
  internalStimThresholdRatio: 0.48,
  internalStimHealAmount: 220,
});

export const MINI_NUKE_CONFIG = Object.freeze({
  packCharges: 1000,
  maxCarry: 9999,
  launchCooldownMs: 1200,
  impactDelayMs: 2150, // Synced to the boom peak at 2.15s in dropped-a-bomb-and-it-exploded_188d696e.mp3
  blastRadius: 185,
  lethalCoreRadius: 72,
  vehicleBlastRadius: 215,
  maxDamage: 980,
  minEdgeDamage: 185,
  ragdollUp: 38,
  ragdollOut: 52,
  vehicleUp: 54,
  vehicleOut: 68,
  vehicleSpin: 11.0,
  electroDamageMultiplier: 0.52,
  electroMaxDamage: 460,
  distances: Object.freeze([
    Object.freeze({ id: "self", label: "Под себя (4 метра — смертельно опасно!)", meters: 4 }),
    Object.freeze({ id: "close", label: "Близко (115 метров — край ударной волны)", meters: 115 }),
    Object.freeze({ id: "medium", label: "Средне (215 метров — безопасно)", meters: 215 }),
    Object.freeze({ id: "far", label: "Далеко (320 метров)", meters: 320 }),
  ]),
});

export const LANDMINE_CONFIG = Object.freeze({
  startingCount: 2,
  maxCarry: 6,
  armDelayMs: 800,
  triggerRadius: 4.5,
  blastRadius: 8.5,
  maxDamage: 260,
  minEdgeDamage: 95,
  soundOffsetSec: 1.45, // Instant boom offset in bomb-drop-and-explosion_424c5b6a.mp3
});

export const RESIDENCE_SITE = Object.freeze({
  buildingId: "residence",
  name: "Резиденция электрического Лукашенко",
  x: 115,
  z: -185,
  width: 24,
  depth: 18,
  bunkerY: -14,
  bunkerHalfX: 14,
  bunkerHalfZ: 12,
  hatchLocalX: 0,
  hatchLocalZ: -6.5,
  vaultLocalX: 9.5,
  vaultLocalZ: -8.0,
});

export const CANNON_CONFIG = Object.freeze({
  weaponId: "cannon",
  name: "Смертонос",
  range: 700,
  baseSpeed: 162,
  gravity: 0.06,
  pitchUpRad: 0.0022,
  wakeRadius: 7.5,
  wakeDamage: 125,
  wakeRagdollUp: 16.5,
  wakeRagdollOut: 22.0,
  reloadMs: 3400,
  heavyReloadMs: 4600,
  minFireIntervalMs: 1150,
  chargeMaxMs: 3500,
  chargeMinRatio: 0.15,
  salvoCount: 5,
  salvoIntervalMs: 145,
  salvoSpreadDeg: Object.freeze([-4.8, -2.4, 0, 2.4, 4.8]),
  shrapnelCount: 7,
  shrapnelSpreadDeg: Object.freeze([-18, -12, -6, 0, 6, 12, 18]),
  shrapnelRange: 210,
  standingRecoilPush: 5.2,
  standingHeavyRecoilVy: 8.2,
  standingHeavyRecoilPush: 14.5,
  coverDamageMultiplier: 0.38,
  coverKnockbackMultiplier: 0.35,
  crouchKnockbackMultiplier: 0.72,
  electroDamageMultiplier: 0.52,
  electroMaxShockwaveDamage: 340,
  juggernautDamageMultiplier: 0.60,
  juggernautMaxShockwaveDamage: 380,
  heavyTurnMultiplier: 0.55,
  heavyStandSpeed: 1.85,
  heavyCrouchSpeed: 1.25,
});

export const CANNON_MODES = Object.freeze([
  Object.freeze({
    id: "standard",
    label: "Стандартный — тяжёлое ударное ядро (700 м, взрывная волна 64 м, швыряет машины и врагов)",
    shortLabel: "Ударное ядро",
    range: 700,
    speed: 162,
    gravity: 0.06,
    wakeRadius: 8.5,
    blastRadius: 64,
    lethalCoreRadius: 24,
    maxDamage: 460,
    minEdgeDamage: 155,
    ragdollUp: 34,
    ragdollOut: 44,
    vehicleUp: 46,
    vehicleOut: 60,
    vehicleSpin: 9.5,
    piercing: false,
    ammoCost: 1,
  }),
  Object.freeze({
    id: "shrapnel",
    label: "Картечь-веер (7 плотных ядер веером, каждый разрыв 28 м по толпе и технике)",
    shortLabel: "Картечь-веер",
    range: 210,
    speed: 148,
    gravity: 0.16,
    wakeRadius: 5.0,
    blastRadius: 28,
    lethalCoreRadius: 10,
    maxDamage: 215,
    minEdgeDamage: 90,
    ragdollUp: 24,
    ragdollOut: 32,
    vehicleUp: 32,
    vehicleOut: 42,
    vehicleSpin: 7.0,
    piercing: false,
    ammoCost: 1,
  }),
  Object.freeze({
    id: "piercing",
    label: "Сквозной бронебой (700 м, рвёт стены, укрытия и машины насквозь, финальный разрыв 46 м)",
    shortLabel: "Сквозной бронебой",
    range: 700,
    speed: 235,
    gravity: 0.035,
    wakeRadius: 9.0,
    blastRadius: 46,
    lethalCoreRadius: 16,
    maxDamage: 520,
    minEdgeDamage: 185,
    ragdollUp: 30,
    ragdollOut: 46,
    vehicleUp: 44,
    vehicleOut: 58,
    vehicleSpin: 9.5,
    piercing: true,
    ammoCost: 1,
  }),
  Object.freeze({
    id: "charged",
    label: "Зарядный (удерживай огонь для зарядки — до 105 м разрушительного разрыва на 700 м)",
    shortLabel: "Зарядный",
    range: 700,
    speed: 150,
    gravity: 0.06,
    wakeRadius: 7.5,
    blastRadius: 48,
    lethalCoreRadius: 16,
    maxDamage: 320,
    minEdgeDamage: 120,
    ragdollUp: 24,
    ragdollOut: 30,
    vehicleUp: 32,
    vehicleOut: 42,
    vehicleSpin: 6.5,
    piercing: false,
    ammoCost: 1,
  }),
  Object.freeze({
    id: "salvo",
    label: "Залповый (5 тяжёлых ядер подряд на 700 м, каждое накрывает 50 м)",
    shortLabel: "Залповый",
    range: 700,
    speed: 160,
    gravity: 0.065,
    wakeRadius: 7.5,
    blastRadius: 50,
    lethalCoreRadius: 18,
    maxDamage: 340,
    minEdgeDamage: 130,
    ragdollUp: 28,
    ragdollOut: 38,
    vehicleUp: 40,
    vehicleOut: 54,
    vehicleSpin: 8.5,
    piercing: false,
    ammoCost: 5,
  }),
]);

export function electroModeById(modeId) {
  return ELECTRO_RIFLE_MODES.find((mode) => mode.id === modeId) ?? ELECTRO_RIFLE_MODES[0];
}

export function nextElectroMode(currentModeId) {
  const idx = ELECTRO_RIFLE_MODES.findIndex((mode) => mode.id === currentModeId);
  return ELECTRO_RIFLE_MODES[(idx + 1) % ELECTRO_RIFLE_MODES.length];
}

export function cannonModeById(modeId) {
  return CANNON_MODES.find((mode) => mode.id === modeId) ?? CANNON_MODES[0];
}

export function nextCannonMode(currentModeId) {
  const idx = CANNON_MODES.findIndex((mode) => mode.id === currentModeId);
  return CANNON_MODES[(idx + 1) % CANNON_MODES.length];
}

export function computeCannonChargeProfile(chargeRatio = 0) {
  const ratio = clamp(chargeRatio, 0, 1);
  return {
    chargeRatio: Number(ratio.toFixed(3)),
    speed: Math.round(148 + 92 * ratio),
    gravity: Number((0.065 - 0.035 * ratio).toFixed(3)),
    wakeRadius: Number((7.0 + 5.5 * ratio).toFixed(1)),
    blastRadius: Number((42 + 63 * ratio).toFixed(1)),
    lethalCoreRadius: Number((14.0 + 26.0 * ratio).toFixed(1)),
    maxDamage: Math.round(320 + 520 * ratio),
    minEdgeDamage: Math.round(120 + 180 * ratio),
    ragdollUp: Number((24 + 30 * ratio).toFixed(1)),
    ragdollOut: Number((30 + 38 * ratio).toFixed(1)),
    vehicleUp: Number((32 + 40 * ratio).toFixed(1)),
    vehicleOut: Number((42 + 48 * ratio).toFixed(1)),
    vehicleSpin: Number((6.5 + 6.0 * ratio).toFixed(1)),
    heavyRecoil: ratio >= 0.65,
  };
}

export function evaluateCannonImpact({
  distance = 0,
  blastRadius = 24,
  lethalCoreRadius = 7.5,
  maxDamage = 290,
  minEdgeDamage = 95,
  ragdollUp = 21,
  ragdollOut = 24,
  piercing = false,
  targetBlockedByCover = false,
  targetCrouching = false,
  targetElectro = false,
  targetJuggernaut = false,
  directHit = false,
} = {}) {
  const dist = Math.max(0, finite(distance, 0));
  const radius = Math.max(1, finite(blastRadius, 24));
  if (!directHit && dist > radius) {
    return {
      hit: false,
      damage: 0,
      ragdollUp: 0,
      ragdollOut: 0,
      mitigatedByCover: false,
    };
  }
  let rawDamage = maxDamage;
  if (!directHit && dist > lethalCoreRadius) {
    const span = Math.max(0.1, radius - lethalCoreRadius);
    const t = clamp((dist - lethalCoreRadius) / span, 0, 1);
    rawDamage = Math.round(maxDamage - (maxDamage - minEdgeDamage) * t);
  }
  const falloff = directHit ? 1 : (1 - clamp(dist / radius, 0, 1) * 0.58);
  let damage = Math.max(1, rawDamage);
  let up = ragdollUp * falloff;
  let out = ragdollOut * falloff;
  const mitigatedByCover = Boolean(targetBlockedByCover && !piercing && !directHit);

  if (mitigatedByCover) {
    damage = Math.max(1, Math.round(damage * CANNON_CONFIG.coverDamageMultiplier));
    up *= CANNON_CONFIG.coverKnockbackMultiplier;
    out *= CANNON_CONFIG.coverKnockbackMultiplier;
  } else if (targetCrouching && !directHit) {
    up *= CANNON_CONFIG.crouchKnockbackMultiplier;
    out *= CANNON_CONFIG.crouchKnockbackMultiplier;
  }

  if (!directHit && targetElectro) {
    damage = Math.min(
      CANNON_CONFIG.electroMaxShockwaveDamage,
      Math.max(1, Math.round(damage * CANNON_CONFIG.electroDamageMultiplier)),
    );
  } else if (!directHit && targetJuggernaut) {
    damage = Math.min(
      CANNON_CONFIG.juggernautMaxShockwaveDamage,
      Math.max(1, Math.round(damage * CANNON_CONFIG.juggernautDamageMultiplier)),
    );
  }

  return {
    hit: true,
    damage: Math.max(1, Math.round(damage)),
    ragdollUp: Number(up.toFixed(2)),
    ragdollOut: Number(out.toFixed(2)),
    mitigatedByCover,
  };
}

export function isInsideResidenceNoGuidanceZone(position = {}) {
  const x = finite(position?.x);
  const y = finite(position?.y);
  const z = finite(position?.z);
  // Deep underground bunker & labyrinth (y <= -6)
  if (
    y <= -6
    && Math.abs(x - RESIDENCE_SITE.x) <= RESIDENCE_SITE.bunkerHalfX + 4
    && Math.abs(z - RESIDENCE_SITE.z) <= RESIDENCE_SITE.bunkerHalfZ + 4
  ) {
    return true;
  }
  // Inside the Residence interior & labyrinth (auto-guidance works up to the entrance outside, disabled inside)
  if (
    Math.abs(y) <= 2.5
    && Math.abs(x - RESIDENCE_SITE.x) <= RESIDENCE_SITE.width / 2 - 0.5
    && z >= RESIDENCE_SITE.z - RESIDENCE_SITE.depth / 2
    && z <= RESIDENCE_SITE.z + RESIDENCE_SITE.depth / 2 - 1.5
  ) {
    return true;
  }
  return false;
}

export function computeMiniNukeTarget(shooterTransform = {}, distanceMeters = 215, mapHalfSize = 1000, groundY = null) {
  const dist = clamp(distanceMeters, 2, 420);
  const angle = finite(shooterTransform?.angle);
  const limit = Math.max(40, finite(mapHalfSize, 1000) - 10);
  const x = clamp(finite(shooterTransform?.x) + Math.sin(angle) * dist, -limit, limit);
  const z = clamp(finite(shooterTransform?.z) - Math.cos(angle) * dist, -limit, limit);
  const shooterY = finite(shooterTransform?.y, 0);
  // Outdoors, ground zero always detonates on the ground surface rather than floating in the sky if launched from height;
  // inside the deep underground bunker (y <= -6), preserve bunker elevation.
  const targetY = shooterY <= -6
    ? shooterY
    : (groundY != null && Number.isFinite(Number(groundY)) ? Number(groundY) : 0);
  return {
    x: Number(x.toFixed(2)),
    y: Number(targetY.toFixed(2)),
    z: Number(z.toFixed(2)),
    distanceMeters: dist,
  };
}

export function evaluateBlastDamage(origin = {}, target = {}, {
  blastRadius = MINI_NUKE_CONFIG.blastRadius,
  lethalCoreRadius = MINI_NUKE_CONFIG.lethalCoreRadius,
  maxDamage = MINI_NUKE_CONFIG.maxDamage,
  minEdgeDamage = MINI_NUKE_CONFIG.minEdgeDamage,
} = {}) {
  const dx = finite(target?.x) - finite(origin?.x);
  const dy = (finite(target?.y) - finite(origin?.y)) * 0.65;
  const dz = finite(target?.z) - finite(origin?.z);
  const dist = Math.hypot(dx, dy, dz);
  if (dist > blastRadius) {
    return { hit: false, distance: dist, damage: 0, knockback: 0 };
  }
  let damage = maxDamage;
  if (dist > lethalCoreRadius) {
    const span = Math.max(0.1, blastRadius - lethalCoreRadius);
    const t = clamp((dist - lethalCoreRadius) / span, 0, 1);
    damage = Math.round(maxDamage - (maxDamage - minEdgeDamage) * t);
  }
  const knockback = Number((1 - clamp(dist / Math.max(1, blastRadius), 0, 1) * 0.65).toFixed(3));
  return {
    hit: true,
    distance: Number(dist.toFixed(2)),
    damage: Math.max(1, damage),
    knockback,
  };
}

const PUZZLE_SWITCHES = Object.freeze([
  Object.freeze({ id: 1, name: "Контакт 1 (низкий сигнал)", label: "Контакт 1 (низкий сигнал)" }),
  Object.freeze({ id: 2, name: "Контакт 2 (средний сигнал)", label: "Контакт 2 (средний сигнал)" }),
  Object.freeze({ id: 3, name: "Контакт 3 (высокий сигнал)", label: "Контакт 3 (высокий сигнал)" }),
  Object.freeze({ id: 4, name: "Контакт 4 (импульс)", label: "Контакт 4 (импульс)" }),
]);

export function createAdaptiveBunkerPuzzle(seed = 1, attempts = 0) {
  const safeSeed = Math.abs(Math.floor(finite(seed, 1))) || 1;
  // Adaptive difficulty: starts with 3 stages (lengths 2, 3, 3); after >=2 failed attempts eases to 3 stages of length 2 with clear hints
  const relaxed = attempts >= 2;
  const stageLengths = relaxed ? [2, 2, 2] : [2, 3, 3];
  const stages = stageLengths.map((len, stageIdx) => {
    const code = [];
    for (let i = 0; i < len; i += 1) {
      const val = ((safeSeed * (stageIdx + 3) + i * 7 + stageIdx * 5) % 4) + 1;
      code.push(val);
    }
    return {
      stage: stageIdx + 1,
      code,
      hint: code.map((n) => `Контакт ${n}`).join(", затем "),
    };
  });
  return {
    stages,
    currentStage: 0,
    entered: [],
    attempts,
    relaxed,
    solved: false,
    switches: PUZZLE_SWITCHES,
  };
}

export function submitPuzzleStep(puzzle, switchId) {
  if (!puzzle || puzzle.solved) {
    const msg = "Замок уже открыт.";
    return { ok: true, solved: true, stageCleared: false, reset: false, relaxed: Boolean(puzzle?.relaxed), text: msg, speech: msg, nextHint: "" };
  }
  const choice = Math.floor(finite(switchId));
  const stage = puzzle.stages[puzzle.currentStage];
  if (!stage || choice < 1 || choice > 4) {
    const msg = "Неверный контакт.";
    return { ok: false, solved: false, stageCleared: false, reset: false, relaxed: Boolean(puzzle.relaxed), text: msg, speech: msg, nextHint: stage?.hint ?? "" };
  }
  const expected = stage.code[puzzle.entered.length];
  if (choice !== expected) {
    puzzle.attempts += 1;
    puzzle.entered = [];
    // Adaptive re-calibration if player struggles
    if (puzzle.attempts >= 2 && !puzzle.relaxed) {
      const adapted = createAdaptiveBunkerPuzzle(puzzle.attempts + 11, puzzle.attempts);
      puzzle.stages = adapted.stages;
      puzzle.currentStage = 0;
      puzzle.relaxed = true;
      const msg = `Сбой замка! Адаптивный режим включён — код упрощён. Этап 1: ${puzzle.stages[0].hint}.`;
      return {
        ok: false,
        solved: false,
        stageCleared: false,
        reset: true,
        relaxed: true,
        nextHint: puzzle.stages[0].hint,
        text: msg,
        speech: msg,
      };
    }
    const msg = `Ошибка контакта! Ввод этапа ${stage.stage} сброшен. Подсказка: ${stage.hint}.`;
    return {
      ok: false,
      solved: false,
      stageCleared: false,
      reset: true,
      relaxed: Boolean(puzzle.relaxed),
      nextHint: stage.hint,
      text: msg,
      speech: msg,
    };
  }

  puzzle.entered.push(choice);
  if (puzzle.entered.length < stage.code.length) {
    const msg = `Контакт ${choice} принят (${puzzle.entered.length} из ${stage.code.length}).`;
    return {
      ok: true,
      solved: false,
      stageCleared: false,
      reset: false,
      relaxed: Boolean(puzzle.relaxed),
      nextHint: stage.hint,
      text: msg,
      speech: msg,
    };
  }

  puzzle.currentStage += 1;
  puzzle.entered = [];
  if (puzzle.currentStage >= puzzle.stages.length) {
    puzzle.solved = true;
    const msg = "Замок бункера взломан! Хранилище «Электрический Лукашенко» открыто!";
    return {
      ok: true,
      solved: true,
      stageCleared: true,
      reset: false,
      relaxed: Boolean(puzzle.relaxed),
      nextHint: "",
      text: msg,
      speech: msg,
    };
  }
  const nextStage = puzzle.stages[puzzle.currentStage];
  const msg = `Этап ${stage.stage} пройден! Этап ${nextStage.stage} из ${puzzle.stages.length}. Подсказка: ${nextStage.hint}.`;
  return {
    ok: true,
    solved: false,
    stageCleared: true,
    reset: false,
    relaxed: Boolean(puzzle.relaxed),
    nextHint: nextStage.hint,
    text: msg,
    speech: msg,
  };
}

export function chooseBotShopAction({
  cash = 0,
  deadTeammates = 0,
  mineCount = 0,
  armorReserve = 0,
  fastStimCount = 0,
  hasMarksman = false,
  isElectroLukashenko = false,
  nukeCount = 0,
  allowElectroDrop = true,
  allowMiniNuke = true,
  prices = {},
} = {}) {
  const money = Math.max(0, Math.floor(finite(cash)));
  const buybackCost = finite(prices.buyback, 1000);
  const electroDropCost = finite(prices.electroDrop ?? prices["electro-drop"], 2000);
  const miniNukeCost = finite(prices.miniNuke ?? prices["mini-nuke"], 1500);
  const mineCost = finite(prices.mines, 350);
  const platesCost = finite(prices.armorPlates ?? prices["armor-plates"], 350);
  const fastStimCost = finite(prices.fastStimulant ?? prices["fast-stimulant"], 500);
  const marksmanCost = finite(prices.marksman, 700);

  if (deadTeammates > 0 && money >= buybackCost) {
    return { itemId: "buyback", cost: buybackCost };
  }
  if (allowElectroDrop && !isElectroLukashenko && money >= electroDropCost) {
    return { itemId: "electro-drop", cost: electroDropCost };
  }
  if (allowMiniNuke && nukeCount < 1 && money >= miniNukeCost) {
    return { itemId: "mini-nuke", cost: miniNukeCost };
  }
  if (mineCount < 2 && money >= mineCost) {
    return { itemId: "mines", cost: mineCost };
  }
  if (armorReserve < 3 && money >= platesCost) {
    return { itemId: "armor-plates", cost: platesCost };
  }
  if (fastStimCount < 2 && money >= fastStimCost) {
    return { itemId: "fast-stimulant", cost: fastStimCost };
  }
  if (!hasMarksman && !isElectroLukashenko && money >= marksmanCost) {
    return { itemId: "marksman", cost: marksmanCost };
  }
  return null;
}
