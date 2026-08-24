export const HEARTBEAT_URL = "/assets/audio/core/heartbeat-fast.mp3";
export const WOUNDED_URL = "/assets/audio/core/player-wounded.mp3";
export const HEARTBEAT_START_RATIO = 0.45;
export const HEARTBEAT_STOP_RATIO = 0.65;
export const REVERB_START_RATIO = 0.65;
export const REVERB_FULL_RATIO = 0.15;
export const MAX_REVERB_MIX = 0.78;
export const MUFFLE_MIN_HZ = 80;
export const MUFFLE_MAX_HZ = 18000;
export const MUFFLE_CURVE_POWER = 3.5;

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
  const injury = clamp01(intensity);
  const openSound = Math.pow(1 - injury, MUFFLE_CURVE_POWER);
  return MUFFLE_MIN_HZ + openSound * (MUFFLE_MAX_HZ - MUFFLE_MIN_HZ);
}

export function heartbeatGainForRatio(ratio) {
  const normalized = clamp01(
    (HEARTBEAT_STOP_RATIO - clamp01(ratio))
      / (HEARTBEAT_STOP_RATIO - REVERB_FULL_RATIO),
  );
  if (normalized <= 0) return 0;
  return 0.02 + normalized * 0.7;
}

export async function setup(ctx) {
  const audio = ctx.services.get("audio");
  const network = ctx.services.get("network");
  let heartbeat = null;
  let heartbeatStarting = false;
  let heartbeatUnavailable = false;
  let woundedCueArmed = true;
  let lastRatio = 1;
  let alive = false;

  function stopHeartbeat() {
    if (!heartbeat && !heartbeatStarting) return;
    heartbeat?.stop?.();
    heartbeat = null;
    heartbeatStarting = false;
    audio.stopChannel("low-health-heartbeat");
  }

  async function playWoundedCue() {
    try {
      await audio.playCentered(WOUNDED_URL, {
        gain: 1.05,
        channel: "low-health-wounded",
        replace: true,
        foreground: true,
      });
    } catch (error) {
      console.error("Echo Front wounded cue audio error", error);
    }
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
      if (!alive) {
        handle?.stop?.();
        return;
      }
      heartbeat = handle;
      heartbeat.setGain?.(heartbeatGainForRatio(lastRatio), 0.28);
    } catch (error) {
      heartbeatUnavailable = true;
      console.error("Echo Front heartbeat audio error", error);
    } finally {
      heartbeatStarting = false;
    }
  }

  function applyIntensity(intensity) {
    const next = clamp01(intensity);
    audio.setReverbMix(next * MAX_REVERB_MIX);
    audio.setMuffleCutoff(muffleCutoffForIntensity(next));
  }

  function resetEffects() {
    alive = false;
    lastRatio = 1;
    woundedCueArmed = true;
    audio.stopChannel("low-health-wounded");
    stopHeartbeat();
    applyIntensity(0);
  }

  function suspendEffectsForReconnect() {
    // A network hiccup is not a new life. Do not re-arm the wounded cue or
    // recreate the heartbeat; just fade the local injury presentation until the
    // authoritative snapshot returns.
    audio.stopChannel("low-health-wounded");
    heartbeat?.setGain?.(0, 0.2);
    applyIntensity(0);
  }

  ctx.events.on("game:snapshot", (snapshot) => {
    const self = snapshot?.entities?.find((entity) => entity.id === network.playerId);
    if (!self) return;
    if (!self.alive) {
      resetEffects();
      return;
    }

    alive = true;
    lastRatio = healthRatio(self.health, self.healthMax);
    applyIntensity(lowHealthIntensity(self.health, self.healthMax));

    if (lastRatio >= HEARTBEAT_STOP_RATIO) {
      woundedCueArmed = true;
    }

    if (lastRatio <= HEARTBEAT_START_RATIO) {
      if (woundedCueArmed) {
        woundedCueArmed = false;
        void playWoundedCue();
      }
      if (!heartbeat) void startHeartbeat();
    }

    if (heartbeat) {
      heartbeat.setGain?.(heartbeatGainForRatio(lastRatio), 0.28);
    }
  });

  ctx.events.on("network:disconnected", suspendEffectsForReconnect);

  ctx.services.provide("low-health-audio", {
    heartbeatUrl: HEARTBEAT_URL,
    woundedUrl: WOUNDED_URL,
    muffleMinHz: MUFFLE_MIN_HZ,
    muffleMaxHz: MUFFLE_MAX_HZ,
    reset: resetEffects,
  });
}
