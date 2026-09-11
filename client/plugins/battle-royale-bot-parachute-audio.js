const ROOT = "/assets/audio/core/parachute";
const FLIGHT_URL = `${ROOT}/wind/wind-rush.mp3`;
const DEPLOY_URL = `${ROOT}/open-air/deploy-swish.mp3`;
const LAND_URL = `${ROOT}/landing/ground-thump.mp3`;
const FLIGHT_START_RADIUS = 95;
const FLIGHT_AUDIO_RADIUS = 110;
const DEPLOY_AUDIO_RADIUS = 100;
const LAND_AUDIO_RADIUS = 70;
const MAX_ACTIVE_BOT_PARACHUTES = 6;

export const manifest = {
  id: "battle-royale-bot-parachute-audio",
  requires: ["spatial-audio-web", "cloudflare-session"],
};

export async function setup(ctx) {
  const audio = ctx.services.get("audio");
  const network = ctx.services.get("network");
  const loops = new Map();
  const pending = new Set();
  const phases = new Map();
  let mode = "tdm";
  let generation = 0;

  function channel(entityId) {
    return `br-bot-parachute:${entityId}`;
  }

  function stopLoop(entityId) {
    audio.stopChannel(channel(entityId));
    loops.delete(entityId);
    pending.delete(entityId);
  }

  function reset() {
    generation += 1;
    for (const entityId of loops.keys()) audio.stopChannel(channel(entityId));
    loops.clear();
    pending.clear();
    phases.clear();
  }

  function listenerFor(snapshot) {
    const spectatorId = snapshot?.spectator?.active ? snapshot.spectator.targetId : null;
    return snapshot?.entities?.find((entity) => entity.id === (spectatorId ?? network.playerId)) ?? null;
  }

  function distance2(a, b) {
    return Math.hypot((Number(a?.x) || 0) - (Number(b?.x) || 0), (Number(a?.z) || 0) - (Number(b?.z) || 0));
  }

  async function playCue(url, bot, options) {
    try {
      await audio.playSpatial(url, bot, options);
    } catch (error) {
      console.warn("Bot parachute cue audio", error);
    }
  }

  async function startLoop(bot, expectedGeneration) {
    if (loops.has(bot.id) || pending.has(bot.id)) return;
    pending.add(bot.id);
    try {
      const handle = await audio.playSpatial(FLIGHT_URL, bot, {
        radius: FLIGHT_AUDIO_RADIUS,
        gain: bot.parachute?.phase === "freefall" ? 0.30 : 0.22,
        referenceDistance: 3.5,
        rolloffFactor: 0.48,
        airAbsorptionMinHz: 5000,
        loop: true,
        channel: channel(bot.id),
        replace: true,
      });
      if (mode !== "battle-royale" || expectedGeneration !== generation || !bot.parachute?.airborne) {
        try { handle?.source?.stop(); } catch {}
        return;
      }
      if (handle) loops.set(bot.id, handle);
    } catch (error) {
      console.warn("Bot parachute flight audio", error);
    } finally {
      pending.delete(bot.id);
    }
  }

  function sync(snapshot) {
    if (mode !== "battle-royale" || snapshot?.mode !== "battle-royale") {
      if (loops.size || pending.size || phases.size) reset();
      return;
    }

    const listener = listenerFor(snapshot);
    if (!listener) return;
    const bots = (snapshot.entities ?? []).filter((entity) => entity.bot && entity.id !== listener.id);
    const visibleIds = new Set(bots.map((bot) => bot.id));

    for (const bot of bots) {
      const previous = phases.get(bot.id) ?? null;
      const phase = bot.parachute?.phase ?? "grounded";
      const airborne = Boolean(bot.parachute?.airborne);
      const distance = distance2(listener, bot);

      if (previous && previous !== phase && phase === "deployed" && distance <= DEPLOY_AUDIO_RADIUS) {
        void playCue(DEPLOY_URL, bot, {
          radius: DEPLOY_AUDIO_RADIUS,
          gain: 0.48,
          referenceDistance: 3,
          rolloffFactor: 0.55,
        });
      }
      if (previous && previous !== "landed" && phase === "landed" && distance <= LAND_AUDIO_RADIUS) {
        void playCue(LAND_URL, bot, {
          radius: LAND_AUDIO_RADIUS,
          gain: 0.55,
          referenceDistance: 2.5,
          rolloffFactor: 0.62,
        });
      }
      phases.set(bot.id, airborne ? phase : phase);
    }

    for (const entityId of [...phases.keys()]) {
      if (!visibleIds.has(entityId)) phases.delete(entityId);
    }

    const nearestAirborne = bots
      .filter((bot) => bot.alive && bot.parachute?.airborne && distance2(listener, bot) <= FLIGHT_START_RADIUS)
      .sort((a, b) => distance2(listener, a) - distance2(listener, b))
      .slice(0, MAX_ACTIVE_BOT_PARACHUTES);
    const wanted = new Set(nearestAirborne.map((bot) => bot.id));

    for (const entityId of [...loops.keys()]) {
      if (!wanted.has(entityId)) stopLoop(entityId);
    }

    const expectedGeneration = generation;
    for (const bot of nearestAirborne) {
      const active = loops.get(bot.id);
      if (active) active.update(bot);
      else void startLoop(bot, expectedGeneration);
    }
  }

  ctx.events.on("network:welcome", ({ mode: joinedMode } = {}) => {
    mode = joinedMode === "battle-royale" ? "battle-royale" : "tdm";
    reset();
  });
  ctx.events.on("game:snapshot", sync);
  ctx.events.on("network:disconnected", reset);
}
