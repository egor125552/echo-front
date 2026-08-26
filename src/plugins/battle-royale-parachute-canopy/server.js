export const manifest = {
  id: "battle-royale-parachute-canopy",
  version: "1.0.0",
  requires: [
    "entities", "match-api", "battle-royale-parachute", "rapier-physics", "map-test-arena",
  ],
  capabilities: [
    "services.consume",
    "components.read", "components.write",
    "events.on", "events.emit",
  ],
};

const CANOPY_RADIUS = 2.65;
const CANOPY_RAY_HEIGHT = 2.15;
const CANOPY_OVERHEAD_ORIGIN = 1.05;
const CANOPY_OVERHEAD_CLEARANCE = 3.6;
const CANOPY_HARD_OVERHEAD_CLEARANCE = 2.25;
const CANOPY_SOFT_SIDE_CLEARANCE = 2.0;
const CANOPY_HARD_SIDE_CLEARANCE = 1.35;
const CANOPY_FORWARD_DISTANCE = 2.4;
const CANOPY_HARD_FORWARD_DISTANCE = 0.9;
const CANOPY_COLLAPSE_INFLATION = 0.35;
const MOVEMENT_GRAVITY = 18;
const COMPRESSION_EVENT_DEBOUNCE_MS = 380;

function clamp(value, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}

function pressure(distance, softDistance, hardDistance) {
  if (!Number.isFinite(distance) || distance >= softDistance) return 0;
  if (distance <= hardDistance) return 1;
  return clamp((softDistance - distance) / Math.max(0.001, softDistance - hardDistance));
}

function kindOf(hit) {
  return String(hit?.worldObject?.kind ?? "");
}

function objectLabel(hit) {
  const object = hit?.worldObject ?? null;
  return object?.accessibleName ?? object?.name ?? object?.doorId ?? object?.id ?? null;
}

export async function setup(ctx) {
  const entities = ctx.services.get("entities");
  const matchApi = ctx.services.get("match-api");
  const parachute = ctx.services.get("parachute");
  const physics = ctx.services.get("physics");
  const map = ctx.services.get("map");

  // Capture the real world raycast once. The parachute integration temporarily swaps
  // physics.raycastWorld for support-only queries while resolving vertical movement.
  const worldRaycast = physics.raycastWorld.bind(physics);

  const originalPrepareMovement = parachute.prepareMovement.bind(parachute);
  const originalStateFor = parachute.stateFor.bind(parachute);
  const originalMatchStep = matchApi.step.bind(matchApi);
  const originalHandleInput = matchApi.handleInput.bind(matchApi);

  function sampleCanopy(entityId) {
    const transform = ctx.components.get(entityId, "Transform");
    if (!transform) return null;

    const overheadOrigin = {
      x: transform.x,
      y: transform.y + CANOPY_OVERHEAD_ORIGIN,
      z: transform.z,
    };
    const canopyOrigin = {
      x: transform.x,
      y: transform.y + CANOPY_RAY_HEIGHT,
      z: transform.z,
    };

    const overhead = worldRaycast(
      overheadOrigin,
      { x: 0, y: 1, z: 0 },
      CANOPY_OVERHEAD_CLEARANCE,
    );
    const overheadDistance = overhead ? Number(overhead.distance) : Infinity;

    const sideHits = [];
    for (let index = 0; index < 8; index += 1) {
      const angle = (Math.PI * 2 * index) / 8;
      const hit = worldRaycast(
        canopyOrigin,
        { x: Math.cos(angle), y: 0, z: Math.sin(angle) },
        CANOPY_RADIUS,
      );
      if (hit) sideHits.push(hit);
    }

    const minSideHit = sideHits.reduce((best, hit) => (
      !best || Number(hit.distance) < Number(best.distance) ? hit : best
    ), null);
    const minSideDistance = minSideHit ? Number(minSideHit.distance) : Infinity;

    const heading = Number(transform.angle) || 0;
    const forwardHit = worldRaycast(
      canopyOrigin,
      { x: Math.sin(heading), y: 0, z: -Math.cos(heading) },
      CANOPY_FORWARD_DISTANCE,
    );
    const forwardDistance = forwardHit ? Number(forwardHit.distance) : Infinity;

    const overheadPressure = pressure(
      overheadDistance,
      CANOPY_OVERHEAD_CLEARANCE,
      CANOPY_HARD_OVERHEAD_CLEARANCE,
    );
    const sideDistancePressure = pressure(
      minSideDistance,
      CANOPY_SOFT_SIDE_CLEARANCE,
      CANOPY_HARD_SIDE_CLEARANCE,
    );
    const sideCountPressure = clamp(sideHits.length / 3);
    const sidePressure = sideDistancePressure * Math.max(0.35, sideCountPressure);
    const forwardPressure = pressure(
      forwardDistance,
      CANOPY_FORWARD_DISTANCE,
      CANOPY_HARD_FORWARD_DISTANCE,
    );

    const compression = Math.max(overheadPressure, sidePressure, forwardPressure);
    const hard = (
      overheadDistance <= CANOPY_HARD_OVERHEAD_CLEARANCE
      || (sideHits.length >= 2 && minSideDistance <= CANOPY_HARD_SIDE_CLEARANCE)
      || (forwardDistance <= CANOPY_HARD_FORWARD_DISTANCE && sideHits.length >= 1)
    );

    let reason = null;
    let primaryHit = null;
    if (overheadPressure >= sidePressure && overheadPressure >= forwardPressure && overhead) {
      reason = "overhead";
      primaryHit = overhead;
    } else if (sidePressure >= forwardPressure && minSideHit) {
      reason = "side-clearance";
      primaryHit = minSideHit;
    } else if (forwardHit) {
      reason = "forward-clearance";
      primaryHit = forwardHit;
    }

    const acousticZone = typeof map.acousticZoneAt === "function"
      ? map.acousticZoneAt(transform)
      : null;

    return {
      compression,
      hard,
      reason,
      overheadDistance: Number.isFinite(overheadDistance) ? overheadDistance : null,
      minSideDistance: Number.isFinite(minSideDistance) ? minSideDistance : null,
      sideHitCount: sideHits.length,
      forwardDistance: Number.isFinite(forwardDistance) ? forwardDistance : null,
      obstacleKind: kindOf(primaryHit) || null,
      obstacleName: objectLabel(primaryHit),
      acousticZone,
      indoor: Boolean(acousticZone && acousticZone !== "outdoor"),
    };
  }

  function updateEnvironmentState(entityId, dt = 0.05, now = Date.now()) {
    const state = ctx.components.get(entityId, "Parachute");
    const transform = ctx.components.get(entityId, "Transform");
    if (!state || !transform) return null;

    if (!state.airborne || state.phase !== "deployed") {
      state.canopyCompression = 0;
      state.canopyEnvironment = "clear";
      state.canopyObstacleKind = null;
      state.canopyObstacleName = null;
      state.canopyCollapsePending = null;
      return null;
    }

    const sampled = sampleCanopy(entityId);
    if (!sampled) return null;

    const previous = clamp(state.canopyCompression);
    const target = clamp(sampled.compression);
    const responseRate = target > previous ? 10 : 2.7;
    const blend = clamp(Math.max(0, Number(dt) || 0) * responseRate);
    const compression = previous + (target - previous) * blend;

    state.canopyCompression = compression;
    state.canopyEnvironment = sampled.indoor ? "indoor" : (compression > 0.08 ? "obstructed" : "clear");
    state.canopyObstacleKind = sampled.obstacleKind;
    state.canopyObstacleName = sampled.obstacleName;
    state.canopyOverheadDistance = sampled.overheadDistance;
    state.canopySideDistance = sampled.minSideDistance;
    state.canopySideHitCount = sampled.sideHitCount;
    state.canopyForwardDistance = sampled.forwardDistance;

    const eventKey = [
      state.canopyEnvironment,
      sampled.reason ?? "none",
      sampled.obstacleKind ?? "none",
      sampled.obstacleName ?? "none",
    ].join(":");

    if (
      compression >= 0.22
      && (eventKey !== state.lastCanopyEnvironmentKey
        || now - Number(state.lastCanopyEnvironmentAt || 0) >= COMPRESSION_EVENT_DEBOUNCE_MS)
    ) {
      state.lastCanopyEnvironmentKey = eventKey;
      state.lastCanopyEnvironmentAt = now;
      ctx.events.emit("parachute:canopy-compressed", {
        entityId,
        compression,
        hard: sampled.hard,
        reason: sampled.reason,
        obstacleKind: sampled.obstacleKind,
        obstacleName: sampled.obstacleName,
        overheadDistance: sampled.overheadDistance,
        sideDistance: sampled.minSideDistance,
        sideHitCount: sampled.sideHitCount,
        forwardDistance: sampled.forwardDistance,
        indoor: sampled.indoor,
        acousticZone: sampled.acousticZone,
        now,
      });
    }

    if (sampled.hard && clamp(state.inflation) >= CANOPY_COLLAPSE_INFLATION) {
      state.canopyCollapsePending = {
        reason: sampled.reason ?? "obstruction",
        obstacleKind: sampled.obstacleKind,
        obstacleName: sampled.obstacleName,
        compression: Math.max(compression, 0.85),
      };
    }

    return sampled;
  }

  parachute.prepareMovement = (dt, now = Date.now()) => {
    const result = originalPrepareMovement(dt, now);
    const safeDt = clamp(dt, 0, 0.1);

    for (const entity of entities.all()) {
      if (!entity.alive || entity.bot || entity.kind !== "human") continue;
      const state = ctx.components.get(entity.id, "Parachute");
      const transform = ctx.components.get(entity.id, "Transform");
      const input = ctx.components.get(entity.id, "Input");
      if (!state?.airborne || state.phase !== "deployed" || !transform) continue;

      updateEnvironmentState(entity.id, safeDt, now);
      const compression = clamp(state.canopyCompression);
      if (compression <= 0.01) continue;

      const retainedGlide = Math.max(0.12, 1 - compression * 0.78);
      state.glideSpeed = Math.max(0, Number(state.glideSpeed) || 0) * retainedGlide;
      state.turnRate = (Number(state.turnRate) || 0) * Math.max(0.18, 1 - compression * 0.72);

      const currentDownward = Math.max(0, -(Number(state.simulatedVerticalVelocity) || 0));
      const constrainedDownward = Math.min(52, Math.max(currentDownward, 5 + compression * 9));
      state.simulatedVerticalVelocity = -constrainedDownward;
      state.airSpeed = Math.hypot(constrainedDownward, state.glideSpeed);
      transform.verticalVelocity = state.simulatedVerticalVelocity + MOVEMENT_GRAVITY * safeDt;

      if (input) {
        input.forward = Math.min(
          Math.max(0, Number(input.forward) || 0),
          clamp(state.glideSpeed / 5.4),
        );
        input.strafe = 0;
      }
    }

    return result;
  };

  matchApi.handleInput = (playerId, input = {}, now = Date.now()) => {
    if (input.parachutePressed) {
      const state = ctx.components.get(playerId, "Parachute");
      if (state?.airborne && state.phase !== "deployed") {
        const sampled = sampleCanopy(playerId);
        if (sampled?.hard || Number(sampled?.compression || 0) >= 0.78) {
          ctx.events.emit("parachute:deploy-blocked", {
            entityId: playerId,
            reason: sampled.reason ?? "insufficient-clearance",
            obstacleKind: sampled.obstacleKind,
            obstacleName: sampled.obstacleName,
            overheadDistance: sampled.overheadDistance,
            sideDistance: sampled.minSideDistance,
            sideHitCount: sampled.sideHitCount,
            forwardDistance: sampled.forwardDistance,
            indoor: sampled.indoor,
            acousticZone: sampled.acousticZone,
            now,
          });
          return originalHandleInput(playerId, { ...input, parachutePressed: false }, now);
        }
      }
    }
    return originalHandleInput(playerId, input, now);
  };

  matchApi.step = (dt, now = Date.now()) => {
    const result = originalMatchStep(dt, now);

    for (const entity of entities.all()) {
      if (!entity.alive || entity.bot || entity.kind !== "human") continue;
      const state = ctx.components.get(entity.id, "Parachute");
      if (!state?.airborne || state.phase !== "deployed") continue;

      updateEnvironmentState(entity.id, dt, now);
      const pending = state.canopyCollapsePending;
      if (!pending) continue;
      state.canopyCollapsePending = null;

      const before = Number(state.glideSpeed) || 0;
      const cut = parachute.cut(entity.id, now);
      if (!cut) continue;

      state.canopyCompression = 1;
      state.canopyEnvironment = "collapsed";
      ctx.events.emit("parachute:canopy-collapse", {
        entityId: entity.id,
        reason: pending.reason,
        obstacleKind: pending.obstacleKind,
        obstacleName: pending.obstacleName,
        compression: pending.compression,
        glideSpeedBefore: before,
        now,
      });
    }

    return result;
  };

  parachute.stateFor = (entityId) => {
    const value = originalStateFor(entityId);
    if (!value) return value;
    const state = ctx.components.get(entityId, "Parachute");
    return {
      ...value,
      canopyCompression: clamp(state?.canopyCompression),
      canopyEnvironment: state?.canopyEnvironment ?? "clear",
      canopyObstacleKind: state?.canopyObstacleKind ?? null,
      canopyObstacleName: state?.canopyObstacleName ?? null,
      canopyOverheadDistance: Number.isFinite(state?.canopyOverheadDistance)
        ? state.canopyOverheadDistance
        : null,
      canopySideDistance: Number.isFinite(state?.canopySideDistance)
        ? state.canopySideDistance
        : null,
      canopySideHitCount: Number(state?.canopySideHitCount) || 0,
      canopyForwardDistance: Number.isFinite(state?.canopyForwardDistance)
        ? state.canopyForwardDistance
        : null,
    };
  };

  ctx.events.on("parachute:landed", ({ entityId }) => {
    const state = ctx.components.get(entityId, "Parachute");
    if (!state) return;
    state.canopyCompression = 0;
    state.canopyEnvironment = "clear";
    state.canopyCollapsePending = null;
  });
}
