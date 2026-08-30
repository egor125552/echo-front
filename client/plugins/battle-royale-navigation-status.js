export const manifest = {
  id: "battle-royale-navigation-status",
  version: "1.0.0",
  requires: ["cloudflare-session", "speech-settings"],
};

function roundedMeters(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}

export async function setup(ctx) {
  const network = ctx.services.get("network");
  const speech = ctx.services.get("speech");
  const live = document.querySelector("#announcer");
  let latestNavigation = null;
  let connected = Boolean(network.connected);

  function announce(text) {
    if (!text) return;
    if (live) {
      live.textContent = "";
      requestAnimationFrame(() => { live.textContent = text; });
    }
    speech.say(text, { interrupt: true });
  }

  function speakStatus() {
    const nav = latestNavigation;
    if (!nav) {
      announce("Навигация пока недоступна.");
      return;
    }

    if (nav.active && nav.target) {
      const distance = Number.isFinite(Number(nav.remainingDistance))
        ? nav.remainingDistance
        : nav.target.distance;
      announce(`Осталось ${roundedMeters(distance)} метров до ${nav.target.name || "цели"}.`);
      return;
    }

    if (nav.selected) {
      announce(`До ${nav.selected.name || "цели"} ${roundedMeters(nav.selected.distance)} метров. Enter — построить маршрут.`);
      return;
    }

    announce("Цель навигации не выбрана. Нажмите M, чтобы выбрать цель.");
  }

  window.addEventListener("keydown", (event) => {
    if (!connected || event.repeat || event.code !== "KeyQ") return;
    event.preventDefault();
    speakStatus();
  }, { capture: true, passive: false });

  window.addEventListener("keyup", (event) => {
    if (!connected || event.code !== "KeyQ") return;
    event.preventDefault();
  }, { capture: true, passive: false });

  ctx.events.on("game:snapshot", (snapshot) => {
    latestNavigation = snapshot?.mode === "battle-royale" ? snapshot.navigation ?? null : null;
  });
  ctx.events.on("network:connected", () => { connected = true; });
  ctx.events.on("network:reconnected", () => { connected = true; });
  ctx.events.on("network:disconnected", () => {
    connected = false;
    latestNavigation = null;
  });
}
