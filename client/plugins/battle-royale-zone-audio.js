const WARZONE_AUDIO_ROOT = "/assets/audio/warzone/";
const GAS_PROXIMITY_URL = `${WARZONE_AUDIO_ROOT}${encodeURIComponent("Call of Duty： Warzone ｜ Gas Circle Proximity (Loop) [Sound Effect].mp3")}`;
const GAS_CHANNEL = "br-zone-proximity";
const GAS_AUDIBLE_DISTANCE = 145;
const GAS_REFERENCE_DISTANCE = 5;
const GAS_ROLLOFF = 0.17;
const GAS_LOOP_START_SECONDS = 0.08;
const GAS_LOOP_END_PADDING_SECONDS = 0.12;

export const manifest = {
  id: "battle-royale-zone-audio",
  requires: ["spatial-audio-web", "cloudflare-session"],
};

export async function setup(ctx) {
  const audio = ctx.services.get("audio");
  const network = ctx.services.get("network");
  let mode = "tdm";
  let closingActive = false;
  let loopHandle = null;
  let pending = false;
  let generation = 0;

  function stopLoop() {
    generation += 1;
    audio.stopChannel(GAS_CHANNEL);
    loopHandle = null;
    pending = false;
  }

  function listenerFor(snapshot) {
    const spectatorId = snapshot?.spectator?.active ? snapshot.spectator.targetId : null;
    return snapshot?.entities?.find((entity) => entity.id === (spectatorId ?? network.playerId)) ?? null;
  }

  function proximityPosition(listener, zone) {
    const zx = Number(zone?.x) || 0;
    const zz = Number(zone?.z) || 0;
    const radius = Math.max(0, Number(zone?.radius) || 0);
    const dx = (Number(listener?.x) || 0) - zx;
    const dz = (Number(listener?.z) || 0) - zz;
    const radialDistance = Math.hypot(dx, dz);

    let ux;
    let uz;
    if (radialDistance > 0.01) {
      ux = dx / radialDistance;
      uz = dz / radialDistance;
    } else {
      const angle = Number(listener?.angle) || 0;
      ux = Math.sin(angle);
      uz = -Math.cos(angle);
    }

    return {
      position: {
        x: zx + ux * radius,
        y: Number(listener?.y) || 0,
        z: zz + uz * radius,
      },
      distanceToGas: Math.abs(radius - radialDistance),
      outside: radialDistance > radius,
    };
  }

  function trimLoopBoundary(handle) {
    const source = handle?.source;
    const duration = Number(source?.buffer?.duration);
    if (!source || !(duration > 0.4)) return;
    const start = Math.min(GAS_LOOP_START_SECONDS, duration * 0.12);
    const end = Math.max(start + 0.15, duration - GAS_LOOP_END_PADDING_SECONDS);
    source.loopStart = start;
    source.loopEnd = Math.min(duration, end);
  }

  async function startLoop(position, expectedGeneration) {
    if (pending || loopHandle) return;
    pending = true;
    try {
      const handle = await audio.playSpatial(GAS_PROXIMITY_URL, position, {
        radius: GAS_AUDIBLE_DISTANCE,
        gain: 0.92,
        referenceDistance: GAS_REFERENCE_DISTANCE,
        rolloffFactor: GAS_ROLLOFF,
        airAbsorptionMinHz: 5200,
        loop: true,
        channel: GAS_CHANNEL,
        replace: true,
      });
      if (mode !== "battle-royale" || expectedGeneration !== generation || !closingActive) {
        try { handle?.source?.stop(); } catch {}
        return;
      }
      trimLoopBoundary(handle);
      loopHandle = handle;
    } catch (error) {
      console.warn("Battle royale gas proximity audio", error);
    } finally {
      pending = false;
    }
  }

  function sync(snapshot) {
    if (mode !== "battle-royale" || snapshot?.mode !== "battle-royale") {
      if (loopHandle || pending) stopLoop();
      return;
    }
    const listener = listenerFor(snapshot);
    const zone = snapshot?.match?.zone;
    if (!listener || !zone || !Number.isFinite(Number(zone.radius))) return;

    const graceEndsAt = Number(zone.graceEndsAt);
    if (!closingActive && Number.isFinite(graceEndsAt) && Date.now() >= graceEndsAt) {
      closingActive = true;
    }
    if (!closingActive) {
      if (loopHandle || pending) stopLoop();
      return;
    }

    const proximity = proximityPosition(listener, zone);
    if (proximity.distanceToGas > GAS_AUDIBLE_DISTANCE) {
      if (loopHandle || pending) stopLoop();
      return;
    }
    if (loopHandle) {
      loopHandle.update(proximity.position);
      return;
    }
    void startLoop(proximity.position, generation);
  }

  ctx.events.on("network:welcome", ({ mode: joinedMode } = {}) => {
    mode = joinedMode === "battle-royale" ? "battle-royale" : "tdm";
    closingActive = false;
    stopLoop();
  });

  ctx.events.on("game:snapshot", sync);

  ctx.events.on("game:event", (packet) => {
    if (mode !== "battle-royale") return;
    if (packet.event === "battle-royale:zone-closing") closingActive = true;
    if (packet.event === "battle-royale:ended") {
      closingActive = false;
      stopLoop();
    }
  });
}
