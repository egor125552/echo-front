export const manifest = {
  id: "battle-royale-vehicle-integration",
  version: "1.2.1",
  requires: ["match-api", "battle-royale-vehicle", "movement", "battle-royale", "map-test-arena"],
  capabilities: ["services.consume", "components.read"],
};

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

const VEHICLE_NETWORK_INTEREST_RADIUS = 240;

export async function setup(ctx) {
  const matchApi = ctx.services.get("match-api");
  const vehicles = ctx.services.get("vehicles");
  const movement = ctx.services.get("movement");
  const battleRoyale = ctx.services.get("battle-royale");
  const map = ctx.services.get("map");

  const originalHandleInput = matchApi.handleInput.bind(matchApi);
  const originalStep = matchApi.step.bind(matchApi);
  const originalSnapshot = matchApi.snapshot.bind(matchApi);
  const originalSnapshotFor = matchApi.snapshotFor.bind(matchApi);
  const originalEventsForPlayer = matchApi.eventsForPlayer.bind(matchApi);

  function decorateVehicles(listener = null, observedEntityId = null) {
    const source = listener && typeof vehicles.networkSnapshot === "function"
      ? vehicles.networkSnapshot({
        center: listener,
        radius: VEHICLE_NETWORK_INTEREST_RADIUS,
        observedEntityId,
      })
      : vehicles.snapshot();
    return source.map((vehicle) => {
      const acousticZone = map.acousticZoneAt?.(vehicle) ?? "outdoor";
      const rawOcclusion = listener ? Number(map.acousticOcclusionBetween?.(listener, vehicle)) : 0;
      return {
        ...vehicle,
        acousticZone,
        occlusion: Number.isFinite(rawOcclusion) ? clamp01(rawOcclusion) : 0,
      };
    });
  }

  matchApi.handleInput = (playerId, input = {}, now = Date.now()) => {
    if (vehicles.isDriving(playerId)) {
      movement.setInput(playerId, {});
      if (input.interactPressed) {
        vehicles.exit(playerId, now, "interact");
        return;
      }
      vehicles.setInput(playerId, input);
      return;
    }

    // A car parked next to an interactive door must not steal the E press.
    // The base match API resolves doors and crates through the real map
    // interaction, while the vehicle interaction is a fallback on foot.
    if (input.interactPressed) {
      const actor = ctx.components.get(playerId, "Transform");
      const atDoor = actor && (map.doors ?? []).some((door) => (
        Math.abs((Number(actor.y) || 0) - (Number(door.y) || 0)) <= 2.2
        && Math.hypot((Number(actor.x) || 0) - (Number(door.x) || 0),
          (Number(actor.z) || 0) - (Number(door.z) || 0)) <= 1.45
      ));
      if (atDoor) {
        originalHandleInput(playerId, input, now);
        return;
      }
      if (vehicles.interact(playerId, now)) {
        movement.setInput(playerId, {});
        return;
      }
    }
    originalHandleInput(playerId, input, now);
  };

  matchApi.step = (dt, now = Date.now()) => {
    const result = originalStep(dt, now);
    if (battleRoyale.isActive()) vehicles.tickPhysics(dt, now);
    return result;
  };

  matchApi.snapshot = (now = Date.now()) => ({
    ...originalSnapshot(now),
    vehicles: decorateVehicles(),
  });

  matchApi.snapshotFor = (playerId, now = Date.now()) => {
    const snapshot = originalSnapshotFor(playerId, now);
    const observedId = snapshot?.spectator?.active ? snapshot.spectator.targetId : playerId;
    const listener = ctx.components.get(observedId, "Transform") ?? null;
    return {
      ...snapshot,
      vehicles: decorateVehicles(listener, observedId),
    };
  };

  matchApi.eventsForPlayer = (playerId, packets = []) => {
    const base = originalEventsForPlayer(playerId, packets);
    const seen = new Set(base.map((packet) => packet));
    const additional = packets.filter((packet) => {
      if (seen.has(packet)) return false;
      const payload = packet.payload ?? {};
      if (packet.event === "vehicle:entered" || packet.event === "vehicle:exited") {
        return payload.entityId === playerId;
      }
      if (packet.event === "vehicle:driver-lost") return payload.entityId === playerId;
      if (packet.event === "vehicle:impact") return payload.driverId === playerId;
      if (String(packet.event ?? "").startsWith("vehicle:nitro-")) {
        return payload.driverId === playerId;
      }
      return false;
    });
    return [...base, ...additional];
  };
}
