import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AI_DECISION_CADENCE_MS,
  AI_DECISION_COMMAND_TTL_MS,
  AI_DECISION_MAX_INPUT_TOKENS,
  AI_DECISION_MAX_REQUESTS,
  AI_DECISION_MAX_UNITS_PER_BATCH,
  AI_DECISION_MODEL,
  DecisionsApiError,
  buildBattlefieldDecisionPayload,
  createGeminiDecisionsClient,
  requestNearestEnemiesDecisions,
} from "../src/server/gemini-decisions.js";
import { createEchoFrontGame } from "../src/server/game.js";
import { EventBus } from "../public/client/core/event-bus.js";
import {
  formatJournalEventAsText,
  setup as setupPlayJournal,
} from "../public/client/plugins/play-journal.js";

test("gemini-decisions enforces 30k-token budget, economical cadence, continuous TTL, 40-unit cap, and 10k request cap", async () => {
  assert.equal(AI_DECISION_MAX_INPUT_TOKENS, 30_000);
  assert(AI_DECISION_CADENCE_MS >= 2000, `expected economical cadence >= 2000ms, got ${AI_DECISION_CADENCE_MS}`);
  assert(
    AI_DECISION_COMMAND_TTL_MS > AI_DECISION_CADENCE_MS * 2.5,
    `expected continuous command TTL (${AI_DECISION_COMMAND_TTL_MS}ms) well above cadence (${AI_DECISION_CADENCE_MS}ms)`,
  );

  const manyUnits = Array.from({ length: 48 }, (_, idx) => ({
    id: idx < 3 ? `ally-${idx + 1}` : `bot-${idx - 2}`,
    role: idx < 3 ? "ally_squad" : "enemy",
    team: idx < 3 ? 1 : 2,
    name: idx < 3 ? `Напарник ${idx + 1}` : `Враг ${idx - 2}`,
    weapon: idx % 3 === 0 ? "sniper" : "rifle",
    weapons: [
      { id: "pistol", ammo: 12, reserve: 36, active: false },
      { id: idx % 3 === 0 ? "sniper" : "rifle", ammo: 8, reserve: 40, active: true },
    ],
    ammo: 8,
    reserve: 40,
    reloading: false,
    hp: 180,
    hpMax: 200,
    armor: 100,
    plates: 2,
    stims: 1,
    money: 1500,
    distToHuman: 10 + idx * 3,
    underFire: idx === 0 || idx === 3,
    insideBuilding: false,
    outsideZoneMeters: 0,
    clearanceAhead: 4.5,
    clearance8Way: [4.5, 5.2, 6, 6, 3.2, 4, 5, 5.5],
    visibleTargets: [
      {
        id: idx < 3 ? "bot-1" : "human-1",
        isHuman: idx >= 3,
        distance: 14 + idx,
        hp: 190,
        armor: 100,
        relDeg: 6,
        isAttacker: idx === 3,
        threateningHuman: idx >= 3 && idx < 6,
      },
    ],
    rememberedDist: null,
  }));

  const oversizedEvents = Array.from({ length: 120 }, (_, i) => ({
    tMs: 1000 + i * 50,
    type: "combat:damage",
    actor: "bot-1",
    target: "human-1",
    dmg: 28,
    weapon: "rifle",
    note: "Detailed battlefield skirmish log entry for token ceiling stress test",
  }));

  const built = buildBattlefieldDecisionPayload({
    mode: "battle-royale",
    zone: { radiusM: 180, closing: true },
    humans: [{ id: "human-1", name: "Игрок", team: 1, hp: 180, armor: 100, plates: 2, stims: 1, money: 2500 }],
    units: manyUnits,
    previousOutcome: { issued: 12, hitRate: 0.45, note: "Squad pushed north cover" },
    recentEvents: oversizedEvents,
    buildings: Array.from({ length: 12 }, (_, b) => ({
      id: `bldg-${b}`,
      name: `Здание ${b + 1}`,
      center: { x: b * 20, z: -20 },
      doors: [{ x: b * 20, z: -15, open: false }],
      occupants: ["bot-1"],
    })),
    tacticalLogistics: {
      shops: [{ id: "shop-1", x: 12, z: 8, distToHumanM: 18 }],
      deadAllies: [],
      vehicles: [{ id: "veh-1", x: 25, z: -10, occupants: 0 }],
      crates: Array.from({ length: 20 }, (_, c) => ({ id: `crate-${c}`, x: c * 5, z: 10 })),
      soundHotspots: [{ x: 18, z: -12, kind: "gunfire", ageMs: 320 }],
    },
    tacticalSectors: [
      { id: "player_close_2m", center: { x: 0, z: 0 }, stepM: 2, grid: Array.from({ length: 13 }, () => ".............") },
      { id: "sector_wide_6m", center: { x: 0, z: 0 }, stepM: 6, grid: Array.from({ length: 13 }, () => ".............") },
    ],
  });

  assert(built);
  assert.equal(built.request.model, AI_DECISION_MODEL);
  assert(
    built.compactUnits.length > 0 && built.compactUnits.length <= AI_DECISION_MAX_UNITS_PER_BATCH,
    `expected bounded unit count <= ${AI_DECISION_MAX_UNITS_PER_BATCH}, got ${built.compactUnits.length}`,
  );
  assert(
    built.estimatedInputTokens <= AI_DECISION_MAX_INPUT_TOKENS,
    `estimatedInputTokens (${built.estimatedInputTokens}) must stay <= ${AI_DECISION_MAX_INPUT_TOKENS}`,
  );
  assert(built.budgetSectionsIncluded.includes("core"));
  assert(built.compactUnits.some((u) => u.role === "ally_squad"));
  assert(built.compactUnits.some((u) => u.role === "enemy"));
  assert.equal(Object.keys(built.request.questions).length, built.compactUnits.length * 4);
  for (let i = 0; i < built.compactUnits.length; i += 1) {
    assert.equal(built.request.questions[`b${i}_target`].type, "choice");
    assert.equal(built.request.questions[`b${i}_move`].type, "choice");
    assert.equal(built.request.questions[`b${i}_pace`].type, "choice");
    assert.equal(built.request.questions[`b${i}_fire`].type, "choice");
  }

  // Heavy event tail trimming keeps tokens <= tighter cap
  const tightCap = buildBattlefieldDecisionPayload({
    mode: "tdm",
    units: manyUnits.slice(0, 6),
    recentEvents: oversizedEvents,
    buildings: [{ id: "b1", name: "Ангар", doors: [] }],
  }, { maxInputTokens: 5_000 });
  assert(tightCap.estimatedInputTokens <= 5_000, `tight cap overshoot: ${tightCap.estimatedInputTokens}`);

  // Missing API key throws DecisionsApiError cleanly without burning budget
  let budgetReserveCalled = 0;
  await assert.rejects(
    () => requestNearestEnemiesDecisions({
      mode: "tdm",
      units: manyUnits.slice(0, 3),
    }, {
      env: {},
      reserveBudget: async () => {
        budgetReserveCalled += 1;
        return { allowed: true, usedRequests: 1, maxRequests: AI_DECISION_MAX_REQUESTS };
      },
    }),
    (err) => err instanceof DecisionsApiError && err.code === "MISSING_API_KEY",
  );
  assert.equal(budgetReserveCalled, 0);

  // Client configuration enforces apiVersion v1beta & User-Agent aistudio-build
  const client = createGeminiDecisionsClient({ apiKey: "test-key-only" });
  assert.equal(client.apiClient?.clientOptions?.apiVersion ?? client.apiVersion, "v1beta");
  const userAgentHeader = client.apiClient?.clientOptions?.httpOptions?.headers?.["User-Agent"]
    ?? client.apiClient?.getHeaders?.()?.["User-Agent"];
  assert.equal(userAgentHeader, "aistudio-build");

  // Budget exhaustion at 10,000 requests fails cleanly with BUDGET_EXHAUSTED
  const used = AI_DECISION_MAX_REQUESTS;
  await assert.rejects(
    () => requestNearestEnemiesDecisions({
      mode: "tdm",
      units: manyUnits.slice(0, 2),
    }, {
      apiKey: "test-key-only",
      clientFactory: () => ({ decisions: { create: async () => ({ answers: {} }) } }),
      reserveBudget: async () => ({
        allowed: used < AI_DECISION_MAX_REQUESTS,
        usedRequests: used,
        maxRequests: AI_DECISION_MAX_REQUESTS,
        remainingRequests: 0,
      }),
    }),
    (err) => err instanceof DecisionsApiError && err.code === "BUDGET_EXHAUSTED" && err.status === 429,
  );
});

test("TDM both allies and enemies obey batched Gemini Decisions smoothly when switched to AI mode", async () => {
  const game = await createEchoFrontGame({ mode: "tdm" });
  try {
    const aiService = game.host.services.get("ai-enemy-decisions");
    const entities = game.host.services.get("entities");
    const teams = game.host.services.get("teams");
    const movement = game.host.services.get("movement");
    const joined = game.api.connectHuman("human-tdm-1");
    assert.equal(aiService.mode, "standard");

    aiService.setMode("ai");
    assert.equal(game.api.aiEnemiesState().mode, "ai");

    // Place one enemy bot and one allied teammate with clear positions
    const humanTransform = game.host.components.get("human-tdm-1", "Transform");
    const enemyBot = entities.all().find((e) => e.bot && teams.teamOf(e.id) !== joined.team);
    const allyBot = entities.all().find((e) => e.bot && teams.teamOf(e.id) === joined.team);
    assert(enemyBot);
    assert(allyBot);
    movement.teleport(enemyBot.id, {
      x: humanTransform.x,
      y: humanTransform.y ?? 0,
      z: humanTransform.z - 12,
      angle: Math.PI,
    });
    movement.teleport(allyBot.id, {
      x: humanTransform.x + 8,
      y: humanTransform.y ?? 0,
      z: humanTransform.z - 4,
      angle: 0,
    });

    let apiCalls = 0;
    const firedEvents = [];
    game.host.events.on("weapon:fired", ({ entityId }) => {
      if (entityId === enemyBot.id) firedEvents.push(entityId);
    });

    const batch = await aiService.refreshOnce({
      apiKey: "unit-test-key",
      reserveBudget: async () => ({
        allowed: true,
        usedRequests: 1,
        maxRequests: AI_DECISION_MAX_REQUESTS,
        remainingRequests: AI_DECISION_MAX_REQUESTS - 1,
      }),
      clientFactory: () => ({
        decisions: {
          create: async (req) => {
            apiCalls += 1;
            assert.equal(req.model, AI_DECISION_MODEL);
            const answers = {};
            const slotCount = Object.keys(req.questions).length / 4;
            for (let i = 0; i < slotCount; i += 1) {
              const instr = req.questions[`b${i}_move`]?.instructions ?? "";
              const isAlly = instr.includes("ALLY");
              answers[`b${i}_target`] = { type: "choice", choice: "priority_threat", confidence: 0.92 };
              answers[`b${i}_move`] = { type: "choice", choice: isAlly ? "regroup_squad" : "flank_left", confidence: 0.9 };
              answers[`b${i}_pace`] = { type: "choice", choice: isAlly ? "sprint_push" : "tactical_strafe", confidence: 0.88 };
              answers[`b${i}_fire`] = { type: "choice", choice: "hold_fire", confidence: 0.95 };
            }
            return { answers, usage: { total_input_tokens: 4200 } };
          },
        },
      }),
    });

    assert.equal(apiCalls, 1);
    assert.equal(batch.usedRequests, 1);
    assert.equal(batch.apiInputTokens, 4200);
    const enemyCmd = aiService.commandFor(enemyBot.id);
    const allyCmd = aiService.commandFor(allyBot.id);
    assert(enemyCmd);
    assert(allyCmd);
    assert.equal(enemyCmd.moveChoice, "flank_left");
    assert.equal(enemyCmd.fireChoice, "hold_fire");
    assert.equal(allyCmd.role, "ally_team");
    assert.equal(allyCmd.moveChoice, "regroup_squad");

    const desc = aiService.describe();
    assert(desc.activeAllyIds.includes(allyBot.id), "TDM ally bot should be tracked in activeAllyIds");
    assert(desc.activeEnemyIds.includes(enemyBot.id), "TDM enemy bot should be tracked in activeEnemyIds");
    assert.equal(desc.maxInputTokens, 30_000);

    // Step simulation and verify enemy executes hold_fire + flank_left smoothly
    for (let i = 0; i < 6; i += 1) {
      game.api.step(0.05, Date.now() + (i + 1) * 50);
    }
    assert.equal(firedEvents.length, 0, "hold_fire AI directive must keep enemy from firing");
    const inputComp = game.host.components.get(enemyBot.id, "Input");
    assert(inputComp.strafe < 0, `expected flank_left negative strafe, got ${inputComp.strafe}`);
  } finally {
    await game.host.stop();
  }
});

test("Battle Royale controls BOTH human squadmates and nearest enemies via one rich batched AI request", async () => {
  const game = await createEchoFrontGame({ mode: "battle-royale" });
  try {
    const aiService = game.host.services.get("ai-enemy-decisions");
    const entities = game.host.services.get("entities");
    const movement = game.host.services.get("movement");
    const br = game.host.services.get("battle-royale");
    const joined = game.api.connectHuman("human-br-1", Date.now());
    const startAt = Date.now() + 2000;
    br.arm(startAt);
    aiService.setMode("ai", startAt);

    // Land human, squadmate, and nearby enemy cleanly
    const humanParachute = game.host.components.get("human-br-1", "Parachute");
    if (humanParachute) Object.assign(humanParachute, { phase: "landed", airborne: false });
    movement.teleport("human-br-1", { x: -42, y: 0, z: -42, angle: Math.PI });
    game.host.events.emit("parachute:landed", { entityId: "human-br-1" });

    assert(joined.squadmates.length >= 1, "BR should spawn human squadmates");
    const squadMateId = joined.squadmates[0];
    joined.squadmates.forEach((mateId, idx) => {
      const mateParachute = game.host.components.get(mateId, "Parachute");
      if (mateParachute) Object.assign(mateParachute, { phase: "landed", airborne: false });
      movement.teleport(mateId, { x: -46 - idx * 2, y: 0, z: -44, angle: 0 });
      game.host.events.emit("parachute:landed", { entityId: mateId });
    });

    const enemyBots = entities.all().filter((e) => e.bot && !e.humanSquad);
    assert(enemyBots.length >= 2);
    const nearbyEnemy = enemyBots[0];
    const enemyParachute = game.host.components.get(nearbyEnemy.id, "Parachute");
    if (enemyParachute) Object.assign(enemyParachute, { phase: "landed", airborne: false });
    movement.teleport(nearbyEnemy.id, { x: -42, y: 0, z: -30, angle: 0 });
    const botState = game.host.components.get(nearbyEnemy.id, "Bot");
    botState.strafeDirection = -1;
    botState.tacticUntil = startAt + 60_000;

    const mateBotState = game.host.components.get(squadMateId, "Bot");
    mateBotState.strafeDirection = -1;
    mateBotState.tacticUntil = startAt + 60_000;

    game.api.step(0.05, startAt + 20);
    const ctx = aiService.collectNearestEnemiesContext(startAt + 50);
    assert(ctx);
    assert(ctx.units.length >= joined.squadmates.length + 1 && ctx.units.length <= AI_DECISION_MAX_UNITS_PER_BATCH);

    // Human squadmates MUST be included alongside enemies and tagged ally_squad
    for (const mateId of joined.squadmates) {
      const unit = ctx.units.find((u) => u.id === mateId);
      assert(unit, `human squadmate ${mateId} must be included in batched AI context`);
      assert.equal(unit.role, "ally_squad");
    }
    const enemyUnit = ctx.units.find((u) => u.id === nearbyEnemy.id);
    assert(enemyUnit && enemyUnit.role === "enemy");
    assert(Array.isArray(enemyUnit.clearance8Way) && enemyUnit.clearance8Way.length === 8);
    assert(Array.isArray(ctx.buildings));
    assert(ctx.tacticalLogistics);
    assert(Array.isArray(ctx.tacticalSectors) && ctx.tacticalSectors.length >= 1);

    const mateFiredOnHuman = [];
    game.host.events.on("combat:damage", ({ attackerId, targetId }) => {
      if (attackerId === squadMateId && (targetId === "human-br-1" || joined.squadmates.includes(targetId))) {
        mateFiredOnHuman.push(targetId);
      }
    });

    const result = await aiService.refreshOnce({
      apiKey: "unit-test-key",
      now: startAt + 60,
      reserveBudget: async () => ({
        allowed: true,
        usedRequests: 2,
        maxRequests: AI_DECISION_MAX_REQUESTS,
        remainingRequests: AI_DECISION_MAX_REQUESTS - 2,
      }),
      clientFactory: () => ({
        decisions: {
          create: async (req) => {
            const answers = {};
            const slotCount = Object.keys(req.questions).length / 4;
            for (let i = 0; i < slotCount; i += 1) {
              answers[`b${i}_target`] = { type: "choice", choice: "priority_threat", confidence: 0.9 };
              answers[`b${i}_move`] = { type: "choice", choice: "flank_right", confidence: 0.9 };
              answers[`b${i}_pace`] = { type: "choice", choice: "tactical_strafe", confidence: 0.9 };
              answers[`b${i}_fire`] = { type: "choice", choice: "controlled_burst", confidence: 0.9 };
            }
            return { answers };
          },
        },
      }),
    });

    assert.equal(result.skipped, false);
    assert(aiService.commandFor(squadMateId), "squadmate should receive an active AI command");
    assert(aiService.commandFor(nearbyEnemy.id), "enemy should receive an active AI command");

    botState.nextThinkAt = 0;
    mateBotState.nextThinkAt = 0;
    game.api.step(0.05, startAt + 120);
    assert.equal(botState.strafeDirection, 1, "BR enemy bot should apply flank_right strafeDirection=1");
    assert.equal(mateBotState.strafeDirection, 1, "BR squadmate bot should apply flank_right strafeDirection=1");
    assert.equal(mateFiredOnHuman.length, 0, "ally squadmate with priority_threat must NEVER harm human or allies");
  } finally {
    await game.host.stop();
  }
});

test("Play journal renders readable Russian text for allies & enemies with 30k token info and exports .txt", async () => {
  const originals = {
    document: globalThis.document,
    localStorage: globalThis.localStorage,
    setInterval: globalThis.setInterval,
    createObjectURL: URL.createObjectURL,
    revokeObjectURL: URL.revokeObjectURL,
  };
  let downloadedBlob = null;
  let downloadedName = "";
  const elements = new Map([
    ["#journal-enabled", { checked: true, addEventListener() {} }],
    ["#journal-format", { value: "text" }],
    ["#journal-text-view", { value: "", scrollHeight: 0, scrollTop: 0 }],
    ["#journal-copy", { disabled: true, addEventListener() {} }],
    ["#journal-copy-status", { textContent: "" }],
    ["#journal-download", { disabled: true, addEventListener() {} }],
    ["#journal-clear", { addEventListener() {} }],
    ["#journal-status", { textContent: "" }],
  ]);
  const fakeLink = { href: "", download: "", click() { downloadedName = this.download; }, remove() {} };
  globalThis.document = {
    querySelector: (selector) => elements.get(selector) ?? null,
    createElement: () => fakeLink,
    body: { append() {} },
  };
  globalThis.localStorage = { getItem: () => "true", setItem() {} };
  globalThis.setInterval = () => 1;
  URL.createObjectURL = (blob) => { downloadedBlob = blob; return "blob:text-journal"; };
  URL.revokeObjectURL = () => {};

  try {
    const events = new EventBus();
    const services = new Map([["network", { connected: false, send: () => false }]]);
    await setupPlayJournal({
      events,
      services: {
        get: (name) => services.get(name),
        provide: (name, value) => services.set(name, value),
      },
    });
    const journal = services.get("play-journal");

    events.emit("game:snapshot", {
      now: 1000,
      match: { roundNumber: 1, remainingMs: 60_000, score: { 1: 0, 2: 0 } },
      entities: [
        { id: "p1", name: "Игрок", team: 1, alive: true, x: 0, y: 0, z: 0 },
        { id: "a1", name: "Напарник 1", bot: true, team: 1, alive: true, x: 2, y: 0, z: 2 },
        { id: "b1", name: "Враг 1", bot: true, team: 2, alive: true, x: 10, y: 0, z: 10 },
      ],
    });
    events.emit("game:event", {
      event: "ai-decisions:batch",
      payload: {
        latencyMs: 140,
        estimatedInputTokens: 6420,
        maxInputTokens: 30_000,
        usedRequests: 5,
        maxRequests: 10_000,
        summary: [
          {
            entityId: "a1",
            name: "Напарник 1",
            role: "ally_squad",
            targetChoice: "priority_threat",
            moveChoice: "regroup_squad",
            paceChoice: "sprint_push",
            fireChoice: "controlled_burst",
          },
          {
            entityId: "b1",
            name: "Враг 1",
            role: "enemy",
            targetChoice: "priority_threat",
            moveChoice: "flank_left",
            paceChoice: "tactical_strafe",
            fireChoice: "single_tap",
          },
        ],
      },
    });
    events.emit("game:event", {
      event: "combat:damage",
      payload: { attackerId: "p1", targetId: "b1", damage: 55, weaponId: "marksman", remainingHealth: 145 },
    });

    const viewText = elements.get("#journal-text-view").value;
    assert(viewText.includes("ИИ ботов (Gemini Decisions, 140 мс"));
    assert(viewText.includes("30"));
    assert(viewText.includes("запрос 5 из 10000"));
    assert(viewText.includes("[Напарник] Напарник 1"));
    assert(viewText.includes("сбор с отрядом"));
    assert(viewText.includes("[Враг] Враг 1"));
    assert(viewText.includes("обход слева"));
    assert(viewText.includes("одиночные выстрелы"));
    assert(viewText.includes("Игрок нанёс 55 урона цели Враг 1 (винтовка)"));

    const errText = formatJournalEventAsText("ai-decisions:error", {
      message: "API key missing",
      usedRequests: 5,
      maxRequests: 10_000,
    });
    assert(errText.includes("Ошибка ИИ ботов"));
    assert(errText.includes("5 из 10000"));

    await journal.download();
    assert(downloadedName.endsWith(".txt"), `expected .txt filename, got ${downloadedName}`);
    const exportedText = await downloadedBlob.text();
    assert(exportedText.includes("Журнал игры Echo Front"));
    assert(exportedText.includes("Игрок нанёс 55 урона цели Враг 1 (винтовка)"));
  } finally {
    globalThis.document = originals.document;
    globalThis.localStorage = originals.localStorage;
    globalThis.setInterval = originals.setInterval;
    URL.createObjectURL = originals.createObjectURL;
    URL.revokeObjectURL = originals.revokeObjectURL;
  }
});
