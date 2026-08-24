const START_URL = "/assets/audio/armor-plating/plate-insert-start.mp3";
const COMPLETE_URLS = {
  1: "/assets/audio/armor-plating/plate-install-1.mp3",
  2: "/assets/audio/armor-plating/plate-install-2.mp3",
  3: "/assets/audio/armor-plating/plate-install-3.mp3",
  4: "/assets/audio/armor-plating/plate-install-heavy.mp3",
};

export const manifest = {
  id: "armor-plating-audio",
  requires: ["spatial-audio-web", "cloudflare-session"],
};

export async function setup(ctx) {
  const audio = ctx.services.get("audio");
  const network = ctx.services.get("network");

  async function playStart() {
    try {
      await audio.playCentered(START_URL, {
        gain: 1,
        channel: "armor-plating-start",
        replace: true,
        foreground: true,
      });
    } catch (error) {
      console.error("Echo Front plating start audio error", error);
    }
  }

  async function playComplete(plateNumber) {
    const url = COMPLETE_URLS[Number(plateNumber)] ?? COMPLETE_URLS[4];
    try {
      await audio.playCentered(url, {
        gain: 1,
        channel: "armor-plating-complete",
        replace: true,
        foreground: true,
      });
    } catch (error) {
      console.error("Echo Front plating completion audio error", error);
    }
  }

  function stopPlatingAudio() {
    audio.stopChannel("armor-plating-start");
    audio.stopChannel("armor-plating-complete");
  }

  ctx.events.on("game:event", (packet) => {
    const payload = packet.payload ?? {};
    if (payload.entityId !== network.playerId) return;

    if (packet.event === "armor:plating-started") {
      void playStart();
      return;
    }

    if (packet.event === "armor:plating-completed") {
      audio.stopChannel("armor-plating-start");
      void playComplete(payload.plateNumber);
      return;
    }

    if (packet.event === "armor:plating-cancelled") {
      stopPlatingAudio();
    }
  });

  ctx.events.on("network:disconnected", stopPlatingAudio);

  ctx.services.provide("armor-plating-audio", {
    startUrl: START_URL,
    completeUrls: COMPLETE_URLS,
    stop: stopPlatingAudio,
  });
}
