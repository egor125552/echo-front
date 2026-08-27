export const manifest = {
  id: "audio-resilience",
  requires: ["spatial-audio-web"],
};

const RETRY_COOLDOWN_MS = 650;

function errorText(error) {
  if (!error) return null;
  const text = String(error?.message ?? error);
  return text.length > 180 ? `${text.slice(0, 177)}...` : text;
}

export async function setup(ctx) {
  const audio = ctx.services.get("audio");
  const context = audio.context;
  let lastReportedState = null;
  let lastAttemptAt = -Infinity;
  let recoveryInFlight = null;

  function report(reason, error = null, force = false) {
    const state = String(context.state ?? "unknown");
    if (!force && !error && state === lastReportedState) return;
    lastReportedState = state;
    ctx.events.emit("game:event", {
      event: "client:audio-state",
      payload: {
        state,
        reason,
        error: errorText(error),
        userActive: Boolean(navigator.userActivation?.isActive),
        visible: document.visibilityState,
      },
    });
  }

  async function recover(reason, { force = false } = {}) {
    if (context.state === "running") {
      report(reason);
      return true;
    }
    if (context.state === "closed") {
      report(reason, new Error("AudioContext is closed"), true);
      return false;
    }

    const now = performance.now();
    if (!force && now - lastAttemptAt < RETRY_COOLDOWN_MS) return false;
    if (recoveryInFlight) return recoveryInFlight;
    lastAttemptAt = now;

    recoveryInFlight = (async () => {
      try {
        await audio.resume();
        report(reason, null, true);
        return context.state === "running";
      } catch (error) {
        report(`${reason}:resume-failed`, error, true);
        return false;
      } finally {
        recoveryInFlight = null;
      }
    })();
    return recoveryInFlight;
  }

  function recoverFromGesture(reason) {
    if (context.state !== "running") void recover(reason, { force: true });
  }

  context.addEventListener?.("statechange", () => {
    report("statechange", null, true);
    if (context.state !== "running" && document.visibilityState === "visible") {
      void recover("statechange-recovery");
    }
  });

  // Safari may suspend or interrupt WebAudio after focus/audio-route changes.
  // Any genuine user gesture is a legal opportunity to resume the shared graph.
  window.addEventListener("pointerdown", () => recoverFromGesture("pointerdown"), { capture: true, passive: true });
  window.addEventListener("touchstart", () => recoverFromGesture("touchstart"), { capture: true, passive: true });
  window.addEventListener("keydown", () => recoverFromGesture("keydown"), { capture: true });
  window.addEventListener("click", () => recoverFromGesture("click"), { capture: true, passive: true });
  window.addEventListener("pageshow", () => {
    if (context.state !== "running") void recover("pageshow");
  });
  document.addEventListener("visibilitychange", () => {
    report("visibilitychange", null, true);
    if (document.visibilityState === "visible" && context.state !== "running") {
      void recover("visibility-visible");
    }
  });

  ctx.events.on("network:connected", () => {
    void recover("network-connected", { force: true });
  });

  ctx.events.on("game:snapshot", () => {
    if (context.state !== "running") void recover("snapshot-recovery");
  });

  report("created", null, true);

  ctx.services.provide("audio-resilience", {
    get state() { return context.state; },
    recover(reason = "manual") { return recover(reason, { force: true }); },
  });
}
