export const manifest = {
  id: "speech-settings",
  requires: [],
};

const RATE_KEY = "echo-front.speech-rate";
const ENABLED_KEY = "echo-front.speech-enabled";
const VOICE_KEY = "echo-front.speech-voice";
const INTERRUPT_RESTART_DELAY_MS = 120;
const START_WATCHDOG_MS = 900;
const PENDING_GRACE_MS = 3000;
const MAX_START_RETRIES = 1;
const VOICE_REFRESH_DELAYS_MS = [0, 100, 500, 1500];

function clampRate(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 1.7;
  return Math.max(0.7, Math.min(2.5, Math.round(number * 10) / 10));
}

function voiceId(voice) {
  if (!voice) return "";
  return String(voice.voiceURI || `${voice.name}|${voice.lang}`);
}

function isRussianVoice(voice) {
  return /^ru(?:-|_)/i.test(String(voice?.lang ?? ""));
}

export function scoreRussianVoice(voice) {
  if (!isRussianVoice(voice)) return -Infinity;
  const name = String(voice?.name ?? "").toLowerCase();
  const lang = String(voice?.lang ?? "").toLowerCase().replace("_", "-");
  let score = 0;
  if (lang === "ru-ru") score += 100;
  if (voice?.default) score += 12;
  if (voice?.localService) score += 4;
  if (/natural|neural|premium|enhanced/.test(name)) score += 90;
  if (/google|microsoft/.test(name)) score += 35;
  if (/milena|yuri|svetlana|dariya|irina/.test(name)) score += 20;
  if (/eloquence/.test(name)) score -= 60;
  return score;
}

function bestRussianVoice(voices) {
  return voices
    .filter(isRussianVoice)
    .slice()
    .sort((a, b) => scoreRussianVoice(b) - scoreRussianVoice(a))[0] ?? null;
}

function userGestureActive() {
  return navigator.userActivation?.isActive === true;
}

export async function setup(ctx) {
  const synth = window.speechSynthesis;
  const rateInput = document.querySelector("#speech-rate");
  const rateValue = document.querySelector("#speech-rate-value");
  const enabledInput = document.querySelector("#speech-enabled");
  const testButton = document.querySelector("#speech-test");

  let rate = clampRate(localStorage.getItem(RATE_KEY) ?? 1.7);
  let enabled = localStorage.getItem(ENABLED_KEY) !== "false";
  let selectedVoiceId = localStorage.getItem(VOICE_KEY) ?? "";
  let voices = [];
  let generation = 0;
  let pendingRestart = null;
  let startWatchdog = null;
  let activeUtterance = null;
  let primed = false;
  let voiceSelect = null;

  function report(reason, extra = {}) {
    ctx.events.emit("speech:state", {
      reason,
      supported: Boolean(synth && window.SpeechSynthesisUtterance),
      enabled,
      primed,
      speaking: Boolean(synth?.speaking),
      pending: Boolean(synth?.pending),
      voices: voices.length,
      russianVoices: voices.filter(isRussianVoice).length,
      selectedVoice: selectedVoiceId || null,
      userActive: Boolean(navigator.userActivation?.isActive),
      ...extra,
    });
  }

  function fallbackLiveRegion() {
    let live = document.getElementById("speech-fallback-live");
    if (live) return live;
    live = document.createElement("p");
    live.id = "speech-fallback-live";
    live.className = "sr-only";
    live.setAttribute("role", "status");
    live.setAttribute("aria-live", "assertive");
    live.setAttribute("aria-atomic", "true");
    document.body.appendChild(live);
    return live;
  }

  function announceFallback(text, reason) {
    if (!text) return;
    const live = fallbackLiveRegion();
    live.textContent = "";
    requestAnimationFrame(() => {
      live.textContent = String(text);
    });
    report("fallback", { fallbackReason: reason, textLength: String(text).length });
  }

  function ensureVoiceSelect() {
    if (voiceSelect) return voiceSelect;
    const grid = document.querySelector("#settings-panel .settings-grid");
    if (!grid) return null;
    const label = document.createElement("label");
    label.className = "setting-row";
    const caption = document.createElement("span");
    caption.textContent = "Голос";
    voiceSelect = document.createElement("select");
    voiceSelect.id = "speech-voice";
    label.append(caption, voiceSelect);
    grid.insertBefore(label, testButton ?? null);
    voiceSelect.addEventListener("change", () => {
      selectedVoiceId = voiceSelect.value;
      localStorage.setItem(VOICE_KEY, selectedVoiceId);
      report("voice-selected", { voice: selectedVoiceId || "auto" });
    });
    return voiceSelect;
  }

  function updateVoiceSelect() {
    const select = ensureVoiceSelect();
    if (!select) return;
    const russian = voices
      .filter(isRussianVoice)
      .slice()
      .sort((a, b) => scoreRussianVoice(b) - scoreRussianVoice(a));
    const previous = selectedVoiceId;
    select.replaceChildren();

    const auto = document.createElement("option");
    auto.value = "";
    const best = bestRussianVoice(voices);
    auto.textContent = best
      ? `Автоматически — ${best.name}`
      : "Автоматически — системный русский голос";
    select.appendChild(auto);

    for (const voice of russian) {
      const option = document.createElement("option");
      option.value = voiceId(voice);
      option.textContent = `${voice.name} (${voice.lang})${voice.localService ? "" : " — сетевой"}`;
      select.appendChild(option);
    }

    if (previous && russian.some((voice) => voiceId(voice) === previous)) {
      select.value = previous;
    } else {
      // Chrome and some Android engines can return an empty voice list during startup.
      // Keep the stored preference so voiceschanged can restore it when the list arrives.
      select.value = "";
    }
  }

  function refreshVoices(reason = "manual") {
    if (!synth?.getVoices) return [];
    try {
      const next = synth.getVoices() ?? [];
      voices = Array.from(next);
      updateVoiceSelect();
      report(`voices:${reason}`);
      return voices;
    } catch (error) {
      report(`voices:${reason}:failed`, { error: String(error?.message ?? error) });
      return voices;
    }
  }

  function chosenVoice() {
    if (selectedVoiceId) {
      const selected = voices.find((voice) => voiceId(voice) === selectedVoiceId);
      if (selected) return selected;
    }
    return bestRussianVoice(voices);
  }

  function syncUi() {
    if (rateInput) rateInput.value = String(rate);
    if (rateValue) rateValue.textContent = `${rate.toFixed(1)}×`;
    if (enabledInput) enabledInput.checked = enabled;
    updateVoiceSelect();
    ctx.events.emit("speech:settings-changed", {
      rate,
      enabled,
      supported: Boolean(synth && window.SpeechSynthesisUtterance),
      primed,
      voice: voiceId(chosenVoice()) || null,
    });
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
    report("stopped");
  }

  function makeUtterance(text, rateOverride = null) {
    const utterance = new SpeechSynthesisUtterance(String(text));
    utterance.lang = "ru-RU";
    utterance.rate = clampRate(rateOverride ?? rate);
    const voice = chosenVoice();
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
      report("speak-threw", { error: String(error?.message ?? error) });
      return false;
    }
  }

  function busy() {
    return Boolean(activeUtterance || pendingRestart != null || synth?.speaking || synth?.pending);
  }

  function primeFromGesture(reason) {
    if (!enabled || !synth || !window.SpeechSynthesisUtterance || primed) return false;
    try {
      synth.resume?.();
      const primer = new SpeechSynthesisUtterance("\u2063");
      primer.lang = "ru-RU";
      primer.volume = 0.01;
      primer.rate = 2;
      const voice = chosenVoice();
      if (voice) primer.voice = voice;
      synth.speak(primer);
      primed = true;
      syncUi();
      report(`primed:${reason}`);
      return true;
    } catch (error) {
      report(`prime:${reason}:failed`, { error: String(error?.message ?? error) });
      return false;
    }
  }

  function retryOrFallback(text, rateOverride, requestGeneration, retry, reason) {
    if (!enabled || requestGeneration !== generation) return;
    clearStartWatchdog();
    activeUtterance = null;
    try { synth?.cancel?.(); } catch {}
    try { synth?.resume?.(); } catch {}

    if (retry < MAX_START_RETRIES) {
      pendingRestart = setTimeout(() => {
        pendingRestart = null;
        startRequest(text, rateOverride, requestGeneration, retry + 1);
      }, INTERRUPT_RESTART_DELAY_MS * (retry + 1));
      return;
    }

    announceFallback(text, reason);
  }

  function startRequest(text, rateOverride, requestGeneration, retry = 0) {
    if (!enabled || !synth || requestGeneration !== generation) return null;

    refreshVoices("before-speak");
    const utterance = makeUtterance(text, rateOverride);
    let started = false;
    let pendingGraceUsed = false;
    activeUtterance = utterance;

    function armStartWatchdog(delay) {
      clearStartWatchdog();
      startWatchdog = setTimeout(() => {
        startWatchdog = null;
        if (!enabled || requestGeneration !== generation || started) return;
        if (synth?.speaking) {
          started = true;
          primed = true;
          report("watchdog-speaking", { retry });
          return;
        }
        if (synth?.pending && !pendingGraceUsed) {
          pendingGraceUsed = true;
          report("watchdog-pending", { retry });
          armStartWatchdog(PENDING_GRACE_MS);
          return;
        }
        report("start-timeout", { retry });
        retryOrFallback(text, rateOverride, requestGeneration, retry, "start-timeout");
      }, delay);
    }

    utterance.onstart = () => {
      if (requestGeneration !== generation) return;
      started = true;
      primed = true;
      clearStartWatchdog();
      report("started", { retry, voice: voiceId(utterance.voice) || null });
    };

    utterance.onend = () => {
      if (requestGeneration !== generation) return;
      clearStartWatchdog();
      if (activeUtterance === utterance) activeUtterance = null;
      report("ended", { retry });
    };

    utterance.onerror = (event) => {
      if (requestGeneration !== generation) return;
      const code = String(event?.error ?? "unknown");
      clearStartWatchdog();
      if (activeUtterance === utterance) activeUtterance = null;
      report("error", { retry, error: code });
      if (code === "canceled" || code === "interrupted") return;
      retryOrFallback(text, rateOverride, requestGeneration, retry, `speech-error:${code}`);
    };

    if (!speakNow(utterance)) {
      retryOrFallback(text, rateOverride, requestGeneration, retry, "speak-threw");
      return utterance;
    }

    armStartWatchdog(START_WATCHDOG_MS);
    return utterance;
  }

  function say(text, { interrupt = false, rateOverride = null } = {}) {
    const spokenText = String(text ?? "").trim();
    if (!enabled || !spokenText) return null;
    if (!synth || !window.SpeechSynthesisUtterance) {
      announceFallback(spokenText, "unsupported");
      return null;
    }

    if (!interrupt) {
      if (busy()) return null;
      const requestGeneration = ++generation;
      return startRequest(spokenText, rateOverride, requestGeneration);
    }

    const requestGeneration = ++generation;
    clearTimers();
    activeUtterance = null;
    try { synth.cancel(); } catch {}
    try { synth.resume?.(); } catch {}

    // On iOS/WebKit the first speak must be tied to a real user gesture.
    // Starting immediately here preserves that gesture instead of losing it in setTimeout.
    if (userGestureActive()) {
      primeFromGesture("say");
      return startRequest(spokenText, rateOverride, requestGeneration);
    }

    pendingRestart = setTimeout(() => {
      pendingRestart = null;
      startRequest(spokenText, rateOverride, requestGeneration);
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
    else if (userGestureActive()) primeFromGesture("enabled");
    syncUi();
  });

  testButton?.addEventListener("click", () => {
    primeFromGesture("test-button");
    say("Проверка игровой озвучки. Скорость речи настроена.", { interrupt: true });
  });

  if (synth?.addEventListener) {
    synth.addEventListener("voiceschanged", () => refreshVoices("event"));
  } else if (synth && "onvoiceschanged" in synth) {
    synth.onvoiceschanged = () => refreshVoices("event");
  }

  for (const delay of VOICE_REFRESH_DELAYS_MS) {
    setTimeout(() => refreshVoices(`timer-${delay}`), delay);
  }

  const prime = (reason) => {
    if (userGestureActive()) primeFromGesture(reason);
  };
  window.addEventListener("pointerdown", () => prime("pointerdown"), { capture: true, passive: true });
  window.addEventListener("touchstart", () => prime("touchstart"), { capture: true, passive: true });
  window.addEventListener("keydown", () => prime("keydown"), { capture: true });
  window.addEventListener("click", () => prime("click"), { capture: true, passive: true });
  window.addEventListener("pageshow", () => refreshVoices("pageshow"));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshVoices("visible");
  });

  ctx.services.provide("speech", {
    say,
    stop,
    prime(reason = "manual") { return primeFromGesture(reason); },
    refreshVoices,
    get rate() { return rate; },
    get enabled() { return enabled; },
    get supported() { return Boolean(synth && window.SpeechSynthesisUtterance); },
    get primed() { return primed; },
    get voices() { return voices.slice(); },
    get voice() { return chosenVoice(); },
  });

  refreshVoices("setup");
  syncUi();
  report("ready");
}
