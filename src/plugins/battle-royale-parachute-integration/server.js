export const manifest = {
  id: "battle-royale-parachute-integration",
  version: "1.1.0",
  requires: ["match-api", "battle-royale-parachute", "battle-royale", "movement"],
  capabilities: [
    "services.consume",
    "components.read", "components.write",
    "events.on", "events.emit",
  ],
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
  const battleRoyale = ctx.services.get("battle-royale");
  const movement = ctx.services.get("movement");

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

    const deploymentActive = Boolean(battleRoyale.status(now)?.deployment?.active);
    let result = null;
    if (deploymentActive) {
      // During deployment only the human movement/Rapier path advances. Bots,
      // weapons and combat stay frozen until the last living human lands.
      battleRoyale.tick(now);
      movement.tick(dt, now);
    } else {
      result = originalStep(dt, now);
    }

    parachute.finishMovement(dt, now);
    return result;
  };

  ctx.events.on("movement:blocked", ({ recipientId, kind, objectId, objectName, now }) => {
    const state = ctx.components.get(recipientId, "Parachute");
    if (!state?.airborne || state.phase !== "deployed") return;

    const before = Math.max(0, Number(state.glideSpeed) || 0);
    if (before < 0.25) return;

    const door = kind === "building-door";
    const retained = door ? 0.42 : 0.26;
    state.glideSpeed = before * retained;
    state.turnRate = (Number(state.turnRate) || 0) * 0.35;
    state.airSpeed = Math.hypot(
      Math.max(0, -(Number(state.simulatedVerticalVelocity) || 0)),
      state.glideSpeed,
    );

    ctx.events.emit("parachute:obstacle-impact", {
      entityId: recipientId,
      kind,
      objectId: objectId ?? null,
      objectName: objectName ?? null,
      speedBefore: before,
      speedAfter: state.glideSpeed,
      now: Number(now) || Date.now(),
    });
  });

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
