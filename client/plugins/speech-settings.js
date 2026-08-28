export const manifest = {
  id: "speech-settings",
  requires: [],
};

const RATE_KEY = "echo-front.speech-rate";
const ENABLED_KEY = "echo-front.speech-enabled";
const INTERRUPT_RESTART_DELAY_MS = 80;
const START_WATCHDOG_MS = 350;
const MAX_START_RETRIES = 1;

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
  let startWatchdog = null;
  let activeUtterance = null;

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

  function clearStartWatchdog() {
    if (startWatchdog == null) return;
    clearTimeout(startWatchdog);
    startWatchdog = null;
  }

  function clearTimers() {
    clearPendingRestart();
    clearStartWatchdog();
  }

  function stop() {
    generation += 1;
    clearTimers();
    activeUtterance = null;
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

  function busy() {
    return Boolean(activeUtterance || pendingRestart != null || synth?.speaking || synth?.pending);
  }

  function startRequest(text, rateOverride, requestGeneration, retry = 0) {
    if (!enabled || !synth || requestGeneration !== generation) return null;

    const utterance = makeUtterance(text, rateOverride);
    let started = false;
    activeUtterance = utterance;

    utterance.onstart = () => {
      if (requestGeneration !== generation) return;
      started = true;
      clearStartWatchdog();
    };

    const finish = () => {
      if (requestGeneration !== generation) return;
      clearStartWatchdog();
      if (activeUtterance === utterance) activeUtterance = null;
    };
    utterance.onend = finish;
    utterance.onerror = finish;

    speakNow(utterance);

    startWatchdog = setTimeout(() => {
      startWatchdog = null;
      if (!enabled || requestGeneration !== generation || started) return;
      if (activeUtterance === utterance) activeUtterance = null;
      synth.cancel();
      synth.resume?.();
      if (retry < MAX_START_RETRIES) {
        pendingRestart = setTimeout(() => {
          pendingRestart = null;
          startRequest(text, rateOverride, requestGeneration, retry + 1);
        }, INTERRUPT_RESTART_DELAY_MS);
      }
    }, START_WATCHDOG_MS);

    return utterance;
  }

  function say(text, { interrupt = false, rateOverride = null } = {}) {
    if (!enabled || !synth || !text) return null;

    // Never build a browser speech queue. Secondary announcements are disposable:
    // if speech is already busy, skip them instead of enqueueing them.
    if (!interrupt) {
      if (busy()) return null;
      const requestGeneration = ++generation;
      return startRequest(text, rateOverride, requestGeneration);
    }

    // Important announcements are latest-wins. Safari may ignore speak() immediately
    // after cancel(), so restart after a short delay and retry once if onstart never fires.
    const requestGeneration = ++generation;
    clearTimers();
    activeUtterance = null;
    synth.cancel();
    synth.resume?.();
    pendingRestart = setTimeout(() => {
      pendingRestart = null;
      startRequest(text, rateOverride, requestGeneration);
    }, INTERRUPT_RESTART_DELAY_MS);

    return null;
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
