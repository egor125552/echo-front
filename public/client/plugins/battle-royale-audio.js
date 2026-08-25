const WARZONE_AUDIO_ROOT = "/assets/audio/warzone/";

function warzoneSound(fileName) {
  return `${WARZONE_AUDIO_ROOT}${encodeURIComponent(fileName)}`;
}

const DEPLOYMENT_URL = warzoneSound("Call of Duty： Warzone ｜ Squad Leader Jump [Sound Effect].mp3");
const CRATE_OPEN_URL = warzoneSound("Call of Duty： Warzone ｜ Loot Cache Chest Open [Sound Effect].mp3");
const LOOT_PICKUP_URL = warzoneSound("Call of Duty： Warzone ｜ Legendary Loot Pickup ♪ [Sound Effect].mp3");
const CIRCLE_CLOSING_URL = warzoneSound("Call of Duty： Warzone ｜ Circle Closing Now! [Sound Effect].mp3");
const VICTORY_URL = warzoneSound("Call of Duty： Warzone ｜ Warzone Victory! [Sound Effect].mp3");
const DEFEAT_URL = warzoneSound("Call of Duty： Warzone ｜ Warzone Defeat [Sound Effect].mp3");

export const manifest = {
  id: "battle-royale-audio",
  requires: ["spatial-audio-web", "cloudflare-session"],
};

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

function createCrateCloseBuffer(audioContext) {
  const duration = 0.3;
  const length = Math.max(1, Math.floor(audioContext.sampleRate * duration));
  const buffer = audioContext.createBuffer(1, length, audioContext.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    const t = i / audioContext.sampleRate;
    const envelope = Math.exp(-t * 13);
    const lid = Math.sin(2 * Math.PI * 118 * t) * 0.82;
    const latch = Math.sin(2 * Math.PI * 560 * t) * Math.exp(-t * 25) * 0.22;
    const noise = (Math.random() * 2 - 1) * 0.11;
    data[i] = (lid + latch + noise) * envelope;
  }
  return buffer;
}

export async function setup(ctx) {
  const audio = ctx.services.get("audio");
  const network = ctx.services.get("network");
  let mode = "tdm";
  let doorOpenBuffer = null;
  let doorCloseBuffer = null;
  let crateCloseBuffer = null;

  function ensureDoorBuffers() {
    doorOpenBuffer ??= createDoorBuffer(audio.context, true);
    doorCloseBuffer ??= createDoorBuffer(audio.context, false);
  }

  function ensureCrateCloseBuffer() {
    crateCloseBuffer ??= createCrateCloseBuffer(audio.context);
  }

  ctx.events.on("network:welcome", async ({ mode: joinedMode, resumed } = {}) => {
    mode = joinedMode === "battle-royale" ? "battle-royale" : "tdm";
    if (mode !== "battle-royale" || resumed) return;
    try { await audio.playCentered(DEPLOYMENT_URL, { gain: 0.9, channel: "br-deployment", replace: true }); }
    catch (error) { console.warn("Battle royale deployment audio", error); }
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
        await audio.playSpatial(CRATE_OPEN_URL, { x: payload.x, y: payload.y ?? 0, z: payload.z }, {
          radius: 40,
          gain: 1.15,
          referenceDistance: 3,
          rolloffFactor: 0.45,
        });
      }
      if (packet.event === "loot:closed") {
        ensureCrateCloseBuffer();
        audio.playSpatialBuffer(crateCloseBuffer, {
          x: payload.x,
          y: payload.y ?? 0,
          z: payload.z,
        }, { radius: 36, gain: 1, referenceDistance: 3, rolloffFactor: 0.5 });
      }
      if (packet.event === "loot:picked" && payload.entityId === network.playerId) {
        await audio.playCentered(LOOT_PICKUP_URL, { gain: 0.8, channel: "br-loot" });
      }
      if (packet.event === "battle-royale:zone-closing") {
        await audio.playCentered(CIRCLE_CLOSING_URL, { gain: 0.8, channel: "br-zone", replace: true });
      }
      if (packet.event === "battle-royale:ended") {
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
