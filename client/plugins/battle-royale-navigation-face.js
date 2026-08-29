export const manifest = {
  id: "battle-royale-navigation-face-client",
  version: "1.3.0",
  requires: [
    "battle-royale-navigation-client",
    "keyboard-input",
    "cloudflare-session",
    "spatial-audio-web",
    "speech-settings",
  ],
};

const GUIDANCE_CONFIRM_TIMEOUT_MS = 1600;

export async function setup(ctx) {
  const input = ctx.services.get("input");
  const network = ctx.services.get("network");
  const audio = ctx.services.get("audio");
  const speech = ctx.services.get("speech");
  const live = document.querySelector("#announcer");
  const speechStatus = document.querySelector("#speech-status");
  const originalSample = input.sample.bind(input);
  const navigationButtons = [...document.querySelectorAll("[data-navigation-action]")];
  const guidanceButtons = navigationButtons.filter(button => button.dataset.navigationAction === "face");
  let navigationNextPressed = false;
  let navigationTogglePressed = false;
  let navigationFacePressed = false;
  let connected = Boolean(network.connected);
  let guidanceEnabled = false;
  let guidanceSnapshotInitialized = false;
  let confirmationTimer = null;
  let expectedState = null;

  function announce(text) {
    if (!text) return;
    if (live) {
      live.textContent = "";
      requestAnimationFrame(() => { live.textContent = text; });
    }
    speech.say(text, { interrupt: true });
  }

  function showNavigationProblem(text) {
    if (speechStatus) {
      speechStatus.textContent = text;
      speechStatus.dataset.state = "error";
    }
    announce(text);
    console.error("[Echo Front navigation]", text);
  }

  function enabledMessage(targetName = null) {
    return `Автоведение включено. Веду к цели: ${targetName || "цель"}.`;
  }

  function clearConfirmation() {
    if (confirmationTimer != null) clearTimeout(confirmationTimer);
    confirmationTimer = null;
    expectedState = null;
  }

  function confirmState(state) {
    if (expectedState == null) return;
    if (Boolean(state) === expectedState) clearConfirmation();
  }

  function waitForConfirmation() {
    clearConfirmation();
    expectedState = !guidanceEnabled;
    confirmationTimer = setTimeout(() => {
      confirmationTimer = null;
      expectedState = null;
      showNavigationProblem("Ошибка автоведения: команда Y не подтверждена игрой.");
    }, GUIDANCE_CONFIRM_TIMEOUT_MS);
  }

  function syncGuidanceButtons() {
    for (const button of guidanceButtons) {
      button.setAttribute("aria-pressed", guidanceEnabled ? "true" : "false");
    }
  }

  function setGuidanceState(enabled, { announceChange = false, targetName = null } = {}) {
    const next = Boolean(enabled);
    const changed = next !== guidanceEnabled;
    guidanceEnabled = next;
    confirmState(next);
    syncGuidanceButtons();
    if (!announceChange || !changed) return;
    announce(next ? enabledMessage(targetName) : "Автоведение выключено. Управление ручное.");
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
    if (action === "face") waitForConfirmation();
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
    clearConfirmation();
    guidanceEnabled = false;
    guidanceSnapshotInitialized = false;
    navigationNextPressed = false;
    navigationTogglePressed = false;
    navigationFacePressed = false;
    syncGuidanceButtons();
  });

  ctx.events.on("game:snapshot", (snapshot) => {
    if (snapshot?.mode !== "battle-royale" || !snapshot.navigationGuidance) return;
    const next = Boolean(snapshot.navigationGuidance.enabled);
    const targetName = snapshot.navigationGuidance.targetName || null;
    if (!guidanceSnapshotInitialized) {
      guidanceSnapshotInitialized = true;
      guidanceEnabled = next;
      confirmState(next);
      syncGuidanceButtons();
      return;
    }
    setGuidanceState(next, { announceChange: true, targetName });
  });

  ctx.events.on("game:event", (packet) => {
    const payload = packet?.payload ?? {};
    if (payload.entityId !== network.playerId) return;

    if (packet.event === "navigation:guidance-enabled") {
      guidanceSnapshotInitialized = true;
      clearConfirmation();
      const changed = !guidanceEnabled;
      guidanceEnabled = true;
      syncGuidanceButtons();
      if (changed) announce(enabledMessage(payload.targetName));
      return;
    }

    if (packet.event === "navigation:guidance-disabled") {
      guidanceSnapshotInitialized = true;
      clearConfirmation();
      const changed = guidanceEnabled;
      guidanceEnabled = false;
      syncGuidanceButtons();
      if (changed && payload.reason === "toggle") announce("Автоведение выключено. Управление ручное.");
      return;
    }

    if (packet.event !== "navigation:face-unavailable") return;
    clearConfirmation();
    if (payload.reason === "no-target") announce("Сначала выберите цель навигации.");
    else if (payload.reason === "no-route") announce("Не удалось построить маршрут к выбранной цели.");
    else announce("Сейчас включить автоведение нельзя.");
  });

  syncGuidanceButtons();
}
