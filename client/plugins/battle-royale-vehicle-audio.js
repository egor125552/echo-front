export const manifest = {
  id: "battle-royale-vehicle-audio",
  requires: ["spatial-audio-web", "cloudflare-session"],
};

const ENGINE_CHANNEL = "br-vehicle-engine";
const BRAKE_CHANNEL = "br-vehicle-brake";
const ENGINE_RADIUS = 170;
const BRAKE_RADIUS = 105;
const CRASH_RADIUS = 120;
const ENGINE_URL = "/audio/vehicles/ts3/ts3_truck_engine.mp3";
const BRAKE_URL = "/audio/vehicles/ts3/brake_builtin6.mp3";

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
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
  const [engineBuffer, brakeBuffer] = await Promise.all([
    audio.load(ENGINE_URL),
    audio.load(BRAKE_URL),
  ]);
  const crashBuffer = createCrashBuffer(audio.context);
  let engine = null;
  let currentVehicleId = null;
  let brakingActive = false;

  function stopEngine() {
    audio.stopChannel(ENGINE_CHANNEL);
    engine = null;
    currentVehicleId = null;
    brakingActive = false;
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

  function isBraking(vehicle) {
    const speedKph = Math.max(0, Number(vehicle?.speedKph) || 0);
    if (speedKph < 4) return false;
    const throttle = Number(vehicle?.input?.throttle) || 0;
    const forwardSpeed = Number(vehicle?.forwardSpeed) || 0;
    if (vehicle?.input?.handbrake) return true;
    if (throttle < -0.08 && forwardSpeed > 1.25) return true;
    if (throttle > 0.08 && forwardSpeed < -1.25) return true;
    return false;
  }

  function playBrake(vehicle) {
    void audio.resume();
    audio.playSpatialBuffer(brakeBuffer, vehicle, {
      radius: BRAKE_RADIUS,
      gain: 0.78,
      referenceDistance: 2.5,
      rolloffFactor: 0.36,
      airAbsorptionMinHz: 4300,
      loop: false,
      channel: BRAKE_CHANNEL,
      replace: true,
    });
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
        gain: 0.58,
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

    // A single off-road engine recording drives the whole rev range. Raising
    // playbackRate raises both playback speed and pitch, like increasing RPM.
    const rate = clamp(0.78 + speedKph / 92 + throttle * 0.3 + airborne * 0.025, 0.76, 2.2);
    engine.source?.playbackRate?.setTargetAtTime(rate, audio.context.currentTime, 0.09);

    const braking = isBraking(vehicle);
    if (braking && !brakingActive) playBrake(vehicle);
    brakingActive = braking;
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

  ctx.events.on("network:disconnected", () => {
    audio.stopChannel(BRAKE_CHANNEL);
    stopEngine();
  });
}
