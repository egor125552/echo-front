const SOUNDS = {
  "weapon.pistol": "/assets/audio/core/pistol-shot.mp3",
  "weapon.rifle": "/assets/audio/core/automatic-shot.mp3",
  "footstep.forest.1": "/assets/audio/footsteps/forest/forest-step-1.mp3",
  "footstep.forest.2": "/assets/audio/footsteps/forest/forest-step-2.mp3",
  "footstep.forest.3": "/assets/audio/footsteps/forest/forest-step-3.mp3",
  "hit.enemy": "/assets/audio/core/hit-enemy.mp3",
  "hit.player": "/assets/audio/core/hit-player.mp3",
  "armor.hit1": "/assets/audio/core/armor-hit-1.mp3",
  "armor.hit2": "/assets/audio/core/armor-hit-2.mp3",
  "armor.break": "/assets/audio/core/armor-break.mp3",
  "armor.self-break": "/assets/audio/core/armor-break.mp3",
  "enemy.killed": "/assets/audio/core/enemy-killed.mp3",
  "death.full": "/assets/audio/core/death-full.mp3",
};

function numbered(prefix, count) {
  return Array.from({ length: count }, (_, index) => `${prefix}${index + 1}.mp3`);
}

const FOOTSTEP_SETS = {
  forest: {
    walk: numbered("/assets/audio/footsteps/forest/forest-step-", 3),
    run: numbered("/assets/audio/footsteps/forest/forest-step-", 3),
  },
  concrete: {
    walk: numbered("/assets/audio/footsteps/library/open-esport-concrete/walk-", 8),
    run: numbered("/assets/audio/footsteps/library/open-esport-concrete/run-", 8),
  },
  metal: {
    walk: numbered("/assets/audio/footsteps/library/scp/metal-walk-", 8),
    run: numbered("/assets/audio/footsteps/library/scp/metal-run-", 8),
  },
  stone: {
    walk: [
      "/assets/audio/footsteps/library/fps-asset-kit/stone-left-1.mp3",
      "/assets/audio/footsteps/library/fps-asset-kit/stone-right-1.mp3",
      "/assets/audio/footsteps/library/fps-asset-kit/stone-left-2.mp3",
      "/assets/audio/footsteps/library/fps-asset-kit/stone-right-2.mp3",
      "/assets/audio/footsteps/library/fps-asset-kit/stone-left-3.mp3",
      "/assets/audio/footsteps/library/fps-asset-kit/stone-right-3.mp3",
    ],
  },
  sand: {
    walk: [
      "/assets/audio/footsteps/library/fps-asset-kit/sand-left-1.mp3",
      "/assets/audio/footsteps/library/fps-asset-kit/sand-right-1.mp3",
      "/assets/audio/footsteps/library/fps-asset-kit/sand-left-2.mp3",
      "/assets/audio/footsteps/library/fps-asset-kit/sand-right-2.mp3",
      "/assets/audio/footsteps/library/fps-asset-kit/sand-left-3.mp3",
      "/assets/audio/footsteps/library/fps-asset-kit/sand-right-3.mp3",
    ],
  },
  default: {
    walk: Array.from({ length: 9 }, (_, index) => `/assets/audio/footsteps/library/zacjoffe/step-${index}.mp3`),
  },
};
FOOTSTEP_SETS.stone.run = FOOTSTEP_SETS.stone.walk;
FOOTSTEP_SETS.sand.run = FOOTSTEP_SETS.sand.walk;
FOOTSTEP_SETS.default.run = FOOTSTEP_SETS.default.walk;

export const SPATIAL_SOUND_PROFILES = {
  footstep: { gain: 0.95, referenceDistance: 2.2, rolloffFactor: 0.55, airAbsorptionMinHz: 6500 },
  "weapon.pistol": { gain: 1, referenceDistance: 2.5, rolloffFactor: 0.32, airAbsorptionMinHz: 3200 },
  "weapon.rifle": { gain: 1.05, referenceDistance: 3, rolloffFactor: 0.28, airAbsorptionMinHz: 2800 },
  default: { gain: 1, referenceDistance: 2, rolloffFactor: 0.5, airAbsorptionMinHz: 4200 },
};

export function spatialProfileForKey(key) {
  if (String(key).startsWith("footstep.")) return SPATIAL_SOUND_PROFILES.footstep;
  return SPATIAL_SOUND_PROFILES[key] ?? SPATIAL_SOUND_PROFILES.default;
}

export function resolveSoundUrl(payload = {}) {
  if (String(payload.key ?? "").startsWith("footstep.")) {
    const surface = String(payload.surface ?? "forest").toLowerCase();
    const gait = payload.gait === "run" ? "run" : "walk";
    const set = FOOTSTEP_SETS[surface]?.[gait] ?? FOOTSTEP_SETS.default[gait];
    const variant = Math.max(1, Math.floor(Number(payload.variant) || 1));
    return set[(variant - 1) % set.length];
  }
  return SOUNDS[payload.key] ?? null;
}

export const manifest = {
  id: "core-sound-pack",
  requires: ["spatial-audio-web", "cloudflare-session", "keyboard-input"],
};

export async function setup(ctx) {
  const audio = ctx.services.get("audio");
  const network = ctx.services.get("network");
  let selfState = { weapon: null, ammo: null, alive: false, canFire: true };
  let selfAcousticZone = "outdoor";
  let automaticTimer = null;

  function stopAutomatic() {
    if (automaticTimer) clearInterval(automaticTimer);
    automaticTimer = null;
  }

  async function playOwnShot() {
    if (!selfState.alive || !selfState.weapon || !selfState.canFire) return;
    if (Number.isFinite(selfState.ammo) && selfState.ammo <= 0) return;
    const key = selfState.weapon === "rifle" ? "weapon.rifle" : "weapon.pistol";
    const url = SOUNDS[key];
    if (!url) return;
    if (Number.isFinite(selfState.ammo)) selfState.ammo = Math.max(0, selfState.ammo - 1);
    try { await audio.playCentered(url, { gain: 0.9, channel: "own-weapon" }); }
    catch (error) { console.error("Echo Front local weapon audio error", error); }
  }

  function startAutomaticIfNeeded() {
    stopAutomatic();
    if (selfState.weapon !== "rifle") return;
    automaticTimer = setInterval(() => { void playOwnShot(); }, 100);
  }

  async function playFeedback(key, url) {
    if (key === "death.full") {
      stopAutomatic();
      audio.stopChannel("own-weapon");
      audio.stopChannel("feedback-received");
      await audio.playCentered(url, { gain: 1.15, channel: "death", replace: true });
      return;
    }
    if (key === "hit.player") return audio.playCentered(url, { gain: 1, channel: "feedback-received", replace: true });
    if (key === "hit.enemy") return audio.playCentered(url, { gain: 1.3, channel: "feedback-flesh", replace: true });
    if (key === "armor.hit1" || key === "armor.hit2") return audio.playCentered(url, { gain: 1.25, channel: "feedback-armor-hit", replace: true });
    if (key === "armor.break" || key === "armor.self-break") {
      setTimeout(() => {
        audio.playCentered(url, {
          gain: key === "armor.self-break" ? 1.5 : 1.4,
          channel: "feedback-armor-break",
          replace: true,
        }).catch((error) => console.error("Armor break audio", error));
      }, 65);
      return;
    }
    if (key === "enemy.killed") return audio.playCentered(url, { gain: 1.35, channel: "feedback-kill", replace: true });
    return audio.playCentered(url);
  }

  ctx.events.on("game:snapshot", (snapshot) => {
    const self = snapshot?.entities?.find((entity) => entity.id === network.playerId);
    if (!self) return;
    const battleRoyale = snapshot.mode === "battle-royale" || snapshot.match?.mode === "battle-royale";
    selfState = {
      weapon: self.weapon,
      ammo: self.ammo,
      alive: Boolean(self.alive),
      canFire: !battleRoyale || snapshot.match?.phase === "active",
    };
    selfAcousticZone = self.acousticZone ?? "outdoor";
    if (!selfState.alive) {
      stopAutomatic();
      audio.stopChannel("own-weapon");
    }
  });

  ctx.events.on("game:event", (packet) => {
    const payload = packet.payload ?? {};
    if (packet.event === "weapon:selected" && payload.entityId === network.playerId) selfState.weapon = payload.weaponId;
  });
  ctx.events.on("input:fire-start", () => { void playOwnShot(); startAutomaticIfNeeded(); });
  ctx.events.on("input:fire-stop", () => stopAutomatic());

  ctx.events.on("game:event", async (packet) => {
    const payload = packet.payload ?? {};
    if (packet.event === "entity:respawned" && payload.entityId === network.playerId) {
      audio.stopChannel("death");
      return;
    }
    const url = resolveSoundUrl(payload);
    if (!url) return;
    const isFootstep = payload.key.startsWith("footstep.");
    try {
      if (packet.event === "feedback:sound") {
        if (payload.recipientId !== network.playerId) return;
        await playFeedback(payload.key, url);
        return;
      }
      if (packet.event !== "sound:spatial") return;
      if (payload.entityId === network.playerId) {
        if (payload.key === "weapon.pistol" || payload.key === "weapon.rifle") return;
        await audio.playCentered(url, { gain: isFootstep ? 0.45 : 0.85 });
        return;
      }
      const profile = spatialProfileForKey(payload.key);
      const sourceZone = payload.acousticZone ?? "outdoor";
      const crossBoundary = sourceZone !== selfAcousticZone;
      const fallbackOcclusion = crossBoundary
        ? (sourceZone === "outdoor" || selfAcousticZone === "outdoor" ? 0.68 : 0.45)
        : 0;
      const physicalOcclusion = Number(payload.occlusion);
      const occlusion = Number.isFinite(physicalOcclusion)
        ? Math.max(0, Math.min(1, physicalOcclusion))
        : fallbackOcclusion;
      await audio.playSpatial(url, { x: payload.x, y: payload.y ?? 0, z: payload.z }, {
        radius: payload.radius ?? 40,
        gain: profile.gain,
        referenceDistance: profile.referenceDistance,
        rolloffFactor: profile.rolloffFactor,
        airAbsorptionMinHz: profile.airAbsorptionMinHz,
        occlusion,
      });
    } catch (error) {
      console.error("Echo Front audio error", error);
    }
  });

  ctx.services.provide("sound-pack", {
    sounds: SOUNDS,
    footstepSets: FOOTSTEP_SETS,
    spatialProfiles: SPATIAL_SOUND_PROFILES,
    resolveSoundUrl,
    async warmEssential() {
      const urls = [
        ...Object.values(SOUNDS).filter((url) => !url.includes("footsteps")),
        ...FOOTSTEP_SETS.forest.walk,
      ];
      await Promise.all([...new Set(urls)].map((url) => audio.load(url)));
    },
  });
}
