export const manifest = {
  id: "battle-royale-vehicle-audio",
  requires: ["spatial-audio-web", "cloudflare-session"],
};

const ENGINE_CHANNEL = "br-vehicle-engine";
const ENGINE_RADIUS = 170;
const CRASH_RADIUS = 120;

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}

function createEngineLoop(context) {
  const duration = 1;
  const length = Math.max(1, Math.floor(context.sampleRate * duration));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  const base = 40;
  for (let i = 0; i < length; i += 1) {
    const t = i / context.sampleRate;
    const pulse = 0.34 * Math.sin(Math.PI * 2 * base * t)
      + 0.19 * Math.sin(Math.PI * 2 * base * 2 * t + 0.28)
      + 0.11 * Math.sin(Math.PI * 2 * base * 3 * t + 0.71)
      + 0.06 * Math.sin(Math.PI * 2 * base * 5 * t + 1.1);
    const mechanical = 0.04 * Math.sin(Math.PI * 2 * 13 * t)
      * Math.sin(Math.PI * 2 * base * 4 * t);
    data[i] = clamp(pulse + mechanical, -0.78, 0.78);
  }
  return buffer;
}

function createCrashBuffer(context) {
  const duration = 0.55;
  const length = Math.max(1, Math.floor(context.sampleRate * duration));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  let noiseMemory = 0;
  for (let i = 0; i < length; i += 1) {
    const t = i / context.sampleRate;
    const envelope = Math.pow(Math.max(0, 1 - t / duration), 2.7);
    noiseMemory = noiseMemory * 0.72 + (Math.random() * 2 - 1) * 0.28;
    const body = Math.sin(Math.PI * 2 * 74 * t) * Math.exp(-t * 11);
    data[i] = clamp((noiseMemory * 0.86 + body * 0.55) * envelope, -1, 1);
  }
  return buffer;
}

export async function setup(ctx) {
  const audio = ctx.services.get("audio");
  const network = ctx.services.get("network");
  const engineBuffer = createEngineLoop(audio.context);
  const crashBuffer = createCrashBuffer(audio.context);
  let engine = null;
  let currentVehicleId = null;

  function stopEngine() {
    audio.stopChannel(ENGINE_CHANNEL);
    engine = null;
    currentVehicleId = null;
  }

  function playerFor(snapshot) {
    const observedId = snapshot?.spectator?.active
      ? snapshot.spectator.targetId
      : network.playerId;
    return snapshot?.entities?.find((entity) => entity.id === observedId) ?? null;
  }

  function distance2(a, b) {
    return Math.hypot(
      (Number(a?.x) || 0) - (Number(b?.x) || 0),
      (Number(a?.z) || 0) - (Number(b?.z) || 0),
    );
  }

  function updateEngine(snapshot) {
    if (snapshot?.mode !== "battle-royale") {
      stopEngine();
      return;
    }
    const listener = playerFor(snapshot);
    const vehicle = snapshot?.vehicles?.[0] ?? null;
    if (!listener || !vehicle || distance2(listener, vehicle) > ENGINE_RADIUS + 10) {
      stopEngine();
      return;
    }

    if (!engine || currentVehicleId !== vehicle.id) {
      stopEngine();
      void audio.resume();
      engine = audio.playSpatialBuffer(engineBuffer, vehicle, {
        radius: ENGINE_RADIUS,
        gain: 0.48,
        referenceDistance: 2.8,
        rolloffFactor: 0.28,
        airAbsorptionMinHz: 4300,
        loop: true,
        channel: ENGINE_CHANNEL,
        replace: true,
      });
      currentVehicleId = vehicle.id;
    }
    if (!engine) return;

    engine.update?.(vehicle);
    const speedKph = Math.max(0, Number(vehicle.speedKph) || 0);
    const throttle = Math.abs(Number(vehicle.input?.throttle) || 0);
    const airborne = Math.max(0, 4 - (Number(vehicle.groundedWheels) || 0));
    const rate = clamp(0.76 + speedKph / 82 + throttle * 0.24 + airborne * 0.035, 0.72, 2.45);
    engine.source?.playbackRate?.setTargetAtTime(rate, audio.context.currentTime, 0.08);
  }

  ctx.events.on("game:snapshot", updateEngine);

  ctx.events.on("game:event", (packet) => {
    if (packet.event !== "vehicle:impact") return;
    const payload = packet.payload ?? {};
    const delta = Math.max(0, Number(payload.deltaSpeed) || 0);
    if (delta < 3.2) return;
    void audio.resume();
    audio.playSpatialBuffer(crashBuffer, payload, {
      radius: CRASH_RADIUS,
      gain: clamp(0.28 + delta / 13, 0.35, 1.15),
      referenceDistance: 2.5,
      rolloffFactor: 0.42,
      airAbsorptionMinHz: 3900,
      loop: false,
    });
  });

  ctx.events.on("network:disconnected", stopEngine);
}
