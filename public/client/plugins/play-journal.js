export const manifest = {
  id: "play-journal",
  version: "2.3.0",
  requires: ["cloudflare-session"],
};

const ENABLED_KEY = "echo-front.journal-enabled";
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
    input.posePressed ? 1 : 0,
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
  return ["EFJ", 4, epochMs, {
    clock: "client milliseconds from journal start",
    keys: "1 up,2 down,3 left,4 right,5 space,6 C,7 X,8 R,9 Z,10 left shift,11 right shift,12 E,13 B",
    k: "[k,t,key,down] exact browser key transition",
    i: "[i,t,forward,strafe,turn,sprint,fireHeld,firePressed,reload,selectDelta,interactPressed,platePressed,posePressed,navigationNextPressed,navigationTogglePressed,navigationFacePressed] input sampled for server",
    n: "[n,t,index,id,name,bot,team,healthMax,armorMax] entity dictionary",
    s: "[s,t,serverNow,round,remaining,score1,score2,ended,winner,targetScore,changes,removed] raw authoritative snapshot delta",
    c: `change=[entityIndex,bitmask,values...] bits: ${ENTITY_FIELDS.join(",")}`,
    e: "[e,t,event,payload] authoritative game event",
    m: "[m,t,name,data] journal/network/navigation/speech marker",
  }];
}

export async function setup(ctx) {
  const enabledInput = document.querySelector("#journal-enabled");
  const downloadButton = document.querySelector("#journal-download");
  const clearButton = document.querySelector("#journal-clear");
  const status = document.querySelector("#journal-status");

  let enabled = localStorage.getItem(ENABLED_KEY) !== "false";
  let startedAtPerf = performance.now();
  let startedAtEpoch = Date.now();
  let lines = [];
  let lastInputSignature = null;
  let entityIndexes = new Map();
  let entityStates = new Map();
  let previousSnapshotIds = new Set();
  let nextEntityIndex = 1;
  let sawRawSnapshot = false;
  let lastGuidanceSignature = null;

  function stamp() {
    return Math.max(0, Math.round(performance.now() - startedAtPerf));
  }

  function append(record, { force = false } = {}) {
    if (!enabled && !force) return;
    lines.push(JSON.stringify(record));
    updateUi();
  }

  function resetJournal() {
    startedAtPerf = performance.now();
    startedAtEpoch = Date.now();
    lines = [JSON.stringify(header(startedAtEpoch))];
    lastInputSignature = null;
    entityIndexes = new Map();
    entityStates = new Map();
    previousSnapshotIds = new Set();
    nextEntityIndex = 1;
    sawRawSnapshot = false;
    lastGuidanceSignature = null;
    updateUi();
  }

  function updateUi() {
    if (enabledInput) enabledInput.checked = enabled;
    const count = Math.max(0, lines.length - 1);
    if (downloadButton) downloadButton.disabled = count === 0;
    if (status) {
      status.textContent = enabled
        ? `Журнал включён. Записей: ${count}.`
        : `Журнал выключен. Сохранено записей: ${count}.`;
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
      || input.posePressed
      || input.navigationNextPressed
      || input.navigationTogglePressed
      || input.navigationFacePressed
    );
    if (signature === lastInputSignature && !impulse) return;
    lastInputSignature = signature;
    append(encodeInputRecord(stamp(), input));
  }

  function ensureEntity(entity, timeMs) {
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
    append(["m", timeMs, "navigation-guidance", compact]);
  }

  function recordSnapshot(snapshot = {}) {
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

  async function makeDownloadBlob(text) {
    if (typeof CompressionStream === "function") {
      try {
        const compressed = new Blob([text], { type: "application/x-ndjson" })
          .stream()
          .pipeThrough(new CompressionStream("gzip"));
        return {
          blob: await new Response(compressed).blob(),
          extension: "jsonl.gz",
        };
      } catch {
      }
    }
    return {
      blob: new Blob([text], { type: "application/x-ndjson;charset=utf-8" }),
      extension: "jsonl",
    };
  }

  async function downloadJournal() {
    append(["m", stamp(), "export", { records: Math.max(0, lines.length - 1) }], { force: true });
    const text = `${lines.join("\n")}\n`;
    const { blob, extension } = await makeDownloadBlob(text);
    const date = new Date().toISOString().replace(/[:.]/g, "-");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Журнал Echo Front ${date}.${extension}`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  enabledInput?.addEventListener("change", () => {
    const next = Boolean(enabledInput.checked);
    if (next === enabled) return;
    if (!next) append(["m", stamp(), "journal-off", null], { force: true });
    enabled = next;
    localStorage.setItem(ENABLED_KEY, String(enabled));
    if (enabled) append(["m", stamp(), "journal-on", null], { force: true });
    updateUi();
  });

  downloadButton?.addEventListener("click", () => {
    downloadJournal().catch((error) => {
      console.error("Play journal download failed", error);
      if (status) status.textContent = "Не удалось скачать журнал.";
    });
  });

  clearButton?.addEventListener("click", resetJournal);

  ctx.events.on("input:key", ({ code, down }) => {
    const key = KEY_IDS[code];
    if (key) append(["k", stamp(), key, down ? 1 : 0]);
  });
  ctx.events.on("input:touch", ({ control, down } = {}) => {
    append(["m", stamp(), "touch-input", { control: control ?? "", down: down ? 1 : 0 }]);
  });
  ctx.events.on("input:parkour-pose", ({ reason } = {}) => {
    append(["m", stamp(), "parkour-pose-input", { reason: reason ?? "" }]);
  });
  ctx.events.on("input:reset", ({ reason } = {}) => append(["m", stamp(), "input-reset", reason ?? null]));
  ctx.events.on("network:input-sampled", ({ input }) => recordInput(input));
  ctx.events.on("network:connected", (details = {}) => append(["m", stamp(), "connected", {
    room: details.room ?? "public",
    mode: details.mode ?? null,
    reconnecting: Boolean(details.reconnecting),
  }]));
  ctx.events.on("network:welcome", ({ playerId, team, mode, resumed } = {}) => append(["m", stamp(), "welcome", {
    playerId,
    team,
    mode: mode ?? null,
    resumed: Boolean(resumed),
  }]));
  ctx.events.on("network:disconnected", (details = {}) => append(["m", stamp(), "disconnected", {
    room: details.room ?? null,
    mode: details.mode ?? null,
    code: details.code ?? null,
    reason: details.reason ?? null,
    wasClean: details.wasClean ?? null,
    endpoint: details.endpoint ?? null,
    willReconnect: details.willReconnect ?? null,
  }]));
  ctx.events.on("network:error", (details = {}) => append(["m", stamp(), "network-error", {
    room: details.room ?? null,
    mode: details.mode ?? null,
    phase: details.phase ?? null,
    endpoint: details.endpoint ?? null,
    readyState: details.readyState ?? null,
    attempt: details.attempt ?? null,
    message: details.message ?? null,
  }]));
  ctx.events.on("network:reconnecting", (details = {}) => append(["m", stamp(), "reconnecting", {
    room: details.room ?? null,
    mode: details.mode ?? null,
    attempt: details.attempt ?? null,
    delay: details.delay ?? null,
  }]));
  ctx.events.on("network:reconnected", (details = {}) => append(["m", stamp(), "reconnected", {
    room: details.room ?? null,
    mode: details.mode ?? null,
    resumed: Boolean(details.resumed),
  }]));
  ctx.events.on("speech:state", (state = {}) => {
    append(["m", stamp(), "speech-state", compactSpeechState(state)]);
  });
  ctx.events.on("speech:visible-error", ({ reason, message } = {}) => {
    append(["m", stamp(), "speech-visible-error", { reason: reason ?? null, message: message ?? null }]);
  });
  ctx.events.on("game:snapshot:raw", (snapshot) => {
    sawRawSnapshot = true;
    recordSnapshot(snapshot);
  });
  ctx.events.on("game:snapshot", (snapshot) => {
    if (!sawRawSnapshot) recordSnapshot(snapshot);
  });
  ctx.events.on("game:event", (packet = {}) => append(["e", stamp(), packet.event ?? "", packet.payload ?? {}]));

  ctx.services.provide("play-journal", {
    get enabled() {
      return enabled;
    },
    get recordCount() {
      return Math.max(0, lines.length - 1);
    },
    reset: resetJournal,
    download: downloadJournal,
  });

  resetJournal();
}
