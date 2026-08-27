export const manifest = {
  id: "battle-royale-vehicle-integration",
  version: "1.0.1",
  requires: ["match-api", "battle-royale-vehicle", "movement", "battle-royale"],
  capabilities: ["services.consume"],
};

export async function setup(ctx) {
  const matchApi = ctx.services.get("match-api");
  const vehicles = ctx.services.get("vehicles");
  const movement = ctx.services.get("movement");
  const battleRoyale = ctx.services.get("battle-royale");

  const originalHandleInput = matchApi.handleInput.bind(matchApi);
  const originalStep = matchApi.step.bind(matchApi);
  const originalSnapshot = matchApi.snapshot.bind(matchApi);
  const originalSnapshotFor = matchApi.snapshotFor.bind(matchApi);
  const originalEventsForPlayer = matchApi.eventsForPlayer.bind(matchApi);

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

    if (input.interactPressed && vehicles.interact(playerId, now)) {
      movement.setInput(playerId, {});
      return;
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
    vehicles: vehicles.snapshot(),
  });

  matchApi.snapshotFor = (playerId, now = Date.now()) => ({
    ...originalSnapshotFor(playerId, now),
    vehicles: vehicles.snapshot(),
  });

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
      return false;
    });
    return [...base, ...additional];
  };
}
