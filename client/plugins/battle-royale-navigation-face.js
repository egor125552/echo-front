export const manifest = {
  id: "battle-royale-navigation-face-client",
  version: "1.0.0",
  requires: ["keyboard-input", "cloudflare-session", "spatial-audio-web", "speech-settings"],
};

export async function setup(ctx) {
  const input = ctx.services.get("input");
  const network = ctx.services.get("network");
  const audio = ctx.services.get("audio");
  const speech = ctx.services.get("speech");
  const live = document.querySelector("#announcer");
  const originalSample = input.sample.bind(input);
  const faceButtons = [...document.querySelectorAll('[data-navigation-action="face"]')];
  let navigationFacePressed = false;
  let connected = Boolean(network.connected);

  function announce(text) {
    if (!text) return;
    if (live) {
      live.textContent = "";
      requestAnimationFrame(() => { live.textContent = text; });
    }
    speech.say(text, { interrupt: true });
  }

  input.sample = () => {
    const sampled = originalSample();
    const face = navigationFacePressed;
    navigationFacePressed = false;
    return { ...sampled, navigationFacePressed: face };
  };

  function triggerFace() {
    if (!connected) return;
    navigationFacePressed = true;
    void audio.resume();
    ctx.events.emit("input:changed", { reason: "navigation:KeyY" });
  }

  window.addEventListener("keydown", (event) => {
    if (!connected || event.repeat || event.code !== "KeyY") return;
    event.preventDefault();
    triggerFace();
  }, { capture: true, passive: false });

  window.addEventListener("keyup", (event) => {
    if (!connected || event.code !== "KeyY") return;
    event.preventDefault();
  }, { capture: true, passive: false });

  for (const button of faceButtons) {
    button.addEventListener("click", (event) => {
      if (!connected) return;
      event.preventDefault();
      triggerFace();
    });
  }

  ctx.events.on("network:connected", () => { connected = true; });
  ctx.events.on("network:reconnected", () => { connected = true; });
  ctx.events.on("network:disconnected", () => {
    connected = false;
    navigationFacePressed = false;
  });

  ctx.events.on("game:event", (packet) => {
    const payload = packet?.payload ?? {};
    if (payload.entityId !== network.playerId) return;
    if (packet.event !== "navigation:face-unavailable") return;

    if (payload.reason === "no-target") announce("Сначала выберите цель навигации.");
    else if (payload.reason === "driving") announce("Поворот к маршруту недоступен за рулём.");
    else if (payload.reason === "airborne") announce("Поворот к маршруту недоступен в воздухе.");
    else if (payload.reason === "ragdoll") announce("Сначала встаньте.");
    else if (payload.reason === "already-there") announce("Вы уже у точки маршрута.");
    else announce("Сейчас повернуться к маршруту нельзя.");
  });
}
