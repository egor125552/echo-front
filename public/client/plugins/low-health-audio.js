export const HEARTBEAT_URL = "/assets/audio/core/heartbeat-fast.mp3";
export const HEARTBEAT_START_RATIO = 0.45;
export const HEARTBEAT_STOP_RATIO = 0.52;
export const REVERB_START_RATIO = 0.65;
export const REVERB_FULL_RATIO = 0.15;
export const MAX_REVERB_MIX = 0.78;

export const manifest = {
  id: "low-health-audio",
  requires: ["spatial-audio-web", "cloudflare-session"],
};

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

export function healthRatio(health, maximum) {
  const max = Number(maximum);
  if (!(max > 0)) return 1;
  return clamp01(Number(health) / max);
}

export function lowHealthIntensity(health, maximum) {
  const ratio = healthRatio(health, maximum);
  if (ratio >= REVERB_START_RATIO) return 0;
  if (ratio <= REVERB_FULL_RATIO) return 1;
  return (REVERB_START_RATIO - ratio) / (REVERB_START_RATIO - REVERB_FULL_RATIO);
}

export function heartbeatGainForRatio(ratio) {
  const critical = clamp01((HEARTBEAT_STOP_RATIO - ratio) / HEARTBEAT_STOP_RATIO);
  return 0.5 + critical * 0.28;
}

export async function setup(ctx) {
  const audio = ctx.services.get("audio");
  const network = ctx.services.get("network");
  let heartbeat = null;
  let heartbeatStarting = false;
  let heartbeatUnavailable = false;
  let lastRatio = 1;
  let alive = false;

  function stopHeartbeat() {
    heartbeat?.stop?.();
    heartbeat = null;
    heartbeatStarting = false;
    audio.stopChannel("low-health-heartbeat");
  }

  async function startHeartbeat() {
    if (heartbeat || heartbeatStarting || heartbeatUnavailable || !alive) return;
    heartbeatStarting = true;
    try {
      const handle = await audio.playCentered(HEARTBEAT_URL, {
        gain: heartbeatGainForRatio(lastRatio),
        channel: "low-health-heartbeat",
        replace: true,
        loop: true,
      });
      if (!alive || lastRatio >= HEARTBEAT_STOP_RATIO) {
        handle?.stop?.();
        return;
      }
      heartbeat = handle;
    } catch (error) {
      heartbeatUnavailable = true;
      console.error("Echo Front heartbeat audio error", error);
    } finally {
      heartbeatStarting = false;
    }
  }

  function resetEffects() {
    alive = false;
    lastRatio = 1;
    stopHeartbeat();
    audio.setReverbMix(0, 0.18);
  }

  ctx.events.on("game:snapshot", (snapshot) => {
    const self = snapshot?.entities?.find((entity) => entity.id === network.playerId);
    if (!self || !self.alive) {
      resetEffects();
      return;
    }

    alive = true;
    lastRatio = healthRatio(self.health, self.healthMax);
    const intensity = lowHealthIntensity(self.health, self.healthMax);
    audio.setReverbMix(intensity * MAX_REVERB_MIX, 0.3);

    if (lastRatio <= HEARTBEAT_START_RATIO) {
      if (heartbeat) heartbeat.setGain?.(heartbeatGainForRatio(lastRatio), 0.2);
      else void startHeartbeat();
    } else if (lastRatio >= HEARTBEAT_STOP_RATIO) {
      stopHeartbeat();
    } else if (heartbeat) {
      heartbeat.setGain?.(heartbeatGainForRatio(lastRatio), 0.2);
    }
  });

  ctx.events.on("network:disconnected", resetEffects);

  ctx.services.provide("low-health-audio", {
    heartbeatUrl: HEARTBEAT_URL,
    reset: resetEffects,
  });
}
