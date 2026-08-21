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
  requires: ["spatial-audio-web", "cloudflare-session", "keyboard-input"],
};

export async function setup(ctx) {
  const audio = ctx.services.get("audio");
  const network = ctx.services.get("network");
  let selfState = { weapon: null, ammo: null, alive: false };
  let automaticTimer = null;

  function stopAutomatic() {
    if (automaticTimer) clearInterval(automaticTimer);
    automaticTimer = null;
  }

  async function playOwnShot() {
    if (!selfState.alive || !selfState.weapon) return;
    if (Number.isFinite(selfState.ammo) && selfState.ammo <= 0) return;
    const key = selfState.weapon === "rifle" ? "weapon.rifle" : "weapon.pistol";
    const url = SOUNDS[key];
    if (!url) return;
    if (Number.isFinite(selfState.ammo)) selfState.ammo = Math.max(0, selfState.ammo - 1);
    try {
      await audio.playCentered(url, { gain: 0.9, channel: "own-weapon" });
    } catch (error) {
      console.error("Echo Front local weapon audio error", error);
    }
  }

  function startAutomaticIfNeeded() {
    stopAutomatic();
    if (selfState.weapon !== "rifle") return;
    automaticTimer = setInterval(() => {
      void playOwnShot();
    }, 100);
  }

  ctx.events.on("game:snapshot", (snapshot) => {
    const self = snapshot?.entities?.find((entity) => entity.id === network.playerId);
    if (!self) return;
    selfState = {
      weapon: self.weapon,
      ammo: self.ammo,
      alive: Boolean(self.alive),
    };
    if (!selfState.alive) {
      stopAutomatic();
      audio.stopChannel("own-weapon");
    }
  });

  ctx.events.on("game:event", (packet) => {
    const payload = packet.payload ?? {};
    if (packet.event === "weapon:selected" && payload.entityId === network.playerId) {
      selfState.weapon = payload.weaponId;
    }
  });

  ctx.events.on("input:fire-start", () => {
    void playOwnShot();
    startAutomaticIfNeeded();
  });

  ctx.events.on("input:fire-stop", () => {
    stopAutomatic();
  });

  ctx.events.on("game:event", async (packet) => {
    const payload = packet.payload ?? {};

    if (packet.event === "entity:respawned" && payload.entityId === network.playerId) {
      audio.stopChannel("death");
      return;
    }

    const url = SOUNDS[payload.key];
    if (!url) return;

    try {
      if (packet.event === "feedback:sound") {
        if (payload.recipientId !== network.playerId) return;

        if (payload.key === "death.full") {
          stopAutomatic();
          audio.stopChannel("own-weapon");
          audio.stopChannel("feedback-hit");
          audio.stopChannel("feedback-received");
          await audio.playCentered(url, { channel: "death", replace: true });
          return;
        }

        if (payload.key === "hit.player") {
          await audio.playCentered(url, { channel: "feedback-received", replace: true });
          return;
        }

        await audio.playCentered(url, { channel: "feedback-hit", replace: true });
        return;
      }

      if (packet.event === "sound:spatial") {
        if (payload.entityId === network.playerId) {
          if (payload.key === "weapon.pistol" || payload.key === "weapon.rifle") return;
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
      await Promise.all([...new Set(Object.values(SOUNDS))].map((url) => audio.load(url)));
    },
  });
}
