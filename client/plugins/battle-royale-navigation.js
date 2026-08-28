export const manifest = {
  id: "battle-royale-navigation-client",
  version: "1.1.0",
  requires: [
    "keyboard-input",
    "cloudflare-session",
    "spatial-audio-web",
  ],
};

const PING_RADIUS = 90;
const PING_REFERENCE_DISTANCE = 22;
const PING_ROLLOFF = 0.08;
const PING_MIN_INTERVAL_MS = 135;
const PING_MAX_INTERVAL_MS = 820;
const PING_DISTANCE_FOR_SLOWEST = 24;

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

export async function setup(ctx) {
  const input = ctx.services.get("input");
  const network = ctx.services.get("network");
  const audio = ctx.services.get("audio");
  const originalSample = input.sample.bind(input);
  const pingBuffer = createPingBuffer(audio.context);

  let navigationNextPressed = false;
  let navigationTogglePressed = false;
  let latestNavigation = null;
  let latestSelf = null;
  let connected = Boolean(network.connected);
  let pingTimer = null;

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
    if (event.code === "KeyM" || event.code === "Enter") return;
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
    navigationNextPressed = false;
    navigationTogglePressed = false;
    latestNavigation = null;
    latestSelf = null;
    clearPingTimer();
  });

  ctx.events.on("game:snapshot", (snapshot) => {
    if (snapshot?.mode !== "battle-royale") {
      latestNavigation = null;
      latestSelf = null;
      return;
    }
    const wasActive = Boolean(latestNavigation?.active);
    latestNavigation = snapshot.navigation ?? null;
    latestSelf = snapshot?.entities?.find((entity) => entity.id === network.playerId) ?? null;
    if (!wasActive && latestNavigation?.active) schedulePing(0);
  });

  if (connected) schedulePing(PING_MAX_INTERVAL_MS);
}
