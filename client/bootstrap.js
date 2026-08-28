import { ClientPluginHost } from "./core/plugin-host.js";
import { echoFrontClientPreset } from "./presets/echo-front.js";

const host = await new ClientPluginHost(echoFrontClientPreset).start();
const playButton = document.querySelector("#play-button");
const battleRoyaleButton = document.querySelector("#battle-royale-button");
const gamePanel = document.querySelector("#game-panel");
const connection = document.querySelector("#connection-status");
const modeValue = document.querySelector("#mode-value");
const startButtons = [playButton, battleRoyaleButton].filter(Boolean);

function setButtonsDisabled(value) {
  for (const button of startButtons) button.disabled = Boolean(value);
}

function fatalMessage(error = {}) {
  if (error.pluginId) return `Ошибка в плагине ${error.pluginId}: ${error.message || "неизвестная ошибка"}`;
  if (error.code === "MATCH_STATE_LOST") return "Ошибка сервера: процесс текущего матча был перезапущен. Новый матч автоматически не создан.";
  if (error.code === "MATCH_ID_CHANGED") return "Ошибка сервера: после переподключения обнаружен другой матч. Автоматическое переключение остановлено.";
  return error.speech || `Ошибка сервера: ${error.message || "неизвестная ошибка"}`;
}

async function start(mode) {
  setButtonsDisabled(true);
  connection.textContent = mode === "battle-royale" ? "Подключение к королевской битве" : "Подключение к командному бою";
  if (modeValue) modeValue.textContent = mode === "battle-royale" ? "Королевская битва" : "Командный бой";
  gamePanel.hidden = false;
  try {
    host.services.get("speech")?.prime?.("game-start");
    await host.services.get("audio").resume();
    host.services.get("network").connect("public", { mode });
    host.services.get("sound-pack").warmEssential().catch((error) => console.warn("Audio preload", error));
  } catch (error) {
    console.error(error);
    connection.textContent = "Не удалось запустить игру";
    setButtonsDisabled(false);
  }
}

playButton?.addEventListener("click", () => start("tdm"));
battleRoyaleButton?.addEventListener("click", () => start("battle-royale"));

host.events.on("network:disconnected", ({ willReconnect, code, reason } = {}) => {
  setButtonsDisabled(Boolean(willReconnect));
  if (willReconnect && connection) connection.textContent = `Связь потеряна. Переподключение. Код ${code || 0}${reason ? `. ${reason}` : ""}`;
});
host.events.on("network:reconnecting", ({ attempt, delay } = {}) => {
  setButtonsDisabled(true);
  if (connection) connection.textContent = `Переподключение ${attempt || 1}. Задержка ${delay || 0} мс`;
});
host.events.on("network:reconnected", () => {
  if (connection) connection.textContent = "Соединение восстановлено. Матч продолжен";
});
host.events.on("network:fatal-error", (error = {}) => {
  const text = fatalMessage(error);
  setButtonsDisabled(false);
  if (connection) {
    connection.textContent = text;
    connection.setAttribute("role", "alert");
    connection.setAttribute("aria-live", "assertive");
  }
  try { host.services.get("speech")?.say?.(text, { interrupt: true }); } catch {}
});
