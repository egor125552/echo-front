import { GoogleGenAI } from "@google/genai";

export const AI_DECISION_MODEL = "gemini-decision-1";
export const AI_DECISION_MAX_REQUESTS = 10_000;
export const AI_DECISION_MAX_INPUT_TOKENS = 30_000;
export const AI_DECISION_CADENCE_MS = 2_200;
export const AI_DECISION_MAX_UNITS_PER_BATCH = 40;
export const AI_DECISION_NEAREST_ENEMY_LIMIT = AI_DECISION_MAX_UNITS_PER_BATCH;
export const AI_DECISION_COMMAND_TTL_MS = 7_500;

export const UNIT_TARGET_CRITERIA = Object.freeze({
  closest: "Engage the closest standing hostile opponent right now to handle the immediate threat.",
  priority_threat: "If enemy: prioritize the human player/squad leader. If ally/squadmate: prioritize the opponent most directly threatening or aiming at the human player.",
  weakest: "Focus-fire the standing hostile opponent with the lowest combined health and armor.",
  attacker: "Turn toward and retaliate against the opponent currently damaging this unit or its teammates.",
});

export const UNIT_MOVE_CRITERIA = Object.freeze({
  advance_direct: "Push aggressively toward the active hostile target or combat contact sector.",
  flank_left: "Move forward-left in a tactical flank arc to break opponent aim and strike from the left.",
  flank_right: "Move forward-right in a tactical flank arc to break opponent aim and strike from the right.",
  hold_cover: "Hold strong cover or a building doorway angle with controlled peeks instead of rushing blindly.",
  kite_back: "Backpedal while maintaining aim to keep optimal rifle or sniper standoff distance.",
  retreat_heal: "Disengage behind cover to reload, apply armor plates, or use a healing stimulant.",
  regroup_squad: "Rally toward the human player or closest standing teammate to escort, cover, or assist a downed ally.",
  move_zone: "Rotate cleanly inside the safe zone or toward the next active sector.",
});

export const UNIT_PACE_CRITERIA = Object.freeze({
  sprint_push: "Sprint rapidly to close ground, execute a wide flank, rally to squadmates, or escape the storm.",
  tactical_strafe: "Combat walk with steady lateral dodging to stay evasive while trading fire.",
  steady_aim: "Slow and stabilize stance for crisp rifle, marksman, or armor-piercing sniper accuracy.",
});

export const UNIT_FIRE_CRITERIA = Object.freeze({
  hold_fire: "Do not fire right now (no clean line of sight, reloading, plating armor, healing, or stealth reposition).",
  single_tap: "Fire deliberate spaced precision single shots (best for sniper, marksman, armor breaks, or long range).",
  controlled_burst: "Fire tight disciplined short bursts with brief pauses for accuracy.",
  suppress_auto: "Fire sustained automatic bursts to overwhelm exposed close-to-mid targets.",
});

// Backward-compatible aliases
export const ENEMY_TARGET_CRITERIA = UNIT_TARGET_CRITERIA;
export const ENEMY_MOVE_CRITERIA = UNIT_MOVE_CRITERIA;
export const ENEMY_PACE_CRITERIA = UNIT_PACE_CRITERIA;
export const ENEMY_FIRE_CRITERIA = UNIT_FIRE_CRITERIA;

export class DecisionsApiError extends Error {
  constructor(message, { status = 502, code = "DECISIONS_API_ERROR", details = null } = {}) {
    super(String(message || "Gemini Decisions API error"));
    this.name = "DecisionsApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function resolveGeminiApiKey(env = null) {
  const fromEnv = typeof env?.GEMINI_API_KEY === "string" ? env.GEMINI_API_KEY.trim() : "";
  if (fromEnv) return fromEnv;
  const fromProcess = typeof process !== "undefined" && typeof process.env?.GEMINI_API_KEY === "string"
    ? process.env.GEMINI_API_KEY.trim()
    : "";
  return fromProcess || "";
}

export function createGeminiDecisionsClient({ apiKey, env = null } = {}) {
  const key = (typeof apiKey === "string" && apiKey.trim()) || resolveGeminiApiKey(env);
  if (!key) {
    throw new DecisionsApiError(
      "GEMINI_API_KEY is not configured on the server. Select an API key in Settings > Secrets.",
      { status: 500, code: "MISSING_API_KEY" },
    );
  }
  return new GoogleGenAI({
    apiKey: key,
    apiVersion: "v1beta",
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function round1(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}

function utf8ByteLength(str) {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(String(str ?? "")).length;
  }
  return String(str ?? "").length;
}

// Conservative ~3.3 bytes/token estimate covering JSON punctuation + Cyrillic/ASCII text
// so requests never silently overshoot the 30,000-token per-request budget.
export function estimateTokens(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return Math.max(1, Math.ceil(utf8ByteLength(text) / 3.3));
}

export function estimateDecisionRequestTokens(request) {
  if (!request || typeof request !== "object") return 0;
  let total = 32;
  for (const block of request.input ?? []) {
    if (block?.type === "text" && typeof block.text === "string") {
      total += estimateTokens(block.text) + 4;
    }
  }
  for (const [key, q] of Object.entries(request.questions ?? {})) {
    total += estimateTokens(key) + estimateTokens(q?.instructions ?? "") + estimateTokens(q?.criteria ?? {}) + 8;
  }
  return total;
}

function compactUnitRecord(unit, idx, { detailLevel = "full" } = {}) {
  const slot = `b${idx}`;
  const role = unit.role === "ally_squad" || unit.role === "ally_team" ? unit.role : "enemy";
  const base = {
    slot,
    id: String(unit.id ?? slot),
    role,
    isAlly: role !== "enemy",
    team: Number(unit.team) || 0,
    name: String(unit.name ?? unit.id ?? slot).slice(0, 32),
    pos: { x: round1(unit.x), y: round1(unit.y), z: round1(unit.z) },
    deg: Math.round(Number(unit.deg) || 0),
    hp: Math.max(0, Math.round(Number(unit.hp) || 0)),
    hpMax: Math.max(1, Math.round(Number(unit.hpMax) || 200)),
    armor: Math.max(0, Math.round(Number(unit.armor) || 0)),
    plates: Math.max(0, Math.round(Number(unit.plates) || 0)),
    stims: Math.max(0, Math.round(Number(unit.stims) || 0)),
    money: Math.max(0, Math.round(Number(unit.money) || 0)),
    weapon: String(unit.weapon ?? "pistol"),
    ammo: Math.max(0, Math.round(Number(unit.ammo) || 0)),
    reserve: Math.max(0, Math.round(Number(unit.reserve) || 0)),
    reloading: Boolean(unit.reloading),
    downed: Boolean(unit.downed),
    underFire: Boolean(unit.underFire),
    attackerId: unit.attackerId ? String(unit.attackerId) : null,
    insideBuilding: unit.insideBuilding ?? null,
    outsideZoneM: round1(unit.outsideZoneMeters ?? 0),
    distToHumanM: unit.distToHuman == null ? null : round1(unit.distToHuman),
    relDegToHuman: unit.relDegToHuman == null ? null : Math.round(Number(unit.relDegToHuman) || 0),
    downedAlliesNearby: Math.max(0, Math.round(Number(unit.downedAlliesNearby) || 0)),
    currentGoal: unit.currentGoal ?? null,
    visibleTargets: (Array.isArray(unit.visibleTargets) ? unit.visibleTargets : [])
      .slice(0, detailLevel === "full" ? 6 : 3)
      .map((t) => ({
        id: String(t.id ?? ""),
        isHuman: Boolean(t.isHuman),
        distM: round1(t.distance),
        hp: Math.max(0, Math.round(Number(t.hp) || 0)),
        armor: Math.max(0, Math.round(Number(t.armor) || 0)),
        downed: Boolean(t.downed),
        weapon: t.weapon ? String(t.weapon) : "pistol",
        relDeg: Math.round(Number(t.relDeg) || 0),
        isAttacker: Boolean(t.isAttacker),
        threateningHuman: Boolean(t.threateningHuman),
      })),
    rememberedThreat: unit.rememberedDist == null
      ? null
      : {
          id: unit.rememberedId ?? null,
          distM: round1(unit.rememberedDist),
          relDeg: unit.rememberedRelDeg == null ? null : Math.round(Number(unit.rememberedRelDeg) || 0),
        },
  };

  if (detailLevel === "full") {
    base.weapons = Array.isArray(unit.weapons) ? unit.weapons : undefined;
    base.inVehicle = unit.inVehicle ?? false;
    base.clearanceAheadM = round1(unit.clearanceAhead ?? 1.5);
    base.clearance8Way = Array.isArray(unit.clearance8Way) ? unit.clearance8Way : undefined;
  } else {
    base.clearanceAheadM = round1(unit.clearanceAhead ?? 1.5);
  }
  return base;
}

function buildQuestionsForUnits(compactUnits) {
  const questions = {};
  for (const unit of compactUnits) {
    const { slot, role, name } = unit;
    const roleLabel = role === "ally_squad"
      ? "ALLY squadmate"
      : role === "ally_team"
        ? "ALLY teammate"
        : "ENEMY combatant";
    questions[`${slot}_target`] = {
      type: "choice",
      instructions: `For ${roleLabel} ${slot} ("${name}") in units, which hostile target rule should ${slot} prioritize right now?`,
      criteria: UNIT_TARGET_CRITERIA,
    };
    questions[`${slot}_move`] = {
      type: "choice",
      instructions: `For ${roleLabel} ${slot} ("${name}") in units, considering cover clearances, buildings, zone safety, health/armor/stims, downed allies, squad cohesion, and recentEvents, what tactical movement should ${slot} take?`,
      criteria: UNIT_MOVE_CRITERIA,
    };
    questions[`${slot}_pace`] = {
      type: "choice",
      instructions: `For ${roleLabel} ${slot} ("${name}") in units, what movement pace and evasion tempo fits the situation?`,
      criteria: UNIT_PACE_CRITERIA,
    };
    questions[`${slot}_fire`] = {
      type: "choice",
      instructions: `For ${roleLabel} ${slot} ("${name}") in units, considering weapon type, line of sight, armor, ammo, and allies near line of fire, how should ${slot} fire right now?`,
      criteria: UNIT_FIRE_CRITERIA,
    };
  }
  return questions;
}

export function buildNearestEnemiesDecisionPayload(context = {}, options = {}) {
  const maxInputTokens = Math.max(
    4_000,
    Math.min(AI_DECISION_MAX_INPUT_TOKENS, Number(options.maxInputTokens) || AI_DECISION_MAX_INPUT_TOKENS),
  );
  const rawUnits = Array.isArray(context.units) && context.units.length
    ? context.units
    : (Array.isArray(context.enemies) ? context.enemies : []);
  if (!rawUnits.length) {
    return null;
  }

  let selectedRawUnits = rawUnits.slice(0, AI_DECISION_MAX_UNITS_PER_BATCH);
  let detailLevel = "full";
  let compactUnits = [];
  let questions = {};
  let coreBlock = "";
  let tokensUsed = 0;

  // Shrink cleanly only if raw unit count + question definitions approach 30,000 tokens.
  while (selectedRawUnits.length >= 1) {
    compactUnits = selectedRawUnits.map((u, idx) => compactUnitRecord(u, idx, { detailLevel }));
    questions = buildQuestionsForUnits(compactUnits);

    const coreState = {
      mode: context.mode === "battle-royale" ? "battle-royale" : "tdm",
      simTimeMs: Math.round(Number(context.simTimeMs) || 0),
      zone: context.zone ?? (context.zoneRadius == null ? null : { radiusM: round1(context.zoneRadius) }),
      matchStats: context.matchStats ?? null,
      humans: Array.isArray(context.humans) ? context.humans : [],
      units: compactUnits,
    };
    coreBlock = `Core battlefield state (allied squadmates + active opponents):\n${JSON.stringify(coreState)}`;

    const baseCost = estimateDecisionRequestTokens({
      input: [{ type: "text", text: coreBlock }],
      questions,
    });
    if (baseCost <= maxInputTokens) {
      tokensUsed = baseCost;
      break;
    }
    if (detailLevel === "full") {
      detailLevel = "compact";
      continue;
    }
    if (selectedRawUnits.length > 1) {
      selectedRawUnits = selectedRawUnits.slice(0, Math.max(1, Math.floor(selectedRawUnits.length * 0.78)));
      continue;
    }
    tokensUsed = baseCost;
    break;
  }

  const slotMap = new Map();
  const roleMap = new Map();
  compactUnits.forEach((unit, idx) => {
    const raw = selectedRawUnits[idx];
    slotMap.set(unit.slot, raw.id);
    roleMap.set(unit.slot, unit.role);
  });

  const inputBlocks = [{ type: "text", text: coreBlock }];
  const budgetSectionsIncluded = ["core"];

  const tryAppendSection = (sectionName, label, data, sliceArrayFallbacks = null) => {
    if (!data) return false;
    const remaining = maxInputTokens - tokensUsed;
    if (remaining <= 96) return false;

    const fullText = `\n${label}:\n${typeof data === "string" ? data : JSON.stringify(data)}`;
    const fullCost = estimateTokens(fullText) + 4;
    if (tokensUsed + fullCost <= maxInputTokens) {
      inputBlocks.push({ type: "text", text: fullText });
      tokensUsed += fullCost;
      budgetSectionsIncluded.push(sectionName);
      return true;
    }

    if (typeof sliceArrayFallbacks === "function") {
      for (const frac of [0.65, 0.4, 0.2]) {
        const trimmed = sliceArrayFallbacks(frac);
        if (!trimmed) continue;
        const partialText = `\n${label} (top slice):\n${typeof trimmed === "string" ? trimmed : JSON.stringify(trimmed)}`;
        const partialCost = estimateTokens(partialText) + 4;
        if (tokensUsed + partialCost <= maxInputTokens) {
          inputBlocks.push({ type: "text", text: partialText });
          tokensUsed += partialCost;
          budgetSectionsIncluded.push(`${sectionName}:trimmed`);
          return true;
        }
      }
    }
    return false;
  };

  // Tier 2: Rolling combat/injury/sound/loot timeline + previous batch performance
  if (context.previousOutcome) {
    tryAppendSection("previousOutcome", "Previous batch execution summary", context.previousOutcome);
  }
  if (Array.isArray(context.recentEvents) && context.recentEvents.length) {
    tryAppendSection(
      "recentEvents",
      "Recent combat, acoustic, injury, loot, and zone timeline",
      context.recentEvents,
      (frac) => context.recentEvents.slice(-Math.max(4, Math.floor(context.recentEvents.length * frac))),
    );
  }

  // Tier 3: World structures, doors, stairs, shops, vehicles, crates
  if (Array.isArray(context.buildings) && context.buildings.length) {
    tryAppendSection(
      "buildings",
      "Map structures, floors, doors, and current occupants",
      context.buildings,
      (frac) => context.buildings.slice(0, Math.max(1, Math.floor(context.buildings.length * frac))),
    );
  }
  if (context.tacticalLogistics) {
    tryAppendSection(
      "logistics",
      "Shops, dead-ally buyback readiness, nearby vehicles, and unopened loot crates",
      context.tacticalLogistics,
      (frac) => ({
        shops: context.tacticalLogistics.shops ?? [],
        deadAllies: context.tacticalLogistics.deadAllies ?? [],
        vehicles: (context.tacticalLogistics.vehicles ?? []).slice(0, Math.max(2, Math.floor((context.tacticalLogistics.vehicles?.length ?? 0) * frac))),
        crates: (context.tacticalLogistics.crates ?? []).slice(0, Math.max(4, Math.floor((context.tacticalLogistics.crates?.length ?? 0) * frac))),
        soundHotspots: (context.tacticalLogistics.soundHotspots ?? []).slice(0, 6),
      }),
    );
  }

  // Tier 4: Spatial tactical map sectors around player & combat hotspots
  if (Array.isArray(context.tacticalSectors) && context.tacticalSectors.length) {
    tryAppendSection(
      "tacticalSectors",
      "Local spatial tactical grids (#=building, D=door, P=human, A=ally, E=enemy, +=downed, C=crate, V=vehicle, S=shop)",
      context.tacticalSectors,
      (frac) => context.tacticalSectors.slice(0, Math.max(1, Math.floor(context.tacticalSectors.length * frac))),
    );
  }

  const request = {
    model: AI_DECISION_MODEL,
    input: inputBlocks,
    questions,
  };
  const estimatedInputTokens = estimateDecisionRequestTokens(request);

  return {
    slotMap,
    roleMap,
    compactUnits,
    compactEnemies: compactUnits.filter((u) => u.role === "enemy"),
    estimatedInputTokens,
    maxInputTokens,
    budgetSectionsIncluded,
    request,
  };
}

export const buildBattlefieldDecisionPayload = buildNearestEnemiesDecisionPayload;

function readChoice(answer, fallbackMap, aliasMap = null) {
  if (!answer || answer.type !== "choice" || typeof answer.choice !== "string") return null;
  const normalized = aliasMap?.[answer.choice] ?? answer.choice;
  if (!(normalized in fallbackMap)) return null;
  return {
    choice: normalized,
    confidence: Number(answer.confidence) || 0,
  };
}

export async function requestNearestEnemiesDecisions(context, {
  env = null,
  apiKey = null,
  clientFactory = createGeminiDecisionsClient,
  reserveBudget = null,
  maxInputTokens = AI_DECISION_MAX_INPUT_TOKENS,
} = {}) {
  const built = buildNearestEnemiesDecisionPayload(context, { maxInputTokens });
  if (!built) {
    return {
      skipped: true,
      reason: "no-active-units",
      commands: {},
      summary: [],
      estimatedInputTokens: 0,
      maxInputTokens,
    };
  }

  // Verify key availability BEFORE consuming a budget slot so missing keys fail cleanly
  // without burning the 10,000 request allowance.
  const resolvedKey = (typeof apiKey === "string" && apiKey.trim()) || resolveGeminiApiKey(env);
  if (!resolvedKey && clientFactory === createGeminiDecisionsClient) {
    throw new DecisionsApiError(
      "GEMINI_API_KEY не настроен на сервере. Добавьте ключ в Settings > Secrets.",
      { status: 500, code: "MISSING_API_KEY" },
    );
  }

  let budgetState = null;
  if (typeof reserveBudget === "function") {
    budgetState = await reserveBudget();
    if (!budgetState?.allowed) {
      throw new DecisionsApiError(
        `Достигнут лимит ${AI_DECISION_MAX_REQUESTS.toLocaleString("ru-RU")} запросов к ИИ ботов.`,
        {
          status: 429,
          code: "BUDGET_EXHAUSTED",
          details: budgetState,
        },
      );
    }
  }

  const startedAt = Date.now();
  let result;
  try {
    const client = clientFactory({ apiKey: resolvedKey, env });
    result = await client.decisions.create(built.request);
  } catch (error) {
    if (error instanceof DecisionsApiError) throw error;
    const status = Number(error?.status ?? error?.httpStatus ?? 502) || 502;
    const rawMessage = String(error?.message ?? error ?? "Gemini Decisions request failed");
    let code = "DECISIONS_API_ERROR";
    if (status === 403 || rawMessage.includes("PERMISSION_DENIED")) code = "PERMISSION_DENIED";
    else if (status === 400 || rawMessage.includes("API_KEY_INVALID")) code = "BAD_REQUEST";
    else if (status === 404 || rawMessage.includes("NOT_FOUND")) code = "MODEL_NOT_FOUND";
    else if (status === 429 || rawMessage.includes("RESOURCE_EXHAUSTED")) code = "RATE_LIMITED";
    throw new DecisionsApiError(rawMessage, { status, code });
  }

  const latencyMs = Math.max(0, Date.now() - startedAt);
  const answers = result?.answers;
  if (!answers || typeof answers !== "object") {
    const feedback = result?.prompt_feedback ?? result?.promptFeedback ?? null;
    throw new DecisionsApiError(
      "Gemini Decisions API returned no answers for the tactical batch.",
      {
        status: 400,
        code: "NO_ANSWERS",
        details: feedback,
      },
    );
  }

  const apiInputTokens = Number(
    result?.usage?.total_input_tokens
    ?? result?.usageMetadata?.promptTokenCount
    ?? 0,
  ) || null;

  const commands = {};
  const summary = [];
  for (const [slot, entityId] of built.slotMap.entries()) {
    const target = readChoice(
      answers[`${slot}_target`],
      UNIT_TARGET_CRITERIA,
      { human_player: "priority_threat" },
    );
    const move = readChoice(answers[`${slot}_move`], UNIT_MOVE_CRITERIA);
    const pace = readChoice(answers[`${slot}_pace`], UNIT_PACE_CRITERIA);
    const fire = readChoice(answers[`${slot}_fire`], UNIT_FIRE_CRITERIA);
    if (!target || !move || !pace || !fire) continue;

    const avgConfidence = Math.round(
      ((target.confidence + move.confidence + pace.confidence + fire.confidence) / 4) * 100,
    ) / 100;
    const role = built.roleMap.get(slot) ?? "enemy";

    commands[entityId] = {
      entityId,
      slot,
      role,
      isAlly: role !== "enemy",
      targetChoice: target.choice,
      moveChoice: move.choice,
      paceChoice: pace.choice,
      fireChoice: fire.choice,
      confidence: avgConfidence,
      issuedAt: Date.now(),
      expiresAt: Date.now() + AI_DECISION_COMMAND_TTL_MS,
    };

    const meta = built.compactUnits.find((u) => u.slot === slot);
    summary.push({
      entityId,
      name: meta?.name ?? entityId,
      role,
      weapon: meta?.weapon ?? "pistol",
      targetChoice: target.choice,
      moveChoice: move.choice,
      paceChoice: pace.choice,
      fireChoice: fire.choice,
      confidence: avgConfidence,
    });
  }

  return {
    skipped: false,
    latencyMs,
    estimatedInputTokens: built.estimatedInputTokens,
    apiInputTokens,
    maxInputTokens: built.maxInputTokens,
    budgetSectionsIncluded: built.budgetSectionsIncluded,
    usedRequests: budgetState?.usedRequests ?? null,
    maxRequests: budgetState?.maxRequests ?? AI_DECISION_MAX_REQUESTS,
    remainingRequests: budgetState?.remainingRequests ?? null,
    commands,
    summary,
  };
}
