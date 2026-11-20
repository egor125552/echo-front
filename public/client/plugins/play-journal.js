export const manifest = {
  id: "play-journal",
  version: "3.0.0",
  requires: ["cloudflare-session"],
};

const ENABLED_KEY = "echo-front.journal-enabled";
const MAX_VIEW_LINES = 400;
const MAX_STORED_TEXT_LINES = 15_000;

const KEY_IDS = {
  ArrowUp: 1,
  ArrowDown: 2,
  ArrowLeft: 3,
  ArrowRight: 4,
  Space: 5,
  KeyC: 6,
  KeyX: 7,
  KeyR: 8,
  KeyZ: 9,
  ShiftLeft: 10,
  ShiftRight: 11,
  KeyE: 12,
  KeyB: 13,
  KeyN: 14,
};

const KEY_LABELS = {
  ArrowUp: "Вперёд (стрелка вверх)",
  ArrowDown: "Назад (стрелка вниз)",
  ArrowLeft: "Поворот влево",
  ArrowRight: "Поворот вправо",
  Space: "Прыжок / парашют (Пробел)",
  KeyC: "Паркур / поза (C)",
  KeyX: "Огонь (X)",
  KeyR: "Перезарядка (R)",
  KeyZ: "Смена оружия (Z)",
  ShiftLeft: "Бег (Shift)",
  ShiftRight: "Бег (Shift)",
  KeyE: "Взаимодействие (E)",
  KeyB: "Бронепластина (B)",
  KeyN: "Стимулятор (N)",
};

const WEAPON_LABELS = {
  pistol: "пистолет",
  rifle: "автомат",
  marksman: "винтовка",
  sniper: "снайперка",
};

const AI_TARGET_LABELS = {
  closest: "ближайшая цель",
  priority_threat: "главная угроза",
  human_player: "фокус на игрока",
  weakest: "добивание слабого",
  attacker: "ответ по атакующему",
};

const AI_MOVE_LABELS = {
  advance_direct: "прямой штурм",
  flank_left: "обход слева",
  flank_right: "обход справа",
  hold_cover: "удержание позиции",
  kite_back: "отход на дистанцию",
  retreat_heal: "отступление и лечение",
  regroup_squad: "сбор с отрядом",
  move_zone: "движение в безопасную зону",
};

const AI_PACE_LABELS = {
  sprint_push: "бегом",
  tactical_strafe: "уклонение шагом",
  steady_aim: "прицельный шаг",
};

const AI_FIRE_LABELS = {
  hold_fire: "не стрелять",
  single_tap: "одиночные выстрелы",
  controlled_burst: "короткие очереди",
  suppress_auto: "плотный огонь",
};

export const ENTITY_FIELDS = [
  "x", "y", "z", "angle", "alive", "health", "armor",
  "armorPlates", "armorPlateMax", "armorReserve", "armorReserveMax", "armorSatchel",
  "weapon", "ammo", "reserve", "weapons", "team", "location", "acousticZone",
];

function round(value, digits = 3) {
  if (!Number.isFinite(Number(value))) return value ?? null;
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}

export function formatJournalClock(timeMs) {
  const safeMs = Math.max(0, Math.round(Number(timeMs) || 0));
  const totalSeconds = Math.floor(safeMs / 1000);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  const tenths = Math.floor((safeMs % 1000) / 100);
  return `[${minutes}:${seconds}.${tenths}]`;
}

export function compactEntity(entity = {}) {
  return [
    round(entity.x, 3),
    round(entity.y, 3),
    round(entity.z, 3),
    round(entity.angle, 4),
    entity.alive ? 1 : 0,
    entity.health ?? null,
    entity.armor ?? null,
    entity.armorPlates ?? null,
    entity.armorPlateMax ?? null,
    entity.armorReserve ?? null,
    entity.armorReserveMax ?? null,
    entity.armorSatchel ? 1 : 0,
    entity.weapon ?? null,
    entity.ammo ?? null,
    entity.reserve ?? null,
    Array.isArray(entity.weapons) ? [...entity.weapons] : [],
    Number(entity.team) || 0,
    entity.location ?? null,
    entity.acousticZone ?? null,
  ];
}

function sameValue(a, b) {
  if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify(a) === JSON.stringify(b);
  return Object.is(a, b);
}

export function diffEntity(previous, next) {
  let mask = 0;
  const values = [];
  for (let index = 0; index < next.length; index += 1) {
    if (previous && sameValue(previous[index], next[index])) continue;
    mask |= 1 << index;
    values.push(next[index]);
  }
  return { mask, values };
}

export function encodeInputRecord(timeMs, input = {}) {
  return [
    "i", timeMs,
    Number(input.forward) || 0,
    Number(input.strafe) || 0,
    Number(input.turn) || 0,
    input.sprint ? 1 : 0,
    input.fireHeld ? 1 : 0,
    input.firePressed ? 1 : 0,
    input.reload ? 1 : 0,
    Number(input.selectDelta) || 0,
    input.interactPressed ? 1 : 0,
    input.platePressed ? 1 : 0,
    input.stimulantPressed ? 1 : 0,
    input.parachutePressed ? 1 : 0,
    input.posePressed ? 1 : 0,
    input.jumpPressed ? 1 : 0,
    input.navigationNextPressed ? 1 : 0,
    input.navigationTogglePressed ? 1 : 0,
    input.navigationFacePressed ? 1 : 0,
  ];
}

function persistentInputSignature(input = {}) {
  return JSON.stringify([
    Number(input.forward) || 0,
    Number(input.strafe) || 0,
    Number(input.turn) || 0,
    input.sprint ? 1 : 0,
    input.fireHeld ? 1 : 0,
  ]);
}

function header(epochMs) {
  return ["EFJ", 5, epochMs, {
    clock: "client milliseconds from journal start",
    keys: "1 up,2 down,3 left,4 right,5 space,6 C,7 X,8 R,9 Z,10 left shift,11 right shift,12 E,13 B,14 N",
    k: "[k,t,key,down] exact browser key transition",
    i: "[i,t,forward,strafe,turn,sprint,fireHeld,firePressed,reload,selectDelta,interactPressed,platePressed,stimulantPressed,parachutePressed,posePressed,jumpPressed,navigationNextPressed,navigationTogglePressed,navigationFacePressed] input sampled for server",
    n: "[n,t,index,id,name,bot,team,healthMax,armorMax] entity dictionary",
    s: "[s,t,serverNow,round,remaining,score1,score2,ended,winner,targetScore,changes,removed] raw authoritative snapshot delta",
    c: `change=[entityIndex,bitmask,values...] bits: ${ENTITY_FIELDS.join(",")}`,
    e: "[e,t,event,payload] authoritative game event",
    m: "[m,t,name,data] journal/network/navigation/speech/performance marker",
  }];
}

export function formatJournalMarkerAsText(name, data = {}) {
  const d = data && typeof data === "object" ? data : {};
  switch (name) {
    case "connected":
      return `Подключение к комнате «${d.room || "public"}» (${d.mode === "battle-royale" ? "Королевская битва" : "Командный бой"})${d.reconnecting ? " — переподключение" : ""}.`;
    case "welcome":
      return `Вход в матч выполнен (команда ${d.team ?? "-"}, режим: ${d.mode === "battle-royale" ? "Королевская битва" : "Командный бой"}${d.resumed ? ", сессия продолжена" : ""}).`;
    case "disconnected":
      return `Соединение с сервером закрыто (код ${d.code ?? "-"}${d.reason ? `, ${d.reason}` : ""}).`;
    case "reconnecting":
      return `Повторное подключение к матчу: попытка ${d.attempt ?? 1}.`;
    case "reconnected":
      return `Соединение восстановлено${d.resumed ? ", матч продолжен" : ""}.`;
    case "network-error":
      return `Ошибка сети: ${d.message || "сбой подключения"}.`;
    case "journal-off":
      return "Запись журнала поставлена на паузу.";
    case "journal-on":
      return "Запись журнала возобновлена.";
    case "navigation-guidance":
      return d.active && d.targetName
        ? `Маршрут навигации: «${d.targetName}» (${d.mode || "авто"}).`
        : "Маршрут навигации остановлен.";
    case "performance":
      return `Связь: пинг ${d.roundTripMs ?? 0} мс, игроков: ${d.server?.players ?? 0}, ботов: ${d.server?.bots ?? 0}.`;
    case "performance-timeout":
      return `Задержка ответа сервера: ${d.elapsedMs ?? 0} мс.`;
    case "touch-input":
      return `Сенсорное управление: ${d.control || "кнопка"} (${d.down ? "нажато" : "отпущено"}).`;
    case "parkour-pose-input":
      return "Активирована поза паркура.";
    case "speech-visible-error":
      return `Ошибка озвучки: ${String(d.message || d.reason || "неизвестно").replace(/\.+$/, "")}.`;
    default:
      return null;
  }
}

export function formatJournalEventAsText(eventName, payload = {}, resolveName = (id) => id) {
  const p = payload && typeof payload === "object" ? payload : {};
  const nameOf = (id) => (id ? String(resolveName(id) || id) : "боец");

  switch (eventName) {
    case "ai-decisions:mode-changed":
      return p.mode === "ai"
        ? `Включён режим «Боты с ИИ (Gemini Decisions: враги и напарники)». Использовано запросов: ${p.usedRequests ?? 0} из ${p.maxRequests ?? 10_000}.`
        : `Включён режим «Обычные боты». Использовано запросов к ИИ: ${p.usedRequests ?? 0} из ${p.maxRequests ?? 10_000}.`;
    case "ai-decisions:batch": {
      const units = Array.isArray(p.summary) && p.summary.length
        ? p.summary.map((item) => {
          const roleTag = item.role && item.role !== "enemy" ? "[Напарник] " : "[Враг] ";
          const targetTxt = AI_TARGET_LABELS[item.targetChoice] ?? item.targetChoice;
          const moveTxt = AI_MOVE_LABELS[item.moveChoice] ?? item.moveChoice;
          const paceTxt = AI_PACE_LABELS[item.paceChoice] ?? item.paceChoice;
          const fireTxt = AI_FIRE_LABELS[item.fireChoice] ?? item.fireChoice;
          return `${roleTag}${item.name || item.entityId}: цель — ${targetTxt}, манёвр — ${moveTxt} (${paceTxt}), стрельба — ${fireTxt}`;
        }).join("; ")
        : "команды не требуются";
      const tokenInfo = Number.isFinite(Number(p.apiInputTokens ?? p.estimatedInputTokens))
        ? `, ~${Math.round(Number(p.apiInputTokens ?? p.estimatedInputTokens)).toLocaleString("ru-RU")} / ${Math.round(Number(p.maxInputTokens) || 30_000).toLocaleString("ru-RU")} ток.`
        : "";
      return `ИИ ботов (Gemini Decisions, ${p.latencyMs ?? 0} мс${tokenInfo}, запрос ${p.usedRequests ?? 0} из ${p.maxRequests ?? 10_000}): ${units}.`;
    }
    case "ai-decisions:error":
      return `Ошибка ИИ ботов (Gemini Decisions): ${String(p.message || p.code || "сбой запроса").replace(/\.+$/, "")}. Использовано запросов: ${p.usedRequests ?? 0} из ${p.maxRequests ?? 10_000}.`;
    case "match:started":
      return "Матч начался.";
    case "match:ended":
      return `Матч завершён. Победила команда ${p.winner ?? "-"}.`;
    case "match:score":
      return `Счёт обновлён: команда 1 — ${p.score?.[1] ?? 0}, команда 2 — ${p.score?.[2] ?? 0}.`;
    case "battle-royale:started":
      return `Королевская битва началась. Участников: ${p.alive ?? "-"}.`;
    case "battle-royale:zone-closing":
      return `Сужение безопасной зоны: текущий радиус ${Math.round(Number(p.radius) || 0)} м.`;
    case "battle-royale:zone-damage":
      return `${nameOf(p.entityId)} получает урон от бури за пределами зоны (${Math.round(Number(p.damage) || 0)} ед.).`;
    case "battle-royale:ended":
      return `Королевская битва завершена.${p.winnerId ? ` Победитель: ${nameOf(p.winnerId)}.` : ""}`;
    case "combat:damage": {
      const attacker = p.attackerId ? nameOf(p.attackerId) : "Неизвестный";
      const target = nameOf(p.targetId);
      const dmg = Math.round(Number(p.damage) || 0);
      const weapon = WEAPON_LABELS[p.weaponId] ? ` (${WEAPON_LABELS[p.weaponId]})` : "";
      const remain = Number.isFinite(Number(p.remainingHealth))
        ? `, осталось здоровья: ${Math.max(0, Math.round(Number(p.remainingHealth)))}`
        : "";
      return `${attacker} нанёс ${dmg} урона цели ${target}${weapon}${remain}.`;
    }
    case "entity:died": {
      const victim = nameOf(p.entityId);
      const killer = p.killerId ? ` от рук ${nameOf(p.killerId)}` : "";
      return `${victim} погиб${killer}.`;
    }
    case "entity:respawned":
      return `${nameOf(p.entityId)} вернулся в бой.`;
    case "injury:downed":
      return `${nameOf(p.entityId)} тяжело ранен и ждёт помощи.`;
    case "injury:revived":
      return `${nameOf(p.entityId)} поднят на ноги${p.reviverId && p.reviverId !== p.entityId ? ` напарником ${nameOf(p.reviverId)}` : ""}.`;
    case "squad:callout":
      return p.text || `Сообщение отряда: ${p.kind || "сигнал"}.`;
    case "loot:opened":
      return `${nameOf(p.entityId)} открыл ящик (${WEAPON_LABELS[p.loot] ?? (p.loot === "armor" ? "броня" : p.loot || "припасы")}).`;
    case "loot:picked":
      return `${nameOf(p.entityId)} подобрал ${WEAPON_LABELS[p.loot ?? p.weaponId] ?? (p.item === "armor-plates" ? "бронепластины" : p.loot || "добычу")}.`;
    case "shop:purchased":
      return `${nameOf(p.entityId)} купил в магазине: ${p.itemName || p.itemId} (баланс: ${p.balance ?? 0} $).`;
    case "shop:purchase-failed":
      return `Покупка в магазине не выполнена (${p.reason || "ошибка"}).`;
    case "parachute:launched":
      return "Высадка с самолёта на парашюте.";
    case "parachute:deployed":
      return `${nameOf(p.entityId)} раскрыл парашют.`;
    case "parachute:landed":
      return `${nameOf(p.entityId)} приземлился.`;
    case "vehicle:entered":
      return `${nameOf(p.entityId)} сел за руль транспорта.`;
    case "vehicle:exited":
      return `${nameOf(p.entityId)} вышел из транспорта.`;
    case "vehicle:passenger-entered":
      return `${nameOf(p.entityId)} сел пассажиром в транспорт.`;
    case "armor:plating-started":
      return "Установка бронепластины начата.";
    case "armor:plating-completed":
      return "Установка бронепластин завершена.";
    case "weapon:selected":
      return `Выбрано оружие: ${WEAPON_LABELS[p.weaponId] ?? p.weaponId ?? "новое оружие"}.`;
    case "weapon:unlocked":
      return `Открыто новое оружие: ${WEAPON_LABELS[p.weaponId] ?? p.weaponId}.`;
    default:
      return null;
  }
}

export async function setup(ctx) {
  const network = ctx.services.get("network");
  const enabledInput = document.querySelector("#journal-enabled");
  const formatSelect = document.querySelector("#journal-format");
  const textView = document.querySelector("#journal-text-view");
  const copyButton = document.querySelector("#journal-copy");
  const copyStatus = document.querySelector("#journal-copy-status");
  const downloadButton = document.querySelector("#journal-download");
  const downloadFallback = document.querySelector("#journal-download-fallback");
  const clearButton = document.querySelector("#journal-clear");
  const status = document.querySelector("#journal-status");
  let lastDownloadUrl = null;

  let enabled = localStorage.getItem(ENABLED_KEY) !== "false";
  let startedAtPerf = performance.now();
  let startedAtEpoch = Date.now();
  let lines = [];
  let textLines = [];
  let lastInputSignature = null;
  let entityIndexes = new Map();
  let entityNames = new Map();
  let entityStates = new Map();
  let previousSnapshotIds = new Set();
  let nextEntityIndex = 1;
  let sawRawSnapshot = false;
  let lastGuidanceSignature = null;
  let performanceRequestId = 0;
  let pendingPerformance = null;
  let lastPerformanceTimerAt = performance.now();
  let journalSnapshotCost = { count: 0, totalMs: 0, maxMs: 0 };

  function stamp() {
    return Math.max(0, Math.round(performance.now() - startedAtPerf));
  }

  function resolveName(id) {
    return entityNames.get(id) || id;
  }

  function renderTextView() {
    if (!textView) return;
    const start = Math.max(0, textLines.length - MAX_VIEW_LINES);
    textView.value = textLines.slice(start).join("\n");
    textView.scrollTop = textView.scrollHeight;
  }

  function pushTextLine(sentence, timeMs = stamp(), { force = false } = {}) {
    if (!sentence || (!enabled && !force)) return;
    const entry = `${formatJournalClock(timeMs)} ${sentence}`;
    textLines.push(entry);
    if (textLines.length > MAX_STORED_TEXT_LINES) {
      textLines.splice(0, textLines.length - MAX_STORED_TEXT_LINES);
    }
    renderTextView();
  }

  function append(record, { force = false, text = null } = {}) {
    if (!enabled && !force) return;
    lines.push(JSON.stringify(record));
    if (text) pushTextLine(text, record?.[1] ?? stamp(), { force });
    updateUi();
  }

  function resetJournal() {
    startedAtPerf = performance.now();
    startedAtEpoch = Date.now();
    lines = [JSON.stringify(header(startedAtEpoch))];
    textLines = [
      `Журнал игры Echo Front — начало записи: ${new Date(startedAtEpoch).toLocaleString("ru-RU")}`,
    ];
    lastInputSignature = null;
    entityIndexes = new Map();
    entityNames = new Map();
    entityStates = new Map();
    previousSnapshotIds = new Set();
    nextEntityIndex = 1;
    sawRawSnapshot = false;
    lastGuidanceSignature = null;
    pendingPerformance = null;
    journalSnapshotCost = { count: 0, totalMs: 0, maxMs: 0 };
    if (copyStatus) copyStatus.textContent = "";
    if (downloadFallback) {
      downloadFallback.hidden = true;
      downloadFallback.textContent = "";
    }
    renderTextView();
    updateUi();
  }

  function updateUi() {
    if (enabledInput) enabledInput.checked = enabled;
    const count = Math.max(0, lines.length - 1);
    const hasAnyRecords = lines.length > 0 || textLines.length > 0;
    const hasAnyText = textLines.length > 0;
    if (downloadButton) downloadButton.disabled = !hasAnyRecords;
    if (copyButton) copyButton.disabled = !hasAnyText;
    if (status) {
      status.textContent = enabled
        ? `Журнал включён. Событий в тексте: ${Math.max(0, textLines.length - 1)}, записей всего: ${count}.`
        : `Журнал выключен. Сохранено событий: ${Math.max(0, textLines.length - 1)}.`;
    }
  }

  function recordInput(input = {}) {
    const signature = persistentInputSignature(input);
    const impulse = Boolean(
      input.firePressed
      || input.reload
      || Number(input.selectDelta)
      || input.interactPressed
      || input.platePressed
      || input.stimulantPressed
      || input.parachutePressed
      || input.posePressed
      || input.jumpPressed
      || input.navigationNextPressed
      || input.navigationTogglePressed
      || input.navigationFacePressed
    );
    if (signature === lastInputSignature && !impulse) return;
    lastInputSignature = signature;
    const timeMs = stamp();
    const parts = [];
    if (input.firePressed) parts.push("выстрел");
    if (input.reload) parts.push("перезарядка");
    if (Number(input.selectDelta)) parts.push("смена оружия");
    if (input.interactPressed) parts.push("взаимодействие");
    if (input.platePressed) parts.push("бронепластина");
    if (input.stimulantPressed) parts.push("стимулятор");
    if (input.parachutePressed) parts.push("парашют");
    if (input.jumpPressed) parts.push("прыжок");
    const text = parts.length ? `Действие игрока: ${parts.join(", ")}.` : null;
    append(encodeInputRecord(timeMs, input), { text });
  }

  function ensureEntity(entity, timeMs) {
    if (entity.name) entityNames.set(entity.id, String(entity.name));
    if (entityIndexes.has(entity.id)) return entityIndexes.get(entity.id);
    const index = nextEntityIndex++;
    entityIndexes.set(entity.id, index);
    append([
      "n", timeMs, index, entity.id, entity.name ?? "", entity.bot ? 1 : 0,
      Number(entity.team) || 0, entity.healthMax ?? null, entity.armorMax ?? null,
    ]);
    return index;
  }

  function recordGuidanceSnapshot(snapshot, timeMs) {
    const guidance = snapshot?.navigationGuidance;
    if (!guidance) return;
    const compact = {
      enabled: Boolean(guidance.enabled),
      mode: guidance.mode ?? null,
      targetId: guidance.targetId ?? null,
      targetName: guidance.targetName ?? null,
      active: Boolean(guidance.active),
      manualOverride: Boolean(guidance.manualOverride),
    };
    const signature = JSON.stringify(compact);
    if (signature === lastGuidanceSignature) return;
    lastGuidanceSignature = signature;
    append(["m", timeMs, "navigation-guidance", compact], {
      text: formatJournalMarkerAsText("navigation-guidance", compact),
    });
  }

  function recordSnapshot(snapshot = {}) {
    if (!enabled) return;
    const startedAt = performance.now();
    const timeMs = stamp();
    const changes = [];
    const currentIds = new Set();

    recordGuidanceSnapshot(snapshot, timeMs);

    for (const entity of snapshot.entities ?? []) {
      if (!entity?.id) continue;
      currentIds.add(entity.id);
      const index = ensureEntity(entity, timeMs);
      const next = compactEntity(entity);
      const previous = entityStates.get(entity.id) ?? null;
      const diff = diffEntity(previous, next);
      if (diff.mask) changes.push([index, diff.mask, ...diff.values]);
      entityStates.set(entity.id, next);
    }

    const removed = [];
    for (const id of previousSnapshotIds) {
      if (currentIds.has(id)) continue;
      const index = entityIndexes.get(id);
      if (index) removed.push(index);
      entityStates.delete(id);
    }
    previousSnapshotIds = currentIds;

    const match = snapshot.match ?? {};
    append([
      "s", timeMs,
      Number(snapshot.now) || 0,
      Number(match.roundNumber) || 0,
      Math.max(0, Math.round(Number(match.remainingMs) || 0)),
      Number(match.score?.[1]) || 0,
      Number(match.score?.[2]) || 0,
      match.ended ? 1 : 0,
      Number(match.winner) || 0,
      Number(match.targetScore) || 0,
      changes,
      removed,
    ]);
    const durationMs = performance.now() - startedAt;
    journalSnapshotCost.count += 1;
    journalSnapshotCost.totalMs += durationMs;
    journalSnapshotCost.maxMs = Math.max(journalSnapshotCost.maxMs, durationMs);
  }

  function compactSpeechState(state = {}) {
    return {
      reason: state.reason ?? null,
      error: state.error ?? null,
      fallbackReason: state.fallbackReason ?? null,
      supported: state.supported ?? null,
      enabled: state.enabled ?? null,
      primed: state.primed ?? null,
      speaking: state.speaking ?? null,
      pending: state.pending ?? null,
      userActive: state.userActive ?? null,
      voice: state.voice ?? state.selectedVoice ?? null,
      retry: state.retry ?? null,
    };
  }

  function selectedDownloadFormat() {
    // Default to plain text when the browser select exists; preserve JSONL when DOM elements
    // are mocked as null in automated performance probe tests.
    return formatSelect?.value === "text" ? "text" : "compact";
  }

  function makeDownloadBlobSync(text, format = "compact") {
    if (format === "text") {
      return {
        blob: new Blob([text], { type: "text/plain;charset=utf-8" }),
        extension: "txt",
      };
    }
    return {
      blob: new Blob([text], { type: "application/x-ndjson;charset=utf-8" }),
      extension: "jsonl",
    };
  }

  function copyStringSync(content) {
    if (typeof document === "undefined" || typeof document.execCommand !== "function") return false;
    const body = document.body;
    if (!body || typeof document.createElement !== "function") return false;
    const helper = document.createElement("textarea");
    helper.value = content;
    helper.setAttribute("aria-hidden", "true");
    helper.style.position = "fixed";
    helper.style.left = "-9999px";
    helper.style.top = "0";
    helper.style.opacity = "0";
    helper.style.fontSize = "16px";
    body.append(helper);
    let copied = false;
    try {
      helper.focus({ preventScroll: true });
      helper.select();
      if (typeof helper.setSelectionRange === "function") {
        helper.setSelectionRange(0, content.length);
      }
      copied = Boolean(document.execCommand("copy"));
    } catch {
      copied = false;
    } finally {
      helper.remove?.();
    }
    return copied;
  }

  function downloadJournal() {
    const format = selectedDownloadFormat();
    append(["m", stamp(), "export", { records: Math.max(0, lines.length - 1), format }], { force: true });
    const text = format === "text"
      ? `${textLines.join("\n")}\n`
      : `${lines.join("\n")}\n`;
    const { blob, extension } = makeDownloadBlobSync(text, format);
    const date = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `echo-front-journal-${date}.${extension}`;
    const url = URL.createObjectURL(blob);
    if (lastDownloadUrl) {
      try { URL.revokeObjectURL(lastDownloadUrl); } catch {}
    }
    lastDownloadUrl = url;

    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.rel = "noopener";
    link.style && (link.style.display = "none");
    document.body.append(link);
    link.click();
    link.remove();

    if (downloadFallback) {
      downloadFallback.textContent = "";
      const fallbackLink = document.createElement("a");
      fallbackLink.href = url;
      fallbackLink.download = filename;
      fallbackLink.rel = "noopener";
      fallbackLink.textContent = `Если файл не сохранился автоматически — нажмите здесь (${filename})`;
      downloadFallback.append(fallbackLink);
      downloadFallback.hidden = false;
    }
    if (status) {
      status.textContent = `Журнал отправлен на скачивание: ${filename}.`;
    }
    setTimeout(() => {
      if (lastDownloadUrl === url) {
        try { URL.revokeObjectURL(url); } catch {}
        lastDownloadUrl = null;
      }
    }, 60_000);
    return Promise.resolve({ filename, format, bytes: blob.size });
  }

  async function copyTextJournal() {
    const content = textLines.join("\n") || textView?.value || lines.join("\n");
    if (!content) return false;
    // Execute synchronous DOM copy first while user click activation is still active (critical in iframes & iOS Safari).
    let copied = copyStringSync(content);
    if (!copied && typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(content);
        copied = true;
      } catch {
        copied = false;
      }
    }
    if (!copied && textView) {
      try {
        textView.focus();
        textView.select();
        textView.setSelectionRange?.(0, textView.value.length);
        copied = Boolean(document.execCommand?.("copy"));
      } catch {}
    }
    const lineCount = textLines.length;
    if (copyStatus) {
      copyStatus.textContent = copied
        ? `Текстовый журнал скопирован (строк: ${lineCount}).`
        : "Не удалось скопировать автоматически — текст выделен в поле выше, скопируйте вручную.";
    }
    return copied;
  }

  enabledInput?.addEventListener("change", () => {
    const next = Boolean(enabledInput.checked);
    if (next === enabled) return;
    if (!next) {
      append(["m", stamp(), "journal-off", null], {
        force: true,
        text: formatJournalMarkerAsText("journal-off"),
      });
    }
    enabled = next;
    localStorage.setItem(ENABLED_KEY, String(enabled));
    if (enabled) {
      append(["m", stamp(), "journal-on", null], {
        force: true,
        text: formatJournalMarkerAsText("journal-on"),
      });
    }
    updateUi();
  });

  copyButton?.addEventListener("click", () => { void copyTextJournal(); });

  downloadButton?.addEventListener("click", () => {
    try {
      downloadJournal().catch((error) => {
        console.error("Play journal download failed", error);
        if (status) status.textContent = "Не удалось скачать журнал.";
      });
    } catch (error) {
      console.error("Play journal download failed", error);
      if (status) status.textContent = "Не удалось скачать журнал.";
    }
  });

  clearButton?.addEventListener("click", resetJournal);

  setInterval(() => {
    const now = performance.now();
    const timerDelayMs = Math.max(0, now - lastPerformanceTimerAt - 2000);
    lastPerformanceTimerAt = now;
    if (!enabled || !network.connected) {
      pendingPerformance = null;
      return;
    }
    if (pendingPerformance) {
      if (now - pendingPerformance.sentAt < 6000) return;
      const elapsedMs = round(now - pendingPerformance.sentAt, 1);
      append(["m", stamp(), "performance-timeout", {
        requestId: pendingPerformance.id,
        elapsedMs,
      }], { text: formatJournalMarkerAsText("performance-timeout", { elapsedMs }) });
      pendingPerformance = null;
    }
    performanceRequestId = (performanceRequestId + 1) % 1_000_000_000;
    const id = performanceRequestId;
    pendingPerformance = { id, sentAt: now, timerDelayMs };
    if (!network.send("perf-probe", { id })) pendingPerformance = null;
  }, 2000);

  ctx.events.on("network:perf-pong", ({ id, server, client, receivedAt } = {}) => {
    if (!enabled || !pendingPerformance || id !== pendingPerformance.id) return;
    const { sentAt, timerDelayMs } = pendingPerformance;
    pendingPerformance = null;
    const count = journalSnapshotCost.count;
    const perfData = {
      roundTripMs: round(receivedAt - sentAt, 1),
      browserTimerDelayMs: round(timerDelayMs, 1),
      server,
      client,
      journal: {
        snapshotCount: count,
        avgSnapshotWriteMs: round(count ? journalSnapshotCost.totalMs / count : 0, 1),
        maxSnapshotWriteMs: round(journalSnapshotCost.maxMs, 1),
      },
    };
    append(["m", stamp(), "performance", perfData], {
      text: formatJournalMarkerAsText("performance", perfData),
    });
    journalSnapshotCost = { count: 0, totalMs: 0, maxMs: 0 };
  });

  ctx.events.on("input:key", ({ code, down }) => {
    const key = KEY_IDS[code];
    if (key) {
      const label = down ? KEY_LABELS[code] : null;
      append(["k", stamp(), key, down ? 1 : 0], {
        text: label ? `Клавиша: ${label}.` : null,
      });
    }
  });
  ctx.events.on("input:touch", ({ control, down } = {}) => {
    const payload = { control: control ?? "", down: down ? 1 : 0 };
    append(["m", stamp(), "touch-input", payload], {
      text: down ? formatJournalMarkerAsText("touch-input", payload) : null,
    });
  });
  ctx.events.on("input:parkour-pose", ({ reason } = {}) => {
    append(["m", stamp(), "parkour-pose-input", { reason: reason ?? "" }], {
      text: formatJournalMarkerAsText("parkour-pose-input"),
    });
  });
  ctx.events.on("input:reset", ({ reason } = {}) => append(["m", stamp(), "input-reset", reason ?? null]));
  ctx.events.on("network:input-sampled", ({ input, reason } = {}) => {
    recordInput(input);
    const traceInputPipeline = Boolean(
      String(reason ?? "").includes("Space")
      || input?.parachutePressed
      || input?.jumpPressed
    );
    if (traceInputPipeline) {
      append(["m", stamp(), "input-pipeline", {
        reason: reason ?? null,
        parachutePressed: input?.parachutePressed ? 1 : 0,
        jumpPressed: input?.jumpPressed ? 1 : 0,
        posePressed: input?.posePressed ? 1 : 0,
      }]);
    }
  });
  ctx.events.on("network:connected", (details = {}) => {
    const payload = {
      room: details.room ?? "public",
      mode: details.mode ?? null,
      reconnecting: Boolean(details.reconnecting),
    };
    append(["m", stamp(), "connected", payload], {
      text: formatJournalMarkerAsText("connected", payload),
    });
  });
  ctx.events.on("network:welcome", ({ playerId, team, mode, resumed } = {}) => {
    const payload = { playerId, team, mode: mode ?? null, resumed: Boolean(resumed) };
    append(["m", stamp(), "welcome", payload], {
      text: formatJournalMarkerAsText("welcome", payload),
    });
  });
  ctx.events.on("network:disconnected", (details = {}) => {
    const payload = {
      room: details.room ?? null,
      mode: details.mode ?? null,
      code: details.code ?? null,
      reason: details.reason ?? null,
      wasClean: details.wasClean ?? null,
      endpoint: details.endpoint ?? null,
      willReconnect: details.willReconnect ?? null,
    };
    append(["m", stamp(), "disconnected", payload], {
      text: formatJournalMarkerAsText("disconnected", payload),
    });
  });
  ctx.events.on("network:error", (details = {}) => {
    const payload = {
      room: details.room ?? null,
      mode: details.mode ?? null,
      phase: details.phase ?? null,
      endpoint: details.endpoint ?? null,
      readyState: details.readyState ?? null,
      attempt: details.attempt ?? null,
      message: details.message ?? null,
    };
    append(["m", stamp(), "network-error", payload], {
      text: formatJournalMarkerAsText("network-error", payload),
    });
  });
  ctx.events.on("network:reconnecting", (details = {}) => {
    const payload = {
      room: details.room ?? null,
      mode: details.mode ?? null,
      attempt: details.attempt ?? null,
      delay: details.delay ?? null,
    };
    append(["m", stamp(), "reconnecting", payload], {
      text: formatJournalMarkerAsText("reconnecting", payload),
    });
  });
  ctx.events.on("network:reconnected", (details = {}) => {
    const payload = {
      room: details.room ?? null,
      mode: details.mode ?? null,
      resumed: Boolean(details.resumed),
    };
    append(["m", stamp(), "reconnected", payload], {
      text: formatJournalMarkerAsText("reconnected", payload),
    });
  });
  ctx.events.on("speech:state", (state = {}) => {
    append(["m", stamp(), "speech-state", compactSpeechState(state)]);
  });
  ctx.events.on("speech:visible-error", ({ reason, message } = {}) => {
    const payload = { reason: reason ?? null, message: message ?? null };
    append(["m", stamp(), "speech-visible-error", payload], {
      text: formatJournalMarkerAsText("speech-visible-error", payload),
    });
  });
  ctx.events.on("game:snapshot:raw", (snapshot) => {
    sawRawSnapshot = true;
    recordSnapshot(snapshot);
  });
  ctx.events.on("game:snapshot", (snapshot) => {
    if (!sawRawSnapshot) recordSnapshot(snapshot);
  });
  ctx.events.on("game:event", (packet = {}) => {
    const eventName = packet.event ?? "";
    const payload = packet.payload ?? {};
    append(["e", stamp(), eventName, payload], {
      text: formatJournalEventAsText(eventName, payload, resolveName),
    });
  });

  ctx.services.provide("play-journal", {
    get enabled() {
      return enabled;
    },
    get recordCount() {
      return Math.max(0, lines.length - 1);
    },
    get text() {
      return textLines.join("\n");
    },
    get textLineCount() {
      return textLines.length;
    },
    reset: resetJournal,
    download: downloadJournal,
    copyText: copyTextJournal,
  });

  resetJournal();
}
