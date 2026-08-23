export const ENVIRONMENT_SOUNDS = {
  wind: "/audio/environment/wind.mp3",
  electric: "/audio/environment/electric-hum.mp3",
  fire: "/audio/environment/fire.mp3",
  metal: "/audio/environment/metal-hit.mp3",
  wood: "/audio/environment/wood-hit.mp3",
};

export const ENVIRONMENT_SOURCES = {
  electric: { x: -12, z: -6 },
  fire: { x: 12, z: 6 },
  metal: { x: -10.5, z: -8.5 },
  wood: { x: 10.5, z: 8.5 },
};

const WIND_POINTS = [
  { x: -14, z: -10 },
  { x: 14, z: 10 },
  { x: -10, z: 14 },
  { x: 10, z: -14 },
];

export const manifest = {
  id: "environment-audio",
  requires: ["spatial-audio-web"],
};

export async function setup(ctx) {
  const audio = ctx.services.get("audio");
  const timers = new Set();
  const handles = new Map();
  let started = false;
  let windIndex = 0;

  function clearTimers() {
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
  }

  function stopEnvironment() {
    started = false;
    clearTimers();
    handles.clear();
    for (const channel of [
      "environment-electric",
      "environment-fire",
      "environment-wind",
      "environment-metal",
      "environment-wood",
    ]) {
      audio.stopChannel(channel);
    }
  }

  function scheduleCue({ key, minMs, maxMs, positions, gain }) {
    if (!started) return;
    const delay = minMs + Math.random() * (maxMs - minMs);
    const timer = setTimeout(async () => {
      timers.delete(timer);
      if (!started) return;
      const position = positions[windIndex++ % positions.length];
      try {
        await audio.playSpatial(ENVIRONMENT_SOUNDS[key], position, {
          radius: 60,
          gain,
          channel: `environment-${key}`,
        });
      } catch (error) {
        console.error(`Echo Front ${key} ambience error`, error);
      }
      scheduleCue({ key, minMs, maxMs, positions, gain });
    }, delay);
    timers.add(timer);
  }

  async function startEnvironment() {
    if (started) return;
    started = true;

    try {
      await Promise.all(Object.values(ENVIRONMENT_SOUNDS).map((url) => audio.load(url)));
      if (!started) return;

      const electric = await audio.playSpatial(
        ENVIRONMENT_SOUNDS.electric,
        ENVIRONMENT_SOURCES.electric,
        {
          radius: 60,
          gain: 0.28,
          channel: "environment-electric",
          replace: true,
          loop: true,
        },
      );
      if (electric) handles.set("electric", electric);

      const fire = await audio.playSpatial(
        ENVIRONMENT_SOUNDS.fire,
        ENVIRONMENT_SOURCES.fire,
        {
          radius: 60,
          gain: 0.24,
          channel: "environment-fire",
          replace: true,
          loop: true,
        },
      );
      if (fire) handles.set("fire", fire);

      scheduleCue({
        key: "wind",
        minMs: 14000,
        maxMs: 26000,
        positions: WIND_POINTS,
        gain: 0.14,
      });
      scheduleCue({
        key: "metal",
        minMs: 22000,
        maxMs: 38000,
        positions: [ENVIRONMENT_SOURCES.metal],
        gain: 0.2,
      });
      scheduleCue({
        key: "wood",
        minMs: 28000,
        maxMs: 46000,
        positions: [ENVIRONMENT_SOURCES.wood],
        gain: 0.18,
      });
    } catch (error) {
      console.error("Echo Front environment audio error", error);
      stopEnvironment();
    }
  }

  ctx.events.on("game:snapshot", () => {
    if (!started) {
      void startEnvironment();
      return;
    }

    handles.get("electric")?.update(ENVIRONMENT_SOURCES.electric);
    handles.get("fire")?.update(ENVIRONMENT_SOURCES.fire);
  });

  ctx.events.on("network:disconnected", stopEnvironment);

  ctx.services.provide("environment-audio", {
    sounds: ENVIRONMENT_SOUNDS,
    sources: ENVIRONMENT_SOURCES,
    start: startEnvironment,
    stop: stopEnvironment,
  });
}
