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

async function start(mode) {
  setButtonsDisabled(true);
  connection.textContent = mode === "battle-royale"
    ? "Подключение к королевской битве"
    : "Подключение к командному бою";
  if (modeValue) modeValue.textContent = mode === "battle-royale" ? "Королевская битва" : "Командный бой";
  gamePanel.hidden = false;

  try {
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

host.events.on("network:disconnected", ({ willReconnect } = {}) => {
  setButtonsDisabled(Boolean(willReconnect));
});
host.events.on("network:reconnecting", () => setButtonsDisabled(true));
