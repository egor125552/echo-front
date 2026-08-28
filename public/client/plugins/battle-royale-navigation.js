export const manifest = {
  id: "battle-royale-navigation-client",
  version: "1.0.0",
  requires: [
    "keyboard-input",
    "cloudflare-session",
    "speech-settings",
    "spatial-audio-web",
  ],
};

const PING_INTERVAL_MS = 380;
const PING_RADIUS = 90;
const PING_REFERENCE_DISTANCE = 22;
const PING_ROLLOFF = 0.08;
const SPEECH_FALLBACK_MS = 520;

function createPingBuffer(context) {
  const duration = 0.085;
  const length = Math.max(1, Math.floor(context.sampleRate * duration));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  let phase = 0;
  for (let i = 0; i < length; i += 1) {
    const t = i / Math.max(1, length - 1);
    const frequency = 920 + 210 * t;
    phase += (Math.PI * 2 * frequency) / context.sampleRate;
    const attack = Math.min(1, t / 0.08);
    const release = Math.min(1, (1 - t) / 0.28);
    const envelope = Math.max(0, Math.min(attack, release));
    data[i] = Math.sin(phase) * envelope * 0.82;
  }
  return buffer;
}

function roundedMeters(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}

export async function setup(ctx) {
  const input = ctx.services.get("input");
  const network = ctx.services.get("network");
  const speech = ctx.services.get("speech");
  const audio = ctx.services.get("audio");
  const originalSample = input.sample.bind(input);
  const pingBuffer = createPingBuffer(audio.context);

  let navigationNextPressed = false;
  let navigationTogglePressed = false;
  let latestNavigation = null;
  let latestSelf = null;
  let connected = Boolean(network.connected);
  let announcementGeneration = 0;

  function liveRegion() {
    let live = document.getElementById("navigation-status-live");
    if (live) return live;
    live = document.createElement("p");
    live.id = "navigation-status-live";
    live.className = "sr-only";
    live.setAttribute("role", "status");
    live.setAttribute("aria-live", "assertive");
    live.setAttribute("aria-atomic", "true");
    document.body.appendChild(live);
    return live;
  }

  function voiceOverFallback(text, generation) {
    if (generation !== announcementGeneration) return;
    const live = liveRegion();
    live.textContent = "";
    requestAnimationFrame(() => {
      if (generation === announcementGeneration) live.textContent = text;
    });
  }

  function announce(text, interrupt = true) {
    if (!text) return;
    const generation = ++announcementGeneration;
    let started = false;
    const utterance = speech.say(text, { interrupt });
    if (!utterance) {
      voiceOverFallback(text, generation);
      return;
    }
    utterance.addEventListener?.("start", () => { started = true; }, { once: true });
    utterance.addEventListener?.("error", () => {
      if (!started) voiceOverFallback(text, generation);
    }, { once: true });
    setTimeout(() => {
      if (!started) voiceOverFallback(text, generation);
    }, SPEECH_FALLBACK_MS);
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
    if (event.code === "KeyM" || event.code === "Enter") event.preventDefault();
  }, { capture: true, passive: false });

  ctx.events.on("network:connected", () => { connected = true; });
  ctx.events.on("network:reconnected", () => { connected = true; });
  ctx.events.on("network:disconnected", () => {
    connected = false;
    navigationNextPressed = false;
    navigationTogglePressed = false;
    latestNavigation = null;
    latestSelf = null;
  });

  ctx.events.on("game:snapshot", (snapshot) => {
    if (snapshot?.mode !== "battle-royale") {
      latestNavigation = null;
      latestSelf = null;
      return;
    }
    latestNavigation = snapshot.navigation ?? null;
    latestSelf = snapshot?.entities?.find((entity) => entity.id === network.playerId) ?? null;
  });

  ctx.events.on("game:event", (packet) => {
    const payload = packet?.payload ?? {};
    if (payload.entityId !== network.playerId) return;

    if (packet.event === "navigation:selected") {
      announce(
        `${payload.targetName}. ${roundedMeters(payload.distanceMeters ?? payload.distance)} метров. Enter — выбрать.`,
        true,
      );
      return;
    }

    if (packet.event === "navigation:started") {
      const prefix = payload.replaced ? "Новая цель" : "Навигация";
      announce(
        `${prefix}: ${payload.targetName}. ${roundedMeters(payload.distanceMeters ?? payload.distance)} метров.`,
        true,
      );
      return;
    }

    if (packet.event === "navigation:stopped") {
      announce("Навигация выключена.", true);
      return;
    }

    if (packet.event === "navigation:reached") {
      announce(`Цель достигнута: ${payload.targetName}.`, true);
      return;
    }

    if (packet.event === "navigation:unavailable") {
      announce("Цель навигации недоступна.", true);
      return;
    }

    if (packet.event === "vehicle:dropzone-placed") {
      announce(`Машина поставлена рядом с местом посадки. ${roundedMeters(payload.distance)} метров.`, false);
    }
  });

  setInterval(() => {
    if (!connected || !latestNavigation?.active || !latestNavigation.checkpoint) return;
    const checkpoint = latestNavigation.checkpoint;
    const position = {
      x: Number(checkpoint.x) || 0,
      // This is horizontal guidance. Keep the beacon at listener height so it is
      // useful on foot, in a vehicle and while descending under a parachute.
      y: Number(latestSelf?.y) || 0,
      z: Number(checkpoint.z) || 0,
    };
    void audio.resume();
    audio.playSpatialBuffer(pingBuffer, position, {
      radius: PING_RADIUS,
      gain: 0.56,
      referenceDistance: PING_REFERENCE_DISTANCE,
      rolloffFactor: PING_ROLLOFF,
      airAbsorptionMinHz: 11000,
      loop: false,
    });
  }, PING_INTERVAL_MS);
}
