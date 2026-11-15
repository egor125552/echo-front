export const manifest = {
  id: "battle-royale-ragdoll-integration",
  version: "1.5.0",
  requires: [
    "match-api",
    "battle-royale-ragdoll",
    "battle-royale-vehicle",
    "movement",
    "battle-royale",
  ],
  capabilities: ["services.consume", "components.read", "events.emit"],
};

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}

const EJECTION_PROFILE = Object.freeze([
  Object.freeze({ speedKph: 0, upward: 1.0, outward: 1.8 }),
  Object.freeze({ speedKph: 15, upward: 1.35, outward: 2.5 }),
  Object.freeze({ speedKph: 30, upward: 1.85, outward: 3.4 }),
  Object.freeze({ speedKph: 50, upward: 2.8, outward: 4.6 }),
  Object.freeze({ speedKph: 70, upward: 8.5, outward: 6.2 }),
  Object.freeze({ speedKph: 100, upward: 12.0, outward: 8.2 }),
  Object.freeze({ speedKph: 150, upward: 16.0, outward: 11.0 }),
  Object.freeze({ speedKph: 200, upward: 20.0, outward: 14.0 }),
]);

function profileValue(speedKph, field) {
  const speed = Math.max(0, Number(speedKph) || 0);
  if (speed <= EJECTION_PROFILE[0].speedKph) return EJECTION_PROFILE[0][field];
  for (let index = 1; index < EJECTION_PROFILE.length; index += 1) {
    const upper = EJECTION_PROFILE[index];
    if (speed > upper.speedKph) continue;
    const lower = EJECTION_PROFILE[index - 1];
    const span = Math.max(0.001, upper.speedKph - lower.speedKph);
    const t = clamp((speed - lower.speedKph) / span, 0, 1);
    return lower[field] + (upper[field] - lower[field]) * t;
  }
  return EJECTION_PROFILE.at(-1)[field];
}

function ejectionVelocityDelta(speed, angle, input) {
  const speedKph = Math.max(0, Number(speed) || 0) * 3.6;
  const upward = profileValue(speedKph, "upward");
  const outward = profileValue(speedKph, "outward");
  const side = Number(input.strafe) < -0.15 ? -1 : 1;
  const right = { x: Math.cos(angle), z: Math.sin(angle) };
  return {
    x: right.x * side * outward,
    y: upward,
    z: right.z * side * outward,
  };
}

export async function setup(ctx) {
  const matchApi = ctx.services.get("match-api");
  const ragdoll = ctx.services.get("ragdoll");
  const vehicles = ctx.services.get("vehicles");
  const movement = ctx.services.get("movement");
  const battleRoyale = ctx.services.get("battle-royale");

  const originalHandleInput = matchApi.handleInput.bind(matchApi);
  const originalStep = matchApi.step.bind(matchApi);
  const originalSnapshot = matchApi.snapshot.bind(matchApi);
  const originalSnapshotFor = matchApi.snapshotFor.bind(matchApi);
  const originalEventsForPlayer = matchApi.eventsForPlayer.bind(matchApi);

  function ejectFromVehicle(playerId, input, now) {
    const isDriver = vehicles.isDriving(playerId);
    const isPassenger = Boolean(vehicles.isPassenger?.(playerId));
    const vehicle = isDriver
      ? (typeof vehicles.vehicleForDriver === "function" ? vehicles.vehicleForDriver(playerId) : vehicles.stateFor())
      : (isPassenger && typeof vehicles.vehicleForPassenger === "function" ? vehicles.vehicleForPassenger(playerId) : null);
    if (!vehicle) return false;
    if (isDriver && vehicle.driverId !== playerId) return false;
    if (isPassenger && !vehicle.passengerIds?.includes(playerId)) return false;
    const speed = Math.max(0, Number(vehicle.speed) || 0);
    if (speed < Number(ragdoll.constants?.vehicleEjectSpeed ?? 3.5)) return false;

    const linvel = vehicle.linvel ?? { x: 0, y: 0, z: 0 };
    const angle = Number(vehicle.angle) || 0;
    const passengerIds = isDriver && vehicle.id && typeof vehicles.passengerIds === "function"
      ? vehicles.passengerIds(vehicle.id)
      : [];

    function activateEjected(entityId, ejectionInput, passengerIndex = null) {
      const velocityDelta = ejectionVelocityDelta(speed, angle, ejectionInput);
      const spread = passengerIndex == null ? 1 : 1 + Math.floor(passengerIndex / 2) * 0.15;
      const launchVelocity = {
        x: (Number(linvel.x) || 0) + velocityDelta.x * spread,
        y: (Number(linvel.y) || 0) + velocityDelta.y,
        z: (Number(linvel.z) || 0) + velocityDelta.z * spread,
      };
      const transform = ctx.components.get(entityId, "Transform");
      const speedKph = speed * 3.6;
      const verticalSpawnOffset = speedKph < 55 ? 0.04 : 0.12;
      const activated = ragdoll.activate(entityId, {
        reason: "vehicle-eject",
        position: transform ? { x: transform.x, y: transform.y + verticalSpawnOffset, z: transform.z } : undefined,
        angle,
        velocity: launchVelocity,
      }, now);
      if (!activated) return false;
      ctx.events.emit("ragdoll:vehicle-eject", {
        entityId,
        vehicleId: vehicle.id ?? null,
        vehicleKind: vehicle.kind ?? null,
        passenger: passengerIndex != null || (isPassenger && entityId === playerId),
        passengerIndex,
        speed,
        speedKph,
        inheritedVelocity: {
          x: Number(linvel.x) || 0,
          y: Number(linvel.y) || 0,
          z: Number(linvel.z) || 0,
        },
        launchVelocity,
        upwardDelta: velocityDelta.y,
        outwardDelta: Math.hypot(velocityDelta.x, velocityDelta.z) * spread,
        now,
      });
      if (transform) {
        ctx.events.emit("sound:spatial", {
          entityId,
          key: "ragdoll.eject.launch",
          intensity: clamp(speedKph / 95, 0.45, 1.35),
          x: transform.x,
          y: transform.y,
          z: transform.z,
          radius: 32,
        });
      }
      return true;
    }

    if (!vehicles.exit(playerId, now, "jump-out")) return false;
    const activated = activateEjected(playerId, input);
    for (let index = 0; index < passengerIds.length; index += 1) {
      const passengerId = passengerIds[index];
      if (ragdoll.isActive(passengerId)) continue;
      activateEjected(passengerId, { strafe: index % 2 === 0 ? -1 : 1 }, index);
    }
    return activated;
  }

  matchApi.handleInput = (playerId, input = {}, now = Date.now()) => {
    if (ragdoll.isActive(playerId)) {
      movement.setInput(playerId, {});
      if (input.parachutePressed) {
        if (ragdoll.deployParachute(playerId, now)) return;
        ctx.events.emit("parachute:deploy-blocked", {
          entityId: playerId,
          reason: "insufficient-clearance",
          now,
        });
      }
      ragdoll.setInput(playerId, input);
      return;
    }

    if (battleRoyale.isActive() && (vehicles.isDriving(playerId) || vehicles.isPassenger?.(playerId)) && input.interactPressed) {
      if (ejectFromVehicle(playerId, input, now)) return;
    }

    originalHandleInput(playerId, input, now);
  };

  matchApi.step = (dt, now = Date.now()) => {
    ragdoll.beginFrame(dt, now);
    const result = originalStep(dt, now);
    ragdoll.endFrame(now);
    return result;
  };

  matchApi.snapshot = (now = Date.now()) => ({
    ...originalSnapshot(now),
    ragdolls: ragdoll.snapshot(),
  });

  matchApi.snapshotFor = (playerId, now = Date.now()) => ({
    ...originalSnapshotFor(playerId, now),
    ragdolls: ragdoll.snapshot(),
  });

  matchApi.eventsForPlayer = (playerId, packets = []) => {
    const base = originalEventsForPlayer(playerId, packets);
    const seen = new Set(base);
    const extra = packets.filter((packet) => {
      if (seen.has(packet)) return false;
      if (!String(packet.event ?? "").startsWith("ragdoll:")) return false;
      return packet.payload?.entityId === playerId;
    });
    return [...base, ...extra];
  };

  ragdoll.ejectFromVehicle = (playerId, input = {}, now = Date.now()) =>
    ejectFromVehicle(playerId, {
      forward: clamp(input.forward, -1, 1),
      strafe: clamp(input.strafe, -1, 1),
      turn: clamp(input.turn, -1, 1),
      sprint: Boolean(input.sprint),
    }, now);

  ragdoll.ejectionProfile = EJECTION_PROFILE;
}
