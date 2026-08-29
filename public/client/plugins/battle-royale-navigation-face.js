export const manifest = {
  id: "battle-royale-navigation-face-client",
  version: "1.2.0",
  requires: [
    "battle-royale-navigation-client",
    "keyboard-input",
    "cloudflare-session",
    "spatial-audio-web",
    "speech-settings",
  ],
};

export async function setup(ctx) {
  const input = ctx.services.get("input");
  const network = ctx.services.get("network");
  const audio = ctx.services.get("audio");
  const speech = ctx.services.get("speech");
  const live = document.querySelector("#announcer");
  const originalSample = input.sample.bind(input);
  const navigationButtons = [...document.querySelectorAll("[data-navigation-action]")];
  const guidanceButtons = navigationButtons.filter(button => button.dataset.navigationAction === "face");
  let navigationNextPressed = false;
  let navigationTogglePressed = false;
  let navigationFacePressed = false;
  let connected = Boolean(network.connected);
  let guidanceEnabled = false;

  function announce(text) {
    if (!text) return;
    if (live) {
      live.textContent = "";
      requestAnimationFrame(() => { live.textContent = text; });
    }
    // This is the in-game TTS path, not just the DOM live region.
    speech.say(text, { interrupt: true });
  }

  function syncGuidanceButtons() {
    for (const button of guidanceButtons) {
      button.setAttribute("aria-pressed", guidanceEnabled ? "true" : "false");
    }
  }

  input.sample = () => {
    const sampled = originalSample();
    const next = navigationNextPressed;
    const toggle = navigationTogglePressed;
    const face = navigationFacePressed;
    navigationNextPressed = false;
    navigationTogglePressed = false;
    navigationFacePressed = false;
    return {
      ...sampled,
      navigationNextPressed: Boolean(sampled.navigationNextPressed || next),
      navigationTogglePressed: Boolean(sampled.navigationTogglePressed || toggle),
      navigationFacePressed: face,
    };
  };

  function trigger(action) {
    if (!connected) return;
    if (action === "next") navigationNextPressed = true;
    else if (action === "toggle") navigationTogglePressed = true;
    else if (action === "face") navigationFacePressed = true;
    else return;
    void audio.resume();
    ctx.events.emit("input:changed", { reason: `navigation:${action}` });
  }

  window.addEventListener("keydown", (event) => {
    if (!connected || event.repeat || event.code !== "KeyY") return;
    event.preventDefault();
    trigger("face");
  }, { capture: true, passive: false });

  window.addEventListener("keyup", (event) => {
    if (!connected || event.code !== "KeyY") return;
    event.preventDefault();
  }, { capture: true, passive: false });

  for (const button of navigationButtons) {
    button.addEventListener("click", (event) => {
      if (!connected) return;
      event.preventDefault();
      trigger(button.dataset.navigationAction);
    });
  }

  ctx.events.on("network:connected", () => { connected = true; });
  ctx.events.on("network:reconnected", () => { connected = true; });
  ctx.events.on("network:disconnected", () => {
    connected = false;
    guidanceEnabled = false;
    navigationNextPressed = false;
    navigationTogglePressed = false;
    navigationFacePressed = false;
    syncGuidanceButtons();
  });

  ctx.events.on("game:event", (packet) => {
    const payload = packet?.payload ?? {};
    if (payload.entityId !== network.playerId) return;

    if (packet.event === "navigation:guidance-enabled") {
      guidanceEnabled = true;
      syncGuidanceButtons();
      announce(`Автоведение включено. Веду к цели: ${payload.targetName || "цель"}.`);
      return;
    }

    if (packet.event === "navigation:guidance-disabled") {
      guidanceEnabled = false;
      syncGuidanceButtons();
      if (payload.reason === "toggle") announce("Автоведение выключено. Управление ручное.");
      return;
    }

    if (packet.event !== "navigation:face-unavailable") return;
    if (payload.reason === "no-target") announce("Сначала выберите цель навигации.");
    else if (payload.reason === "no-route") announce("Не удалось построить маршрут к выбранной цели.");
    else if (payload.reason === "driving") announce("Автоведение пешего маршрута недоступно за рулём.");
    else if (payload.reason === "airborne") announce("Автоведение недоступно в воздухе.");
    else if (payload.reason === "ragdoll") announce("Сначала встаньте, затем включите автоведение.");
    else announce("Сейчас включить автоведение нельзя.");
  });

  syncGuidanceButtons();
}
