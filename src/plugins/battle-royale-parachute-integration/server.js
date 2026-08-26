export const manifest = {
  id: "battle-royale-parachute-integration",
  version: "1.0.0",
  requires: ["match-api", "battle-royale-parachute"],
  capabilities: ["services.consume"],
};

function enrichSnapshot(snapshot, parachute) {
  if (!snapshot || !Array.isArray(snapshot.entities)) return snapshot;
  return {
    ...snapshot,
    entities: snapshot.entities.map((entity) => ({
      ...entity,
      parachute: parachute.stateFor(entity.id),
    })),
  };
}

export async function setup(ctx) {
  const matchApi = ctx.services.get("match-api");
  const parachute = ctx.services.get("parachute");

  const originalHandleInput = matchApi.handleInput.bind(matchApi);
  const originalStep = matchApi.step.bind(matchApi);
  const originalSnapshot = matchApi.snapshot.bind(matchApi);
  const originalSnapshotFor = matchApi.snapshotFor.bind(matchApi);
  const originalEventsForPlayer = matchApi.eventsForPlayer.bind(matchApi);

  matchApi.handleInput = (playerId, input = {}, now = Date.now()) => {
    if (input.parachutePressed) parachute.toggle(playerId, now);
    return originalHandleInput(playerId, input, now);
  };

  matchApi.step = (dt, now = Date.now()) => {
    parachute.prepareMovement(dt, now);
    const result = originalStep(dt, now);
    parachute.finishMovement(dt, now);
    return result;
  };

  matchApi.snapshot = (now = Date.now()) => enrichSnapshot(originalSnapshot(now), parachute);
  matchApi.snapshotFor = (playerId, now = Date.now()) => (
    enrichSnapshot(originalSnapshotFor(playerId, now), parachute)
  );

  matchApi.eventsForPlayer = (playerId, packets = []) => {
    const selected = originalEventsForPlayer(playerId, packets);
    const seen = new Set(selected);
    for (const packet of packets) {
      if (!String(packet?.event ?? "").startsWith("parachute:")) continue;
      if (packet?.payload?.entityId !== playerId) continue;
      if (seen.has(packet)) continue;
      seen.add(packet);
      selected.push(packet);
    }
    return selected;
  };
}
