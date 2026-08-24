export const EVENT_SOUNDS = {
  "round.start": "/assets/audio/events/round-start.mp3",
  "round.victory": "/assets/audio/events/round-victory.mp3",
  "round.defeat": "/assets/audio/events/round-defeat.mp3",
  "round.draw": "/assets/audio/events/round-draw.mp3",
  "rifle.unlocked": "/assets/audio/events/rifle-unlocked.mp3",
};

export const manifest = {
  id: "event-sound-pack",
  requires: ["spatial-audio-web", "cloudflare-session"],
};

export async function setup(ctx) {
  const audio = ctx.services.get("audio");
  const network = ctx.services.get("network");
  let team = 0;

  async function play(key, gain = 1) {
    const url = EVENT_SOUNDS[key];
    if (!url) return;
    try {
      await audio.playCentered(url, {
        gain,
        channel: "event-cue",
        replace: true,
      });
    } catch (error) {
      console.error("Echo Front event cue audio error", key, error);
    }
  }

  ctx.events.on("network:welcome", ({ team: joinedTeam }) => {
    team = Number(joinedTeam) || 0;
  });

  ctx.events.on("game:event", (packet) => {
    const payload = packet.payload ?? {};

    if (packet.event === "match:started") {
      void play("round.start", 1.0);
      return;
    }

    if (
      packet.event === "weapon:unlocked"
      && payload.entityId === network.playerId
      && payload.weaponId === "rifle"
    ) {
      void play("rifle.unlocked", 1.05);
      return;
    }

    if (packet.event !== "match:ended") return;

    if (Number(payload.winner) === 0) {
      void play("round.draw", 1.05);
      return;
    }

    if (Number(payload.winner) === team) {
      void play("round.victory", 1.1);
      return;
    }

    void play("round.defeat", 1.1);
  });

  ctx.services.provide("event-sound-pack", {
    sounds: EVENT_SOUNDS,
    async warm() {
      await Promise.all(Object.values(EVENT_SOUNDS).map((url) => audio.load(url)));
    },
  });
}
