export const manifest = {
  id: "play-journal",
  version: "2.2.0",
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
    round(entity.x, 3), round(entity.y, 3), round(entity.z, 3), round(entity.angle, 4),
    entity.alive ? 1 : 0, entity.health ?? null, entity.armor ?? null,
    entity.armorPlates ?? null, entity.armorPlateMax ?? null, entity.armorReserve ?? null,
    entity.armorReserveMax ?? null, entity.armorSatchel ? 1 : 0, entity.weapon ?? null,
    entity.ammo ?? null, entity.reserve ?? null, Array.isArray(entity.weapons) ? [...entity.weapons] : [],
    Number(entity.team) || 0, entity.location ?? null, entity.acousticZone ?? null,
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
  return ["i", timeMs, Number(input.forward) || 0, Number(input.strafe) || 0, Number(input.turn) || 0,
    input.sprint ? 1 : 0, input.fireHeld ? 1 : 0, input.firePressed ? 1 : 0, input.reload ? 1 : 0,
    Number(input.selectDelta) || 0, input.interactPressed ? 1 : 0, input.platePressed ? 1 : 0,
    input.posePressed ? 1 : 0];
}

function persistentInputSignature(input = {}) {
  return JSON.stringify([Number(input.forward) || 0, Number(input.strafe) || 0, Number(input.turn) || 0,
    input.sprint ? 1 : 0, input.fireHeld ? 1 : 0]);
}

function header(epochMs) {
  return ["EFJ", 4, epochMs, {
    clock: "client milliseconds from journal start",
    keys: "1 up,2 down,3 left,4 right,5 space,6 C,7 X,8 R,9 Z,10 left shift,11 right shift,12 E,13 B",
    k: "[k,t,key,down] exact browser key transition",
    i: "[i,t,forward,strafe,turn,sprint,fireHeld,firePressed,reload,selectDelta,interactPressed,platePressed,posePressed] input sampled for server",
    n: "[n,t,index,id,name,bot,team,healthMax,armorMax] entity dictionary",
    s: "[s,t,serverNow,round,remaining,score1,score2,ended,winner,targetScore,changes,removed] raw authoritative snapshot delta",
    c: `change=[entityIndex,bitmask,values...] bits: ${ENTITY_FIELDS.join(",")}`,
    e: "[e,t,event,payload] authoritative game event; ragdoll events include reason, body part and impact severity when available",
    m: "[m,t,name,data] journal/network/input/server lifecycle marker. Network markers preserve close code, reason, reconnect attempt, server bootId/matchId and fatal plugin/runtime errors.",
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

  function stamp() { return Math.max(0, Math.round(performance.now() - startedAtPerf)); }
  function append(record, { force = false } = {}) {
    if (!enabled && !force) return;
    lines.push(JSON.stringify(record)); updateUi();
  }
  function marker(name, data = null, options = {}) { append(["m", stamp(), name, data], options); }
  function resetJournal() {
    startedAtPerf = performance.now(); startedAtEpoch = Date.now(); lines = [JSON.stringify(header(startedAtEpoch))];
    lastInputSignature = null; entityIndexes = new Map(); entityStates = new Map(); previousSnapshotIds = new Set();
    nextEntityIndex = 1; sawRawSnapshot = false; updateUi();
  }
  function updateUi() {
    if (enabledInput) enabledInput.checked = enabled;
    const count = Math.max(0, lines.length - 1);
    if (downloadButton) downloadButton.disabled = count === 0;
    if (status) status.textContent = enabled ? `Журнал включён. Записей: ${count}.` : `Журнал выключен. Сохранено записей: ${count}.`;
  }
  function recordInput(input = {}) {
    const signature = persistentInputSignature(input);
    const impulse = Boolean(input.firePressed || input.reload || Number(input.selectDelta) || input.interactPressed || input.platePressed || input.posePressed);
    if (signature === lastInputSignature && !impulse) return;
    lastInputSignature = signature; append(encodeInputRecord(stamp(), input));
  }
  function ensureEntity(entity, timeMs) {
    if (entityIndexes.has(entity.id)) return entityIndexes.get(entity.id);
    const index = nextEntityIndex++; entityIndexes.set(entity.id, index);
    append(["n", timeMs, index, entity.id, entity.name ?? "", entity.bot ? 1 : 0, Number(entity.team) || 0, entity.healthMax ?? null, entity.armorMax ?? null]);
    return index;
  }
  function recordSnapshot(snapshot = {}) {
    const timeMs = stamp(); const changes = []; const currentIds = new Set();
    for (const entity of snapshot.entities ?? []) {
      if (!entity?.id) continue; currentIds.add(entity.id); const index = ensureEntity(entity, timeMs);
      const next = compactEntity(entity); const previous = entityStates.get(entity.id) ?? null; const diff = diffEntity(previous, next);
      if (diff.mask) changes.push([index, diff.mask, ...diff.values]); entityStates.set(entity.id, next);
    }
    const removed = [];
    for (const id of previousSnapshotIds) {
      if (currentIds.has(id)) continue; const index = entityIndexes.get(id); if (index) removed.push(index); entityStates.delete(id);
    }
    previousSnapshotIds = currentIds; const match = snapshot.match ?? {};
    append(["s", timeMs, Number(snapshot.now) || 0, Number(match.roundNumber) || 0, Math.max(0, Math.round(Number(match.remainingMs) || 0)),
      Number(match.score?.[1]) || 0, Number(match.score?.[2]) || 0, match.ended ? 1 : 0, Number(match.winner) || 0,
      Number(match.targetScore) || 0, changes, removed]);
  }
  async function makeDownloadBlob(text) {
    if (typeof CompressionStream === "function") {
      try {
        const compressed = new Blob([text], { type: "application/x-ndjson" }).stream().pipeThrough(new CompressionStream("gzip"));
        return { blob: await new Response(compressed).blob(), extension: "jsonl.gz" };
      } catch {}
    }
    return { blob: new Blob([text], { type: "application/x-ndjson;charset=utf-8" }), extension: "jsonl" };
  }
  async function downloadJournal() {
    marker("export", { records: Math.max(0, lines.length - 1) }, { force: true });
    const { blob, extension } = await makeDownloadBlob(`${lines.join("\n")}\n`);
    const date = new Date().toISOString().replace(/[:.]/g, "-"); const link = document.createElement("a");
    link.href = URL.createObjectURL(blob); link.download = `Журнал Echo Front ${date}.${extension}`; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  enabledInput?.addEventListener("change", () => {
    const next = Boolean(enabledInput.checked); if (next === enabled) return;
    if (!next) marker("journal-off", null, { force: true }); enabled = next; localStorage.setItem(ENABLED_KEY, String(enabled));
    if (enabled) marker("journal-on", null, { force: true }); updateUi();
  });
  downloadButton?.addEventListener("click", () => downloadJournal().catch((error) => {
    console.error("Play journal download failed", error); if (status) status.textContent = "Не удалось скачать журнал.";
  }));
  clearButton?.addEventListener("click", resetJournal);

  ctx.events.on("input:key", ({ code, down }) => { const key = KEY_IDS[code]; if (key) append(["k", stamp(), key, down ? 1 : 0]); });
  ctx.events.on("input:touch", ({ control, down } = {}) => marker("touch-input", { control: control ?? "", down: down ? 1 : 0 }));
  ctx.events.on("input:parkour-pose", ({ reason } = {}) => marker("parkour-pose-input", { reason: reason ?? "" }));
  ctx.events.on("input:reset", ({ reason } = {}) => marker("input-reset", reason ?? null));
  ctx.events.on("network:input-sampled", ({ input }) => recordInput(input));
  ctx.events.on("network:connect-attempt", (data = {}) => marker("network-connect-attempt", data));
  ctx.events.on("network:socket-open", (data = {}) => marker("network-socket-open", data));
  ctx.events.on("network:connected", (data = {}) => marker("connected", data));
  ctx.events.on("network:welcome", (data = {}) => marker("welcome", { playerId: data.playerId ?? null, team: data.team ?? null, mode: data.mode ?? null, resumed: data.resumed === true, server: data.server ?? null }));
  ctx.events.on("network:server-identity", (data = {}) => marker("server-identity", data));
  ctx.events.on("network:reconnect-scheduled", (data = {}) => marker("network-reconnect-scheduled", data));
  ctx.events.on("network:reconnected", (data = {}) => marker("reconnected", data));
  ctx.events.on("network:disconnected", (data = {}) => marker("disconnected", data));
  ctx.events.on("network:error", (data = {}) => marker("network-error", data));
  ctx.events.on("network:protocol-error", (data = {}) => marker("network-protocol-error", data));
  ctx.events.on("network:server-error", (data = {}) => marker("server-error", data));
  ctx.events.on("network:match-identity-changed", (data = {}) => marker("match-identity-changed", data));
  ctx.events.on("network:fatal-error", (data = {}) => marker("fatal-error", data, { force: true }));
  ctx.events.on("game:snapshot:raw", (snapshot) => { sawRawSnapshot = true; recordSnapshot(snapshot); });
  ctx.events.on("game:snapshot", (snapshot) => { if (!sawRawSnapshot) recordSnapshot(snapshot); });
  ctx.events.on("game:event", (packet = {}) => append(["e", stamp(), packet.event ?? "", packet.payload ?? {}]));

  ctx.services.provide("play-journal", {
    get enabled() { return enabled; }, get recordCount() { return Math.max(0, lines.length - 1); },
    reset: resetJournal, download: downloadJournal, marker: (name, data = null) => marker(name, data),
  });
  resetJournal();
}
