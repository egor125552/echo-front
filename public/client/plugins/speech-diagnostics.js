export const manifest = {
  id: "speech-diagnostics",
  version: "1.0.0",
  requires: ["speech-settings"],
};

const FAILURE_REASONS = new Set([
  "speak-threw",
  "start-timeout",
  "fallback",
]);

function humanError(reason, state = {}) {
  const detail = String(state.error ?? state.fallbackReason ?? "").trim();
  if (reason === "start-timeout" || detail === "start-timeout") {
    return "Ошибка игровой озвучки: браузер не запустил речь. Код: start-timeout.";
  }
  if (reason === "speak-threw" || detail === "speak-threw") {
    return `Ошибка игровой озвучки: speechSynthesis отклонил запуск${state.error ? `. ${state.error}` : "."}`;
  }
  if (detail.startsWith("speech-error:")) {
    return `Ошибка игровой озвучки: ${detail.slice("speech-error:".length) || "неизвестная ошибка синтеза"}.`;
  }
  if (reason === "error") {
    return `Ошибка игровой озвучки: ${state.error || "неизвестная ошибка синтеза"}.`;
  }
  if (String(reason).includes(":failed")) {
    return `Ошибка игровой озвучки: ${state.error || reason}.`;
  }
  if (reason === "fallback") {
    return `Игровая речь не прозвучала. Включён текстовый запасной режим${detail ? `. Причина: ${detail}` : "."}`;
  }
  return null;
}

export async function setup(ctx) {
  const speech = ctx.services.get("speech");
  const settingsGrid = document.querySelector("#settings-panel .settings-grid");
  let status = document.querySelector("#speech-status");

  if (!status && settingsGrid) {
    status = document.createElement("p");
    status.id = "speech-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "assertive");
    status.setAttribute("aria-atomic", "true");
    settingsGrid.appendChild(status);
  }

  function setStatus(text, { error = false } = {}) {
    if (!status) return;
    status.textContent = text;
    status.dataset.state = error ? "error" : "ok";
  }

  function initialStatus() {
    if (!speech.supported) return "Ошибка игровой озвучки: этот браузер не поддерживает speechSynthesis.";
    if (!speech.enabled) return "Игровая озвучка выключена.";
    if (!speech.voices.length) return "Игровая озвучка включена. Голоса браузера ещё загружаются.";
    return speech.primed
      ? "Игровая озвучка готова."
      : "Игровая озвучка включена. Нажмите любую игровую клавишу, чтобы активировать речь браузера.";
  }

  setStatus(initialStatus(), { error: !speech.supported });

  ctx.events.on("speech:settings-changed", ({ enabled, supported, primed }) => {
    if (!supported) {
      setStatus("Ошибка игровой озвучки: speechSynthesis недоступен в этом браузере.", { error: true });
    } else if (!enabled) {
      setStatus("Игровая озвучка выключена.");
    } else if (primed) {
      setStatus("Игровая озвучка готова.");
    } else {
      setStatus("Игровая озвучка включена. Ожидается первое нажатие клавиши для активации речи.");
    }
  });

  ctx.events.on("speech:state", (state = {}) => {
    const reason = String(state.reason ?? "");
    const explicitError = humanError(reason, state);
    if (explicitError) {
      setStatus(explicitError, { error: true });
      console.error("[Echo Front speech]", reason, state);
      ctx.events.emit("speech:visible-error", { reason, message: explicitError, ...state });
      return;
    }

    if (reason === "started" || reason === "watchdog-speaking") {
      setStatus("Игровая озвучка работает: речь воспроизводится.");
      return;
    }
    if (reason === "ended") {
      setStatus("Игровая озвучка работает.");
      return;
    }
    if (reason.startsWith("primed:")) {
      setStatus("Игровая озвучка активирована и готова.");
      return;
    }
    if (reason === "watchdog-pending") {
      setStatus("Игровая озвучка: браузер задерживает запуск речи…");
      return;
    }
    if (FAILURE_REASONS.has(reason) || reason.includes(":failed")) {
      setStatus(`Ошибка игровой озвучки: ${reason}.`, { error: true });
    }
  });
}
