export const manifest = {
  id: "battle-royale-navigation-client",
  version: "1.2.0",
  requires: [
    "keyboard-input",
    "cloudflare-session",
    "spatial-audio-web",
    "speech-settings",
  ],
};

const PING_RADIUS = 90;
const PING_REFERENCE_DISTANCE = 22;
const PING_ROLLOFF = 0.08;
const PING_MIN_INTERVAL_MS = 135;
const PING_MAX_INTERVAL_MS = 820;
const PING_DISTANCE_FOR_SLOWEST = 24;
const TERMINAL_EVENT_GRACE_MS = 750;

function createPingBuffer(context) {
  const duration = 0.052;
  const length = Math.max(1, Math.floor(context.sampleRate * duration));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  const frequency = 880;
  for (let i = 0; i < length; i += 1) {
    const t = i / context.sampleRate;
    const progress = i / Math.max(1, length - 1);
    const attack = Math.min(1, progress / 0.12);
    const release = Math.min(1, (1 - progress) / 0.35);
    data[i] = Math.sin(Math.PI * 2 * frequency * t) * Math.max(0, Math.min(attack, release)) * 0.78;
  }
  return buffer;
}

function distance2(a, b) {
  return Math.hypot(
    (Number(a?.x) || 0) - (Number(b?.x) || 0),
    (Number(a?.z) || 0) - (Number(b?.z) || 0),
  );
}

function pingInterval(distance) {
  const normalized = Math.max(0, Math.min(1, (Number(distance) || 0) / PING_DISTANCE_FOR_SLOWEST));
  return Math.round(
    PING_MIN_INTERVAL_MS
      + (PING_MAX_INTERVAL_MS - PING_MIN_INTERVAL_MS) * Math.pow(normalized, 0.78),
  );
}

function roundedMeters(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}

export async function setup(ctx) {
  const input = ctx.services.get("input");
  const network = ctx.services.get("network");
  const audio = ctx.services.get("audio");
  const speech = ctx.services.get("speech");
  const live = document.querySelector("#announcer");
  const originalSample = input.sample.bind(input);
  const pingBuffer = createPingBuffer(audio.context);

  let navigationNextPressed = false;
  let navigationTogglePressed = false;
  let latestNavigation = null;
  let latestSelf = null;
  let connected = Boolean(network.connected);
  let pingTimer = null;
  let lastSelectedId = null;
  let lastActiveId = null;
  let terminalEventAt = -Infinity;

  function announce(text, { interrupt = true } = {}) {
    if (!text) return;
    if (live) {
      live.textContent = "";
      requestAnimationFrame(() => { live.textContent = text; });
    }
    // speech-settings is deliberately latest-wins and never builds a TTS queue.
    speech.say(text, { interrupt });
  }

  input.sample = () => {
    const sampled = originalSample();
    const next = navigationNextPressed;
    const toggle = navigationTogglePressed;
    navigationNextPressed = false;
    navigationTogglePressed = false;
    return {
      ...sampled,
      navigationNextPressed: next,
      navigationTogglePressed: toggle,
    };
  };

  function triggerNavigation(code) {
    if (!connected) return;
    if (code === "KeyM") navigationNextPressed = true;
    if (code === "Enter") navigationTogglePressed = true;
    void audio.resume();
    ctx.events.emit("input:changed", { reason: `navigation:${code}` });
  }

  window.addEventListener("keydown", (event) => {
    if (!connected || event.repeat) return;
    if (event.code !== "KeyM" && event.code !== "Enter") return;
    event.preventDefault();
    triggerNavigation(event.code);
  }, { capture: true, passive: false });

  window.addEventListener("keyup", (event) => {
    if (!connected) return;
    if (event.code !== "KeyM" && event.code !== "Enter") return;
    event.preventDefault();
  }, { capture: true, passive: false });

  function clearPingTimer() {
    if (pingTimer == null) return;
    clearTimeout(pingTimer);
    pingTimer = null;
  }

  function schedulePing(delay = 0) {
    clearPingTimer();
    pingTimer = setTimeout(playPing, Math.max(0, delay));
  }

  function playPing() {
    pingTimer = null;
    if (!connected || !latestNavigation?.active || !latestNavigation.checkpoint || !latestSelf) {
      schedulePing(PING_MAX_INTERVAL_MS);
      return;
    }

    const checkpoint = latestNavigation.checkpoint;
    const distance = Number.isFinite(Number(checkpoint.distance))
      ? Number(checkpoint.distance)
      : distance2(latestSelf, checkpoint);
    const position = {
      x: Number(checkpoint.x) || 0,
      y: Number(latestSelf.y) || 0,
      z: Number(checkpoint.z) || 0,
    };

    void audio.resume();
    audio.playSpatialBuffer(pingBuffer, position, {
      radius: PING_RADIUS,
      gain: 0.58,
      referenceDistance: PING_REFERENCE_DISTANCE,
      rolloffFactor: PING_ROLLOFF,
      airAbsorptionMinHz: 11000,
      loop: false,
    });
    schedulePing(pingInterval(distance));
  }

  function resetNavigationState() {
    navigationNextPressed = false;
    navigationTogglePressed = false;
    latestNavigation = null;
    latestSelf = null;
    lastSelectedId = null;
    lastActiveId = null;
    terminalEventAt = -Infinity;
    clearPingTimer();
  }

  ctx.events.on("network:connected", () => {
    connected = true;
    schedulePing(0);
  });
  ctx.events.on("network:reconnected", () => {
    connected = true;
    schedulePing(0);
  });
  ctx.events.on("network:disconnected", () => {
    connected = false;
    resetNavigationState();
  });

  ctx.events.on("game:snapshot", (snapshot) => {
    if (snapshot?.mode !== "battle-royale") {
      resetNavigationState();
      return;
    }

    const previousActive = Boolean(latestNavigation?.active);
    const nextNavigation = snapshot.navigation ?? null;
    const selected = nextNavigation?.selected ?? null;
    const activeTarget = nextNavigation?.target ?? null;
    const selectedId = selected?.id ?? null;
    const activeId = nextNavigation?.active ? activeTarget?.id ?? null : null;

    latestNavigation = nextNavigation;
    latestSelf = snapshot?.entities?.find((entity) => entity.id === network.playerId) ?? null;

    // Selection speech follows the same snapshot that drives the audible beacon.
    // If the beacon state arrived, this announcement path necessarily arrived too.
    if (selectedId && selectedId !== lastSelectedId) {
      announce(`${selected.name || "Цель"}. ${roundedMeters(selected.distance)} метров. Enter — выбрать.`);
    }

    if (activeId && activeId !== lastActiveId) {
      const distance = Number.isFinite(Number(nextNavigation?.remainingDistance))
        ? nextNavigation.remainingDistance
        : activeTarget?.distance;
      announce(`Маршрут: ${activeTarget?.name || "цель"}. ${roundedMeters(distance)} метров.`);
      schedulePing(0);
    } else if (previousActive && !nextNavigation?.active) {
      if (performance.now() - terminalEventAt > TERMINAL_EVENT_GRACE_MS) {
        announce("Навигация выключена.");
      }
    }

    lastSelectedId = selectedId;
    lastActiveId = activeId;
  });

  ctx.events.on("game:event", (packet) => {
    const payload = packet?.payload ?? {};
    if (payload.entityId !== network.playerId) return;

    // Selection/start are intentionally snapshot-driven above. These terminal
    // events keep the more specific messages while retaining snapshot fallback.
    if (packet.event === "navigation:stopped") {
      terminalEventAt = performance.now();
      announce("Навигация выключена.");
      return;
    }
    if (packet.event === "navigation:reached") {
      terminalEventAt = performance.now();
      announce(`Цель достигнута: ${payload.targetName || "цель"}.`);
      return;
    }
    if (packet.event === "navigation:unavailable") {
      terminalEventAt = performance.now();
      announce("Цель навигации недоступна.");
      return;
    }
    if (packet.event === "vehicle:dropzone-placed") {
      const name = payload.vehicleName || "Внедорожник";
      announce(`${name} рядом с местом посадки. ${roundedMeters(payload.distance)} метров.`, { interrupt: false });
    }
  });

  if (connected) schedulePing(PING_MAX_INTERVAL_MS);
}
