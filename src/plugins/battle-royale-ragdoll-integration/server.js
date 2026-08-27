export const manifest = {
  id: "battle-royale-ragdoll-integration",
  version: "1.0.1",
  requires: [
    "match-api",
    "battle-royale-ragdoll",
    "battle-royale-vehicle",
    "movement",
    "battle-royale",
  ],
  capabilities: ["services.consume", "components.read"],
};

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
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
    const vehicle = vehicles.stateFor();
    if (!vehicle || vehicle.driverId !== playerId) return false;
    const speed = Math.max(0, Number(vehicle.speed) || 0);
    if (speed < Number(ragdoll.constants?.vehicleEjectSpeed ?? 3.5)) return false;

    const linvel = vehicle.linvel ?? { x: 0, y: 0, z: 0 };
    const angle = Number(vehicle.angle) || 0;
    const side = Number(input.strafe) < -0.15 ? -1 : 1;
    const right = { x: Math.cos(angle), z: Math.sin(angle) };
    const outward = 1.45 + Math.min(1.2, speed * 0.045);
    const upward = 1.1 + Math.min(1.1, speed * 0.04);

    if (!vehicles.exit(playerId, now, "jump-out")) return false;
    const transform = ctx.components.get(playerId, "Transform");
    return ragdoll.activate(playerId, {
      reason: "vehicle-eject",
      position: transform ? { x: transform.x, y: transform.y + 0.12, z: transform.z } : undefined,
      angle,
      velocity: {
        x: Number(linvel.x) || 0,
        y: Number(linvel.y) || 0,
        z: Number(linvel.z) || 0,
      },
      impulse: {
        x: right.x * side * outward,
        y: upward,
        z: right.z * side * outward,
      },
    }, now);
  }

  matchApi.handleInput = (playerId, input = {}, now = Date.now()) => {
    if (ragdoll.isActive(playerId)) {
      movement.setInput(playerId, {});
      ragdoll.setInput(playerId, input);
      return;
    }

    if (battleRoyale.isActive() && vehicles.isDriving(playerId) && input.interactPressed) {
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
}
