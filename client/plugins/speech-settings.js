export const manifest = {
  id: "speech-settings",
  requires: [],
};

const RATE_KEY = "echo-front.speech-rate";
const ENABLED_KEY = "echo-front.speech-enabled";

function clampRate(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 1.7;
  return Math.max(0.7, Math.min(2.5, Math.round(number * 10) / 10));
}

export async function setup(ctx) {
  const synth = window.speechSynthesis;
  const rateInput = document.querySelector("#speech-rate");
  const rateValue = document.querySelector("#speech-rate-value");
  const enabledInput = document.querySelector("#speech-enabled");
  const testButton = document.querySelector("#speech-test");

  let rate = clampRate(localStorage.getItem(RATE_KEY) ?? 1.7);
  let enabled = localStorage.getItem(ENABLED_KEY) !== "false";

  function syncUi() {
    if (rateInput) rateInput.value = String(rate);
    if (rateValue) rateValue.textContent = `${rate.toFixed(1)}×`;
    if (enabledInput) enabledInput.checked = enabled;
    ctx.events.emit("speech:settings-changed", { rate, enabled });
  }

  function russianVoice() {
    const voices = synth?.getVoices?.() ?? [];
    return voices.find((voice) => /^ru(?:-|_)/i.test(voice.lang)) ?? null;
  }

  function stop() {
    synth?.cancel?.();
  }

  function say(text, { interrupt = false, rateOverride = null } = {}) {
    if (!enabled || !synth || !text) return null;
    if (interrupt) synth.cancel();
    const utterance = new SpeechSynthesisUtterance(String(text));
    utterance.lang = "ru-RU";
    utterance.rate = clampRate(rateOverride ?? rate);
    const voice = russianVoice();
    if (voice) utterance.voice = voice;
    synth.speak(utterance);
    return utterance;
  }

  rateInput?.addEventListener("input", () => {
    rate = clampRate(rateInput.value);
    localStorage.setItem(RATE_KEY, String(rate));
    syncUi();
  });

  enabledInput?.addEventListener("change", () => {
    enabled = Boolean(enabledInput.checked);
    localStorage.setItem(ENABLED_KEY, String(enabled));
    if (!enabled) stop();
    syncUi();
  });

  testButton?.addEventListener("click", () => {
    say("Проверка игровой озвучки. Скорость речи настроена.", { interrupt: true });
  });

  ctx.services.provide("speech", {
    say,
    stop,
    get rate() {
      return rate;
    },
    get enabled() {
      return enabled;
    },
  });

  syncUi();
}
