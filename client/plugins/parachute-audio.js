export const manifest = {
  id: "parachute-audio",
  requires: ["cloudflare-session", "spatial-audio-web"],
};

const ROOT = "/assets/audio/core/parachute";

const WIND = [
  `${ROOT}/wind/eye-of-storm.mp3`,
  `${ROOT}/wind/turbulent-wind.mp3`,
  `${ROOT}/wind/wind-rush.mp3`,
];

const OPEN_AIR = [
  `${ROOT}/open-air/cut-sweep.mp3`,
  `${ROOT}/open-air/debris-whoosh.mp3`,
  `${ROOT}/open-air/deploy-swish.mp3`,
];

const CLOTH = [
  `${ROOT}/cloth/canvas-flap.mp3`,
  `${ROOT}/cloth/page-flutter.mp3`,
  `${ROOT}/cloth/paper-rattle.mp3`,
  `${ROOT}/cloth/rummage.mp3`,
  `${ROOT}/cloth/wrapping-flutter.mp3`,
];

const RIG = [
  `${ROOT}/rig/carabiner-lock.mp3`,
  `${ROOT}/rig/carabiner-rope.mp3`,
  `${ROOT}/rig/metal-rattle.mp3`,
  `${ROOT}/rig/spring-wire.mp3`,
  `${ROOT}/rig/tension-thunk.mp3`,
];

const CLOSE = [
  `${ROOT}/close/measuring-tape.mp3`,
  `${ROOT}/close/retract.mp3`,
];

const LANDING = [
  `${ROOT}/landing/body-impact.mp3`,
  `${ROOT}/landing/gear-clatter.mp3`,
  `${ROOT}/landing/ground-thump.mp3`,
];

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function randomBetween(minimum, maximum) {
  return minimum + Math.random() * (maximum - minimum);
}

function pick(list, excluded = null) {
  const candidates = excluded ? list.filter((entry) => entry !== excluded) : list;
  return candidates[Math.floor(Math.random() * candidates.length)] ?? list[0];
}

function delayed(callback, minimumMs, maximumMs = minimumMs) {
  const delay = Math.round(randomBetween(minimumMs, maximumMs));
  setTimeout(callback, delay);
}

export async function setup(ctx) {
  const network = ctx.services.get("network");
  const audio = ctx.services.get("audio");
  let windPrimary = null;
  let windSecondary = null;
  let windMode = "off";
  let windGeneration = 0;
  let observedPhase = null;

  async function playOne(url, gain) {
    try {
      await audio.resume();
      return await audio.playCentered(url, {
        gain,
        foreground: true,
      });
    } catch {
      return null;
    }
  }

  function playRandom(list, gainMinimum, gainMaximum, exclude = null) {
    const url = pick(list, exclude);
    void playOne(url, randomBetween(gainMinimum, gainMaximum));
    return url;
  }

  function stopWindSoon() {
    const primary = windPrimary;
    const secondary = windSecondary;
    windPrimary = null;
    windSecondary = null;
    primary?.setGain?.(0, 0.16);
    secondary?.setGain?.(0, 0.18);
    setTimeout(() => {
      primary?.stop?.();
      secondary?.stop?.();
    }, 700);
  }

  function targetWindGains(mode, verticalVelocity = 0) {
    const fall = clamp01(Math.abs(Math.min(0, Number(verticalVelocity) || 0)) / 16);
    if (mode === "freefall") {
      return {
        primary: 0.54 + fall * 0.34,
        secondary: 0.20 + fall * 0.25,
      };
    }
    if (mode === "deployed") {
      return {
        primary: 0.20 + fall * 0.15,
        secondary: 0.07 + fall * 0.10,
      };
    }
    return { primary: 0, secondary: 0 };
  }

  async function ensureWind(mode, verticalVelocity = 0) {
    windMode = mode;
    const gains = targetWindGains(mode, verticalVelocity);
    if (mode === "off") {
      windGeneration += 1;
      stopWindSoon();
      return;
    }

    if (!windPrimary || !windSecondary) {
      const generation = ++windGeneration;
      const first = pick(WIND);
      const second = pick(WIND, first);
      try {
        await audio.resume();
        const [primary, secondary] = await Promise.all([
          audio.playCentered(first, { gain: 0, loop: true, foreground: true }),
          audio.playCentered(second, { gain: 0, loop: true, foreground: true }),
        ]);
        if (generation !== windGeneration || windMode === "off") {
          primary?.stop?.();
          secondary?.stop?.();
          return;
        }
        windPrimary = primary;
        windSecondary = secondary;
      } catch {
        return;
      }
    }

    windPrimary?.setGain?.(gains.primary, mode === "freefall" ? 0.22 : 0.34);
    windSecondary?.setGain?.(gains.secondary, mode === "freefall" ? 0.28 : 0.40);
  }

  function playDeployment() {
    const air = playRandom(OPEN_AIR, 0.32, 0.52);
    delayed(() => playRandom(CLOTH, 0.68, 0.96), 24, 62);
    delayed(() => playRandom(RIG, 0.25, 0.46), 82, 145);
    if (Math.random() < 0.48) {
      delayed(() => playRandom(CLOTH, 0.18, 0.34), 125, 215);
    }
    if (Math.random() < 0.35) {
      delayed(() => playRandom(RIG, 0.12, 0.24), 175, 280);
    }
    return air;
  }

  function playCut() {
    const close = playRandom(CLOSE, 0.48, 0.72);
    delayed(() => playRandom(CLOTH, 0.34, 0.56), 20, 68);
    delayed(() => playRandom(RIG, 0.16, 0.31), 74, 145);
    if (Math.random() < 0.40) delayed(() => playRandom(CLOTH, 0.12, 0.24), 135, 230);
    return close;
  }

  function playLanding(impactSpeed = 0) {
    const normalized = clamp01((Number(impactSpeed) || 0) / 12);
    playRandom(LANDING, 0.38 + normalized * 0.30, 0.55 + normalized * 0.38);
    delayed(() => playRandom(LANDING, 0.18, 0.34), 22, 62);
    if (Math.random() < 0.72) delayed(() => playRandom(RIG, 0.10, 0.22), 55, 125);
    if (Math.random() < 0.52) delayed(() => playRandom(CLOTH, 0.08, 0.18), 85, 170);
  }

  function updateFromParachuteState(state) {
    const phase = state?.phase ?? "grounded";
    observedPhase = phase;
    if (phase === "freefall") {
      void ensureWind("freefall", state?.verticalVelocity);
      return;
    }
    if (phase === "deployed") {
      void ensureWind("deployed", state?.verticalVelocity);
      return;
    }
    void ensureWind("off", 0);
  }

  ctx.events.on("game:snapshot", (snapshot) => {
    if (snapshot?.mode !== "battle-royale") return;
    const self = snapshot.entities?.find((entity) => entity.id === network.playerId);
    if (!self?.parachute) return;
    updateFromParachuteState(self.parachute);
  });

  ctx.events.on("game:event", (packet) => {
    const payload = packet?.payload ?? {};
    if (payload.entityId !== network.playerId) return;
    if (packet.event === "parachute:launched") {
      observedPhase = "freefall";
      void ensureWind("freefall", payload.verticalVelocity ?? -1.5);
      return;
    }
    if (packet.event === "parachute:deployed") {
      playDeployment();
      observedPhase = "deployed";
      void ensureWind("deployed", payload.verticalVelocity);
      return;
    }
    if (packet.event === "parachute:cut") {
      playCut();
      observedPhase = "freefall";
      void ensureWind("freefall", payload.verticalVelocity);
      return;
    }
    if (packet.event === "parachute:landed") {
      playLanding(payload.impactSpeed);
      observedPhase = "landed";
      void ensureWind("off", 0);
    }
  });

  ctx.events.on("network:disconnected", () => {
    observedPhase = null;
    windMode = "off";
    windGeneration += 1;
    stopWindSoon();
  });

  ctx.services.provide("parachute-audio", {
    get phase() { return observedPhase; },
    playDeployment,
    playCut,
    playLanding,
  });
}
