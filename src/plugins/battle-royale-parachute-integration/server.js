export const manifest = {
  id: "battle-royale-parachute-integration",
  version: "1.4.2",
  requires: [
    "match-api", "battle-royale-parachute", "battle-royale", "movement",
    "rapier-physics", "entities", "battle-royale-vehicle",
  ],
  optional: ["health-regeneration"],
  capabilities: [
    "services.consume",
    "components.read", "components.write",
    "events.on", "events.emit",
  ],
};

const PARACHUTE_SUPPORT_PROBE_DISTANCE = 800;
const LANDING_SUPPORT_TOLERANCE = 0.08;
const UNSTABLE_CONTACT_PROBE_DISTANCE = 0.28;
const UNSTABLE_SIDE_SLIP_PER_TICK = 0.085;
const UNSTABLE_SLIP_MEMORY_MS = 650;
const UNSTABLE_SLIP_SPEED_RETAIN = 0.94;
const UNSTABLE_INITIAL_SPEED_RETAIN = 0.86;
const UNSTABLE_TOP_KINDS = new Set(["building-wall", "building-door"]);

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
  const vehicles = ctx.services.get("vehicles");
  const healthRegeneration = ctx.services.has("health-regeneration")
    ? ctx.services.get("health-regeneration")
    : null;

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

  function worldSurfaceAtFeet(transform) {
    if (!transform || typeof physics.raycastWorld !== "function") return null;
    const lift = 0.12;
    const hit = physics.raycastWorld(
      { x: transform.x, y: transform.y + lift, z: transform.z },
      { x: 0, y: -1, z: 0 },
      UNSTABLE_CONTACT_PROBE_DISTANCE,
    );
    if (!hit) return null;
    const distance = Math.max(0, Number(hit.distance) - lift);
    if (distance > LANDING_SUPPORT_TOLERANCE) return null;
    return { ...hit, distance };
  }

  function clearSlipMemory(state) {
    state.unstableContactKey = null;
    state.unstableSlipX = 0;
    state.unstableSlipZ = 0;
    state.unstableSlipUntil = 0;
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

  function chooseSlipVector(transform, object) {
    const hx = Math.max(0.01, Math.abs(Number(object?.hx) || 0.01));
    const hz = Math.max(0.01, Math.abs(Number(object?.hz) || 0.01));

    if (hx <= hz) {
      let side = Math.sign((Number(transform.x) || 0) - (Number(object?.x) || 0));
      if (!side) side = Math.cos(Number(transform.angle) || 0) >= 0 ? 1 : -1;
      return { x: side * UNSTABLE_SIDE_SLIP_PER_TICK, z: 0 };
    }

    let side = Math.sign((Number(transform.z) || 0) - (Number(object?.z) || 0));
    if (!side) side = Math.sin(Number(transform.angle) || 0) >= 0 ? 1 : -1;
    return { x: 0, z: side * UNSTABLE_SIDE_SLIP_PER_TICK };
  }

  function applySlip(entityId, state, transform, slipX, slipZ, retain) {
    physics.move(entityId, slipX, slipZ, 0);
    const position = physics.position(entityId);
    if (position) {
      transform.x = position.x;
      transform.y = position.y;
      transform.z = position.z;
    }
    transform.grounded = false;
    state.glideSpeed = Math.max(0.55, (Number(state.glideSpeed) || 0) * retain);
    state.turnRate = (Number(state.turnRate) || 0) * 0.72;
    state.airSpeed = Math.hypot(
      Math.max(0, -(Number(state.simulatedVerticalVelocity) || 0)),
      state.glideSpeed,
    );
  }

  function resolveUnstableTopContacts(now = Date.now()) {
    for (const entity of entities.all()) {
      if (!entity.alive || entity.bot || entity.kind !== "human") continue;
      const state = ctx.components.get(entity.id, "Parachute");
      const transform = ctx.components.get(entity.id, "Transform");
      if (!state?.airborne || state.phase !== "deployed" || !transform) continue;

      if (supportDistanceAt(transform) <= LANDING_SUPPORT_TOLERANCE) {
        clearSlipMemory(state);
        continue;
      }

      const hit = worldSurfaceAtFeet(transform);
      const object = hit?.worldObject ?? null;
      const kind = String(object?.kind ?? "");

      if (hit && UNSTABLE_TOP_KINDS.has(kind)) {
        const slip = chooseSlipVector(transform, object);
        state.unstableSlipX = slip.x;
        state.unstableSlipZ = slip.z;
        state.unstableSlipUntil = now + UNSTABLE_SLIP_MEMORY_MS;

        applySlip(
          entity.id,
          state,
          transform,
          state.unstableSlipX,
          state.unstableSlipZ,
          UNSTABLE_INITIAL_SPEED_RETAIN,
        );

        const key = `${kind}:${hit.colliderHandle ?? object.id ?? "surface"}`;
        if (state.unstableContactKey !== key) {
          state.unstableContactKey = key;
          ctx.events.emit("parachute:obstacle-impact", {
            entityId: entity.id,
            kind,
            objectId: object.doorId ?? object.id ?? null,
            objectName: object.accessibleName ?? null,
            unstableTop: true,
            speedAfter: state.glideSpeed,
            now,
          });
        }
        continue;
      }

      if (
        Number(state.unstableSlipUntil || 0) > now
        && (Math.abs(Number(state.unstableSlipX) || 0) > 0.001
          || Math.abs(Number(state.unstableSlipZ) || 0) > 0.001)
      ) {
        applySlip(
          entity.id,
          state,
          transform,
          Number(state.unstableSlipX) || 0,
          Number(state.unstableSlipZ) || 0,
          UNSTABLE_SLIP_SPEED_RETAIN,
        );
        continue;
      }

      clearSlipMemory(state);
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
      // Keep the one shared Rapier world advancing while some players are still
      // descending. This is required even when the jeep is parked: Rapier 0.19.x
      // broad-phase updates for door enable/disable changes happen on the physics
      // step. It also means an early-landed player can drive immediately instead
      // of waiting for the last parachute to touch down.
      vehicles.tickPhysics(dt, now);
      movement.tick(dt, now);
    } else {
      result = originalStep(dt, now);
    }

    resolveUnstableTopContacts(now);
    clearUnsupportedGrounding();
    withParachuteQueries(() => parachute.finishMovement(dt, now), { wrapMove: true });
    if (deploymentActive) healthRegeneration?.tick(dt, now);
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
      unstableTop: false,
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
