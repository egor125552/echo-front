const SOUNDS = {
  "weapon.pistol": "/assets/audio/core/pistol-shot.mp3",
  "weapon.rifle": "/assets/audio/core/automatic-shot.mp3",
  "step.1": "/assets/audio/core/step-1.mp3",
  "step.2": "/assets/audio/core/step-2.mp3",
  "step.3": "/assets/audio/core/step-3.mp3",
  "step.4": "/assets/audio/core/step-4.mp3",
  "hit.enemy": "/assets/audio/core/hit-enemy.mp3",
  "hit.player": "/assets/audio/core/hit-player.mp3",
  "armor.hit1": "/assets/audio/core/armor-hit-1.mp3",
  "armor.hit2": "/assets/audio/core/armor-hit-2.mp3",
  "armor.break": "/assets/audio/core/armor-break.mp3",
  "enemy.killed": "/assets/audio/core/enemy-killed.mp3",
  "death.full": "/assets/audio/core/death-full.mp3",
};

export const manifest = {
  id: "core-sound-pack",
  requires: ["spatial-audio-web", "cloudflare-session"],
};

export async function setup(ctx) {
  const audio = ctx.services.get("audio");
  const network = ctx.services.get("network");

  ctx.events.on("game:event", async (packet) => {
    const payload = packet.payload ?? {};
    const url = SOUNDS[payload.key];
    if (!url) return;

    try {
      if (packet.event === "feedback:sound") {
        if (payload.recipientId === network.playerId) await audio.playCentered(url);
        return;
      }

      if (packet.event === "sound:spatial") {
        if (payload.entityId === network.playerId) {
          await audio.playCentered(url, { gain: payload.key.startsWith("step.") ? 0.45 : 0.85 });
        } else {
          await audio.playSpatial(url, { x: payload.x, z: payload.z }, {
            radius: payload.radius ?? 40,
            gain: payload.key.startsWith("step.") ? 0.85 : 1,
          });
        }
      }
    } catch (error) {
      console.error("Echo Front audio error", error);
    }
  });

  ctx.services.provide("sound-pack", {
    sounds: SOUNDS,
    async warmEssential() {
      await Promise.all([
        audio.load(SOUNDS["weapon.pistol"]),
        audio.load(SOUNDS["weapon.rifle"]),
        audio.load(SOUNDS["step.1"]),
        audio.load(SOUNDS["hit.enemy"]),
        audio.load(SOUNDS["hit.player"]),
      ]);
    },
  });
}
