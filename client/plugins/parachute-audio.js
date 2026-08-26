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

function later(callback, minimumMs, maximumMs = minimumMs) {
  const delay = Math.round(randomBetween(minimumMs, maximumMs));
  setTimeout(callback, delay);
}

export async function setup(ctx) {
  const network = ctx.services.get("network");
  const audio = ctx.services.get("audio");

  let windHandles = [];
  let windGeneration = 0;
  let observedPhase = "grounded";
  let openingGeneration = 0;
  let landingApproachActive = false;
  let nextFlightFoleyAt = 0;
  let lastCloth = null;
  let lastRig = null;

  async function playOne(url, gain, fadeIn = 0) {
    try {
      await audio.resume();
      const handle = await audio.playCentered(url, {
        gain: fadeIn > 0 ? 0 : gain,
        foreground: true,
      });
      if (fadeIn > 0) handle?.setGain?.(gain, fadeIn);
      return handle;
    } catch {
      return null;
    }
  }

  function playRandom(list, gainMinimum, gainMaximum, exclude = null, fadeIn = 0) {
    const url = pick(list, exclude);
    void playOne(url, randomBetween(gainMinimum, gainMaximum), fadeIn);
    return url;
  }

  async function ensureWind() {
    if (windHandles.length === WIND.length) return;
    const generation = ++windGeneration;
    try {
      await audio.resume();
      const handles = await Promise.all(WIND.map((url) => audio.playCentered(url, {
        gain: 0,
        loop: true,
        foreground: true,
      })));
      if (generation !== windGeneration) {
        for (const handle of handles) handle?.stop?.();
        return;
      }
      windHandles = handles;
    } catch {
      windHandles = [];
    }
  }

  function windTargets(state = {}) {
    const phase = state.phase ?? "grounded";
    if (phase !== "freefall" && phase !== "deployed") return [0, 0, 0];

    const vertical = Math.abs(Math.min(0, Number(state.verticalVelocity) || 0));
    const glide = Math.max(0, Number(state.glideSpeed) || 0);
    const airSpeed = Math.max(Number(state.airSpeed) || 0, Math.hypot(vertical, glide));
    const air = clamp01(airSpeed / 52);

    if (phase === "freefall") {
      return [
        0.08 + 0.72 * air,
        0.025 + 0.34 * air * air,
        0.035 + 0.40 * air,
      ];
    }

    const inflation = clamp01(state.inflation);
    const glideEnergy = clamp01(glide / 5.4);
    const turnEnergy = clamp01(Math.abs(Number(state.turnRate) || 0) / 1.05);
    const brake = clamp01(state.brake);
    const landing = state.landingApproach ? 1 : 0;

    return [
      (0.48 * (1 - inflation) + 0.12 + 0.08 * air) * (1 - 0.18 * landing),
      0.035 + 0.12 * inflation + 0.22 * turnEnergy + 0.06 * brake,
      0.03 + 0.34 * inflation * glideEnergy + 0.10 * inflation,
    ];
  }

  async function updateWind(state = {}, transition = 0.24) {
    const phase = state.phase ?? "grounded";
    observedPhase = phase;
    if (phase === "freefall" || phase === "deployed") await ensureWind();
    const targets = windTargets(state);
    for (let index = 0; index < windHandles.length; index += 1) {
      windHandles[index]?.setGain?.(targets[index] ?? 0, transition);
    }
  }

  function fadeOutWind(seconds = 0.55) {
    for (const handle of windHandles) handle?.setGain?.(0, seconds);
  }

  function playDeployment() {
    const generation = ++openingGeneration;
    const air = playRandom(OPEN_AIR, 0.18, 0.32, null, 0.08);

    later(() => {
      if (generation !== openingGeneration) return;
      lastCloth = playRandom(CLOTH, 0.20, 0.34, lastCloth, 0.10);
    }, 120, 210);

    later(() => {
      if (generation !== openingGeneration) return;
      lastCloth = playRandom(CLOTH, 0.36, 0.56, lastCloth, 0.12);
    }, 390, 570);

    later(() => {
      if (generation !== openingGeneration) return;
      lastRig = playRandom(RIG, 0.18, 0.31, lastRig, 0.08);
    }, 650, 850);

    later(() => {
      if (generation !== openingGeneration) return;
      lastCloth = playRandom(CLOTH, 0.44, 0.66, lastCloth, 0.10);
    }, 880, 1120);

    later(() => {
      if (generation !== openingGeneration) return;
      lastRig = playRandom(RIG, 0.24, 0.40, lastRig, 0.06);
    }, 1180, 1480);

    return air;
  }

  function playCut() {
    openingGeneration += 1;
    playRandom(CLOSE, 0.42, 0.64, null, 0.04);
    later(() => {
      lastCloth = playRandom(CLOTH, 0.26, 0.44, lastCloth, 0.06);
    }, 35, 95);
    later(() => {
      lastRig = playRandom(RIG, 0.12, 0.24, lastRig, 0.04);
    }, 110, 190);
  }

  function playLandingApproach() {
    lastRig = playRandom(RIG, 0.07, 0.13, lastRig, 0.18);
    later(() => {
      lastCloth = playRandom(CLOTH, 0.07, 0.14, lastCloth, 0.16);
    }, 180, 420);
  }

  function playLanding(impactSpeed = 0) {
    const impact = clamp01((Number(impactSpeed) || 0) / 18);
    playRandom(LANDING, 0.32 + impact * 0.42, 0.46 + impact * 0.48);
    later(() => playRandom(LANDING, 0.12 + impact * 0.10, 0.23 + impact * 0.14), 24, 68);
    later(() => {
      lastRig = playRandom(RIG, 0.07, 0.17, lastRig, 0.05);
    }, 70, 150);
    if (Math.random() < 0.62) {
      later(() => {
        lastCloth = playRandom(CLOTH, 0.06, 0.14, lastCloth, 0.12);
      }, 120, 240);
    }
  }

  function maybeFlightFoley(state) {
    if (state?.phase !== "deployed" || clamp01(state.inflation) < 0.92) return;
    const now = performance.now();
    if (now < nextFlightFoleyAt) return;

    const turn = clamp01(Math.abs(Number(state.turnRate) || 0) / 1.05);
    const brake = clamp01(state.brake);
    const activity = Math.max(turn, brake * 0.75);
    const baseGain = 0.035 + activity * 0.08;

    if (Math.random() < 0.62) {
      lastCloth = playRandom(CLOTH, baseGain, baseGain + 0.045, lastCloth, 0.06);
    } else {
      lastRig = playRandom(RIG, baseGain * 0.70, baseGain, lastRig, 0.04);
    }
    nextFlightFoleyAt = now + randomBetween(1700, activity > 0.45 ? 2800 : 4400);
  }

  function updateFromState(state) {
    if (!state) return;
    void updateWind(state, state.phase === observedPhase ? 0.20 : 0.36);

    const approach = Boolean(state.landingApproach);
    if (approach && !landingApproachActive) playLandingApproach();
    landingApproachActive = approach;
    maybeFlightFoley(state);
  }

  ctx.events.on("game:snapshot", (snapshot) => {
    if (snapshot?.mode !== "battle-royale") return;
    const self = snapshot.entities?.find((entity) => entity.id === network.playerId);
    if (!self?.parachute) return;
    updateFromState(self.parachute);
  });

  ctx.events.on("game:event", (packet) => {
    const payload = packet?.payload ?? {};
    if (payload.entityId !== network.playerId) return;

    if (packet.event === "parachute:launched") {
      landingApproachActive = false;
      nextFlightFoleyAt = performance.now() + 1600;
      void updateWind({ phase: "freefall", verticalVelocity: payload.verticalVelocity ?? -1.5, airSpeed: 1.5 }, 0.65);
      return;
    }

    if (packet.event === "parachute:deployed") {
      playDeployment();
      void updateWind({ phase: "deployed", verticalVelocity: payload.verticalVelocity, inflation: 0, glideSpeed: 0 }, 0.42);
      return;
    }

    if (packet.event === "parachute:cut") {
      playCut();
      landingApproachActive = false;
      void updateWind({ phase: "freefall", verticalVelocity: payload.verticalVelocity }, 0.38);
      return;
    }

    if (packet.event === "parachute:landing-approach") {
      if (!landingApproachActive) playLandingApproach();
      landingApproachActive = true;
      return;
    }

    if (packet.event === "parachute:landed") {
      openingGeneration += 1;
      playLanding(payload.impactSpeed);
      landingApproachActive = false;
      observedPhase = "landed";
      fadeOutWind(0.58);
    }
  });

  ctx.events.on("network:disconnected", () => {
    openingGeneration += 1;
    landingApproachActive = false;
    observedPhase = "grounded";
    windGeneration += 1;
    for (const handle of windHandles) {
      handle?.setGain?.(0, 0.15);
      setTimeout(() => handle?.stop?.(), 500);
    }
    windHandles = [];
  });

  ctx.services.provide("parachute-audio", {
    get phase() { return observedPhase; },
    playDeployment,
    playCut,
    playLanding,
  });
}
