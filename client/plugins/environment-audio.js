export const AMBIENT_BED = "/audio/environment/arena-ambient.mp3";

export const manifest = {
  id: "environment-audio",
  requires: ["spatial-audio-web"],
};

export async function setup(ctx) {
  const audio = ctx.services.get("audio");
  let started = false;

  async function startEnvironment() {
    if (started) return;
    started = true;

    try {
      await audio.playCentered(AMBIENT_BED, {
        gain: 0.28,
        channel: "environment-bed",
        replace: true,
        loop: true,
      });
    } catch (error) {
      started = false;
      console.error("Echo Front forest ambience error", error);
    }
  }

  function stopEnvironment() {
    started = false;
    audio.stopChannel("environment-bed");
  }

  ctx.events.on("game:snapshot", () => {
    if (!started) void startEnvironment();
  });

  ctx.events.on("network:disconnected", stopEnvironment);

  ctx.services.provide("environment-audio", {
    bed: AMBIENT_BED,
    start: startEnvironment,
    stop: stopEnvironment,
  });
}
