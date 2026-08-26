export const manifest = {
  id: "speech-settings",
  requires: [],
};

const RATE_KEY = "echo-front.speech-rate";
const ENABLED_KEY = "echo-front.speech-enabled";
const INTERRUPT_RESTART_DELAY_MS = 28;

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
  let generation = 0;
  let pendingRestart = null;

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

  function clearPendingRestart() {
    if (pendingRestart == null) return;
    clearTimeout(pendingRestart);
    pendingRestart = null;
  }

  function stop() {
    generation += 1;
    clearPendingRestart();
    synth?.cancel?.();
  }

  function makeUtterance(text, rateOverride = null) {
    const utterance = new SpeechSynthesisUtterance(String(text));
    utterance.lang = "ru-RU";
    utterance.rate = clampRate(rateOverride ?? rate);
    const voice = russianVoice();
    if (voice) utterance.voice = voice;
    return utterance;
  }

  function speakNow(utterance) {
    if (!enabled || !synth || !utterance) return;
    try {
      synth.resume?.();
      synth.speak(utterance);
    } catch (error) {
      console.warn("Speech synthesis failed", error);
    }
  }

  function say(text, { interrupt = false, rateOverride = null } = {}) {
    if (!enabled || !synth || !text) return null;
    const utterance = makeUtterance(text, rateOverride);

    if (!interrupt) {
      speakNow(utterance);
      return utterance;
    }

    const requestGeneration = ++generation;
    clearPendingRestart();
    synth.cancel();
    synth.resume?.();

    // Safari can silently ignore speak() when it follows cancel() in the same task.
    // Restart on the next short timer and discard stale interrupted requests.
    pendingRestart = setTimeout(() => {
      pendingRestart = null;
      if (!enabled || requestGeneration !== generation) return;
      speakNow(utterance);
    }, INTERRUPT_RESTART_DELAY_MS);

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
