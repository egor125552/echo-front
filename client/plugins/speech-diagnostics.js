export const manifest = {
  id: "speech-diagnostics",
  version: "1.1.0",
  requires: ["speech-settings"],
};

function humanError(reason, state = {}) {
  const detail = String(state.error ?? state.fallbackReason ?? "").trim();
  if (reason === "start-timeout" || detail === "start-timeout") {
    return "Ошибка игровой озвучки: браузер не запустил речь.";
  }
  if (reason === "speak-threw" || detail === "speak-threw") {
    return `Ошибка игровой озвучки: браузер отклонил запуск речи${state.error ? `. ${state.error}` : "."}`;
  }
  if (detail.startsWith("speech-error:")) {
    return `Ошибка игровой озвучки: ${detail.slice("speech-error:".length) || "неизвестная ошибка синтеза"}.`;
  }
  if (reason === "error") {
    return `Ошибка игровой озвучки: ${state.error || "неизвестная ошибка синтеза"}.`;
  }
  if (String(reason).includes(":failed")) {
    return `Ошибка игровой озвучки: ${state.error || "операция речи завершилась с ошибкой"}.`;
  }
  if (reason === "fallback") {
    return `Игровая речь не прозвучала${detail ? `. Причина: ${detail}` : "."}`;
  }
  return null;
}

export async function setup(ctx) {
  const speech = ctx.services.get("speech");
  const settingsGrid = document.querySelector("#settings-panel .settings-grid");
  let status = document.querySelector("#speech-status");
  let lastError = "";

  if (!status && settingsGrid) {
    status = document.createElement("p");
    status.id = "speech-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "assertive");
    status.setAttribute("aria-atomic", "true");
    settingsGrid.appendChild(status);
  }

  function showError(text, reason, state = {}) {
    if (!text || text === lastError) return;
    lastError = text;
    if (status) {
      status.setAttribute("aria-live", "assertive");
      status.textContent = text;
      status.dataset.state = "error";
    }
    console.error("[Echo Front speech]", reason, state);
    ctx.events.emit("speech:visible-error", { reason, message: text, ...state });
  }

  function clearHealthy() {
    if (!lastError && !status?.textContent) return;
    lastError = "";
    if (!status) return;
    status.setAttribute("aria-live", "off");
    status.textContent = "";
    delete status.dataset.state;
    requestAnimationFrame(() => status?.setAttribute("aria-live", "assertive"));
  }

  if (!speech.supported) {
    showError("Ошибка игровой озвучки: этот браузер не поддерживает синтез речи.", "unsupported");
  } else {
    clearHealthy();
  }

  ctx.events.on("speech:settings-changed", ({ enabled, supported }) => {
    if (!supported) {
      showError("Ошибка игровой озвучки: синтез речи недоступен в этом браузере.", "unsupported");
      return;
    }
    if (enabled) clearHealthy();
    else clearHealthy();
  });

  ctx.events.on("speech:state", (state = {}) => {
    const reason = String(state.reason ?? "");
    const explicitError = humanError(reason, state);
    if (explicitError) {
      showError(explicitError, reason, state);
      return;
    }

    if (
      reason === "started"
      || reason === "ended"
      || reason === "watchdog-speaking"
      || reason.startsWith("primed:")
      || reason.startsWith("voices:")
      || reason === "ready"
    ) {
      clearHealthy();
    }
  });
}
