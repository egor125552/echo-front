export const TOUCH_MODE_KEY = "echo-front.touch-control-mode";
export const DEFAULT_TOUCH_MODE = "buttons";

export function normalizeTouchMode(value) {
  return value === "gestures" ? "gestures" : "buttons";
}

export async function setup(ctx) {
  const picker = document.querySelector("#touch-control-mode");
  const hint = document.querySelector("#touch-mode-status");
  let saved;
  try { saved = localStorage.getItem(TOUCH_MODE_KEY); } catch { saved = null; }
  let mode = normalizeTouchMode(saved);

  function sync() {
    if (picker) picker.value = mode;
    document.documentElement.dataset.touchMode = mode;
    if (hint) hint.textContent = mode === "buttons"
      ? "Кнопки включены. С VoiceOver двойное касание включает и выключает движение. Прокрутка страницы работает как обычно."
      : "Жесты включены. После запуска матча весь экран станет игровой зоной. Для управления движением обычными касаниями нужно выключить VoiceOver; Меню и Карта доступны отдельными кнопками.";
  }

  function setMode(value) {
    const next = normalizeTouchMode(value);
    if (next === mode) return;
    mode = next;
    try { localStorage.setItem(TOUCH_MODE_KEY, mode); } catch {}
    sync();
    ctx.events.emit("touch-control:mode-changed", { mode });
  }

  picker?.addEventListener("change", () => setMode(picker.value));
  ctx.services.provide("touch-control-settings", {
    get mode() { return mode; },
    setMode,
  });
  sync();
}
