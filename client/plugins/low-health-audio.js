export const HEARTBEAT_URL = "/assets/audio/core/heartbeat-fast.mp3";
export const HEARTBEAT_START_RATIO = 0.45;
export const HEARTBEAT_STOP_RATIO = 0.52;
export const REVERB_START_RATIO = 0.65;
export const REVERB_FULL_RATIO = 0.15;
export const MAX_REVERB_MIX = 0.78;
export const MUFFLE_MIN_HZ = 80;
export const MUFFLE_MAX_HZ = 18000;
export const EFFECT_UPDATE_EPSILON = 0.015;

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

export function muffleCutoffForIntensity(intensity) {
  const t = clamp01(intensity);
  const ratio = MUFFLE_MAX_HZ / MUFFLE_MIN_HZ;
  return MUFFLE_MIN_HZ * Math.pow(ratio, 1 - t);
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
  let lastAppliedIntensity = 0;
  let alive = false;

  function stopHeartbeat() {
    if (!heartbeat && !heartbeatStarting) return;
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

  function applyIntensity(intensity, force = false) {
    const next = clamp01(intensity);
    if (!force && Math.abs(next - lastAppliedIntensity) < EFFECT_UPDATE_EPSILON) return;
    lastAppliedIntensity = next;
    audio.setReverbMix(next * MAX_REVERB_MIX, 0.35);
    audio.setMuffleCutoff(muffleCutoffForIntensity(next), 0.35);
  }

  function resetEffects() {
    const alreadyReset = !alive && !heartbeat && !heartbeatStarting && lastAppliedIntensity === 0;
    alive = false;
    lastRatio = 1;
    stopHeartbeat();
    if (!alreadyReset) applyIntensity(0, true);
  }

  ctx.events.on("game:snapshot", (snapshot) => {
    const self = snapshot?.entities?.find((entity) => entity.id === network.playerId);
    // A transient snapshot without the local player must not tear down and
    // restart the heartbeat/master effects. Only an explicit dead state or a
    // network disconnect resets them.
    if (!self) return;
    if (!self.alive) {
      resetEffects();
      return;
    }

    alive = true;
    lastRatio = healthRatio(self.health, self.healthMax);
    const intensity = lowHealthIntensity(self.health, self.healthMax);
    applyIntensity(intensity);

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
    muffleMinHz: MUFFLE_MIN_HZ,
    muffleMaxHz: MUFFLE_MAX_HZ,
    reset: resetEffects,
  });
}
