const serverStatus = document.querySelector("#server-status");
const audioStatus = document.querySelector("#audio-status");
const checkServerButton = document.querySelector("#check-server");

async function checkServer() {
  serverStatus.textContent = "Проверяю соединение с Worker…";

  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    serverStatus.textContent = data.ok
      ? "Worker отвечает. Прототип готов к следующему этапу."
      : "Worker ответил, но проверка не пройдена.";
  } catch (error) {
    console.error(error);
    serverStatus.textContent = "Не удалось связаться с Worker.";
  }
}

async function playSound(path) {
  audioStatus.textContent = "Загружаю звук…";

  try {
    const audio = new Audio(path);
    audio.preload = "auto";
    await audio.play();
    audioStatus.textContent = "Звук воспроизводится.";
  } catch (error) {
    console.error(error);
    audioStatus.textContent = "Не удалось воспроизвести звук.";
  }
}

checkServerButton.addEventListener("click", checkServer);

document.querySelectorAll("[data-sound]").forEach((button) => {
  button.addEventListener("click", () => playSound(button.dataset.sound));
});

void checkServer();
