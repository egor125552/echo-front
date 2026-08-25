const WARZONE_AUDIO_ROOT = "/assets/audio/warzone/";

function warzoneSound(fileName) {
  return `${WARZONE_AUDIO_ROOT}${encodeURIComponent(fileName)}`;
}

const DEPLOYMENT_URL = warzoneSound("Call of Duty： Warzone ｜ Squad Leader Jump [Sound Effect].mp3");
const CRATE_AMBIENT_URL = warzoneSound("Call of Duty： Warzone ｜ Loot Cache Chest Ambient (Loop) [Sound Effect].mp3");
const CRATE_OPEN_URL = warzoneSound("Call of Duty： Warzone ｜ Loot Cache Chest Open [Sound Effect].mp3");
const LOOT_PICKUP_URL = warzoneSound("Call of Duty： Warzone ｜ Legendary Loot Pickup ♪ [Sound Effect].mp3");
const CIRCLE_CLOSING_URL = warzoneSound("Call of Duty： Warzone ｜ Circle Closing Now! [Sound Effect].mp3");
const VICTORY_URL = warzoneSound("Call of Duty： Warzone ｜ Warzone Victory! [Sound Effect].mp3");
const DEFEAT_URL = warzoneSound("Call of Duty： Warzone ｜ Warzone Defeat [Sound Effect].mp3");
const CRATE_AUDIO_RADIUS = 10;
const CRATE_START_RADIUS = 9.5;
const CRATE_FLOOR_TOLERANCE = 1.75;
const CRATE_OCCLUSION_RESTART_DELTA = 0.08;

export const manifest = {
  id: "battle-royale-audio",
  requires: ["spatial-audio-web", "cloudflare-session"],
};

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function createDoorBuffer(audioContext, open) {
  const duration = open ? 0.34 : 0.24;
  const length = Math.max(1, Math.floor(audioContext.sampleRate * duration));
  const buffer = audioContext.createBuffer(1, length, audioContext.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    const t = i / audioContext.sampleRate;
    const envelope = Math.exp(-t * (open ? 9 : 15));
    const thud = Math.sin(2 * Math.PI * (open ? 105 : 135) * t) * 0.72;
    const creak = Math.sin(2 * Math.PI * (open ? 410 : 280) * t) * 0.16;
    const noise = (Math.random() * 2 - 1) * 0.08;
    data[i] = (thud + creak + noise) * envelope;
  }
  return buffer;
}

export async function setup(ctx) {
  const audio = ctx.services.get("audio");
  const network = ctx.services.get("network");
  let mode = "tdm";
  let doorOpenBuffer = null;
  let doorCloseBuffer = null;
  let crateGeneration = 0;
  const crateLoops = new Map();
  const pendingCrates = new Set();

  function ensureDoorBuffers() {
    doorOpenBuffer ??= createDoorBuffer(audio.context, true);
    doorCloseBuffer ??= createDoorBuffer(audio.context, false);
  }

  function crateChannel(crateId) {
    return `br-crate:${crateId}`;
  }

  function stopCrateLoop(crateId) {
    if (!crateId) return;
    audio.stopChannel(crateChannel(crateId));
    crateLoops.delete(crateId);
  }

  function stopAllCrateLoops() {
    crateGeneration += 1;
    for (const crateId of crateLoops.keys()) audio.stopChannel(crateChannel(crateId));
    crateLoops.clear();
    pendingCrates.clear();
  }

  async function startCrateLoop(crate, generation) {
    if (pendingCrates.has(crate.id) || crateLoops.has(crate.id)) return;
    pendingCrates.add(crate.id);
    const occlusion = clamp01(crate.occlusion);
    try {
      const handle = await audio.playSpatial(CRATE_AMBIENT_URL, crate, {
        radius: CRATE_AUDIO_RADIUS,
        gain: 0.48,
        referenceDistance: 1.1,
        rolloffFactor: 4.5,
        occlusion,
        loop: true,
        channel: crateChannel(crate.id),
        replace: true,
      });
      if (mode !== "battle-royale" || generation !== crateGeneration || crate.opened) {
        try { handle?.source?.stop(); } catch {}
        return;
      }
      if (handle) {
        handle.crateOcclusion = occlusion;
        crateLoops.set(crate.id, handle);
      }
    } catch (error) {
      console.warn("Battle royale crate ambient audio", error);
    } finally {
      pendingCrates.delete(crate.id);
    }
  }

  function syncCrateLoops(snapshot) {
    if (mode !== "battle-royale" || snapshot?.mode !== "battle-royale") {
      if (crateLoops.size || pendingCrates.size) stopAllCrateLoops();
      return;
    }

    const crates = Array.isArray(snapshot?.map?.crates) ? snapshot.map.crates : [];
    const spectatorId = snapshot?.spectator?.active ? snapshot.spectator.targetId : null;
    const listener = snapshot?.entities?.find((entity) => entity.id === (spectatorId ?? network.playerId));
    if (!listener) return;

    const known = new Set(crates.map((crate) => crate.id));
    for (const crateId of crateLoops.keys()) {
      if (!known.has(crateId)) stopCrateLoop(crateId);
    }

    const generation = crateGeneration;
    for (const crate of crates) {
      const verticalDistance = Math.abs((crate.y ?? 0) - (listener.y ?? 0));
      const horizontalDistance = Math.hypot(crate.x - listener.x, crate.z - listener.z);
      if (crate.opened || verticalDistance > CRATE_FLOOR_TOLERANCE || horizontalDistance > CRATE_START_RADIUS) {
        stopCrateLoop(crate.id);
        continue;
      }

      const active = crateLoops.get(crate.id);
      if (active) {
        const nextOcclusion = clamp01(crate.occlusion);
        if (Math.abs((active.crateOcclusion ?? 0) - nextOcclusion) >= CRATE_OCCLUSION_RESTART_DELTA) {
          stopCrateLoop(crate.id);
          void startCrateLoop(crate, generation);
          continue;
        }
        active.update(crate);
        continue;
      }
      void startCrateLoop(crate, generation);
    }
  }

  ctx.events.on("network:welcome", async ({ mode: joinedMode, resumed } = {}) => {
    mode = joinedMode === "battle-royale" ? "battle-royale" : "tdm";
    stopAllCrateLoops();
    if (mode !== "battle-royale" || resumed) return;
    try { await audio.playCentered(DEPLOYMENT_URL, { gain: 0.9, channel: "br-deployment", replace: true }); }
    catch (error) { console.warn("Battle royale deployment audio", error); }
  });

  ctx.events.on("game:snapshot", (snapshot) => {
    syncCrateLoops(snapshot);
  });

  ctx.events.on("game:event", async (packet) => {
    if (mode !== "battle-royale") return;
    const payload = packet.payload ?? {};
    try {
      if (packet.event === "world:door") {
        ensureDoorBuffers();
        audio.playSpatialBuffer(payload.open ? doorOpenBuffer : doorCloseBuffer, {
          x: payload.x,
          y: payload.y ?? 0,
          z: payload.z,
        }, { radius: 30, gain: 0.78, referenceDistance: 2, rolloffFactor: 0.55 });
      }
      if (packet.event === "loot:opened") {
        crateGeneration += 1;
        stopCrateLoop(payload.crateId);
        await audio.playSpatial(CRATE_OPEN_URL, { x: payload.x, y: payload.y ?? 0, z: payload.z }, {
          radius: 12,
          gain: 0.68,
          referenceDistance: 1.2,
          rolloffFactor: 3.2,
          occlusion: clamp01(payload.occlusion),
        });
      }
      if (packet.event === "loot:picked" && payload.entityId === network.playerId) {
        await audio.playCentered(LOOT_PICKUP_URL, { gain: 0.8, channel: "br-loot" });
      }
      if (packet.event === "battle-royale:zone-closing") {
        await audio.playCentered(CIRCLE_CLOSING_URL, { gain: 0.8, channel: "br-zone", replace: true });
      }
      if (packet.event === "battle-royale:ended") {
        stopAllCrateLoops();
        await audio.playCentered(payload.winnerId === network.playerId ? VICTORY_URL : DEFEAT_URL, {
          gain: 0.95,
          channel: "br-result",
          replace: true,
        });
      }
    } catch (error) {
      console.warn("Battle royale audio", error);
    }
  });
}
