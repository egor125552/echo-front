import { ClientPluginHost } from "./core/plugin-host.js";
import { echoFrontClientPreset } from "./presets/echo-front.js";

const ERROR_HISTORY_LIMIT = 20;

function errorMessage(error) {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === "string") return error;
  try { return JSON.stringify(error); } catch { return String(error ?? "Неизвестная ошибка"); }
}

function detailText(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "string") return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}

function installErrorDialog() {
  let dialog = document.querySelector("#runtime-error-dialog");
  if (dialog) return dialog;

  dialog = document.createElement("dialog");
  dialog.id = "runtime-error-dialog";
  dialog.setAttribute("aria-labelledby", "runtime-error-title");
  dialog.setAttribute("aria-describedby", "runtime-error-summary");
  dialog.innerHTML = `
    <section>
      <h2 id="runtime-error-title" tabindex="-1">Ошибка</h2>
      <p id="runtime-error-summary" role="alert" aria-live="assertive" aria-atomic="true"></p>
      <label for="runtime-error-text">Текст ошибки</label>
      <textarea id="runtime-error-text" rows="10" readonly spellcheck="false"></textarea>
      <p id="runtime-error-copy-status" role="status" aria-live="polite"></p>
      <details>
        <summary>История ошибок</summary>
        <ol id="runtime-error-history"></ol>
      </details>
      <div>
        <button id="runtime-error-copy" type="button">Скопировать текст ошибки</button>
        <button id="runtime-error-ok" type="button">ОК</button>
      </div>
    </section>
  `;
  document.body.append(dialog);
  return dialog;
}

const errorDialog = installErrorDialog();
const errorHeading = errorDialog.querySelector("#runtime-error-title");
const errorSummary = errorDialog.querySelector("#runtime-error-summary");
const errorTextArea = errorDialog.querySelector("#runtime-error-text");
const errorCopyStatus = errorDialog.querySelector("#runtime-error-copy-status");
const errorHistory = errorDialog.querySelector("#runtime-error-history");
const errorCopyButton = errorDialog.querySelector("#runtime-error-copy");
const errorOkButton = errorDialog.querySelector("#runtime-error-ok");

let lastErrorReport = "";
let focusBeforeError = null;

function closeErrorDialog() {
  if (typeof errorDialog.close === "function" && errorDialog.open) errorDialog.close();
  else errorDialog.removeAttribute("open");
  const previous = focusBeforeError;
  focusBeforeError = null;
  if (previous && typeof previous.focus === "function" && previous.isConnected) {
    try { previous.focus({ preventScroll: true }); } catch { previous.focus(); }
  }
}

async function copyCurrentError() {
  if (!lastErrorReport) return;
  let copied = false;
  try {
    await navigator.clipboard.writeText(lastErrorReport);
    copied = true;
  } catch {
    const helper = document.createElement("textarea");
    helper.value = lastErrorReport;
    helper.setAttribute("readonly", "");
    helper.style.position = "fixed";
    helper.style.left = "-9999px";
    document.body.append(helper);
    helper.select();
    try { copied = document.execCommand("copy"); } catch {}
    helper.remove();
  }
  if (errorCopyStatus) {
    errorCopyStatus.textContent = copied
      ? "Текст ошибки скопирован"
      : "Не удалось скопировать автоматически. Текст ошибки доступен в поле выше.";
  }
}

errorCopyButton?.addEventListener("click", copyCurrentError);
errorOkButton?.addEventListener("click", closeErrorDialog);
errorDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeErrorDialog();
});

function buildErrorReport(title, error, details = {}) {
  const message = errorMessage(error);
  const detailEntries = Object.entries(details)
    .map(([key, value]) => [key, detailText(value)])
    .filter(([, value]) => value !== null);
  const lines = [
    `Время: ${new Date().toISOString()}`,
    `Ошибка: ${title}`,
    `Сообщение: ${message}`,
  ];
  if (detailEntries.length) {
    lines.push("Подробности:");
    for (const [key, value] of detailEntries) lines.push(`${key}: ${value}`);
  }
  if (error instanceof Error && error.stack) lines.push("Стек:", error.stack);
  return { message, text: lines.join("\n") };
}

function reportError(title, error, details = {}) {
  const report = buildErrorReport(title, error, details);
  lastErrorReport = report.text;

  if (errorSummary) errorSummary.textContent = `${title}. ${report.message}`;
  if (errorTextArea) errorTextArea.value = report.text;
  if (errorCopyStatus) errorCopyStatus.textContent = "";

  if (errorHistory) {
    const item = document.createElement("li");
    item.textContent = `${new Date().toLocaleTimeString("ru-RU")} — ${title}: ${report.message}`;
    errorHistory.prepend(item);
    while (errorHistory.children.length > ERROR_HISTORY_LIMIT) errorHistory.lastElementChild?.remove();
  }

  const connection = document.querySelector("#connection-status");
  if (connection) connection.textContent = `Ошибка: ${report.message}`;

  const wasOpen = Boolean(errorDialog.open || errorDialog.hasAttribute("open"));
  if (!wasOpen) {
    focusBeforeError = document.activeElement;
    if (typeof errorDialog.showModal === "function") {
      try { errorDialog.showModal(); } catch { errorDialog.setAttribute("open", ""); }
    } else {
      errorDialog.setAttribute("open", "");
      errorDialog.setAttribute("aria-modal", "true");
    }
    requestAnimationFrame(() => {
      try { errorHeading?.focus({ preventScroll: true }); } catch { errorHeading?.focus(); }
    });
  }

  console.error(`[Echo Front] ${title}`, error, details);
}

window.addEventListener("error", (event) => {
  if (event instanceof ErrorEvent) {
    reportError("Ошибка клиента", event.error ?? event.message ?? "JavaScript error", {
      file: event.filename ? event.filename.split("/").at(-1) : null,
      line: event.lineno || null,
      column: event.colno || null,
    });
    return;
  }

  const target = event.target;
  const resource = target?.currentSrc || target?.src || target?.href || null;
  reportError("Ошибка загрузки ресурса", resource ? `Не удалось загрузить ${resource}` : "Resource load failed", {
    tag: target?.tagName ?? null,
    resource,
  });
}, true);

window.addEventListener("unhandledrejection", (event) => {
  reportError("Необработанная ошибка клиента", event.reason ?? "Promise rejection");
});

window.addEventListener("securitypolicyviolation", (event) => {
  reportError("Ошибка политики безопасности", event.violatedDirective || "Security policy violation", {
    blockedURI: event.blockedURI || null,
    sourceFile: event.sourceFile || null,
    line: event.lineNumber || null,
    column: event.columnNumber || null,
  });
});

window.addEventListener("offline", () => {
  reportError("Нет подключения к сети", "Браузер перешёл в автономный режим", { phase: "browser-offline" });
});

let host;
try {
  host = await new ClientPluginHost(echoFrontClientPreset).start();
} catch (error) {
  reportError("Не удалось загрузить игровой клиент", error, { phase: "client-startup" });
  throw error;
}

const playButton = document.querySelector("#play-button");
const battleRoyaleButton = document.querySelector("#battle-royale-button");
const gamePanel = document.querySelector("#game-panel");
const connection = document.querySelector("#connection-status");
const modeValue = document.querySelector("#mode-value");
const startButtons = [playButton, battleRoyaleButton].filter(Boolean);

let diagnosisPromise = null;
let lastNetworkFailure = null;

function setButtonsDisabled(value) {
  for (const button of startButtons) button.disabled = Boolean(value);
}

function reportServerError(info = {}, extra = {}) {
  reportError("Ошибка сервера", info.message ?? "Unknown server runtime error", {
    serverName: info.name ?? null,
    serverPhase: info.phase ?? null,
    serverMode: info.mode ?? null,
    serverPlayerId: info.playerId ?? null,
    serverTime: info.at ?? null,
    serverStack: info.stack ?? null,
    ...extra,
  });
}

async function diagnoseServerFailure(mode, room, networkDetails = {}) {
  if (diagnosisPromise) return diagnosisPromise;
  const wantedMode = mode || "tdm";
  const wantedRoom = room || "public";

  diagnosisPromise = (async () => {
    try {
      const exactResponse = await fetch(
        `/api/play-error?room=${encodeURIComponent(wantedRoom)}&mode=${encodeURIComponent(wantedMode)}`,
        { cache: "no-store", headers: { Accept: "application/json" } },
      );
      let exact = null;
      try { exact = await exactResponse.json(); } catch {}
      if (exact?.error) {
        reportServerError(exact.error, {
          diagnosticSource: "current-room",
          networkPhase: networkDetails.phase ?? null,
          socketState: networkDetails.readyState ?? null,
          closeCode: networkDetails.code ?? null,
        });
        return exact;
      }

      const response = await fetch(`/api/runtime-probe?mode=${encodeURIComponent(wantedMode)}`, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      let data = null;
      try { data = await response.json(); } catch {}
      if (data?.ok) return data;

      reportError("Ошибка серверного runtime", data?.error ?? `Runtime probe HTTP ${response.status || "error"}`, {
        mode: data?.mode ?? wantedMode,
        probePhase: data?.phase ?? null,
        errorName: data?.errorName ?? null,
        serverStack: data?.errorStack ?? null,
        diagnosticSource: "deep-probe",
        networkPhase: networkDetails.phase ?? null,
        socketState: networkDetails.readyState ?? null,
        closeCode: networkDetails.code ?? null,
      });
      return data;
    } catch (error) {
      reportError("Ошибка подключения и диагностики", error, {
        ...networkDetails,
        room: wantedRoom,
        mode: wantedMode,
      });
      return null;
    } finally {
      diagnosisPromise = null;
    }
  })();
  return diagnosisPromise;
}

async function start(mode) {
  setButtonsDisabled(true);
  connection.textContent = mode === "battle-royale"
    ? "Подключение к королевской битве"
    : "Подключение к командному бою";
  if (modeValue) modeValue.textContent = mode === "battle-royale" ? "Королевская битва" : "Командный бой";
  gamePanel.hidden = false;

  try {
    host.services.get("speech")?.prime?.("game-start");
    await host.services.get("audio").resume();
    host.services.get("network").connect("public", { mode });
    host.services.get("sound-pack").warmEssential().catch((error) => {
      reportError("Не удалось заранее загрузить часть звуков", error, { phase: "audio-preload" });
    });
  } catch (error) {
    reportError("Не удалось запустить игру", error, { mode, phase: "game-start" });
    setButtonsDisabled(false);
  }
}

playButton?.addEventListener("click", () => start("tdm"));
battleRoyaleButton?.addEventListener("click", () => start("battle-royale"));

host.events.on("network:server-error", ({ error, room, mode, endpoint } = {}) => {
  reportServerError(error ?? {}, {
    diagnosticSource: "live-websocket",
    room,
    mode,
    endpoint,
  });
});

host.events.on("network:error", (details = {}) => {
  lastNetworkFailure = { ...details };
  if (connection) connection.textContent = "Соединение прервано. Переподключение";
  reportError("Ошибка подключения", details.message ?? "WebSocket connection failed", details);
  diagnoseServerFailure(
    details.mode ?? host.services.get("network").mode,
    details.room ?? host.services.get("network").room,
    details,
  );
});

host.events.on("network:disconnected", (details = {}) => {
  lastNetworkFailure = { ...(lastNetworkFailure ?? {}), ...details, phase: "close" };
  setButtonsDisabled(Boolean(details.willReconnect));
  if (details.willReconnect && connection) connection.textContent = "Соединение прервано. Переподключение";
  if (Number(details.code) !== 1000) {
    reportError("Соединение закрыто с ошибкой", details.reason || `WebSocket закрыт с кодом ${details.code ?? "unknown"}`, {
      ...details,
      phase: "close",
    });
    diagnoseServerFailure(
      details.mode ?? host.services.get("network").mode,
      details.room ?? host.services.get("network").room,
      lastNetworkFailure,
    );
  }
});

host.events.on("network:reconnecting", ({ attempt, delay } = {}) => {
  setButtonsDisabled(true);
  if (connection) connection.textContent = `Повторное подключение, попытка ${attempt ?? "?"}`;
  if (lastNetworkFailure) lastNetworkFailure = { ...lastNetworkFailure, attempt, nextDelayMs: delay };
});

host.events.on("network:reconnected", ({ resumed } = {}) => {
  lastNetworkFailure = null;
  setButtonsDisabled(true);
  if (connection) {
    connection.textContent = resumed
      ? "Соединение восстановлено. Матч продолжен"
      : "Соединение восстановлено";
  }
});

host.events.on("network:welcome", () => {
  lastNetworkFailure = null;
  setButtonsDisabled(true);
});
