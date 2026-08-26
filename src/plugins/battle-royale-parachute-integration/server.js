export const manifest = {
  id: "battle-royale-parachute-integration",
  version: "1.2.0",
  requires: [
    "match-api", "battle-royale-parachute", "battle-royale", "movement",
    "rapier-physics", "entities",
  ],
  capabilities: [
    "services.consume",
    "components.read", "components.write",
    "events.on", "events.emit",
  ],
};

const PARACHUTE_SUPPORT_PROBE_DISTANCE = 800;
const LANDING_SUPPORT_TOLERANCE = 0.08;

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
  const physics = ctx.services.get("physics");
  const entities = ctx.services.get("entities");

  const originalHandleInput = matchApi.handleInput.bind(matchApi);
  const originalStep = matchApi.step.bind(matchApi);
  const originalSnapshot = matchApi.snapshot.bind(matchApi);
  const originalSnapshotFor = matchApi.snapshotFor.bind(matchApi);
  const originalEventsForPlayer = matchApi.eventsForPlayer.bind(matchApi);

  function supportDistanceAt(transform) {
    if (!transform || typeof physics.raycastSupportWorld !== "function") return Infinity;
    const lift = 0.12;
    const hit = physics.raycastSupportWorld(
      { x: transform.x, y: transform.y + lift, z: transform.z },
      { x: 0, y: -1, z: 0 },
      PARACHUTE_SUPPORT_PROBE_DISTANCE,
    );
    return hit ? Math.max(0, Number(hit.distance) - lift) : Infinity;
  }

  function clearUnsupportedGrounding() {
    for (const entity of entities.all()) {
      if (!entity.alive || entity.bot || entity.kind !== "human") continue;
      const state = ctx.components.get(entity.id, "Parachute");
      const transform = ctx.components.get(entity.id, "Transform");
      if (!state?.airborne || !transform?.grounded) continue;
      if (supportDistanceAt(transform) > LANDING_SUPPORT_TOLERANCE) {
        transform.grounded = false;
      }
    }
  }

  function withParachuteQueries(callback, { wrapMove = false } = {}) {
    const originalRaycastWorld = physics.raycastWorld;
    const originalMove = physics.move;

    if (typeof physics.raycastSupportWorld === "function") {
      physics.raycastWorld = (origin, direction, maxDistance) => physics.raycastSupportWorld(
        origin,
        direction,
        Math.max(PARACHUTE_SUPPORT_PROBE_DISTANCE, Number(maxDistance) || 0),
      );
    }

    if (wrapMove) {
      physics.move = (entityId, dx, dz, dy = 0) => {
        const moved = originalMove(entityId, dx, dz, dy);
        if (!moved?.grounded) return moved;
        const state = ctx.components.get(entityId, "Parachute");
        if (!state?.airborne) return moved;
        const position = physics.position(entityId);
        if (supportDistanceAt(position) <= LANDING_SUPPORT_TOLERANCE) return moved;
        return { ...moved, grounded: false };
      };
    }

    try {
      return callback();
    } finally {
      physics.raycastWorld = originalRaycastWorld;
      physics.move = originalMove;
    }
  }

  matchApi.handleInput = (playerId, input = {}, now = Date.now()) => {
    if (input.parachutePressed) parachute.toggle(playerId, now);
    return originalHandleInput(playerId, input, now);
  };

  matchApi.step = (dt, now = Date.now()) => {
    withParachuteQueries(() => parachute.prepareMovement(dt, now));

    const deploymentActive = Boolean(battleRoyale.status(now)?.deployment?.active);
    let result = null;
    if (deploymentActive) {
      battleRoyale.tick(now);
      movement.tick(dt, now);
    } else {
      result = originalStep(dt, now);
    }

    clearUnsupportedGrounding();
    withParachuteQueries(() => parachute.finishMovement(dt, now), { wrapMove: true });
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
