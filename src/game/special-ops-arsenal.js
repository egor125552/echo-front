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
  blastRadius: 86,
  lethalCoreRadius: 28,
  maxDamage: 620,
  minEdgeDamage: 120,
  electroDamageMultiplier: 0.3,
  electroMaxDamage: 220,
  distances: Object.freeze([
    Object.freeze({ id: "self", label: "Под себя (4 метра — опасно!)", meters: 4 }),
    Object.freeze({ id: "close", label: "Близко (60 метров — край взрыва)", meters: 60 }),
    Object.freeze({ id: "medium", label: "Средне (105 метров — безопасно)", meters: 105 }),
    Object.freeze({ id: "far", label: "Далеко (160 метров)", meters: 160 }),
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

export function electroModeById(modeId) {
  return ELECTRO_RIFLE_MODES.find((mode) => mode.id === modeId) ?? ELECTRO_RIFLE_MODES[0];
}

export function nextElectroMode(currentModeId) {
  const idx = ELECTRO_RIFLE_MODES.findIndex((mode) => mode.id === currentModeId);
  return ELECTRO_RIFLE_MODES[(idx + 1) % ELECTRO_RIFLE_MODES.length];
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

export function computeMiniNukeTarget(shooterTransform = {}, distanceMeters = 105, mapHalfSize = 1000) {
  const dist = clamp(distanceMeters, 2, 220);
  const angle = finite(shooterTransform?.angle);
  const limit = Math.max(40, finite(mapHalfSize, 1000) - 10);
  const x = clamp(finite(shooterTransform?.x) + Math.sin(angle) * dist, -limit, limit);
  const z = clamp(finite(shooterTransform?.z) - Math.cos(angle) * dist, -limit, limit);
  return {
    x: Number(x.toFixed(2)),
    y: finite(shooterTransform?.y, 0),
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
