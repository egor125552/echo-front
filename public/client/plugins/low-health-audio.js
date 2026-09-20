export const HEARTBEAT_URL = "/assets/audio/core/heartbeat-fast.mp3";
export const WOUNDED_URL = "/assets/audio/core/player-wounded.mp3";
export const HEARTBEAT_START_RATIO = 0.55;
export const HEARTBEAT_STOP_RATIO = 0.72;
export const HEARTBEAT_RETRY_MS = 1500;
export const REVERB_START_RATIO = 0.65;
export const REVERB_FULL_RATIO = 0.15;
export const MAX_REVERB_MIX = 0.78;
export const MAX_STUN_INTENSITY = 0.8; // 20% less maximum reverb and filtering depth.
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

// The cutoff curve is intentionally nonlinear: scaling intensity alone
// would change the deepest filter from 80 Hz to only ~144 Hz, which remains
// nearly inaudible. Open 20% of the *cutoff range* at maximum injury instead.
export function softenedMuffleCutoffForIntensity(intensity) {
  const raw = muffleCutoffForIntensity(intensity);
  return raw + (MUFFLE_MAX_HZ - raw) * (1 - MAX_STUN_INTENSITY) * clamp01(intensity);
}

export function heartbeatGainForRatio(ratio) {
  const normalized = clamp01(
    (HEARTBEAT_STOP_RATIO - clamp01(ratio))
      / (HEARTBEAT_STOP_RATIO - REVERB_FULL_RATIO),
  );
  if (normalized <= 0) return 0;
  return 0.02 + normalized * 0.7;
}

export function downedRecoveryAudioState(self, now) {
  const use = self?.stimulantUse;
  const full = { progress: 0, intensity: MAX_STUN_INTENSITY,
    cutoff: softenedMuffleCutoffForIntensity(1) };
  if (!self?.downed || !use?.downed) return full;
  const startedAt = Number(use.startedAt);
  const completesAt = Number(use.completesAt);
  if (!Number.isFinite(startedAt) || !Number.isFinite(completesAt) || completesAt <= startedAt) return full;
  const progress = clamp01((Number(now) - startedAt) / (completesAt - startedAt));
  const normalMaximum = Math.max(1, Number(self.normalHealthMax) || 200);
  const revivedHealth = Math.min(normalMaximum, 100);
  const recoveredIntensity = lowHealthIntensity(revivedHealth, normalMaximum);
  const targetCutoff = softenedMuffleCutoffForIntensity(recoveredIntensity);
  const startingCutoff = softenedMuffleCutoffForIntensity(1);
  const intensity = MAX_STUN_INTENSITY
    + (recoveredIntensity * MAX_STUN_INTENSITY - MAX_STUN_INTENSITY) * progress;
  const cutoff = startingCutoff * Math.pow(targetCutoff / startingCutoff, progress);
  return { progress, intensity, cutoff };
}

export async function setup(ctx) {
  const audio = ctx.services.get("audio");
  const network = ctx.services.get("network");
  let heartbeat = null;
  let heartbeatStarting = false;
  let heartbeatRetryAfter = 0;
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
    if (heartbeat || heartbeatStarting || !alive || Date.now() < heartbeatRetryAfter) return;
    heartbeatStarting = true;
    try {
      await audio.resume();
      const handle = await audio.playCentered(HEARTBEAT_URL, {
        gain: heartbeatGainForRatio(lastRatio),
        channel: "low-health-heartbeat",
        replace: true,
        loop: true,
        foreground: true,
      });
      if (!alive || lastRatio > HEARTBEAT_STOP_RATIO) {
        handle?.stop?.();
        return;
      }
      heartbeat = handle;
      heartbeatRetryAfter = 0;
      heartbeat.setGain?.(heartbeatGainForRatio(lastRatio), 0.28);
    } catch (error) {
      heartbeatRetryAfter = Date.now() + HEARTBEAT_RETRY_MS;
      console.error("Echo Front heartbeat audio error", error);
    } finally {
      heartbeatStarting = false;
    }
  }

  function applyIntensity(intensity) {
    const next = clamp01(intensity);
    const softened = next * MAX_STUN_INTENSITY;
    audio.setReverbMix(softened * MAX_REVERB_MIX);
    audio.setMuffleCutoff(softenedMuffleCutoffForIntensity(next));
  }

  function resetEffects() {
    alive = false;
    lastRatio = 1;
    woundedCueArmed = true;
    heartbeatRetryAfter = 0;
    audio.stopChannel("low-health-wounded");
    stopHeartbeat();
    applyIntensity(0);
  }

  function suspendEffectsForReconnect() {
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
    if (self.downed) {
      // Injury feedback owns the supplied heartbeat in this state. While a
      // revive stimulant is active, let the world open back up in sync with
      // the real server-side 6 second progress instead of snapping at the end.
      lastRatio = 1;
      stopHeartbeat();
      const recovery = downedRecoveryAudioState(self, snapshot.now);
      audio.setReverbMix(recovery.intensity * MAX_REVERB_MIX);
      audio.setMuffleCutoff(recovery.cutoff);
      return;
    }
    lastRatio = healthRatio(self.health, self.healthMax);
    applyIntensity(lowHealthIntensity(self.health, self.healthMax));

    if (lastRatio >= HEARTBEAT_STOP_RATIO) {
      woundedCueArmed = true;
      if (heartbeat) stopHeartbeat();
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
    playWoundedCue,
    reset: resetEffects,
  });
}
