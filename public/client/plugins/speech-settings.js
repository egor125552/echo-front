export const manifest = {
  id: "speech-settings",
  requires: [],
};

const RATE_KEY = "echo-front.speech-rate";
const ENABLED_KEY = "echo-front.speech-enabled";
const INTERRUPT_RESTART_DELAY_MS = 100;
const START_WATCHDOG_MS = 900;
const MAX_START_RETRIES = 1;
const FALLBACK_LIVE_ID = "speech-fallback-live";

function clampRate(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 1.7;
  return Math.max(0.7, Math.min(2.5, Math.round(number * 10) / 10));
}

function normalizedLang(value) {
  return String(value ?? "").replace(/_/g, "-").toLowerCase();
}

function isIOSFamily() {
  const ua = navigator.userAgent || "";
  return /iPhone|iPad|iPod/i.test(ua)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function voiceScore(voice) {
  const lang = normalizedLang(voice?.lang);
  if (!lang.startsWith("ru")) return -Infinity;
  let score = 0;
  if (lang === "ru-ru") score += 100;
  else if (lang.startsWith("ru-")) score += 80;
  else score += 60;
  if (voice?.localService) score += 10;
  if (voice?.default) score += 4;
  return score;
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
  let voices = [];
  let primed = false;
  let fallbackSequence = 0;

  function fallbackLiveRegion() {
    let live = document.getElementById(FALLBACK_LIVE_ID);
    if (live) return live;
    live = document.createElement("p");
    live.id = FALLBACK_LIVE_ID;
    live.className = "sr-only";
    live.setAttribute("role", "status");
    live.setAttribute("aria-live", "off");
    live.setAttribute("aria-atomic", "true");
    document.body.appendChild(live);
    return live;
  }

  function silenceFallback() {
    const live = fallbackLiveRegion();
    live.setAttribute("aria-live", "off");
  }

  function screenReaderFallback(text, { interrupt = false, reason = "fallback" } = {}) {
    if (!text) return;
    const live = fallbackLiveRegion();
    const sequence = ++fallbackSequence;
    live.setAttribute("aria-live", interrupt ? "assertive" : "polite");
    live.textContent = "";
    requestAnimationFrame(() => {
      if (sequence !== fallbackSequence) return;
      live.textContent = String(text);
    });
    ctx.events.emit("speech:fallback", { text: String(text), interrupt, reason });
  }

  function syncUi() {
    if (rateInput) rateInput.value = String(rate);
    if (rateValue) rateValue.textContent = `${rate.toFixed(1)}×`;
    if (enabledInput) enabledInput.checked = enabled;
    ctx.events.emit("speech:settings-changed", { rate, enabled });
  }

  function refreshVoices() {
    voices = synth?.getVoices?.() ?? [];
    ctx.events.emit("speech:voices-changed", {
      count: voices.length,
      russian: voices.filter((voice) => normalizedLang(voice.lang).startsWith("ru")).length,
    });
    return voices;
  }

  function russianVoice() {
    // Apple WebKit often produces better/more reliable language selection when
    // only utterance.lang is set and the platform chooses its own system voice.
    if (isIOSFamily()) return null;
    if (!voices.length) refreshVoices();
    let selected = null;
    let selectedScore = -Infinity;
    for (const voice of voices) {
      const score = voiceScore(voice);
      if (score > selectedScore) {
        selected = voice;
        selectedScore = score;
      }
    }
    return selectedScore > -Infinity ? selected : null;
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
    silenceFallback();
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
    if (!enabled || !synth || !utterance) return false;
    try {
      synth.resume?.();
      synth.speak(utterance);
      return true;
    } catch (error) {
      console.warn("Speech synthesis failed", error);
      return false;
    }
  }

  function busy() {
    return Boolean(activeUtterance || pendingRestart != null || synth?.speaking || synth?.pending);
  }

  function finishAsFallback(text, interrupt, reason, requestGeneration) {
    if (requestGeneration !== generation) return;
    clearTimers();
    activeUtterance = null;
    try { synth?.cancel?.(); } catch {}
    screenReaderFallback(text, { interrupt, reason });
  }

  function startRequest(text, rateOverride, requestGeneration, interrupt, retry = 0) {
    if (requestGeneration !== generation) return null;
    if (!enabled) {
      screenReaderFallback(text, { interrupt, reason: "browser-speech-disabled" });
      return null;
    }
    if (!synth || typeof SpeechSynthesisUtterance === "undefined") {
      screenReaderFallback(text, { interrupt, reason: "speech-synthesis-unavailable" });
      return null;
    }

    const utterance = makeUtterance(text, rateOverride);
    let started = false;
    let finished = false;
    activeUtterance = utterance;
    silenceFallback();

    utterance.onstart = () => {
      if (requestGeneration !== generation) return;
      started = true;
      clearStartWatchdog();
      ctx.events.emit("speech:started", { text: String(text), retry });
    };

    utterance.onend = () => {
      if (requestGeneration !== generation) return;
      finished = true;
      clearStartWatchdog();
      if (activeUtterance === utterance) activeUtterance = null;
      ctx.events.emit("speech:ended", { text: String(text) });
    };

    utterance.onerror = (event) => {
      if (requestGeneration !== generation || finished) return;
      clearStartWatchdog();
      if (activeUtterance === utterance) activeUtterance = null;
      const error = String(event?.error ?? "speech-error");
      if (!started && retry < MAX_START_RETRIES && !/canceled|interrupted/i.test(error)) {
        try { synth.cancel(); } catch {}
        pendingRestart = setTimeout(() => {
          pendingRestart = null;
          startRequest(text, rateOverride, requestGeneration, interrupt, retry + 1);
        }, INTERRUPT_RESTART_DELAY_MS);
        return;
      }
      if (!started && !/canceled|interrupted/i.test(error)) {
        finishAsFallback(text, interrupt, `speech-error:${error}`, requestGeneration);
      }
    };

    if (!speakNow(utterance)) {
      finishAsFallback(text, interrupt, "speak-threw", requestGeneration);
      return null;
    }

    startWatchdog = setTimeout(() => {
      startWatchdog = null;
      if (requestGeneration !== generation || started || finished) return;
      if (activeUtterance === utterance) activeUtterance = null;
      try { synth.cancel(); } catch {}
      try { synth.resume?.(); } catch {}
      if (retry < MAX_START_RETRIES) {
        pendingRestart = setTimeout(() => {
          pendingRestart = null;
          startRequest(text, rateOverride, requestGeneration, interrupt, retry + 1);
        }, INTERRUPT_RESTART_DELAY_MS);
        return;
      }
      finishAsFallback(text, interrupt, "start-timeout", requestGeneration);
    }, START_WATCHDOG_MS);

    return utterance;
  }

  function say(text, { interrupt = false, rateOverride = null } = {}) {
    if (!text) return null;

    if (!enabled || !synth || typeof SpeechSynthesisUtterance === "undefined") {
      screenReaderFallback(text, {
        interrupt,
        reason: enabled ? "speech-synthesis-unavailable" : "browser-speech-disabled",
      });
      return null;
    }

    // Secondary announcements are disposable: don't build a delayed browser queue.
    if (!interrupt && busy()) return null;

    if (!interrupt) {
      const requestGeneration = ++generation;
      return startRequest(text, rateOverride, requestGeneration, false);
    }

    // Important announcements are latest-wins. Safari/WebKit may ignore speak()
    // immediately after cancel(), so restart after a short delay.
    const requestGeneration = ++generation;
    clearTimers();
    activeUtterance = null;
    silenceFallback();
    try { synth.cancel(); } catch {}
    try { synth.resume?.(); } catch {}
    pendingRestart = setTimeout(() => {
      pendingRestart = null;
      startRequest(text, rateOverride, requestGeneration, true);
    }, INTERRUPT_RESTART_DELAY_MS);
    return null;
  }

  function unlockFromGesture(reason = "user-gesture") {
    if (!synth || typeof SpeechSynthesisUtterance === "undefined") return false;
    refreshVoices();
    try { synth.resume?.(); } catch {}
    if (primed) return true;
    try {
      const unlockUtterance = new SpeechSynthesisUtterance("");
      unlockUtterance.lang = "ru-RU";
      unlockUtterance.volume = 0;
      synth.speak(unlockUtterance);
      primed = true;
      ctx.events.emit("speech:primed", { reason });
      return true;
    } catch (error) {
      ctx.events.emit("speech:prime-failed", { reason, error: String(error?.message ?? error) });
      return false;
    }
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
    unlockFromGesture("speech-test");
    say("Проверка игровой озвучки. Скорость речи настроена.", { interrupt: true });
  });

  if (synth) {
    refreshVoices();
    synth.addEventListener?.("voiceschanged", refreshVoices);
    setTimeout(refreshVoices, 250);
    setTimeout(refreshVoices, 1000);
  }

  // Capture the first genuine gesture before game events start arriving. This is
  // especially important on iOS, where the first speech request may otherwise be
  // silently suppressed even though the API exists.
  const primeOnGesture = () => unlockFromGesture("captured-gesture");
  window.addEventListener("pointerdown", primeOnGesture, { capture: true, passive: true });
  window.addEventListener("touchstart", primeOnGesture, { capture: true, passive: true });
  window.addEventListener("keydown", primeOnGesture, { capture: true });
  window.addEventListener("click", primeOnGesture, { capture: true, passive: true });

  ctx.services.provide("speech", {
    say,
    stop,
    unlock: unlockFromGesture,
    get rate() {
      return rate;
    },
    get enabled() {
      return enabled;
    },
    get available() {
      return Boolean(synth && typeof SpeechSynthesisUtterance !== "undefined");
    },
  });

  syncUi();
}
