import { ClientPluginHost } from "./core/plugin-host.js";
import { echoFrontClientPreset } from "./presets/echo-front.js";

const ERROR_HISTORY_LIMIT = 8;
const PROBE_COOLDOWN_MS = 2500;
const NETWORK_ERROR_ATTEMPT_THRESHOLD = 3;

function errorMessage(error) {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === "string") return error;
  try { return JSON.stringify(error); } catch { return String(error ?? "Неизвестная ошибка"); }
}

function installErrorUi() {
  let panel = document.querySelector("#runtime-error-panel");
  if (panel) return panel;

  panel = document.createElement("section");
  panel.id = "runtime-error-panel";
  panel.hidden = true;
  panel.setAttribute("aria-labelledby", "runtime-error-title");
  panel.innerHTML = `
    <h2 id="runtime-error-title">Ошибка игры</h2>
    <p id="runtime-error-live" role="alert" aria-live="assertive" aria-atomic="true"></p>
    <details open>
      <summary>Технические подробности</summary>
      <ol id="runtime-error-history"></ol>
    </details>
    <button id="runtime-error-clear" type="button">Скрыть ошибки</button>
  `;

  const main = document.querySelector("main") ?? document.body;
  const gamePanel = document.querySelector("#game-panel");
  if (gamePanel?.parentNode === main) main.insertBefore(panel, gamePanel);
  else main.append(panel);

  panel.querySelector("#runtime-error-clear")?.addEventListener("click", () => {
    panel.hidden = true;
    const history = panel.querySelector("#runtime-error-history");
    if (history) history.replaceChildren();
    const live = panel.querySelector("#runtime-error-live");
    if (live) live.textContent = "";
  });
  return panel;
}

const errorPanel = installErrorUi();

function reportError(title, error, details = {}) {
  const message = errorMessage(error);
  const live = errorPanel.querySelector("#runtime-error-live");
  const history = errorPanel.querySelector("#runtime-error-history");
  errorPanel.hidden = false;
  if (live) live.textContent = `${title}. ${message}`;

  if (history) {
    const item = document.createElement("li");
    const time = new Date().toLocaleTimeString("ru-RU");
    const detailEntries = Object.entries(details)
      .filter(([, value]) => value !== undefined && value !== null && value !== "")
      .map(([key, value]) => `${key}=${typeof value === "object" ? JSON.stringify(value) : value}`);
    item.textContent = `${time} — ${title}: ${message}${detailEntries.length ? `; ${detailEntries.join("; ")}` : ""}`;
    history.prepend(item);
    while (history.children.length > ERROR_HISTORY_LIMIT) history.lastElementChild?.remove();
  }

  const connection = document.querySelector("#connection-status");
  if (connection) connection.textContent = `Ошибка: ${message}`;
  console.error(`[Echo Front] ${title}`, error, details);
}

window.addEventListener("error", (event) => {
  reportError("Ошибка клиента", event.error ?? event.message ?? "JavaScript error", {
    file: event.filename ? event.filename.split("/").at(-1) : null,
    line: event.lineno || null,
    column: event.colno || null,
  });
});

window.addEventListener("unhandledrejection", (event) => {
  reportError("Необработанная ошибка клиента", event.reason ?? "Promise rejection");
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

let lastProbeAt = 0;
let probePromise = null;
let lastNetworkFailure = null;

function setButtonsDisabled(value) {
  for (const button of startButtons) button.disabled = Boolean(value);
}

async function probeServerRuntime(mode, networkDetails = {}, { reportTransportFailure = false } = {}) {
  const now = Date.now();
  if (probePromise) return probePromise;
  if (now - lastProbeAt < PROBE_COOLDOWN_MS) return null;
  lastProbeAt = now;

  probePromise = (async () => {
    try {
      const response = await fetch(`/api/runtime-probe?mode=${encodeURIComponent(mode || "tdm")}`, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      let data = null;
      try { data = await response.json(); } catch {}

      // A healthy runtime means the game server can start. A short WebSocket
      // transport interruption is recoverable and must not become a red
      // "Ошибка игры" on its own.
      if (data?.ok) {
        if (reportTransportFailure) {
          reportError("Соединение нестабильно", networkDetails.message ?? "WebSocket connection failed", {
            ...networkDetails,
            runtimeProbe: "server runtime starts successfully",
            httpStatus: response.status,
          });
        }
        return data;
      }

      const serverError = data?.error
        ?? `Runtime probe HTTP ${response.status || "error"}`;
      reportError("Ошибка серверного runtime", serverError, {
        mode: data?.mode ?? mode,
        errorName: data?.errorName ?? null,
        networkPhase: networkDetails.phase ?? null,
        socketState: networkDetails.readyState ?? null,
        closeCode: networkDetails.code ?? null,
      });
      return data;
    } catch (error) {
      if (reportTransportFailure) {
        reportError("Ошибка подключения и диагностики", error, {
          ...networkDetails,
          runtimeProbe: "request failed",
        });
      }
      return null;
    } finally {
      probePromise = null;
    }
  })();
  return probePromise;
}

async function start(mode) {
  setButtonsDisabled(true);
  connection.textContent = mode === "battle-royale"
    ? "Подключение к королевской битве"
    : "Подключение к командному бою";
  if (modeValue) modeValue.textContent = mode === "battle-royale" ? "Королевская битва" : "Командный бой";
  gamePanel.hidden = false;

  try {
    // Prime browser speech while this call still belongs to the user's tap/click.
    // This is especially important for iPhone/WebKit and VoiceOver activation.
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

host.events.on("network:error", (details = {}) => {
  lastNetworkFailure = { ...details };
  if (connection) connection.textContent = "Соединение прервано. Переподключение";
  // Probe silently. If the runtime is healthy, the reconnect loop gets a
  // chance to recover before anything is presented as a game error.
  probeServerRuntime(details.mode ?? host.services.get("network").mode, details);
});

host.events.on("network:disconnected", (details = {}) => {
  lastNetworkFailure = { ...(lastNetworkFailure ?? {}), ...details, phase: "close" };
  setButtonsDisabled(Boolean(details.willReconnect));
  if (details.willReconnect && connection) connection.textContent = "Соединение прервано. Переподключение";
});

host.events.on("network:reconnecting", ({ attempt, delay, mode } = {}) => {
  setButtonsDisabled(true);
  if (connection) connection.textContent = `Повторное подключение, попытка ${attempt ?? "?"}`;
  if (attempt >= NETWORK_ERROR_ATTEMPT_THRESHOLD) {
    const details = {
      ...(lastNetworkFailure ?? {}),
      mode,
      attempt,
      nextDelayMs: delay,
      message: lastNetworkFailure?.message ?? "WebSocket connection failed",
    };
    probeServerRuntime(mode ?? host.services.get("network").mode, details, { reportTransportFailure: true });
  }
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
