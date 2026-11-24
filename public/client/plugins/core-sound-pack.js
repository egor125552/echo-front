const SOUNDS = {
  "weapon.pistol": "/assets/audio/core/pistol-shot.mp3",
  "weapon.rifle": "/assets/audio/core/automatic-shot.mp3",
  "weapon.marksman": "/assets/aistudio/single-shot-m-1-rifle_c09ae09f.mp3",
  "weapon.sniper": "/assets/aistudio/precise-booming-shot-from-a-short-barreled-weapon_4606b104.mp3",
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
  "bomb.nuke": "/assets/aistudio/dropped-a-bomb-and-it-exploded_188d696e.mp3",
  "bomb.mine": "/assets/aistudio/bomb-drop-and-explosion_424c5b6a.mp3",
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
  "weapon.marksman": { gain: 1.12, referenceDistance: 4, rolloffFactor: 0.24, airAbsorptionMinHz: 2600 },
  "weapon.sniper": { gain: 1.25, referenceDistance: 5.5, rolloffFactor: 0.19, airAbsorptionMinHz: 2200 },
  "bomb.nuke": { gain: 1.4, referenceDistance: 4.5, rolloffFactor: 0.16, airAbsorptionMinHz: 1800 },
  "bomb.mine": { gain: 1.25, referenceDistance: 8, rolloffFactor: 0.22, airAbsorptionMinHz: 2100 },
  default: { gain: 1, referenceDistance: 2, rolloffFactor: 0.5, airAbsorptionMinHz: 4200 },
};

const WEAPON_SOUND_KEYS = Object.freeze({
  pistol: "weapon.pistol",
  rifle: "weapon.rifle",
  "electro-rifle": "weapon.rifle",
  marksman: "weapon.marksman",
  sniper: "weapon.sniper",
});

const WEAPON_HOLD_INTERVAL_MS = Object.freeze({
  rifle: 100,
  "electro-rifle": 90,
  pistol: 200,
  marksman: 255,
});

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

function createHumanThreatPingBuffer(context) {
  const sampleRate = Math.max(8000, Number(context?.sampleRate) || 44100);
  const duration = 0.145;
  const length = Math.max(1, Math.floor(sampleRate * duration));
  const buffer = context.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    const t = i / sampleRate;
    let sample = 0;
    // Pulse 1: crisp 640 Hz tactical lock tone (0.000s .. 0.046s)
    if (t <= 0.046) {
      const p = t / 0.046;
      const env = Math.sin(Math.PI * p) * Math.exp(-t * 10);
      sample += (Math.sin(2 * Math.PI * 640 * t) * 0.72 + Math.sin(2 * Math.PI * 1280 * t) * 0.18) * env;
    }
    // Pulse 2: descending 460 Hz confirmation pulse (0.082s .. 0.140s)
    if (t >= 0.082 && t <= 0.140) {
      const lt = t - 0.082;
      const p = lt / 0.058;
      const env = Math.sin(Math.PI * p) * Math.exp(-lt * 11);
      sample += (Math.sin(2 * Math.PI * 460 * lt) * 0.76 + Math.sin(2 * Math.PI * 920 * lt) * 0.16) * env;
    }
    data[i] = Math.max(-0.92, Math.min(0.92, sample * 0.85));
  }
  return buffer;
}

function createHumanPresenceBlipBuffer(context) {
  const sampleRate = Math.max(8000, Number(context?.sampleRate) || 44100);
  const duration = 0.046;
  const length = Math.max(1, Math.floor(sampleRate * duration));
  const buffer = context.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    const t = i / sampleRate;
    const p = t / duration;
    const env = Math.sin(Math.PI * p);
    data[i] = (Math.sin(2 * Math.PI * 520 * t) * 0.75 + Math.sin(2 * Math.PI * 1040 * t) * 0.12) * env * 0.65;
  }
  return buffer;
}

function createHumanFriendPingBuffer(context) {
  const sampleRate = Math.max(8000, Number(context?.sampleRate) || 44100);
  const duration = 0.14;
  const length = Math.max(1, Math.floor(sampleRate * duration));
  const buffer = context.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    const t = i / sampleRate;
    let sample = 0;
    if (t <= 0.055) {
      const env = Math.sin(Math.PI * (t / 0.055));
      sample += Math.sin(2 * Math.PI * 523.25 * t) * env * 0.65;
    }
    if (t >= 0.07 && t <= 0.135) {
      const lt = t - 0.07;
      const env = Math.sin(Math.PI * (lt / 0.065));
      sample += Math.sin(2 * Math.PI * 659.25 * lt) * env * 0.68;
    }
    data[i] = Math.max(-0.9, Math.min(0.9, sample));
  }
  return buffer;
}

export const manifest = {
  id: "core-sound-pack",
  requires: ["spatial-audio-web", "cloudflare-session", "keyboard-input"],
};

export async function setup(ctx) {
  const audio = ctx.services.get("audio");
  const network = ctx.services.get("network");
  let selfState = { weapon: null, ammo: null, alive: false, canFire: true, team: 0, x: 0, y: 0, z: 0 };
  let selfAcousticZone = "outdoor";
  let automaticTimer = null;
  let lastOwnShotAt = { marksman: -Infinity, sniper: -Infinity };
  const activeTrajectories = new Set();
  let trajectoryTimer = null;
  let humanThreatPingBuffer = null;
  let humanPresenceBlipBuffer = null;
  let humanFriendPingBuffer = null;
  const lastHumanThreatPingAt = new Map();
  const lastHumanPresenceAt = new Map();

  function ensureHumanAudioBuffers() {
    if (!audio?.context) return false;
    humanThreatPingBuffer ??= createHumanThreatPingBuffer(audio.context);
    humanPresenceBlipBuffer ??= createHumanPresenceBlipBuffer(audio.context);
    humanFriendPingBuffer ??= createHumanFriendPingBuffer(audio.context);
    return true;
  }

  function isFriendlyHuman(entityId, entityTeam = 0) {
    if (!entityId || entityId === network.playerId) return true;
    const ownTeam = Number(selfState.team) || 0;
    const otherTeam = Number(entityTeam) || 0;
    if (ownTeam > 0 && otherTeam > 0 && ownTeam === otherTeam) return true;
    const socialProfile = ctx.services.has("social-profile") ? ctx.services.get("social-profile") : null;
    if (socialProfile?.isFriend?.(entityId)) return true;
    return false;
  }

  function playHuman3DPing(buffer, position, { radius = 160, gain = 0.62, referenceDistance = 12, rolloffFactor = 0.3 } = {}) {
    if (!buffer || !position || typeof audio.playSpatialBuffer !== "function") return;
    try {
      audio.playSpatialBuffer(buffer, {
        x: Number(position.x) || 0,
        y: Number(position.y) || 0,
        z: Number(position.z) || 0,
      }, {
        radius,
        gain,
        referenceDistance,
        rolloffFactor,
        airAbsorptionMinHz: 9500,
        loop: false,
      });
    } catch {}
  }

  function sampleTrajectoryPosition(traj, nowMs) {
    const duration = Math.max(100, Number(traj.flightMs) || 2150);
    const t = Math.max(0, Math.min(1, (nowMs - traj.startedAt) / duration));
    const x = traj.startX + (traj.endX - traj.startX) * t;
    const z = traj.startZ + (traj.endZ - traj.startZ) * t;
    const baseY = traj.startY + (traj.endY - traj.startY) * t;
    const arcY = 4 * traj.arcHeight * t * (1 - t);
    return { x, y: baseY + arcY, z };
  }

  function tickActiveTrajectories() {
    if (!activeTrajectories.size) {
      if (trajectoryTimer) {
        clearInterval(trajectoryTimer);
        trajectoryTimer = null;
      }
      return;
    }
    const nowMs = typeof performance !== "undefined" ? performance.now() : Date.now();
    for (const entry of [...activeTrajectories]) {
      const pos = sampleTrajectoryPosition(entry, nowMs);
      try {
        entry.handle.update(pos);
      } catch {
        activeTrajectories.delete(entry);
      }
    }
  }

  function trackTrajectoryHandle(handle, traj) {
    if (!handle || typeof handle.update !== "function") return;
    const entry = {
      handle,
      startX: Number(traj.startX) || 0,
      startY: Number(traj.startY) || 0,
      startZ: Number(traj.startZ) || 0,
      endX: Number(traj.endX) || 0,
      endY: Number(traj.endY) || 0,
      endZ: Number(traj.endZ) || 0,
      arcHeight: Math.max(0, Number(traj.arcHeight) || 0),
      flightMs: Math.max(100, Number(traj.flightMs) || 2150),
      startedAt: typeof performance !== "undefined" ? performance.now() : Date.now(),
    };
    activeTrajectories.add(entry);
    handle.source?.addEventListener?.("ended", () => {
      activeTrajectories.delete(entry);
      if (!activeTrajectories.size && trajectoryTimer) {
        clearInterval(trajectoryTimer);
        trajectoryTimer = null;
      }
    }, { once: true });
    if (!trajectoryTimer) {
      trajectoryTimer = setInterval(tickActiveTrajectories, 33);
    }
  }

  function stopAutomatic() {
    if (automaticTimer) clearInterval(automaticTimer);
    automaticTimer = null;
  }

  async function playOwnShot() {
    if (!selfState.alive || !selfState.weapon || !selfState.canFire) return;
    if (Number.isFinite(selfState.ammo) && selfState.ammo <= 0) return;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (selfState.weapon === "sniper" && now - lastOwnShotAt.sniper < 1040) return;
    if (selfState.weapon === "marksman" && now - lastOwnShotAt.marksman < 215) return;
    const key = WEAPON_SOUND_KEYS[selfState.weapon] ?? "weapon.pistol";
    const url = SOUNDS[key];
    if (!url) return;
    if (selfState.weapon === "sniper") lastOwnShotAt.sniper = now;
    if (selfState.weapon === "marksman") lastOwnShotAt.marksman = now;
    if (Number.isFinite(selfState.ammo)) selfState.ammo = Math.max(0, selfState.ammo - 1);
    const gain = selfState.weapon === "sniper" ? 1.05 : selfState.weapon === "marksman" ? 0.98 : 0.9;
    try { await audio.playCentered(url, { gain, channel: "own-weapon" }); }
    catch (error) { console.error("Echo Front local weapon audio error", error); }
  }

  function startAutomaticIfNeeded() {
    stopAutomatic();
    const intervalMs = WEAPON_HOLD_INTERVAL_MS[selfState.weapon];
    if (!intervalMs) return;
    automaticTimer = setInterval(() => { void playOwnShot(); }, intervalMs);
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
      team: Number(self.team) || 0,
      x: Number(self.x) || 0,
      y: Number(self.y) || 0,
      z: Number(self.z) || 0,
    };
    selfAcousticZone = self.acousticZone ?? "outdoor";
    if (!selfState.alive) {
      stopAutomatic();
      audio.stopChannel("own-weapon");
      return;
    }
    if (network.tutorial || !selfState.canFire || !ensureHumanAudioBuffers()) return;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    for (const entity of snapshot.entities ?? []) {
      if (!entity || entity.id === network.playerId || entity.bot || !entity.alive) continue;
      const dx = selfState.x - (Number(entity.x) || 0);
      const dz = selfState.z - (Number(entity.z) || 0);
      const dist = Math.hypot(dx, dz);
      if (dist < 2.5 || dist > 125) continue;
      const pos = { x: entity.x, y: entity.y ?? 0, z: entity.z };
      if (isFriendlyHuman(entity.id, entity.team)) {
        const lastFriendAt = lastHumanPresenceAt.get(entity.id) ?? -Infinity;
        if (now - lastFriendAt >= 4800) {
          lastHumanPresenceAt.set(entity.id, now);
          playHuman3DPing(humanFriendPingBuffer, pos, {
            radius: 130,
            gain: 0.34,
            referenceDistance: 10,
            rolloffFactor: 0.35,
          });
        }
        continue;
      }
      // Enemy human player: check if they are aiming directly in our direction
      const angle = Number(entity.angle) || 0;
      const aimDot = (dx * Math.sin(angle) + dz * -Math.cos(angle)) / Math.max(0.001, dist);
      const aimingAtUs = aimDot >= 0.945; // within ~19 degrees cone
      if (aimingAtUs) {
        const lastThreatAt = lastHumanThreatPingAt.get(entity.id) ?? -Infinity;
        if (now - lastThreatAt >= 1900) {
          lastHumanThreatPingAt.set(entity.id, now);
          lastHumanPresenceAt.set(entity.id, now);
          playHuman3DPing(humanThreatPingBuffer, pos, {
            radius: 180,
            gain: 0.64,
            referenceDistance: 12,
            rolloffFactor: 0.28,
          });
        }
      } else if (dist <= 115) {
        const lastBlipAt = lastHumanPresenceAt.get(entity.id) ?? -Infinity;
        if (now - lastBlipAt >= 4200) {
          lastHumanPresenceAt.set(entity.id, now);
          playHuman3DPing(humanPresenceBlipBuffer, pos, {
            radius: 125,
            gain: 0.38,
            referenceDistance: 10,
            rolloffFactor: 0.36,
          });
        }
      }
    }
  });

  ctx.events.on("game:event", (packet) => {
    const payload = packet.payload ?? {};
    if (packet.event === "weapon:selected" && payload.entityId === network.playerId) selfState.weapon = payload.weaponId;
    if (
      packet.event === "weapon:fired"
      && payload.shooterIsHuman
      && payload.entityId !== network.playerId
      && selfState.alive
      && !network.tutorial
      && !isFriendlyHuman(payload.entityId, payload.shooterTeam)
      && ensureHumanAudioBuffers()
    ) {
      const dx = selfState.x - (Number(payload.x) || 0);
      const dz = selfState.z - (Number(payload.z) || 0);
      const dist = Math.hypot(dx, dz);
      let aimedTowardUs = payload.assistedTargetId === network.playerId || dist <= 32;
      if (!aimedTowardUs && dist <= 220 && Number.isFinite(payload.directionX) && Number.isFinite(payload.directionZ)) {
        const dirLen = Math.hypot(payload.directionX, payload.directionZ) || 1;
        const dot = (dx * payload.directionX + dz * payload.directionZ) / (Math.max(0.001, dist) * dirLen);
        aimedTowardUs = dot >= 0.78; // within ~38 degrees toward listener
      }
      if (aimedTowardUs) {
        const now = typeof performance !== "undefined" ? performance.now() : Date.now();
        const lastAt = lastHumanThreatPingAt.get(payload.entityId) ?? -Infinity;
        if (now - lastAt >= 750) {
          lastHumanThreatPingAt.set(payload.entityId, now);
          lastHumanPresenceAt.set(payload.entityId, now);
          playHuman3DPing(humanThreatPingBuffer, payload, {
            radius: 230,
            gain: 0.74,
            referenceDistance: 14,
            rolloffFactor: 0.25,
          });
        }
      }
    }
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
      const isBombSound = payload.key === "bomb.nuke" || payload.key === "bomb.mine";
      const offset = Number.isFinite(Number(payload.offset))
        ? Number(payload.offset)
        : (payload.key === "bomb.mine" ? 1.45 : 0);
      if (payload.entityId === network.playerId && !isBombSound) {
        if (Object.values(WEAPON_SOUND_KEYS).includes(payload.key)) return;
        await audio.playCentered(url, { gain: isFootstep ? 0.45 : 0.85, offset });
        return;
      }
      const profile = spatialProfileForKey(payload.key);
      const sourceZone = payload.acousticZone ?? "outdoor";
      const crossBoundary = sourceZone !== selfAcousticZone;
      const fallbackOcclusion = crossBoundary
        ? (sourceZone === "outdoor" || selfAcousticZone === "outdoor" ? 0.68 : 0.45)
        : 0;
      const physicalOcclusion = Number(payload.occlusion);
      const occlusion = isBombSound
        ? Math.min(0.45, Number.isFinite(physicalOcclusion) ? Math.max(0, physicalOcclusion) : 0)
        : (Number.isFinite(physicalOcclusion)
          ? Math.max(0, Math.min(1, physicalOcclusion))
          : fallbackOcclusion);
      const trajectory = payload.trajectory && typeof payload.trajectory === "object"
        ? payload.trajectory
        : null;
      const initialPos = trajectory
        ? {
          x: Number(trajectory.startX) || 0,
          y: Number(trajectory.startY) || 0,
          z: Number(trajectory.startZ) || 0,
        }
        : { x: payload.x, y: payload.y ?? 0, z: payload.z };
      const handle = await audio.playSpatial(url, initialPos, {
        radius: trajectory ? Math.max(payload.radius ?? 650, 1200) : (payload.radius ?? 40),
        gain: profile.gain,
        referenceDistance: profile.referenceDistance,
        rolloffFactor: profile.rolloffFactor,
        airAbsorptionMinHz: profile.airAbsorptionMinHz,
        occlusion,
        offset,
      });
      if (handle && trajectory) {
        trackTrajectoryHandle(handle, trajectory);
      }
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
      const warming = Promise.allSettled(
        [...new Set(urls)].map((url) => audio.load(url).catch(() => null)),
      );
      await Promise.race([
        warming,
        new Promise((resolve) => setTimeout(resolve, 4000)),
      ]);
    },
  });
}
