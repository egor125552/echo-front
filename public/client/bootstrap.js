import { ClientPluginHost } from "./core/plugin-host.js";
import { echoFrontClientPreset } from "./presets/echo-front.js";

const host = await new ClientPluginHost(echoFrontClientPreset).start();
const playButton = document.querySelector("#play-button");
const gamePanel = document.querySelector("#game-panel");
const connection = document.querySelector("#connection-status");

playButton.addEventListener("click", async () => {
  playButton.disabled = true;
  connection.textContent = "Подключение к матчу";
  gamePanel.hidden = false;

  try {
    await host.services.get("audio").resume();
    host.services.get("network").connect("public");
    host.services.get("sound-pack").warmEssential().catch((error) => console.warn("Audio preload", error));
  } catch (error) {
    console.error(error);
    connection.textContent = "Не удалось запустить игру";
    playButton.disabled = false;
  }
});

host.events.on("network:disconnected", ({ willReconnect } = {}) => {
  playButton.disabled = Boolean(willReconnect);
});

host.events.on("network:reconnecting", () => {
  playButton.disabled = true;
});
