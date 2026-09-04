export const manifest = {
  id: "battle-royale-vehicle-audio",
  requires: ["spatial-audio-web", "cloudflare-session"],
};

const ENGINE_CHANNEL = "br-vehicle-engine";
const BRAKE_CHANNEL = "br-vehicle-brake";
const TRUCK_ENGINE_RADIUS = 170;
const SPORT_ENGINE_RADIUS = 220;
const BRAKE_RADIUS = 105;
const CRASH_RADIUS = 120;
const CABIN_TRUCK_CUTOFF_HZ = 3600;
const CABIN_SPORT_CUTOFF_HZ = 4600;
const CABIN_OPEN_CUTOFF_HZ = 18000;
const OCCLUSION_RESTART_DELTA = 0.08;
const TRUCK_ENGINE_URL = "/audio/vehicles/ts3/ts3_truck_engine.mp3";
const SPORT_ENGINE_URL = "/audio/vehicles/ts3/engine.mp3";
const BRAKE_URL = "/audio/vehicles/ts3/brake_builtin6.mp3";
const TRUCK_LOOP_START_SECONDS = 0.249818594;
const TRUCK_LOOP_END_SECONDS = 1.827619048;
const SPORT_LOOP_START_SECONDS = 0.210612245;
const SPORT_LOOP_END_SECONDS = 0.950249433;

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
  const [truckEngineBuffer, sportEngineBuffer, brakeBuffer] = await Promise.all([
    audio.load(TRUCK_ENGINE_URL),
    audio.load(SPORT_ENGINE_URL),
    audio.load(BRAKE_URL),
  ]);
  const crashBuffer = createCrashBuffer(audio.context);
  let engine = null;
  let currentVehicleId = null;
  let currentProfile = null;
  let currentOcclusion = 0;
  let brakingActive = false;

  function profileFor(vehicle) {
    return vehicle?.audioProfile === "sport" || vehicle?.kind === "supercar" ? "sport" : "truck";
  }

  function radiusFor(vehicle) {
    return profileFor(vehicle) === "sport" ? SPORT_ENGINE_RADIUS : TRUCK_ENGINE_RADIUS;
  }

  function bufferFor(vehicle) {
    return profileFor(vehicle) === "sport" ? sportEngineBuffer : truckEngineBuffer;
  }

  function stopEngine() {
    audio.stopChannel(ENGINE_CHANNEL);
    engine = null;
    currentVehicleId = null;
    currentProfile = null;
    currentOcclusion = 0;
    brakingActive = false;
  }

  function observedPlayerId(snapshot) {
    return snapshot?.spectator?.active
      ? snapshot.spectator.targetId
      : network.playerId;
  }

  function playerFor(snapshot) {
    const observedId = observedPlayerId(snapshot);
    return snapshot?.entities?.find((entity) => entity.id === observedId) ?? null;
  }

  function updateCabinMuffle(snapshot) {
    const observedId = observedPlayerId(snapshot);
    const driven = (Array.isArray(snapshot?.vehicles) ? snapshot.vehicles : [])
      .find((vehicle) => vehicle?.driverId === observedId) ?? null;
    const cutoff = !driven
      ? CABIN_OPEN_CUTOFF_HZ
      : profileFor(driven) === "sport"
        ? CABIN_SPORT_CUTOFF_HZ
        : CABIN_TRUCK_CUTOFF_HZ;
    audio.setCabinMuffleCutoff?.(cutoff);
  }

  function distance2(a, b) {
    return Math.hypot(
      (Number(a?.x) || 0) - (Number(b?.x) || 0),
      (Number(a?.z) || 0) - (Number(b?.z) || 0),
    );
  }

  function nearestAudibleVehicle(snapshot, listener) {
    return (Array.isArray(snapshot?.vehicles) ? snapshot.vehicles : [])
      .map((vehicle) => ({
        vehicle,
        distance: distance2(listener, vehicle),
        radius: radiusFor(vehicle),
      }))
      .filter((entry) => entry.distance <= entry.radius + 10)
      .sort((a, b) => a.distance - b.distance)[0]?.vehicle ?? null;
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
      occlusion: clamp(vehicle?.occlusion, 0, 1),
      loop: false,
      channel: BRAKE_CHANNEL,
      replace: true,
    });
  }

  function updateEngine(snapshot) {
    if (snapshot?.mode !== "battle-royale") {
      audio.setCabinMuffleCutoff?.(CABIN_OPEN_CUTOFF_HZ);
      stopEngine();
      return;
    }
    updateCabinMuffle(snapshot);
    const listener = playerFor(snapshot);
    const vehicle = listener ? nearestAudibleVehicle(snapshot, listener) : null;
    if (!listener || !vehicle) {
      stopEngine();
      return;
    }

    const profile = profileFor(vehicle);
    const occlusion = clamp(vehicle?.occlusion, 0, 1);
    const acousticsChanged = Math.abs(currentOcclusion - occlusion) >= OCCLUSION_RESTART_DELTA;
    if (!engine || currentVehicleId !== vehicle.id || currentProfile !== profile || acousticsChanged) {
      stopEngine();
      void audio.resume();
      engine = audio.playSpatialBuffer(bufferFor(vehicle), vehicle, {
        radius: radiusFor(vehicle),
        gain: profile === "sport" ? 0.66 : 0.58,
        referenceDistance: profile === "sport" ? 3.2 : 2.8,
        rolloffFactor: profile === "sport" ? 0.25 : 0.28,
        airAbsorptionMinHz: profile === "sport" ? 5200 : 4300,
        occlusion,
        loop: true,
        channel: ENGINE_CHANNEL,
        replace: true,
      });
      if (engine?.source) {
        if (profile === "truck" && truckEngineBuffer.duration > TRUCK_LOOP_END_SECONDS) {
          engine.source.loopStart = TRUCK_LOOP_START_SECONDS;
          engine.source.loopEnd = TRUCK_LOOP_END_SECONDS;
        } else if (profile === "sport" && sportEngineBuffer.duration > SPORT_LOOP_END_SECONDS) {
          engine.source.loopStart = SPORT_LOOP_START_SECONDS;
          engine.source.loopEnd = SPORT_LOOP_END_SECONDS;
        }
      }
      currentVehicleId = vehicle.id;
      currentProfile = profile;
      currentOcclusion = occlusion;
    }
    if (!engine) return;

    engine.update?.(vehicle);
    const speedKph = Math.max(0, Number(vehicle.speedKph) || 0);
    const throttle = Math.abs(Number(vehicle.input?.throttle) || 0);
    const airborne = Math.max(0, 4 - (Number(vehicle.groundedWheels) || 0));

    const rate = profile === "sport"
      ? clamp(0.9 + speedKph / 145 + throttle * 0.5 + airborne * 0.02, 0.86, 2.5)
      : clamp(0.78 + speedKph / 92 + throttle * 0.3 + airborne * 0.025, 0.76, 2.2);
    engine.source?.playbackRate?.setTargetAtTime(rate, audio.context.currentTime, 0.09);

    const braking = isBraking(vehicle);
    if (braking && !brakingActive) playBrake(vehicle);
    brakingActive = braking;
  }

  ctx.events.on("game:snapshot", updateEngine);

  ctx.events.on("game:event", (packet) => {
    if (packet.event !== "vehicle:impact") return;
    const payload = packet.payload ?? {};
    const forceSeverity = Math.max(0, Number(payload.crashSeverity) || 0);
    const delta = Math.max(0, Number(payload.deltaSpeed) || 0);
    const strength = payload.impactSource === "rapier-contact-force" && forceSeverity > 0
      ? forceSeverity
      : delta;
    if (strength < 1.6) return;
    void audio.resume();
    audio.playSpatialBuffer(crashBuffer, payload, {
      radius: CRASH_RADIUS * clamp(0.78 + strength / 45, 0.8, 1.35),
      gain: clamp(0.24 + strength / 18, 0.3, 1.2),
      referenceDistance: 2.5,
      rolloffFactor: 0.42,
      airAbsorptionMinHz: 3900,
      occlusion: clamp(payload?.occlusion, 0, 1),
      loop: false,
    });
  });

  ctx.events.on("network:disconnected", () => {
    audio.setCabinMuffleCutoff?.(CABIN_OPEN_CUTOFF_HZ);
    audio.stopChannel(BRAKE_CHANNEL);
    stopEngine();
  });
}
