export const manifest = {
  id: "parachute-input",
  requires: ["keyboard-input", "cloudflare-session", "speech-settings"],
};

const PARACHUTE_ACTION_DEBOUNCE_MS = 350;

export async function setup(ctx) {
  const input = ctx.services.get("input");
  const network = ctx.services.get("network");
  const speech = ctx.services.get("speech");
  const originalSample = input.sample.bind(input);
  let parachutePressed = false;
  let latestParachute = null;
  let lastParachuteActionAt = -Infinity;

  function trigger(reason) {
    if (!network.connected) return;
    const now = performance.now();
    if (now - lastParachuteActionAt < PARACHUTE_ACTION_DEBOUNCE_MS) {
      ctx.events.emit("parachute:input-suppressed", {
        reason,
        elapsedMs: now - lastParachuteActionAt,
      });
      return;
    }
    lastParachuteActionAt = now;
    parachutePressed = true;
    ctx.events.emit("input:changed", { reason });
  }

  function statusLiveRegion() {
    let live = document.getElementById("parachute-status-live");
    if (live) return live;
    live = document.createElement("p");
    live.id = "parachute-status-live";
    live.className = "sr-only";
    live.setAttribute("role", "status");
    live.setAttribute("aria-live", "assertive");
    live.setAttribute("aria-atomic", "true");
    document.body.appendChild(live);
    return live;
  }

  function announceWithScreenReader(text) {
    const live = statusLiveRegion();
    live.textContent = "";
    requestAnimationFrame(() => {
      live.textContent = text;
    });
  }

  function announce(text) {
    if (!text) return;
    // When browser TTS is enabled, the shared speech service owns retries and
    // fallback. Doing a second local watchdog here can produce duplicate speech.
    if (speech.enabled) {
      speech.say(text, { interrupt: true });
      return;
    }
    announceWithScreenReader(text);
  }

  function flightStatusText() {
    const state = latestParachute;
    if (!state?.airborne) return "Парашют сейчас не используется.";

    const altitude = Math.max(0, Number(state.altitude) || 0);
    const downward = Math.max(0, -(Number(state.verticalVelocity) || 0));
    const glide = Math.max(0, Number(state.glideSpeed) || 0);
    const wind = Math.max(0, Number(state.windSpeed) || 0);
    const ground = Number.isFinite(Number(state.groundDistance))
      ? Math.max(0, Number(state.groundDistance))
      : null;
    const phase = state.phase === "deployed"
      ? `Купол раскрыт на ${Math.round((Number(state.inflation) || 0) * 100)} процентов.`
      : "Свободное падение.";
    const stall = Number(state.stall) >= 0.35
      ? `Сваливание купола ${Math.round(Number(state.stall) * 100)} процентов.`
      : "";
    const environment = state.canopyEnvironment === "indoor"
      ? "Купол под перекрытием."
      : state.canopyEnvironment === "obstructed"
        ? "Рядом препятствие для купола."
        : "";

    return [
      `Высота ${altitude.toFixed(1)} метра.`,
      `Скорость вниз ${downward.toFixed(1)} метра в секунду.`,
      `Планирование ${glide.toFixed(1)} метра в секунду.`,
      `Ветер ${wind.toFixed(1)} метра в секунду.`,
      ground == null ? "" : `До поверхности ${ground.toFixed(1)} метра.`,
      phase,
      stall,
      environment,
    ].filter(Boolean).join(" ");
  }

  input.sample = () => {
    const sampled = originalSample();
    const pressed = parachutePressed;
    parachutePressed = false;
    return { ...sampled, parachutePressed: pressed };
  };

  ctx.events.on("game:snapshot", (snapshot) => {
    const self = snapshot?.entities?.find((entity) => entity.id === network.playerId);
    latestParachute = self?.parachute ?? null;
  });

  window.addEventListener("keydown", (event) => {
    if (!network.connected || event.repeat) return;
    if (event.code === "Space") {
      event.preventDefault();
      trigger("key:Space:down");
      return;
    }
    if (event.code === "KeyH") {
      event.preventDefault();
      announce(flightStatusText());
    }
  }, { capture: true, passive: false });

  const button = document.querySelector('[data-touch-action="parachute"]');
  button?.addEventListener("click", (event) => {
    event.preventDefault();
    trigger("touch:parachute");
  });

  const statusButton = document.querySelector('[data-touch-action="parachute-status"]');
  statusButton?.addEventListener("click", (event) => {
    event.preventDefault();
    announce(flightStatusText());
  });
}
