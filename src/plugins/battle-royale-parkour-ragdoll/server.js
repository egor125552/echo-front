export const BUILDING_IMPACT_MIN_SPEED = 6.5;
export const AIRBORNE_BUILDING_IMPACT_MIN_SPEED = 4.35;
export const AIRBORNE_BUILDING_MIN_TOTAL_SPEED = 5.0;
export const AIRBORNE_BUILDING_MIN_HEAD_ON = 0.5;
export const AIRBORNE_BUILDING_DROP_SPEED = 4.4;
export const VEHICLE_CRASH_MIN_SPEED = 9.5;
export const VEHICLE_CRASH_MIN_DELTA = 6.5;
export const PARKOUR_FLIP_SPEED = 8.8;
export const PARKOUR_TUCK_SPEED = 4.2;

export const manifest = {
  id: "battle-royale-parkour-ragdoll",
  version: "1.2.0",
  requires: [
    "match-api",
    "battle-royale",
    "battle-royale-jump",
    "battle-royale-ragdoll",
    "battle-royale-ragdoll-stability",
    "battle-royale-vehicle",
    "rapier-physics",
    "entities",
  ],
  capabilities: [
    "services.consume",
    "services.provide",
    "components.read",
    "events.on",
    "events.emit",
  ],
};

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}

function magnitude2(x, z) {
  return Math.hypot(Number(x) || 0, Number(z) || 0);
}

function basis(angle) {
  const a = Number(angle) || 0;
  return {
    forward: { x: Math.sin(a), y: 0, z: -Math.cos(a) },
    right: { x: Math.cos(a), y: 0, z: Math.sin(a) },
  };
}

function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function hardBuildingCollision(collision, airborne) {
  const kind = String(collision?.worldObject?.kind ?? "");
  if (!kind.startsWith("building-")) return false;
  if (kind === "building-floor") return false;
  if (kind === "building-stair") return Boolean(airborne);
  return true;
}

function movementVelocity(transform, input = {}) {
  const speed = input.sprint ? 5.4 : 3.25;
  const rawForward = clamp(input.forward, -1, 1);
  const rawStrafe = clamp(input.strafe, -1, 1);
  const length = Math.hypot(rawForward, rawStrafe);
  const scale = length > 1 ? 1 / length : 1;
  const axes = basis(transform?.angle);
  return {
    x: (axes.forward.x * rawForward + axes.right.x * rawStrafe) * scale * speed,
    y: Number(transform?.verticalVelocity) || 0,
    z: (axes.forward.z * rawForward + axes.right.z * rawStrafe) * scale * speed,
  };
}

function collisionHeadOn(normal, velocity, lostFraction) {
  const horizontalSpeed = magnitude2(velocity.x, velocity.z);
  const normalLength = magnitude2(normal?.x, normal?.z);
  if (horizontalSpeed < 0.01 || normalLength < 0.01) return clamp(lostFraction, 0, 1);
  return clamp(Math.abs(
    ((Number(velocity.x) || 0) * (Number(normal.x) || 0)
      + (Number(velocity.z) || 0) * (Number(normal.z) || 0))
      / (horizontalSpeed * normalLength)
  ), 0, 1);
}

function adaptiveBuildingImpact({ kind, velocity, lostFraction, normal }) {
  const horizontalSpeed = magnitude2(velocity.x, velocity.z);
  const verticalSpeed = Number(velocity.y) || 0;
  const descendingSpeed = Math.max(0, -verticalSpeed);
  const totalSpeed = Math.hypot(horizontalSpeed, verticalSpeed);
  const blockedSpeed = horizontalSpeed * clamp(lostFraction, 0, 1);
  const headOn = collisionHeadOn(normal, velocity, lostFraction);
  const impactSpeed = Math.hypot(blockedSpeed, descendingSpeed * 0.75);

  if (kind === "building-stair") {
    const hardStairLanding = descendingSpeed >= 3.2
      && totalSpeed >= 4.6
      && impactSpeed >= 3.8;
    return {
      shouldFall: hardStairLanding,
      impactSpeed,
      blockedSpeed,
      totalSpeed,
      verticalSpeed,
      descendingSpeed,
      headOn,
      mode: hardStairLanding ? "airborne-stair-crash" : "airborne-stair-brace",
    };
  }

  const hardLaunch = blockedSpeed >= AIRBORNE_BUILDING_IMPACT_MIN_SPEED
    && totalSpeed >= AIRBORNE_BUILDING_MIN_TOTAL_SPEED;
  const hardDrop = descendingSpeed >= AIRBORNE_BUILDING_DROP_SPEED
    && blockedSpeed >= 2.4;
  const badAngle = headOn >= AIRBORNE_BUILDING_MIN_HEAD_ON;
  const shouldFall = badAngle && (hardLaunch || hardDrop);
  return {
    shouldFall,
    impactSpeed,
    blockedSpeed,
    totalSpeed,
    verticalSpeed,
    descendingSpeed,
    headOn,
    mode: shouldFall ? (hardDrop ? "airborne-drop-crash" : "airborne-wall-crash") : "airborne-brace",
  };
}

function parkourOmega(transform, input = {}) {
  const axes = basis(transform?.angle);
  const forward = clamp(input.forward, -1, 1);
  const strafe = clamp(input.strafe, -1, 1);
  const sprintBoost = input.sprint ? 1.12 : 1;

  if (Math.abs(strafe) >= Math.max(0.25, Math.abs(forward))) {
    const direction = strafe >= 0 ? -1 : 1;
    return {
      x: axes.forward.x * PARKOUR_FLIP_SPEED * direction * sprintBoost,
      y: 0,
      z: axes.forward.z * PARKOUR_FLIP_SPEED * direction * sprintBoost,
      style: strafe >= 0 ? "right-roll" : "left-roll",
    };
  }

  if (Math.abs(forward) >= 0.25) {
    const direction = forward >= 0 ? 1 : -1;
    return {
      x: axes.right.x * PARKOUR_FLIP_SPEED * direction * sprintBoost,
      y: 0,
      z: axes.right.z * PARKOUR_FLIP_SPEED * direction * sprintBoost,
      style: forward >= 0 ? "front-flip" : "back-flip",
    };
  }

  return {
    x: axes.right.x * PARKOUR_TUCK_SPEED,
    y: 0,
    z: axes.right.z * PARKOUR_TUCK_SPEED,
    style: "tuck",
  };
}

export async function setup(ctx) {
  const matchApi = ctx.services.get("match-api");
  const battleRoyale = ctx.services.get("battle-royale");
  const jump = ctx.services.get("jump");
  const ragdoll = ctx.services.get("ragdoll");
  const stability = ctx.services.get("ragdoll-stability");
  const vehicles = ctx.services.get("vehicles");
  const physics = ctx.services.get("physics");
  const entities = ctx.services.get("entities");

  const pendingBuildingImpacts = new Map();
  const pendingVehicleImpacts = new Map();
  let parkourPoses = 0;
  let buildingContacts = 0;
  let buildingBraces = 0;
  let buildingFalls = 0;
  let crashEjections = 0;

  function collectBodyHandles() {
    const handles = new Set();
    if (typeof physics.world.forEachRigidBody !== "function") return handles;
    physics.world.forEachRigidBody((body) => handles.add(Number(body.handle)));
    return handles;
  }

  function newBodiesSince(before) {
    const bodies = [];
    if (typeof physics.world.forEachRigidBody !== "function") return bodies;
    physics.world.forEachRigidBody((body) => {
      if (!before.has(Number(body.handle))) bodies.push(body);
    });
    return bodies;
  }

  function applyCoherentSpin(bodies, omega) {
    if (!bodies.length) return false;
    let totalMass = 0;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (const body of bodies) {
      const mass = Math.max(0.001, Number(body.mass?.()) || 0.001);
      const p = body.translation();
      totalMass += mass;
      cx += p.x * mass;
      cy += p.y * mass;
      cz += p.z * mass;
    }
    if (!(totalMass > 0)) return false;
    const center = { x: cx / totalMass, y: cy / totalMass, z: cz / totalMass };

    for (const body of bodies) {
      const p = body.translation();
      const rel = { x: p.x - center.x, y: p.y - center.y, z: p.z - center.z };
      const rotational = cross(omega, rel);
      const velocity = body.linvel();
      body.setLinvel({
        x: velocity.x + rotational.x,
        y: velocity.y + rotational.y,
        z: velocity.z + rotational.z,
      }, true);
      body.setAngvel({ x: omega.x, y: omega.y, z: omega.z }, true);
    }
    return true;
  }

  function enterParkourPose(entityId, input, now) {
    if (!battleRoyale.isActive() || ragdoll.isActive(entityId) || vehicles.isDriving(entityId)) return false;
    const jumpState = jump.stateFor(entityId);
    const transform = ctx.components.get(entityId, "Transform");
    const entity = entities.get(entityId);
    if (!jumpState || !transform || !entity?.alive || entity.bot) return false;

    const before = collectBodyHandles();
    const velocity = {
      x: Number(jumpState.velocityX) || 0,
      y: Number(transform.verticalVelocity) || 0,
      z: Number(jumpState.velocityZ) || 0,
    };
    const activated = ragdoll.activate(entityId, {
      reason: "parkour-pose",
      position: { x: transform.x, y: transform.y, z: transform.z },
      angle: transform.angle,
      velocity,
    }, now);
    if (!activated) return false;

    const omega = parkourOmega(transform, input);
    const bodies = newBodiesSince(before);
    const spun = applyCoherentSpin(bodies, omega);
    ragdoll.setInput(entityId, input);
    parkourPoses += 1;
    ctx.events.emit("ragdoll:parkour-pose", {
      entityId,
      style: omega.style,
      spinRate: Math.hypot(omega.x, omega.y, omega.z),
      parts: bodies.length,
      coherentSpin: spun,
      velocity,
      x: transform.x,
      y: transform.y,
      z: transform.z,
      now,
    });
    return true;
  }

  const originalPhysicsMove = physics.move.bind(physics);
  physics.move = (entityId, dx, dz, dy = 0) => {
    const entity = entities.get(entityId);
    const input = ctx.components.get(entityId, "Input") ?? {};
    const jumpState = jump.stateFor(entityId);
    const velocity = jumpState ? {
      x: Number(jumpState.velocityX) || 0,
      y: Number(ctx.components.get(entityId, "Transform")?.verticalVelocity) || 0,
      z: Number(jumpState.velocityZ) || 0,
    } : movementVelocity(ctx.components.get(entityId, "Transform"), input);
    const result = originalPhysicsMove(entityId, dx, dz, dy);

    if (!battleRoyale.isActive()
      || !entity?.alive
      || entity.bot
      || ragdoll.isActive(entityId)
      || vehicles.isDriving(entityId)) return result;

    const attempted = magnitude2(dx, dz);
    if (attempted < 0.001) return result;
    const collision = result.collisions?.find((entry) => hardBuildingCollision(entry, Boolean(jumpState)));
    if (!collision) return result;

    buildingContacts += 1;
    const along = ((Number(result.x) || 0) * dx + (Number(result.z) || 0) * dz) / attempted;
    const lostDistance = Math.max(0, attempted - Math.max(0, along));
    const lostFraction = clamp(lostDistance / attempted, 0, 1);
    const kind = String(collision.worldObject?.kind ?? "building-obstacle");

    // Grounded characters brace against walls and doors instead of collapsing.
    // A normal on-foot sprint tops out below BUILDING_IMPACT_MIN_SPEED anyway, but
    // the explicit airborne requirement makes the intended behavior unambiguous.
    if (!jumpState) {
      if (magnitude2(velocity.x, velocity.z) * lostFraction >= 2.5) buildingBraces += 1;
      return result;
    }

    const adaptive = adaptiveBuildingImpact({
      kind,
      velocity,
      lostFraction,
      normal: collision.normal ?? null,
    });
    if (!adaptive.shouldFall) {
      if (adaptive.blockedSpeed >= 1.5 || adaptive.descendingSpeed >= 2.5) buildingBraces += 1;
      return result;
    }

    const current = pendingBuildingImpacts.get(entityId);
    if (!current || adaptive.impactSpeed > current.impactSpeed) {
      pendingBuildingImpacts.set(entityId, {
        entityId,
        impactSpeed: adaptive.impactSpeed,
        blockedSpeed: adaptive.blockedSpeed,
        totalSpeed: adaptive.totalSpeed,
        verticalSpeed: adaptive.verticalSpeed,
        headOn: adaptive.headOn,
        mode: adaptive.mode,
        velocity,
        kind,
        objectId: collision.worldObject?.doorId ?? collision.worldObject?.id ?? null,
        normal: collision.normal ?? null,
        airborne: true,
      });
    }
    return result;
  };

  ctx.events.on("vehicle:impact", (payload = {}) => {
    const entityId = payload.driverId;
    if (!entityId) return;
    const speedBefore = Math.max(0, Number(payload.speedBefore) || 0);
    const deltaSpeed = Math.max(0, Number(payload.deltaSpeed) || 0);
    if (speedBefore < VEHICLE_CRASH_MIN_SPEED || deltaSpeed < VEHICLE_CRASH_MIN_DELTA) return;
    const current = pendingVehicleImpacts.get(entityId);
    if (!current || deltaSpeed > current.deltaSpeed) {
      pendingVehicleImpacts.set(entityId, {
        entityId,
        vehicleId: payload.vehicleId ?? null,
        speedBefore,
        speedAfter: Math.max(0, Number(payload.speedAfter) || 0),
        deltaSpeed,
      });
    }
  });

  function processBuildingImpacts(now) {
    for (const impact of pendingBuildingImpacts.values()) {
      const entity = entities.get(impact.entityId);
      const transform = ctx.components.get(impact.entityId, "Transform");
      if (!entity?.alive || entity.bot || !transform || ragdoll.isActive(impact.entityId) || vehicles.isDriving(impact.entityId)) continue;

      const activated = ragdoll.activate(impact.entityId, {
        reason: "building-impact",
        position: { x: transform.x, y: transform.y + 0.04, z: transform.z },
        angle: transform.angle,
        velocity: impact.velocity,
      }, now);
      if (!activated) continue;

      const normal = impact.normal;
      if (normal) {
        stability.applyVelocityDeltaToLatest({
          x: (Number(normal.x) || 0) * Math.min(2.4, impact.impactSpeed * 0.24),
          y: 0.25 + Math.min(0.75, impact.impactSpeed * 0.07),
          z: (Number(normal.z) || 0) * Math.min(2.4, impact.impactSpeed * 0.24),
        }, 16);
      }
      buildingFalls += 1;
      ctx.events.emit("ragdoll:building-impact", {
        entityId: impact.entityId,
        impactSpeed: impact.impactSpeed,
        blockedSpeed: impact.blockedSpeed,
        totalSpeed: impact.totalSpeed,
        verticalSpeed: impact.verticalSpeed,
        headOn: impact.headOn,
        mode: impact.mode,
        kind: impact.kind,
        objectId: impact.objectId,
        airborne: true,
        x: transform.x,
        y: transform.y,
        z: transform.z,
        now,
      });
    }
    pendingBuildingImpacts.clear();
  }

  function processVehicleImpacts(now) {
    for (const impact of pendingVehicleImpacts.values()) {
      const entity = entities.get(impact.entityId);
      const vehicle = vehicles.stateFor(impact.vehicleId ?? undefined);
      if (!entity?.alive || entity.bot || !vehicle || vehicle.driverId !== impact.entityId || ragdoll.isActive(impact.entityId)) continue;

      const angle = Number(vehicle.angle) || 0;
      const axes = basis(angle);
      const direction = Number(vehicle.forwardSpeed) < -0.25 ? -1 : 1;
      const carrySpeed = Math.min(55, impact.speedBefore * 0.62);
      const upward = 1.2 + Math.min(3.8, impact.deltaSpeed * 0.24);

      if (!vehicles.exit(impact.entityId, now, "crash-eject")) continue;
      const transform = ctx.components.get(impact.entityId, "Transform");
      if (!transform) continue;

      const activated = ragdoll.activate(impact.entityId, {
        reason: "vehicle-crash",
        position: { x: transform.x, y: transform.y + 0.18, z: transform.z },
        angle,
        velocity: {
          x: axes.forward.x * carrySpeed * direction,
          y: upward,
          z: axes.forward.z * carrySpeed * direction,
        },
      }, now);
      if (!activated) continue;

      stability.applyVelocityDeltaToLatest({
        x: axes.forward.x * Math.min(4.5, impact.deltaSpeed * 0.24) * direction,
        y: 1.2 + Math.min(3.5, impact.deltaSpeed * 0.22),
        z: axes.forward.z * Math.min(4.5, impact.deltaSpeed * 0.24) * direction,
      }, 16);
      crashEjections += 1;
      ctx.events.emit("ragdoll:vehicle-crash-eject", {
        entityId: impact.entityId,
        vehicleId: impact.vehicleId,
        speedBefore: impact.speedBefore,
        speedAfter: impact.speedAfter,
        deltaSpeed: impact.deltaSpeed,
        x: transform.x,
        y: transform.y,
        z: transform.z,
        now,
      });
    }
    pendingVehicleImpacts.clear();
  }

  const originalHandleInput = matchApi.handleInput.bind(matchApi);
  matchApi.handleInput = (playerId, input = {}, now = Date.now()) => {
    if (input.posePressed && enterParkourPose(playerId, input, now)) return;
    originalHandleInput(playerId, input, now);
  };

  const originalStep = matchApi.step.bind(matchApi);
  matchApi.step = (dt, now = Date.now()) => {
    pendingBuildingImpacts.clear();
    pendingVehicleImpacts.clear();
    const result = originalStep(dt, now);
    processBuildingImpacts(now);
    processVehicleImpacts(now);
    return result;
  };

  ctx.services.provide("parkour-ragdoll", {
    enterPose: enterParkourPose,
    summary() {
      return {
        parkourPoses,
        buildingContacts,
        buildingBraces,
        buildingFalls,
        crashEjections,
        thresholds: {
          buildingImpactMinSpeed: BUILDING_IMPACT_MIN_SPEED,
          airborneBuildingImpactMinSpeed: AIRBORNE_BUILDING_IMPACT_MIN_SPEED,
          airborneBuildingMinTotalSpeed: AIRBORNE_BUILDING_MIN_TOTAL_SPEED,
          airborneBuildingMinHeadOn: AIRBORNE_BUILDING_MIN_HEAD_ON,
          airborneBuildingDropSpeed: AIRBORNE_BUILDING_DROP_SPEED,
          vehicleCrashMinSpeed: VEHICLE_CRASH_MIN_SPEED,
          vehicleCrashMinDelta: VEHICLE_CRASH_MIN_DELTA,
          parkourFlipSpeed: PARKOUR_FLIP_SPEED,
        },
      };
    },
  });
}
