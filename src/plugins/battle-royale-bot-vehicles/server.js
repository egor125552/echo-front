import { angleDelta, brakeInput, clamp, CONSERVATIVE_BRAKE_DECELERATION, distance, drivingInput, headingTo } from "./driving.js";
import { createDriverRoutes } from "./routes.js";
import { createRamRecovery } from "./ram-recovery.js";

export const BOT_DRIVER_SHARE = 0.64;
export const BOT_RESERVED_VEHICLES = 8;
export const BOT_VEHICLE_SEARCH_RADIUS = 125;
export const BOT_VEHICLE_REFILL_RADIUS = 210;
export const BOT_VEHICLE_ASSIGNMENTS_PER_SCAN = 12;
export const BOT_VEHICLE_FAILURE_COOLDOWN_MS = 60_000;
export const BOT_VEHICLE_STATIONARY_FAILURE_QUARANTINE_MS = 180_000;
export const BOT_VEHICLE_CRASH_COOLDOWN_MS = 30_000;
export const BOT_VEHICLE_RETRY_COOLDOWN_MS = 1_500;
export const BOT_VEHICLE_APPROACH_INTERVAL_MS = 100;
export const BOT_VEHICLE_DRIVE_INTERVAL_MS = 250;
export const BOT_VEHICLE_NEAR_DRIVE_INTERVAL_MS = 50;
export const BOT_VEHICLE_DETAILED_RADIUS = 320;
const BOT_RAM_MAX_DISTANCE = 105;
const BOT_RAM_COMMIT_MS = 5_000;
const BOT_RAM_COOLDOWN_MS = 7_000;
export const manifest = {
  id: "battle-royale-bot-vehicles",
  requires: ["battle-royale-vehicle-fleet", "match-api", "bot-combat", "bot-brain", "bot-perception", "battle-royale-navigation-lifecycle", "battle-royale-bot-parachute"],
  optional: ["battle-royale-tutorial"],
  capabilities: ["services.consume", "services.provide", "components.read", "events.on", "events.emit"],
};

export async function setup(ctx) {
  const get = name => ctx.services.get(name);
  const vehicles = get("vehicles"), entities = get("entities"), bots = get("bots");
  const movement = get("movement"), physics = get("physics"), map = get("map");
  const match = get("match-api"), weapons = get("weapons"), battle = get("battle-royale");
  const brain = get("bot-brain"), perception = get("bot-perception");
  const tutorial = ctx.services.has("battle-royale-tutorial")
    ? ctx.services.get("battle-royale-tutorial")
    : null;
  const routes = createDriverRoutes(physics, get("navigation"), map);
  const ramRecovery = createRamRecovery({ routes, targetFor(id, vehicleId, car) {
    if (!entities.get(id)?.alive) return null;
    const target = vehicleId ? vehicles.stateFor(vehicleId) : ctx.components.get(id, "Transform");
    if (!target || distance(car, target) > 180) return null;
    if (vehicleId) {
      if (target.driverId !== id || routes.clearDistance(car, headingTo(car, target), distance(car, target), vehicleId) < distance(car, target) - 4) return null;
    } else if (target.downed || get("ragdoll").isActive(id) || !routes.visible(car, target)) return null;
    return target;
  } });
  const states = new Map(), reservations = new Map(), cooldowns = new Map(), vehicleCooldowns = new Map();
  const stationaryVehicleFailures = new Map();
  const sameFailedParkingSpot = (car, now) => {
    const failed = stationaryVehicleFailures.get(car.id);
    if (!failed) return false;
    // Physical displacement (including movement by a human) invalidates
    // the old failure location. A bounded expiry keeps the fleet reusable.
    if (now >= failed.until || distance(car, failed) >= 8) {
      stationaryVehicleFailures.delete(car.id);
      return false;
    }
    return true;
  };
  const recentAttackers = new Map();
  const pedestrianSamples = new Map();
  const lastVehicleImpacts = new Map();
  const recentCrashes = [];
  const recentFailures = [];
  const everAssigned = new Set(), everDrivers = new Set();
  const counters = { ticks: 0, assigned: 0, entered: 0, exited: 0, recoveries: 0, trafficYields: 0, crossingYields: 0,
    ramAttempts: 0, hits: 0, waypointAdvances: 0, crashEjections: 0, emergencyYields: 0, pedestrianYields: 0,
    headOnYields: 0, parkedAvoids: 0, emergencyBrakes: 0, deadlockResolutions: 0, controlUpdates: 0,
    releaseReasons: Object.create(null), unavailableReasons: Object.create(null) };
  let lastScan = { eligible: 0, availableCars: 0, nearCar: 0, withGoal: 0, assigned: 0 };
  let internalInput = false, nextScan = 0;
  const transform = id => ctx.components.get(id, "Transform");
  const botState = id => ctx.components.get(id, "Bot");

  function controlOffset(id, intervalMs) {
    let hash = 0;
    for (const ch of String(id)) hash = ((hash * 31) + ch.charCodeAt(0)) >>> 0;
    return hash % Math.max(1, intervalMs);
  }

  function nextControlDeadline(id, now, intervalMs) {
    const interval = Math.max(1, Number(intervalMs) || BOT_VEHICLE_DRIVE_INTERVAL_MS);
    const offset = controlOffset(id, interval);
    return (Math.floor((now - offset) / interval) + 1) * interval + offset;
  }
  const originalInput = movement.setInput.bind(movement);
  const setFootInput = (id, input) => {
    internalInput = true;
    try { movement.setInput(id, input); } finally { internalInput = false; }
  };
  movement.setInput = (id, input = {}) => {
    if (!internalInput && states.has(id)) return;
    return originalInput(id, (vehicles.isDriving(id) || vehicles.isPassenger?.(id)) ? {} : input);
  };
  const fire = weapons.fire.bind(weapons);
  weapons.fire = (id, now, options) => (vehicles.isDriving(id) || vehicles.isPassenger?.(id)) ? false : fire(id, now, options);

  function release(id, now, reason) {
    const state = states.get(id);
    if (!state) return;
    if (reason === "stuck" || reason === "unsafe" || reason === "traffic-deadlock") {
      vehicleCooldowns.set(state.vehicleId, now + BOT_VEHICLE_FAILURE_COOLDOWN_MS);
      const car = vehicles.stateFor(state.vehicleId);
      if (car && state.phase !== "approach"
        && (reason === "stuck" || reason === "traffic-deadlock")) {
        stationaryVehicleFailures.set(car.id, {
          x: car.x, z: car.z, reason,
          until: now + BOT_VEHICLE_STATIONARY_FAILURE_QUARANTINE_MS,
        });
      }
      const nearestVehicle = car ? vehicles.snapshot()
        .filter(other => other.id !== state.vehicleId)
        .map(other => ({ other, distance: distance(car, other) }))
        .sort((a, b) => a.distance - b.distance)[0] ?? null : null;
      recentFailures.push({ reason, vehicleId: state.vehicleId, entityId: id, now,
        position: car ? { x: car.x, z: car.z } : null,
        destination: state.destination ? { ...state.destination } : null, recoveries: state.recoveries,
        nearestVehicle: nearestVehicle ? {
          id: nearestVehicle.other.id, distance: nearestVehicle.distance,
          speed: nearestVehicle.other.speed, occupied: nearestVehicle.other.occupied,
          driverId: nearestVehicle.other.driverId, angle: nearestVehicle.other.angle,
        } : null });
      if (recentFailures.length > 24) recentFailures.splice(0, recentFailures.length - 24);
    }
    const releasedCar = vehicles.stateFor(state.vehicleId);
    reservations.delete(state.vehicleId);
    states.delete(id);
    counters.releaseReasons[reason] = (counters.releaseReasons[reason] ?? 0) + 1;
    const retryDelay = reason === "unavailable" ? BOT_VEHICLE_RETRY_COOLDOWN_MS : 45_000;
    cooldowns.set(id, now + retryDelay);
    if (botState(id)) { botState(id).vehicleControl = false; botState(id).nextThinkAt = 0; }
    setFootInput(id, {});
    ctx.events.emit("bot-vehicle:released", {
      entityId: id, vehicleId: state.vehicleId, reason, now,
      // "combat" can abort an approach before the bot EVER occupies the car.
      // Distinguish this from a driver who actually exited, otherwise a count
      // of cancelled approaches misleadingly looks like abandoned vehicles.
      hadEnteredVehicle: state.phase !== "approach",
      lastDrivingPhase: state.phase,
      stopTelemetry: state.stopTelemetry ?? null,
      // Snapshot the actual final driving conditions before the state is gone.
      // Only enriched internal AI events receive this detail, not every
      // ordinary client network packet.
      lastControl: state.input ? {
        forward: Number(state.input.forward) || 0,
        strafe: Number(state.input.strafe) || 0,
        handbrake: Boolean(state.input.sprint),
      } : null,
      lastTraffic: state.traffic ? { ...state.traffic } : null,
      lastCollisionRisk: state.lastCollisionRisk ? { ...state.lastCollisionRisk } : null,
      lastObstacleDistance: Number.isFinite(state.lastObstacleDistance)
        ? state.lastObstacleDistance : null,
      recoveries: state.recoveries ?? 0,
      stationaryRecoveryAttempts: state.stationaryRecoveryAttempts ?? 0,
      stationaryAt: state.stationaryAt ?? null,
      physicalStationaryForMs: state.stationaryAt == null ? null
        : Math.max(0, now - state.stationaryAt),
      rearClearanceMeters: releasedCar ? routes.clearDistance(releasedCar, releasedCar.angle + Math.PI, 9) : null,
      lastProgressAt: state.lastProgressAt ?? null,
      trafficWaitAt: state.trafficWaitAt ?? null,
      nearestParkedVehicles: (releasedCar
        ? vehicles.snapshot().filter(other =>
            other.id !== state.vehicleId && !other.occupied && other.speed < 1.5
            && distance(other, releasedCar) < 14
          ).map(other=>({id:other.id,x:other.x,z:other.z})).slice(0,8)
        : []),
    });
  }

  function driverLimit() {
    const liveBots = bots.all().filter(bot => bot.alive).length;
    const fleetCapacity = Math.max(0, vehicles.snapshot().length - BOT_RESERVED_VEHICLES);
    return Math.min(fleetCapacity, Math.ceil(liveBots * BOT_DRIVER_SHARE));
  }

  function assign(id, vehicleId, destination, now = Date.now(), options = {}) {
    const entity = entities.get(id), p = transform(id), car = vehicles.stateFor(vehicleId);
    const maxDistance = Math.max(BOT_VEHICLE_SEARCH_RADIUS, Number(options.maxDistance) || BOT_VEHICLE_SEARCH_RADIUS);
    const initialDistance = p && car ? distance(p, car) : Infinity;
    if (!entity?.bot || !entity.alive || !botState(id) || !p || p.downed || states.has(id)
      || states.size >= driverLimit() || !car || car.occupied || reservations.has(vehicleId)
      || (vehicleCooldowns.get(vehicleId) ?? 0) > now
      || sameFailedParkingSpot(car, now)
      || !destination || !Number.isFinite(destination.x) || !Number.isFinite(destination.z)
      || initialDistance > maxDistance || distance(p, destination) < 60
      || get("parachute").stateFor(id)?.airborne || get("ragdoll").isActive(id)
      || Math.abs(p.y) > 1 || vehicles.isDriving(id)) return false;
    const approachTimeoutMs = initialDistance <= BOT_VEHICLE_SEARCH_RADIUS
      ? 22_000
      : clamp(22_000 + (initialDistance - BOT_VEHICLE_SEARCH_RADIUS) * 140, 22_000, 36_000);
    states.set(id, { phase: "approach", vehicleId, destination: { ...destination }, startedAt: now,
      approachTimeoutMs, initialApproachDistance: initialDistance,
      phaseAt: now, previousSteering: 0, lastProgressAt: now, lastPosition: { ...car }, recoveries: 0, attempts: 0,
      nextControlAt: now, lastControlAt: now });
    reservations.set(vehicleId, id);
    counters.assigned++;
    everAssigned.add(id);
    botState(id).vehicleControl = true;
    setFootInput(id, {});
    return true;
  }

  function stop(state, now, reason = "arrived") {
    // Capture the real control state that caused stopping before the brake
    // phase replaces the throttle and clears the physical-stall clock.
    const car = vehicles.stateFor(state.vehicleId);
    const rear = car ? routes.clearDistance(car, car.angle + Math.PI, 9) : null;
    state.stopTelemetry = {
      reason, at: now, phaseBeforeBrake: state.phase,
      chassisSleeping: physics.dynamicBody(state.vehicleId)?.isSleeping?.() ?? null,
      forward: state.input?.forward ?? null,
      handbrake: state.input?.sprint ?? null,
      obstacleDistance: state.lastObstacleDistance ?? null,
      frontBlocker: car ? routes.forwardBlocker(car, 20) : null,
      physicalStillForMs: state.stationaryAt == null
        ? null : Math.max(0, now - state.stationaryAt),
      rearClearanceMeters: rear == null ? null
        : Number.isFinite(rear) ? rear : "clear",
      recoveries: state.recoveries ?? 0,
      stationaryRecoveryAttempts: state.stationaryRecoveryAttempts ?? 0,
      lastReverseMeters: state.lastReverseMeters ?? null,
      stationaryRecoveryBlockedBy: state.stationaryRecoveryBlockedBy ?? null,
      traffic: state.traffic ? { ...state.traffic } : null,
      pedestrian: state.lastPedestrian ? { ...state.lastPedestrian } : null,
      collisionRisk: state.lastCollisionRisk ? { ...state.lastCollisionRisk } : null,
      lastYield: state.lastYield ? { ...state.lastYield } : null,
    };
    state.phase = "brake"; state.phaseAt = now; state.reason = reason;
  }

  function approach(id, state, now) {
    const car = vehicles.stateFor(state.vehicleId), p = transform(id);
    // A visible enemy takes priority over a car that has not been entered yet.
    // This also prevents a nearby unarmed-looking bot from ignoring a player.
    const inventory = ctx.components.get(id, "Weapons");
    const selected = inventory?.items?.[inventory.selected];
    const range = Number(weapons.definitions[selected?.id]?.range) || 28;
    if (perception.nearestVisibleEnemy?.(id, range, { now })) {
      release(id, now, "combat");
      return;
    }
    const elapsed = now - state.startedAt;
    const baseTimeout = state.approachTimeoutMs ?? 22_000;
    const currentDistance = p && car ? distance(p, car) : Infinity;
    const finishingGrace = currentDistance <= 35 && elapsed <= baseTimeout + 8_000;
    const timedOut = elapsed > baseTimeout && !finishingGrace;
    if (!car || car.occupied || timedOut) {
      const unavailableReason = !car ? "missing" : car.occupied ? "occupied" : "timeout";
      counters.unavailableReasons[unavailableReason] = (counters.unavailableReasons[unavailableReason] ?? 0) + 1;
      recentFailures.push({ reason: `unavailable:${unavailableReason}`, vehicleId: state.vehicleId, entityId: id, now,
        initialApproachDistance: state.initialApproachDistance ?? null, approachTimeoutMs: state.approachTimeoutMs ?? 22_000,
        elapsed, currentDistance: Number.isFinite(currentDistance) ? currentDistance : null,
        carOccupied: Boolean(car?.occupied), carSpeed: car?.speed ?? null });
      if (recentFailures.length > 24) recentFailures.splice(0, recentFailures.length - 24);
      release(id, now, "unavailable"); return;
    }
    if ((vehicles.enterBot?.(id, now, car.id) ?? vehicles.enter(id, now, car.id))) {
      state.phase = "travel"; state.phaseAt = now; state.lastProgressAt = now;
      state.route = routes.plan(car, state.destination);
      counters.entered++;
      everDrivers.add(id);
      return;
    }
    const goal = map.navigationWaypoint?.(p, car) ?? car;
    if (goal.doorId) {
      const door = map.doors.find(d => d.id === goal.doorId);
      if (door && distance(p, door) < 2.6) map.setDoorOpen(door.id, true, id, now);
    }
    const error = angleDelta(headingTo(p, goal) - p.angle);
    setFootInput(id, { forward: Math.abs(error) < .7 ? 1 : 0, turn: clamp(error * 1.8, -1, 1), sprint: distance(p, car) > 7 });
  }

  function nearbyCombatTarget(id, car, now) {
    const preferredRange = Number(brain.profile?.(id)?.preferredRange);
    const fallbackDismountDistance = clamp((Number.isFinite(preferredRange) ? preferredRange : 12) + 12, 24, 38);
    const speed = Math.max(0, Math.abs(Number(car.forwardSpeed) || 0), Math.abs(Number(car.speed) || 0));
    const brakingDistance = speed * speed / (2 * CONSERVATIVE_BRAKE_DECELERATION);

    const recentAttacker = recentAttackers.get(id);
    if (recentAttacker?.until > now) {
      const attacker = entities.get(recentAttacker.attackerId);
      const attackerPosition = transform(recentAttacker.attackerId);
      if (attacker?.alive && attackerPosition && !attackerPosition.downed
        && !vehicles.isDriving(recentAttacker.attackerId) && !vehicles.isPassenger?.(recentAttacker.attackerId)
        && !get("ragdoll").isActive(recentAttacker.attackerId)) {
        const targetDistance = distance(car, attackerPosition);
        if (targetDistance <= fallbackDismountDistance) {
          return { entityId: recentAttacker.attackerId, distance: targetDistance,
            dismountDistance: fallbackDismountDistance, brakingDistance, source: "retaliation" };
        }
        const headingError = Math.abs(angleDelta(headingTo(car, attackerPosition) - car.angle));
        if (headingError <= .42 && targetDistance <= fallbackDismountDistance + brakingDistance + 8) {
          return { entityId: recentAttacker.attackerId, distance: targetDistance,
            dismountDistance: fallbackDismountDistance, brakingDistance, headingError, source: "forward-retaliation" };
        }
      }
    }

    const decision = brain.commitmentFor(id);
    const targetId = decision?.targetEntityId;
    if (targetId) {
      const targetEntity = entities.get(targetId);
      const targetPosition = transform(targetId);
      if (targetEntity?.alive && targetPosition && !targetPosition.downed
        && !vehicles.isDriving(targetId) && !vehicles.isPassenger?.(targetId)
        && !get("ragdoll").isActive(targetId)) {
        const recentAttacker = recentAttackers.get(id);
        const retaliating = recentAttacker?.attackerId === targetId && recentAttacker.until > now;
        if (targetEntity.bot && !retaliating) {
          // Ignore stale pre-vehicle bot-vs-bot commitments. A bot target only
          // justifies abandoning the car if that opponent actually attacked
          // this driver recently.
        } else {
        const desiredRange = Number(decision.desiredRange);
        const dismountDistance = clamp((Number.isFinite(desiredRange) ? desiredRange : 12) + 12, 24, 38);
        const targetDistance = distance(car, targetPosition);
        if (targetDistance <= dismountDistance) {
          return { entityId: targetId, distance: targetDistance, dismountDistance,
            source: retaliating ? "retaliation" : "commitment" };
        }
        }
      }
    }

    // Infantry thinking is intentionally paused while driving, so a newly
    // appearing enemy would never reach bot-brain on its own. Keep only the
    // perception slice alive here; driving, aiming and firing remain owned by
    // their respective vehicle/infantry controllers.
    const dismountDistance = fallbackDismountDistance;
    const forwardLookahead = clamp(dismountDistance + brakingDistance + 8, 42, 220);
    const visibleEnemies = perception.visibleEnemies?.(id, forwardLookahead, { now, limit: 8 }) ?? [];
    for (const visible of visibleEnemies) {
      const visibleEntity = entities.get(visible.entityId);
      if (visible.transform?.downed || vehicles.isDriving(visible.entityId) || vehicles.isPassenger?.(visible.entityId)
        || get("ragdoll").isActive(visible.entityId)) continue;
      // A car should not become disposable just because another solo-BR bot
      // crosses its view. Bot-vs-bot encounters happen at the destination or
      // through an existing combat commitment. A human player remains a
      // high-priority fresh threat so drivers cannot blindly blast past them.
      if (visibleEntity?.bot) continue;
      if (visible.distance <= dismountDistance) {
        return { entityId: visible.entityId, distance: visible.distance, dismountDistance,
          brakingDistance, source: "fresh-vision" };
      }
      const headingError = Math.abs(angleDelta(headingTo(car, visible.transform) - car.angle));
      if (headingError <= .42 && visible.distance <= dismountDistance + brakingDistance + 8) {
        return { entityId: visible.entityId, distance: visible.distance, dismountDistance,
          brakingDistance, headingError, source: "forward-braking-vision" };
      }
    }
    return null;
  }

  function ramOpportunity(id, car, combatTarget, state, now) {
    if ((state.ramCooldownUntil ?? 0) > now) return null;
    const candidateId = combatTarget?.entityId
      ?? ((state.ramUntil ?? 0) > now ? state.ramTargetId : null);
    if (!candidateId) return null;
    const target = entities.get(candidateId), driver = entities.get(id);
    const targetPosition = transform(candidateId);
    if (!target?.alive || target.bot || !targetPosition || targetPosition.downed
      || vehicles.isDriving(candidateId) || vehicles.isPassenger?.(candidateId)
      || get("ragdoll").isActive(candidateId)) return null;
    if (driver?.team != null && target.team != null && driver.team === target.team) return null;
    const targetDistance = distance(car, targetPosition);
    const committed = state.ramTargetId === candidateId && (state.ramUntil ?? 0) > now;
    if ((!committed && targetDistance < 5) || targetDistance > BOT_RAM_MAX_DISTANCE) return null;

    const carSpeed = Math.max(9, Math.abs(Number(car.forwardSpeed) || 0), Math.abs(Number(car.speed) || 0));
    const sample = pedestrianSamples.get(candidateId);
    const leadTime = clamp(targetDistance / carSpeed, .15, 1.45);
    const point = {
      x: targetPosition.x + (Number(sample?.vx) || 0) * leadTime * .8,
      y: 0,
      z: targetPosition.z + (Number(sample?.vz) || 0) * leadTime * .8,
    };
    const aim = headingTo(car, point);
    const headingError = Math.abs(angleDelta(aim - car.angle));
    const finalCommit = committed && targetDistance <= 8;
    if (headingError > .72 && !finalCommit) return null;
    const clearDistance = routes.clearDistance(car, aim, Math.min(120, targetDistance + 12));
    if (!finalCommit && clearDistance < Math.max(8, targetDistance - 6)) return null;
    return { entityId: candidateId, point, distance: targetDistance, headingError, leadTime, clearDistance,
      source: combatTarget?.source ?? "ram-lock" };
  }

  function vehicleRamOpportunity(id, car, trafficCars, state, now) {
    if ((state.ramCooldownUntil ?? 0) > now) return null;
    const driver = entities.get(id);
    let best = null;
    for (const other of trafficCars) {
      if (!other || other.id === car.id || !other.driverId) continue;
      const target = entities.get(other.driverId);
      if (!target?.alive || target.bot) continue;
      if (driver?.team != null && target.team != null && driver.team === target.team) continue;
      const targetDistance = distance(car, other);
      const committed = state.ramVehicleId === other.id && (state.ramUntil ?? 0) > now;
      if ((!committed && targetDistance < 6) || targetDistance > 140) continue;
      const ownSpeed = Math.max(10, Math.abs(Number(car.forwardSpeed) || 0), Math.hypot(Number(car.linvel?.x) || 0, Number(car.linvel?.z) || 0));
      const leadTime = clamp(targetDistance / ownSpeed, .15, 1.6);
      const point = {
        x: other.x + (Number(other.linvel?.x) || 0) * leadTime * .85,
        y: 0,
        z: other.z + (Number(other.linvel?.z) || 0) * leadTime * .85,
      };
      const aim = headingTo(car, point);
      const headingError = Math.abs(angleDelta(aim - car.angle));
      const finalCommit = committed && targetDistance <= 10;
      if (headingError > .9 && !finalCommit) continue;
      const clearDistance = routes.clearDistance(car, aim, Math.min(155, targetDistance + 15), other.id);
      if (!finalCommit && clearDistance < Math.max(10, targetDistance - 8)) continue;
      const score = targetDistance + headingError * 24;
      if (!best || score < best.score) best = {
        kind: "vehicle", entityId: other.driverId, vehicleId: other.id, point, distance: targetDistance,
        headingError, leadTime, clearDistance, score, source: "player-vehicle",
      };
    }
    return best;
  }

  function trafficAhead(car, trafficCars) {
    const forwardX = Math.sin(car.angle), forwardZ = -Math.cos(car.angle);
    const rightX = Math.cos(car.angle), rightZ = Math.sin(car.angle);
    let best = null;
    for (const other of trafficCars) {
      if (!other || other.id === car.id) continue;
      const dx = other.x - car.x, dz = other.z - car.z;
      const ahead = dx * forwardX + dz * forwardZ;
      if (ahead <= 2.5) continue;
      const headingGap = Math.abs(angleDelta(other.angle - car.angle));
      // A driverless parked vehicle has no oncoming intent, regardless of
      // which way its chassis points. Treat it as a static following obstacle
      // so the existing parked-car avoidance can handle it. Keep genuine
      // occupied/moving head-on traffic under the normal yield rules.
      const headOn = headingGap > 2.35
        && other.occupied && (Number(other.speed) || 0) >= 1.5;
      if (ahead > (headOn ? 100 : 32)) continue;
      const lateral = Math.abs(dx * rightX + dz * rightZ);
      if (lateral > (headOn ? 6.5 : 4.8)) continue;
      if (!best || ahead < best.distance) best = { type: headOn ? "head-on" : "following", distance: ahead, lateral, headingGap, vehicleId: other.id };
    }
    return best;
  }

  function crossingTraffic(car, trafficCars) {
    const ownSpeed = Math.max(0, Number(car.forwardSpeed) || Number(car.speed) / 3.6 || 0);
    if (ownSpeed < 2) return null;
    const ownForward = { x: Math.sin(car.angle), z: -Math.cos(car.angle) };
    const ownRight = { x: Math.cos(car.angle), z: Math.sin(car.angle) };
    let best = null;
    for (const other of trafficCars) {
      if (!other || other.id === car.id) continue;
      const otherSpeed = Math.max(0, Number(other.forwardSpeed) || Number(other.speed) / 3.6 || 0);
      if (otherSpeed < 1.5) continue;
      const headingGap = Math.abs(angleDelta(other.angle - car.angle));
      if (headingGap < .5) continue;
      const dx = other.x - car.x, dz = other.z - car.z;
      const currentDistance = Math.hypot(dx, dz);
      if (currentDistance > 120) continue;
      const side = dx * ownRight.x + dz * ownRight.z;
      const otherForward = { x: Math.sin(other.angle), z: -Math.cos(other.angle) };
      const rvx = otherForward.x * otherSpeed - ownForward.x * ownSpeed;
      const rvz = otherForward.z * otherSpeed - ownForward.z * ownSpeed;
      const relativeSpeedSq = rvx * rvx + rvz * rvz;
      if (relativeSpeedSq < .25) continue;
      const time = -(dx * rvx + dz * rvz) / relativeSpeedSq;
      if (time < .15 || time > 4.5) continue;
      const closestX = dx + rvx * time, closestZ = dz + rvz * time;
      const closestDistance = Math.hypot(closestX, closestZ);
      if (closestDistance > 6.5) continue;
      const emergency = time <= 1.6 && closestDistance <= 5.2;
      const yieldsByRight = side > 1.5;
      if (!emergency && !yieldsByRight) continue;
      const distanceToConflict = ownSpeed * time;
      if (!best || time < best.time || (emergency && !best.emergency)) {
        best = { type: "crossing", vehicleId: other.id, distance: distanceToConflict,
          currentDistance, closestDistance, time, headingGap, emergency, side };
      }
    }
    return best;
  }

  function predictedVehicleCollision(car, trafficCars) {
    const ownSpeed = Math.max(0, Number(car.speed) || 0);
    if (ownSpeed < 2) return null;
    const ownForwardX = Math.sin(car.angle), ownForwardZ = -Math.cos(car.angle);
    const ownVx = Number(car.linvel?.x) || ownForwardX * ownSpeed;
    const ownVz = Number(car.linvel?.z) || ownForwardZ * ownSpeed;
    let best = null;
    for (const other of trafficCars) {
      if (!other || other.id === car.id) continue;
      const dx = other.x - car.x, dz = other.z - car.z;
      const currentDistance = Math.hypot(dx, dz);
      if (currentDistance > 220) continue;
      const otherSpeed = Math.max(0, Number(other.speed) || 0);
      const otherForwardX = Math.sin(other.angle), otherForwardZ = -Math.cos(other.angle);
      const otherVx = Number(other.linvel?.x) || otherForwardX * otherSpeed;
      const otherVz = Number(other.linvel?.z) || otherForwardZ * otherSpeed;
      const rvx = otherVx - ownVx, rvz = otherVz - ownVz;
      const relativeSpeedSq = rvx * rvx + rvz * rvz;
      if (relativeSpeedSq < 1) continue;
      const time = -(dx * rvx + dz * rvz) / relativeSpeedSq;
      if (time < .15 || time > 6) continue;
      const closestX = dx + rvx * time, closestZ = dz + rvz * time;
      const closestDistance = Math.hypot(closestX, closestZ);
      const headingGap = Math.abs(angleDelta(other.angle - car.angle));
      const collisionRadius = headingGap > 2.35 ? 8.5 : 7.2;
      if (closestDistance > collisionRadius) continue;
      const distanceToConflict = ownSpeed * time;
      if (!best || time < best.time) best = {
        type: headingGap > 2.35 ? "head-on-risk" : "collision-risk",
        vehicleId: other.id, distance: distanceToConflict, currentDistance,
        closestDistance, time, headingGap,
      };
    }
    return best;
  }

  function plannedVehicleCollision(id, state, car, trafficCars) {
    const ownPoint = state.route?.points?.[state.route.index] ?? state.destination;
    if (!ownPoint) return null;
    const ownDx = ownPoint.x - car.x, ownDz = ownPoint.z - car.z;
    const ownLength = Math.hypot(ownDx, ownDz);
    if (ownLength < 12) return null;
    const ownDirX = ownDx / ownLength, ownDirZ = ownDz / ownLength;
    const ownSpeed = Math.max(6, Number(car.speed) || 0);
    const ownAngle = Math.atan2(ownDirX, -ownDirZ);
    const ownRightX = -ownDirZ, ownRightZ = ownDirX;
    let best = null;
    for (const other of trafficCars) {
      if (!other || other.id === car.id || !other.driverId) continue;
      const otherState = states.get(other.driverId);
      if (!otherState || otherState.phase !== "travel") continue;
      const otherPoint = otherState.route?.points?.[otherState.route.index] ?? otherState.destination;
      if (!otherPoint) continue;
      const dx = other.x - car.x, dz = other.z - car.z;
      const currentDistance = Math.hypot(dx, dz);
      if (currentDistance < 18 || currentDistance > 180) continue;
      const otherDx = otherPoint.x - other.x, otherDz = otherPoint.z - other.z;
      const otherLength = Math.hypot(otherDx, otherDz);
      if (otherLength < 12) continue;
      const otherDirX = otherDx / otherLength, otherDirZ = otherDz / otherLength;
      const otherSpeed = Math.max(6, Number(other.speed) || 0);
      const rvx = otherDirX * otherSpeed - ownDirX * ownSpeed;
      const rvz = otherDirZ * otherSpeed - ownDirZ * ownSpeed;
      const relativeSpeedSq = rvx * rvx + rvz * rvz;
      if (relativeSpeedSq < 1) continue;
      const time = -(dx * rvx + dz * rvz) / relativeSpeedSq;
      if (time < .5 || time > 6) continue;
      const closestX = dx + rvx * time, closestZ = dz + rvz * time;
      const closestDistance = Math.hypot(closestX, closestZ);
      const otherAngle = Math.atan2(otherDirX, -otherDirZ);
      const headingGap = Math.abs(angleDelta(otherAngle - ownAngle));
      const headOn = headingGap > 2.35;
      if (closestDistance > (headOn ? 9 : 7.5)) continue;
      const side = dx * ownRightX + dz * ownRightZ;
      if (!headOn) {
        // The live crossing rule uses right-hand priority. For a future-route
        // prediction the two local coordinate frames can both classify the
        // other car as "left", leaving nobody yielding. This fail-safe must
        // guarantee exactly one winner for the pair.
        const yields = String(car.id).localeCompare(String(other.id)) > 0;
        if (!yields) continue;
      }
      const risk = {
        type: headOn ? "planned-head-on-risk" : "planned-collision-risk",
        source: "planned-route", vehicleId: other.id, distance: ownSpeed * time,
        currentDistance, closestDistance, time, headingGap, side,
      };
      if (!best || risk.time < best.time) best = risk;
    }
    return best;
  }

  function stationaryBlocker(car, trafficCars) {
    if ((Number(car.speed) || 0) > 1.7) return null;
    let best = null;
    for (const other of trafficCars) {
      if (!other || other.id === car.id || (Number(other.speed) || 0) > 1.4) continue;
      const d = distance(car, other);
      if (d > 16.5) continue;
      if (!best || d < best.distance) best = { vehicle: other, distance: d };
    }
    return best;
  }

  function samplePedestrianMotion(now) {
    const seen = new Set();
    for (const entity of entities.all()) {
      if (!entity?.alive || vehicles.isDriving(entity.id) || vehicles.isPassenger?.(entity.id)) continue;
      const p = transform(entity.id);
      if (!p) continue;
      seen.add(entity.id);
      const previous = pedestrianSamples.get(entity.id);
      let vx = previous?.vx ?? 0, vz = previous?.vz ?? 0;
      const elapsed = previous ? (now - previous.now) / 1000 : 0;
      if (elapsed >= .02 && elapsed <= .2) {
        const nextVx = (p.x - previous.x) / elapsed;
        const nextVz = (p.z - previous.z) / elapsed;
        if (Math.hypot(nextVx, nextVz) <= 8) { vx = nextVx; vz = nextVz; }
        else { vx = 0; vz = 0; }
      }
      pedestrianSamples.set(entity.id, { x: p.x, z: p.z, now, vx, vz });
    }
    for (const entityId of pedestrianSamples.keys()) if (!seen.has(entityId)) pedestrianSamples.delete(entityId);
  }

  function pedestrianAhead(id, car, ignoreEntityId = null) {
    const speed = Math.max(0, Number(car.forwardSpeed) || Number(car.speed) / 3.6 || 0);
    if (speed < 2) return null;
    const brakingDistance = speed * speed / (2 * CONSERVATIVE_BRAKE_DECELERATION);
    const lookahead = clamp(brakingDistance + 14, 35, 220);
    const forwardX = Math.sin(car.angle), forwardZ = -Math.cos(car.angle);
    const rightX = Math.cos(car.angle), rightZ = Math.sin(car.angle);
    const carVx = Number(car.linvel?.x) || forwardX * speed;
    const carVz = Number(car.linvel?.z) || forwardZ * speed;
    const predictionHorizon = Math.min(6, lookahead / Math.max(speed, 1));
    let best = null;
    for (const entity of entities.all()) {
      if (!entity?.alive || entity.id === id || entity.id === ignoreEntityId
        || vehicles.isDriving(entity.id) || vehicles.isPassenger?.(entity.id)) continue;
      const p = transform(entity.id);
      if (!p || Math.abs(Number(p.y) || 0) > 2.2) continue;
      const dx = p.x - car.x, dz = p.z - car.z;
      const ahead = dx * forwardX + dz * forwardZ;
      if (ahead <= -2 || ahead > lookahead) continue;
      const signedLateral = dx * rightX + dz * rightZ;
      const lateral = Math.abs(signedLateral);
      const closeSafety = ahead <= 18 && lateral <= 6.5;
      if (!closeSafety && !routes.visible(car, p)) continue;

      let distanceToConflict = (lateral <= 5.5 || closeSafety) ? Math.max(0, ahead) : Infinity;
      let predicted = false, timeToConflict = null, closestDistance = null;
      const sample = pedestrianSamples.get(entity.id);
      if (sample && Math.hypot(sample.vx, sample.vz) > .4) {
        const rvx = sample.vx - carVx, rvz = sample.vz - carVz;
        const relativeSpeedSq = rvx * rvx + rvz * rvz;
        if (relativeSpeedSq > .25) {
          const time = clamp(-(dx * rvx + dz * rvz) / relativeSpeedSq, 0, predictionHorizon);
          const closestX = dx + rvx * time, closestZ = dz + rvz * time;
          const closest = Math.hypot(closestX, closestZ);
          if (time >= .15 && time <= predictionHorizon && closest <= 5.4) {
            distanceToConflict = Math.min(distanceToConflict, speed * time);
            predicted = true; timeToConflict = time; closestDistance = closest;
          }
        }
      }
      if (!Number.isFinite(distanceToConflict)) continue;
      if (!best || distanceToConflict < best.distance) best = {
        type: "pedestrian", entityId: entity.id, distance: distanceToConflict, lateral, signedLateral, closeSafety,
        predicted, timeToConflict, closestDistance,
      };
    }
    return best;
  }

  function personInReverseCorridor(id, car) {
    const backX = -Math.sin(car.angle), backZ = Math.cos(car.angle);
    return entities.all().some(entity => {
      if (!entity.alive || entity.id === id || vehicles.isDriving(entity.id)
        || vehicles.isPassenger?.(entity.id)) return false;
      const p = transform(entity.id);
      if (!p || Math.abs((p.y ?? 0) - (car.y ?? 0)) > 3.5) return false;
      const dx = p.x - car.x, dz = p.z - car.z;
      const rear = dx * backX + dz * backZ;
      return rear > -2 && rear < 10
        && Math.abs(dx * backZ - dz * backX) < 5;
    });
  }

  function recover(id, state, car, now) {
    const reverseMeters = state.reverseStartPosition
      ? distance(car, state.reverseStartPosition) : 0;
    const reverseStoppedByPerson = personInReverseCorridor(id, car);
    const rearClearance = routes.clearDistance(car, car.angle + Math.PI, 8);
    const reverseTimedOut = now - state.phaseAt > 2100;
    if (reverseStoppedByPerson || reverseTimedOut || rearClearance < 2) {
      state.lastReverseMeters = reverseMeters;
      // The exit is from a REAL car-controller maneuver, not a synthetic
      // verdict. Include even successful reverses which were invisible in
      // the old "released" log because the bot kept the driver's seat.
      if (state.reverseStartPosition) {
        ctx.events.emit("bot-vehicle:reverse-finished", {
          entityId: id, vehicleId: state.vehicleId, now,
          x: car.x, z: car.z,
          movedMeters: Number(reverseMeters.toFixed(3)),
          elapsedMs: now - state.phaseAt,
          stationaryRecovery: (state.stationaryRecoveryAttempts ?? 0) > 0,
          reason: reverseStoppedByPerson ? "pedestrian-behind"
            : rearClearance < 2 ? "rear-obstacle" : "completed",
        });
      }
      state.reverseStartPosition = null;
      state.phase = "travel"; state.phaseAt = now;
      if (reverseStoppedByPerson) {
        state.input = brakeInput(car);
        vehicles.setInput(id, state.input);
        return;
      }
      state.lastProgressAt = now;
      state.lastPosition = { ...car }; state.previousSteering = 0;
      state.route = routes.plan(car, state.destination);
      state.input = brakeInput(car);
      vehicles.setInput(id, state.input);
      return;
    }
    state.input = {
      forward: car.forwardSpeed > .5 ? -1 : -.65,
      // First reverse straight away from the obstacle. Steering the
      // wheels immediately can swing the chassis into the adjacent wall.
      strafe: now - state.phaseAt < 900 ? 0 : state.recoverTurn,
      sprint: false, fireHeld: false,
    };
    vehicles.setInput(id, state.input);
  }

  function drive(id, state, dt, now, trafficCars, humanPositions = []) {
    const car = vehicles.vehicleForDriver(id);
    if (!car || car.id !== state.vehicleId) { release(id, now, "driver-lost"); return; }
    // A route can keep replanning and refreshing lastProgressAt while Rapier
    // reports nearly the same world position. Neither the ordinary recovery
    // nor the traffic-yield watchdog catches a zero-throttle obstacle in that
    // case. Use a separate physical-position clock, irrespective of route and
    // input, and eventually give the stuck bot its on-foot AI back.
    if (state.phase !== "brake" && distance(car, state.destination) > 60
      && car.speed < 1.5) {
      if (!state.stationaryPosition || distance(car, state.stationaryPosition) > 3) {
        state.stationaryPosition = { x: car.x, z: car.z };
        state.stationaryAt = now;
      } else {
        const stillFor = now - (state.stationaryAt ?? now);
        if (state.phase !== "reverse" && stillFor >= 5_000
          && (state.nextStationaryRecoveryAt ?? 0) <= now
          && (state.stationaryRecoveryAttempts ?? 0) < 2) {
          const rearClear = routes.clearDistance(car, car.angle + Math.PI, 9);
          // The Rapier sweep excludes character colliders.
          const personBehind = personInReverseCorridor(id, car);
          if (rearClear > 7 && !personBehind) {
            const left = routes.clearDistance(car, car.angle - .6, 20);
            const right = routes.clearDistance(car, car.angle + .6, 20);
            state.phase = "reverse"; state.phaseAt = now;
            state.reverseStartPosition = { x: car.x, z: car.z };
            state.recoverTurn = left > right ? .8 : -.8;
            state.stationaryRecoveryAttempts = (state.stationaryRecoveryAttempts ?? 0) + 1;
            state.nextStationaryRecoveryAt = now + 5_000;
            state.recoveries++; counters.recoveries++;
            state.lastStationaryRecoveryAt = now;
            state.input = {
              forward: -.65, strafe: 0,
              sprint: false, fireHeld: false,
            };
            vehicles.setInput(id, state.input);
            return;
          }
          state.stationaryRecoveryBlockedBy =
            rearClear <= 7 ? "rear-obstacle" : "person-behind";
        }
        if (stillFor >= 15_000) {
          stop(state, now, "stuck");
          vehicles.setInput(id, brakeInput(car));
          return;
        }
      }
    } else if (state.phase !== "reverse") {
      state.stationaryPosition = null;
      state.stationaryAt = null;
      state.stationaryRecoveryAttempts = 0;
      state.nextStationaryRecoveryAt = null;
      state.stationaryRecoveryBlockedBy = null;
    }
    const rotation = car.rotation;
    const up = rotation ? 1 - 2 * (rotation.x ** 2 + rotation.z ** 2) : 1;
    if (up < .35 && state.phase !== "brake") stop(state, now, "unsafe");
    if (state.phase === "brake") {
      vehicles.setInput(id, brakeInput(car));
      if (car.speed < .8 || (state.reason === "unsafe" && now - state.phaseAt > 4000)) {
        vehicles.exit(id, now, "bot-dismount"); counters.exited++;
        release(id, now, state.reason);
      }
      return;
    }
    // Once backing out, finish that maneuver before reconsidering a fight.
    if (state.phase === "reverse") { recover(id, state, car, now); return; }
    const detailed = humanPositions.some(position => distance(car, position) <= BOT_VEHICLE_DETAILED_RADIUS);
    const combatTarget = detailed && state.phase !== "ram-turnaround" ? nearbyCombatTarget(id, car, now) : null;
    const vehicleRam = detailed && state.phase !== "ram-turnaround"
      ? vehicleRamOpportunity(id, car, trafficCars, state, now) : null;
    const ram = detailed && state.phase !== "ram-turnaround"
      ? vehicleRam ?? ramOpportunity(id, car, combatTarget, state, now) : null;
    const recovery = ramRecovery.update(state, car, ram, now);
    if (recovery.stopReason) {
      stop(state, now, recovery.stopReason); vehicles.setInput(id, brakeInput(car)); return;
    }
    if (recovery.reacquired) return;
    if (ram) {
      state.combatTarget = combatTarget ?? state.combatTarget ?? null;
      const ramKey = ram.vehicleId ? `vehicle:${ram.vehicleId}` : `entity:${ram.entityId}`;
      if (state.ramKey !== ramKey) {
        state.ramKey = ramKey;
        state.ramTargetId = ram.entityId;
        state.ramVehicleId = ram.vehicleId ?? null;
        state.ramStartedAt = now;
        counters.ramAttempts++;
      }
      if (vehicleRam || combatTarget?.entityId === ram.entityId) state.ramUntil = now + BOT_RAM_COMMIT_MS;
      state.ram = ram;
    } else {
      state.ram = null;
      if ((state.ramUntil ?? 0) <= now) { state.ramKey = null; state.ramTargetId = null; state.ramVehicleId = null; }
      if (combatTarget && !recovery.turnaround) {
        state.combatTarget = combatTarget;
        if (combatTarget.distance <= combatTarget.dismountDistance
          || !["forward-braking-vision", "forward-retaliation"].includes(combatTarget.source)) {
          stop(state, now, "combat");
          vehicles.setInput(id, brakeInput(car));
          return;
        }
      } else {
        state.combatTarget = null;
      }
    }
    const path = recovery.turnaround
      ? { point: recovery.point, nextPoint: recovery.nextPoint, remaining: Infinity }
      : routes.waypoint(car, state.route);
    const reachedWorldAnchor = state.destination?.drivePurpose === "world-anchor" && path.remaining < 8;
    if (!ram && !recovery.turnaround && (path.remaining < 4 || reachedWorldAnchor)) {
      if (state.destination?.drivePurpose === "world-anchor") {
        const nextDestination = destinationFor(id, car, now);
        if (nextDestination && distance(car, nextDestination) > 60) {
          state.destination = { ...nextDestination };
          state.route = routes.plan(car, state.destination);
          state.lastProgressAt = now;
          state.lastPosition = { ...car };
          state.recoveries = 0;
          counters.waypointAdvances++;
          return;
        }
      }
      stop(state, now); vehicles.setInput(id, brakeInput(car)); return;
    }
    const avoidanceTraffic = ram?.vehicleId ? trafficCars.filter(other => other.id !== ram.vehicleId) : trafficCars;
    const followingTraffic = trafficAhead(car, avoidanceTraffic);
    const crossing = detailed ? crossingTraffic(car, avoidanceTraffic) : null;
    const actualCollisionRisk = detailed ? predictedVehicleCollision(car, avoidanceTraffic) : null;
    // Future route directions change much more slowly than Rapier velocity.
    // Keep the real-velocity fail-safe at physics rate, but sample the planned
    // predictor at 5 Hz so 60+ drivers do not do an O(N²) route comparison 20 times/s.
    if (!detailed) {
      state.plannedCollisionRisk = null;
    } else if ((state.nextPlannedCollisionAt ?? 0) <= now) {
      state.plannedCollisionRisk = plannedVehicleCollision(id, state, car, avoidanceTraffic);
      state.nextPlannedCollisionAt = now + 200;
    }
    const plannedCollisionRisk = state.plannedCollisionRisk ?? null;
    const collisionRisk = actualCollisionRisk ?? plannedCollisionRisk;
    const pedestrian = detailed
      ? pedestrianAhead(id, car, ram?.vehicleId ? null : (ram?.entityId ?? null))
      : null;
    const leadVehicle = followingTraffic?.vehicleId ? vehicles.stateFor(followingTraffic.vehicleId) : null;
    const parkedLead = followingTraffic?.type === "following" && leadVehicle
      && !leadVehicle.occupied && leadVehicle.speed < .8 && followingTraffic.distance < 36;
    let traffic = followingTraffic?.type === "head-on" ? followingTraffic
      : !followingTraffic ? crossing : !crossing ? followingTraffic
        : (followingTraffic.distance <= crossing.distance ? followingTraffic : crossing);
    if (collisionRisk?.type?.includes("head-on") && traffic?.type !== "head-on") {
      traffic = { ...collisionRisk, type: "head-on" };
    }
    if (traffic?.type === "crossing") {
      state.crossingYieldUntil = Math.max(state.crossingYieldUntil ?? 0, now + (traffic.emergency ? 1800 : 1400));
      state.crossingVehicleId = traffic.vehicleId;
    }
    const crossingHold = (state.crossingYieldUntil ?? 0) > now && traffic?.type !== "head-on";
    const obstruction = routes.clearDistance(car, car.angle, 180, ram?.vehicleId ?? null);
    let obstacleDistance = traffic ? Math.min(obstruction, Math.max(0, traffic.distance - (traffic.type === "crossing" ? (traffic.emergency ? 10 : 7) : traffic.type === "head-on" ? 9 : 3.5))) : obstruction;
    if (collisionRisk) {
      obstacleDistance = Math.min(obstacleDistance, Math.max(0, collisionRisk.distance - 16));
      state.collisionYieldUntil = Math.max(state.collisionYieldUntil ?? 0, now + 1400);
      state.collisionVehicleId = collisionRisk.vehicleId;
    } else if ((state.collisionYieldUntil ?? 0) > now) {
      obstacleDistance = Math.min(obstacleDistance, 0);
    }
    if (crossingHold && traffic?.type !== "crossing") obstacleDistance = Math.min(obstacleDistance, 0);
    let drivePoint = ram?.point ?? path.point;
    if (parkedLead) {
      // Diagnostic only: an empty vehicle can block several directions, and
      // counting the final dismount does not reveal why the driver did not
      // route around it. Sample at most once per bot / 4 simulated seconds.
      if (now >= (state.nextParkedProbeAt ?? 0)) {
        state.nextParkedProbeAt = now + 4000;
        const right = routes.clearDistance(car, car.angle + .38, 30);
        const left = routes.clearDistance(car, car.angle - .38, 30);
        const rear = routes.clearDistance(car, car.angle + Math.PI, 12);
        ctx.events.emit("bot-vehicle:parked-probe", {
          entityId:id, vehicleId:state.vehicleId, parkedVehicleId:leadVehicle.id,
          now, separation:followingTraffic.distance,
          leftClearance:Number.isFinite(left) ? left : "clear",
          rightClearance:Number.isFinite(right) ? right : "clear",
          rearClearance:Number.isFinite(rear) ? rear : "clear",
          desiredHeading:headingTo(car,path.point),
          carHeading:car.angle,
          obstacleDistance:Number.isFinite(obstacleDistance)
            ? obstacleDistance : "clear",
          previousAvoidVehicleId:state.parkedAvoidVehicleId ?? null,
          inRecovery:state.phase === "reverse",
        });
      }
      if (state.parkedAvoidVehicleId !== leadVehicle.id || (state.parkedAvoidUntil ?? 0) <= now) {
        const right = routes.clearDistance(car, car.angle + .38, 30);
        const left = routes.clearDistance(car, car.angle - .38, 30);
        const preferred = right >= left ? 1 : -1;
        const clearance = Math.max(right, left);
        if (clearance > 16) {
          state.parkedAvoidVehicleId = leadVehicle.id;
          state.parkedAvoidSide = preferred;
          state.parkedAvoidUntil = now + 2400;
          counters.parkedAvoids++;
        }
      } else {
        state.parkedAvoidUntil = Math.max(state.parkedAvoidUntil, now + 800);
      }
    }
    if ((state.parkedAvoidUntil ?? 0) > now && state.parkedAvoidSide) {
      const side = state.parkedAvoidSide;
      const diagonalClearance = routes.clearDistance(car, car.angle + side * .38, 30);
      if (diagonalClearance > 12) {
        drivePoint = {
          ...drivePoint,
          x: drivePoint.x + Math.cos(car.angle) * side * 5.5,
          z: drivePoint.z + Math.sin(car.angle) * side * 5.5,
        };
      }
    }
    if (traffic?.type === "head-on" && traffic.distance < 100) {
      const rightClearance = routes.clearDistance(car, car.angle + Math.PI / 2, 12);
      if (rightClearance > 6) {
        const shift = clamp(3.5 + (100 - traffic.distance) * .025, 3.5, 5.5);
        drivePoint = {
          ...path.point,
          x: path.point.x + Math.cos(car.angle) * shift,
          z: path.point.z + Math.sin(car.angle) * shift,
        };
      }
    }
    if (pedestrian && (pedestrian.predicted || pedestrian.distance < 35)) {
      if (state.pedestrianAvoidEntityId !== pedestrian.entityId) {
        state.pedestrianAvoidEntityId = pedestrian.entityId;
        state.pedestrianAvoidSide = pedestrian.signedLateral >= 0 ? -1 : 1;
      }
      state.pedestrianAvoidUntil = now + 1200;
    }
    if ((state.pedestrianAvoidUntil ?? 0) > now && state.pedestrianAvoidSide) {
      const side = state.pedestrianAvoidSide;
      const sideClearance = routes.clearDistance(car, car.angle + side * Math.PI / 2, 12);
      if (sideClearance > 6) {
        const shift = pedestrian ? clamp(3.2 + Math.max(0, 70 - pedestrian.distance) * .025, 3.2, 4.8) : 3.2;
        drivePoint = {
          ...drivePoint,
          x: drivePoint.x + Math.cos(car.angle) * side * shift,
          z: drivePoint.z + Math.sin(car.angle) * side * shift,
        };
      }
    }
    if (pedestrian) {
      obstacleDistance = Math.min(obstacleDistance, Math.max(0, pedestrian.distance - 7));
      if (pedestrian.distance < 45 && !state.pedestrianYielding) { counters.pedestrianYields++; state.pedestrianYielding = true; }
    } else state.pedestrianYielding = false;
    state.lastPedestrian = pedestrian ? { ...pedestrian } : null;
    state.lastCollisionRisk = collisionRisk ? { ...collisionRisk } : null;
    state.lastObstacleDistance = obstacleDistance;
    if (!ram && ["forward-braking-vision", "forward-retaliation"].includes(combatTarget?.source)) {
      // Brake down to an approach speed while preserving the infantry's
      // actual engagement distance. The extra six metres cancel the driver's
      // obstacle safety buffer, so the car aims to stop at dismountDistance.
      obstacleDistance = Math.min(obstacleDistance,
        Math.max(0, combatTarget.distance - combatTarget.dismountDistance + 6));
    }
    const allowNitro = !recovery.turnaround && !pedestrian && (state.pedestrianAvoidUntil ?? 0) <= now
      && !collisionRisk && (state.collisionYieldUntil ?? 0) <= now && !crossingHold
      && (state.parkedAvoidUntil ?? 0) <= now
      && (!ram || ram.clearDistance >= Math.min(ram.distance + 8, 90));
    const imminentVehicle = collisionRisk && collisionRisk.time <= 1.35 && collisionRisk.closestDistance <= 5.5;
    const imminentPedestrian = Boolean(pedestrian && (
      (pedestrian.predicted && pedestrian.timeToConflict <= .7 && pedestrian.closestDistance <= 4.6)
      || (pedestrian.closeSafety && pedestrian.distance <= 8)
    ));
    if (imminentPedestrian) {
      const preferred = pedestrian.signedLateral >= 0 ? -1 : 1;
      const preferredClear = routes.clearDistance(car, car.angle + preferred * .55, 18);
      const alternateClear = routes.clearDistance(car, car.angle - preferred * .55, 18);
      const side = preferredClear >= 8 ? preferred : alternateClear >= 8 ? -preferred : 0;
      if (side) {
        state.emergencyPedestrianSide = side;
        state.emergencyPedestrianUntil = now + 900;
      }
    }
    if ((state.emergencyPedestrianUntil ?? 0) > now && state.emergencyPedestrianSide) {
      const side = state.emergencyPedestrianSide;
      drivePoint = {
        x: car.x + Math.sin(car.angle) * 10 + Math.cos(car.angle) * side * 5,
        y: 0,
        z: car.z - Math.cos(car.angle) * 10 + Math.sin(car.angle) * side * 5,
      };
    }
    const driveContext = ram ? { ...path, remaining: Infinity, nextPoint: null } : path;
    const input = drivingInput(car, drivePoint, {
      ...driveContext, dt, previousSteering: state.previousSteering, obstacleDistance, allowNitro, ram: Boolean(ram),
      speedLimit: recovery.turnaround ? 7 : Infinity,
    });
    if ((imminentVehicle || imminentPedestrian) && car.speed > 6) {
      input.forward = -1;
      input.sprint = true;
      input.fireHeld = false;
      if (!state.emergencyBraking) counters.emergencyBrakes++;
      state.emergencyBraking = true;
    } else {
      state.emergencyBraking = false;
    }
    state.previousSteering = input.strafe;
    state.input = input;
    vehicles.setInput(id, input);
    if (distance(car, state.lastPosition) > 1.5) {
      state.lastPosition = { ...car };
      state.lastProgressAt = now;
    }
    const queuedBehindTraffic = traffic?.type === "following" && traffic.distance < 18 && traffic.headingGap < 1.25 && car.speed < 1.5;
    const yieldingAtCrossing = (traffic?.type === "crossing" && traffic.time < 2.4) || crossingHold;
    const yieldingHeadOn = traffic?.type === "head-on" && traffic.distance < 45;
    const yieldingCollision = Boolean(collisionRisk) || (state.collisionYieldUntil ?? 0) > now;
    const yieldingPedestrian = Boolean(pedestrian && pedestrian.distance < 20)
      || (state.emergencyPedestrianUntil ?? 0) > now;
    // Record why the real controller chose to hold. A free forward Rapier
    // cast alongside obstacleDistance=0 means a traffic hold, not a wall.
    state.lastYield = {
      queuedBehindTraffic, yieldingAtCrossing, yieldingHeadOn,
      yieldingCollision, yieldingPedestrian,
      traffic: traffic ? { ...traffic } : null,
      collisionRisk: collisionRisk ? { ...collisionRisk } : null,
      parkedLeadVehicleId: parkedLead ? leadVehicle.id : null,
      crossingHoldUntil: state.crossingYieldUntil ?? null,
      collisionHoldUntil: state.collisionYieldUntil ?? null,
      pedestrianHoldUntil: state.emergencyPedestrianUntil ?? null,
    };
    if (queuedBehindTraffic || yieldingAtCrossing || yieldingHeadOn || yieldingCollision || yieldingPedestrian) {
      if (!state.trafficWaitAt) {
        state.trafficWaitAt = now; counters.trafficYields++;
        if (yieldingAtCrossing) {
          counters.crossingYields++;
          if (traffic?.emergency) counters.emergencyYields++;
        }
        if (yieldingHeadOn) counters.headOnYields++;
      }
      // In a crowded junction the collision / pedestrian yield can remain
      // asserted forever. Then both drivers keep the handbrake on, and the
      // normal stuck recovery below is never reached. Do not accelerate
      // through an occupied crossing: give up the driver's seat after an
      // extended stationary yield so on-foot AI can resume.
      if (car.speed < .8) {
        if (!state.trafficStallPosition
          || distance(car, state.trafficStallPosition) > 2) {
          state.trafficStallPosition = { x: car.x, z: car.z };
          state.trafficStallAt = now;
        } else if (now - (state.trafficStallAt ?? now) >= 12_000) {
          stop(state, now, "traffic-deadlock");
          vehicles.setInput(id, brakeInput(car));
          return;
        }
      } else {
        state.trafficStallAt = null;
        state.trafficStallPosition = null;
      }
      const waitLimit = yieldingHeadOn ? 5000 : 9000;
      if (yieldingAtCrossing || yieldingCollision || yieldingPedestrian || now - state.trafficWaitAt < waitLimit) return;
    } else {
      if (state.trafficWaitAt) state.lastProgressAt = now;
      state.trafficWaitAt = null;
      state.trafficStallAt = null;
      state.trafficStallPosition = null;
    }
    if (now - state.lastProgressAt > 4000 && car.speed < 1.5) {
      const blocker = stationaryBlocker(car, trafficCars);
      if (blocker) {
        const other = blocker.vehicle;
        if (!other.occupied && state.destination?.drivePurpose === "world-anchor") {
          const alternate = worldDestinationFor(id, car, now, {
            exclude: state.destination, salt: `parked:${other.id}`,
          });
          if (alternate && distance(car, alternate) > 60) {
            const nextRoute = routes.plan(car, alternate);
            const firstLeg = nextRoute.points?.[0];
            // A new destination is not a physical escape. Do not reset the
            // stationary/progress clocks if the very first leg is blocked by
            // the same parked chassis or a wall. Let normal safe reverse and
            // eventually dismount take over instead of endlessly replanning.
            const openFirstLeg = firstLeg
              && distance(car, firstLeg) >= 4
              && routes.clearPath(car, firstLeg, 3);
            if (openFirstLeg) {
              state.destination = alternate;
              state.route = nextRoute;
              state.parkedAvoidVehicleId = other.id;
              state.parkedAvoidUntil = now + 5000;
              counters.parkedAvoids++;
              counters.deadlockResolutions++;
              counters.waypointAdvances++;
              return;
            }
          }
        }
        const otherAiDriver = Boolean(other.driverId && states.has(other.driverId));
        const shouldBackOut = !other.occupied || !otherAiDriver
          || String(car.id).localeCompare(String(other.id)) > 0;
        if (!shouldBackOut) {
          // Only one side of an AI-vs-AI deadlock reverses. The lower stable
          // vehicle id waits, so two cars do not mirror each other's recovery.
          state.lastProgressAt = now;
          vehicles.setInput(id, brakeInput(car));
          return;
        }
        counters.deadlockResolutions++;
        if (state.recoveries >= 3 && otherAiDriver && state.destination?.drivePurpose === "world-anchor") {
          const alternate = worldDestinationFor(id, car, now, {
            exclude: state.destination, salt: `deadlock-final:${other.id}:${now}`,
          });
          if (alternate && distance(car, alternate) > 60) {
            state.destination = alternate;
            state.route = routes.plan(car, state.destination);
            state.recoveries = 0;
            state.lastProgressAt = now;
            state.lastPosition = { ...car };
            state.trafficWaitAt = null;
            counters.waypointAdvances++;
            vehicles.setInput(id, brakeInput(car));
            return;
          }
        }
      }
      if (state.recoveries >= 3) stop(state, now, "stuck");
      else {
        state.phase = "reverse"; state.phaseAt = now; state.recoveries++; counters.recoveries++;
        state.trafficWaitAt = null;
        const left = routes.clearDistance(car, car.angle - .6, 20);
        const right = routes.clearDistance(car, car.angle + .6, 20);
        // Reverse steering swings the nose toward the more open side.
        state.recoverTurn = left > right ? .8 : -.8;
        if (blocker) {
          state.parkedAvoidVehicleId = blocker.vehicle.id;
          state.parkedAvoidSide = right >= left ? 1 : -1;
          state.parkedAvoidUntil = now + 5000;
          counters.parkedAvoids++;
        }
      }
    }
  }

  function stableChoice(id, length) {
    if (length <= 1) return 0;
    let hash = 2166136261;
    for (const ch of String(id)) {
      hash ^= ch.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) % length;
  }

  const worldTravelAnchors = (() => {
    const limit = Math.max(300, (Number(map.halfSize) || 1000) - 140);
    const points = [];
    for (let row = 0; row < 8; row += 1) {
      const z = -limit + (2 * limit * row) / 7;
      for (let column = 0; column < 8; column += 1) {
        const x = -limit + (2 * limit * column) / 7;
        const bounds = [map.building, ...(map.navigationBuildings ?? []).map(building => building?.bounds)]
          .filter(Boolean);
        const insideBuilding = bounds.some(building => (
          x >= building.minX - 35 && x <= building.maxX + 35
          && z >= building.minZ - 35 && z <= building.maxZ + 35
        ));
        if (!insideBuilding) points.push(Object.freeze({ x, y: 0, z }));
      }
    }
    return Object.freeze(points);
  })();

  function worldDestinationFor(id, p, now, { exclude = null, salt = "" } = {}) {
    const candidates = worldTravelAnchors.filter(point => distance(p, point) > 220
      && (!exclude || distance(exclude, point) > 180));
    const epoch = Math.floor(now / 120_000);
    const loads = candidates.map(anchor => states.size ? [...states.values()].filter(state => (
      state.destination?.drivePurpose === "world-anchor"
      && distance(state.destination, anchor) < 36
    )).length : 0);
    const minimumLoad = loads.length ? Math.min(...loads) : 0;
    const leastLoaded = candidates.filter((_, index) => loads[index] === minimumLoad);
    const anchor = leastLoaded[stableChoice(`${id}:${epoch}:${salt}`, leastLoaded.length)] ?? null;
    return anchor ? { ...anchor, drivePurpose: "world-anchor" } : null;
  }

  function destinationFor(id, p, now) {
    const zone = battle.zoneSteeringTarget(id, now);
    if (zone && distance(p, zone) > 80) return { ...zone, drivePurpose: "zone" };
    const commitment = brain.commitmentFor(id);
    const goal = commitment?.target;
    const targetEntity = commitment?.targetEntityId ? entities.get(commitment.targetEntityId) : null;
    const recentAttacker = recentAttackers.get(id);
    const retaliating = targetEntity?.id && recentAttacker?.attackerId === targetEntity.id && recentAttacker.until > now;
    const vehicleRelevantEnemy = targetEntity?.alive && (!targetEntity.bot || retaliating);
    if (vehicleRelevantEnemy && goal && distance(p, goal) > 80) {
      return { ...goal, drivePurpose: "combat-route", targetEntityId: targetEntity.id };
    }
    // Ordinary driving should keep the whole 2 km world alive. Buildings are
    // local interests, not a global magnet for every driver. Pick a stable
    // long-distance world anchor and only rotate choices on a slow cadence.
    return worldDestinationFor(id, p, now);
  }

  function tick(dt, now) {
    counters.ticks++;
    if (!battle.isActive()) return;
    if (tutorial?.botsPassive?.()) return;
    for (const [vehicleId, until] of vehicleCooldowns) {
      if (until <= now) vehicleCooldowns.delete(vehicleId);
    }

    const humanPositions = entities.all()
      .filter(entity => entity?.alive && !entity.bot && entity.kind === "human")
      .map(entity => transform(entity.id))
      .filter(Boolean);

    const due = [];
    for (const [id, state] of states) {
      if (!entities.get(id)?.alive || get("ragdoll").isActive(id)) {
        release(id, now, "incapacitated");
        continue;
      }
      if (now + 0.001 < Number(state.nextControlAt ?? 0)) continue;
      let interval = BOT_VEHICLE_APPROACH_INTERVAL_MS;
      if (state.phase !== "approach") {
        const car = vehicles.vehicleForDriver(id);
        const nearHuman = car && humanPositions.some(position => distance(car, position) <= BOT_VEHICLE_DETAILED_RADIUS);
        interval = nearHuman ? BOT_VEHICLE_NEAR_DRIVE_INTERVAL_MS : BOT_VEHICLE_DRIVE_INTERVAL_MS;
      }
      const previousControlAt = Number(state.lastControlAt);
      const controlDt = Number.isFinite(previousControlAt)
        ? clamp((now - previousControlAt) / 1000, 1 / 120, 0.25)
        : Math.max(1 / 120, Number(dt) || 0.05);
      state.lastControlAt = now;
      state.nextControlAt = nextControlDeadline(id, now, interval);
      due.push({ id, state, controlDt });
    }

    const drivingDue = due.some(({ state }) => state.phase !== "approach");
    if (drivingDue) samplePedestrianMotion(now);
    // Traffic is not only AI traffic. A human crawling along in front of a bot
    // must be followed like a real lead car instead of being mistaken for a wall.
    const trafficCars = drivingDue ? vehicles.snapshot() : [];
    for (const { id, state, controlDt } of due) {
      counters.controlUpdates++;
      if (state.phase === "approach") approach(id, state, now);
      else drive(id, state, controlDt, now, trafficCars, humanPositions);
    }
    const targetDrivers = driverLimit();
    if (now < nextScan || states.size >= targetDrivers) return;
    nextScan = now + 1000;
    const available = vehicles.snapshot().filter(car => !car.occupied && !reservations.has(car.id)
      && (vehicleCooldowns.get(car.id) ?? 0) <= now
      && !sameFailedParkingSpot(car, now) && car.speed < 1.5);
    lastScan = { eligible: 0, availableCars: available.length, nearCar: 0, refillNearCar: 0, withGoal: 0, assigned: 0 };
    const eligible = [];
    const nearestAvailableDistances = [];
    for (const bot of bots.all()) {
      if (!bot.alive || states.has(bot.id) || vehicles.isPassenger?.(bot.id) || (cooldowns.get(bot.id) ?? 0) > now) continue;
      const p = transform(bot.id);
      if (!p || p.y > 1 || get("parachute").stateFor(bot.id)?.airborne) continue;
      eligible.push({ bot, p });
      lastScan.eligible++;
      let nearest = Infinity;
      for (const car of available) nearest = Math.min(nearest, distance(p, car));
      if (Number.isFinite(nearest)) nearestAvailableDistances.push(nearest);
      if (nearest < BOT_VEHICLE_SEARCH_RADIUS) lastScan.nearCar++;
      if (nearest < BOT_VEHICLE_REFILL_RADIUS) lastScan.refillNearCar++;
    }

    // Global nearest-pair matching prevents an earlier bot in iteration order
    // from reserving a car that is much closer to somebody else. Prefer the
    // normal short radius first; only use the refill radius when seats remain.
    const usedBots = new Set();
    const usedCars = new Set();
    let assignedThisScan = 0;
    const matchPairs = (maximumDistance) => {
      const pairs = [];
      for (const entry of eligible) {
        if (usedBots.has(entry.bot.id)) continue;
        for (const car of available) {
          if (usedCars.has(car.id) || reservations.has(car.id)) continue;
          const d = distance(entry.p, car);
          if (d <= maximumDistance) pairs.push({ entry, car, distance: d });
        }
      }
      pairs.sort((a, b) => a.distance - b.distance);
      for (const pair of pairs) {
        if (assignedThisScan >= BOT_VEHICLE_ASSIGNMENTS_PER_SCAN || states.size >= targetDrivers) break;
        const id = pair.entry.bot.id;
        if (usedBots.has(id) || usedCars.has(pair.car.id) || reservations.has(pair.car.id)) continue;
        const goal = destinationFor(id, pair.entry.p, now);
        if (!goal) continue;
        lastScan.withGoal++;
        if (!assign(id, pair.car.id, goal, now, { maxDistance: maximumDistance })) continue;
        usedBots.add(id); usedCars.add(pair.car.id);
        assignedThisScan++; lastScan.assigned++;
      }
    };
    matchPairs(BOT_VEHICLE_SEARCH_RADIUS);
    if (states.size < targetDrivers && assignedThisScan < BOT_VEHICLE_ASSIGNMENTS_PER_SCAN) {
      matchPairs(BOT_VEHICLE_REFILL_RADIUS);
    }
    if (nearestAvailableDistances.length) {
      nearestAvailableDistances.sort((a, b) => a - b);
      lastScan.nearestCarDistance = {
        min: nearestAvailableDistances[0],
        median: nearestAvailableDistances[Math.floor(nearestAvailableDistances.length / 2)],
        max: nearestAvailableDistances.at(-1),
      };
    } else lastScan.nearestCarDistance = null;
  }

  const oldStep = match.step.bind(match);
  match.step = (dt, now = Date.now()) => {
    tick(dt, now);
    return oldStep(dt, now);
  };
  ctx.events.on("combat:damage", ({ targetId, attackerId, now }) => {
    if (!targetId || !attackerId || !entities.get(targetId)?.bot) return;
    const eventNow = Number(now) || Date.now();
    recentAttackers.set(targetId, { attackerId, until: eventNow + 7000 });
  });
  ctx.events.on("ragdoll:fleet-vehicle-hit", ({ entityId, driverId, vehicleId, speed, now }) => {
    const state = driverId ? states.get(driverId) : null;
    if (!state || state.vehicleId !== vehicleId || state.ramTargetId !== entityId) return;
    const eventNow = Number(now) || Date.now();
    counters.hits++;
    ramRecovery.markHit(state);
    state.lastRamHit = { entityId, vehicleId, speed: Number(speed) || 0, now: eventNow };
    state.ramKey = null;
    state.ramTargetId = null;
    state.ramVehicleId = null;
    state.ram = null;
    state.ramUntil = 0;
    state.ramCooldownUntil = eventNow + BOT_RAM_COOLDOWN_MS;
  });
  ctx.events.on("vehicle:impact", (payload = {}) => {
    const driverId = payload.driverId;
    if (!driverId || !states.has(driverId)) return;
    const ramState = states.get(driverId);
    if (ramState?.ramVehicleId && payload.otherBodyId === ramState.ramVehicleId) {
      const eventNow = Number(payload.now) || Date.now();
      counters.hits++;
      ramRecovery.markHit(ramState);
      ramState.lastRamHit = { vehicleId: ramState.ramVehicleId, entityId: ramState.ramTargetId ?? null,
        speed: Number(payload.speedBefore) || 0, now: eventNow };
      ramState.ramKey = null; ramState.ramTargetId = null; ramState.ramVehicleId = null;
      ramState.ram = null; ramState.ramUntil = 0; ramState.ramCooldownUntil = eventNow + BOT_RAM_COOLDOWN_MS;
    }
    const impactedVehicle = payload.vehicleId ? vehicles.stateFor(payload.vehicleId) : null;
    const otherVehicle = payload.otherBodyId ? vehicles.stateFor(payload.otherBodyId) : null;
    lastVehicleImpacts.set(driverId, {
      vehicleId: payload.vehicleId ?? null, vehicleKind: payload.vehicleKind ?? null,
      crashSeverity: Number(payload.crashSeverity) || 0, crashTier: payload.crashTier ?? null,
      speedBefore: Number(payload.speedBefore) || 0, speedAfter: Number(payload.speedAfter) || 0,
      deltaSpeed: Number(payload.deltaSpeed) || 0, x: Number(payload.x) || 0, z: Number(payload.z) || 0,
      otherBodyId: payload.otherBodyId ?? null, otherKind: payload.otherKind ?? null,
      otherEntityId: payload.otherEntityId ?? null,
      angle: Number(impactedVehicle?.angle) || 0, otherAngle: Number(otherVehicle?.angle) || null,
      impactSource: payload.impactSource ?? null, now: Number(payload.now) || Date.now(),
      driverInput: states.get(driverId)?.input ? { ...states.get(driverId).input } : null,
      pedestrian: states.get(driverId)?.lastPedestrian ? { ...states.get(driverId).lastPedestrian } : null,
      collisionRisk: states.get(driverId)?.lastCollisionRisk ? { ...states.get(driverId).lastCollisionRisk } : null,
      obstacleDistance: states.get(driverId)?.lastObstacleDistance ?? null,
      emergencyBraking: Boolean(states.get(driverId)?.emergencyBraking),
      destination: states.get(driverId)?.destination ? { ...states.get(driverId).destination } : null,
      routeIndex: states.get(driverId)?.route?.index ?? null,
      routePoint: states.get(driverId)?.route?.points?.[states.get(driverId)?.route?.index ?? -1]
        ? { ...states.get(driverId).route.points[states.get(driverId).route.index] } : null,
      routePoints: states.get(driverId)?.route?.points
        ? states.get(driverId).route.points.map(point => ({ ...point })) : null,
    });
  });
  ctx.events.on("vehicle:exited", ({ entityId, vehicleId, reason, now }) => {
    if (reason !== "crash-eject" || !entities.get(entityId)?.bot || !vehicleId) return;
    const eventNow = Number(now) || Date.now();
    vehicleCooldowns.set(vehicleId, eventNow + BOT_VEHICLE_CRASH_COOLDOWN_MS);
    counters.crashEjections++;
    const impact = lastVehicleImpacts.get(entityId);
    recentCrashes.push({ entityId, vehicleId, ...(impact ?? {}), ejectedAt: eventNow });
    if (recentCrashes.length > 24) recentCrashes.splice(0, recentCrashes.length - 24);
    lastVehicleImpacts.delete(entityId);
    // Crash-eject is already authoritative vehicle state. Release vehicle AI
    // immediately with the real reason instead of waiting one more tick for
    // ragdoll detection and misclassifying it as generic incapacitation.
    if (states.has(entityId)) release(entityId, eventNow, "crash");
  });
  ctx.events.on("entity:died", ({ entityId, now }) => release(entityId, Number(now) || Date.now(), "death"));
  ctx.events.on("entity:removed", ({ entityId, now }) => {
    release(entityId, Number(now) || Date.now(), "removed");
    cooldowns.delete(entityId);
    recentAttackers.delete(entityId);
    lastVehicleImpacts.delete(entityId);
  });
  ctx.services.provide("bot-vehicles", { assign, tick,
    stateFor(id) { const state = states.get(id); return state ? structuredClone(state) : null; },
    vehicleCooldownFor(vehicleId) { return vehicleCooldowns.get(vehicleId) ?? 0; },
    summary() {
      const phaseCounts = Object.create(null);
      const approachDistances = [];
      let driving = 0;
      for (const [id, state] of states) {
        phaseCounts[state.phase] = (phaseCounts[state.phase] ?? 0) + 1;
        if (vehicles.isDriving(id)) driving++;
        if (state.phase === "approach") {
          const p = transform(id), car = vehicles.stateFor(state.vehicleId);
          if (p && car) approachDistances.push(distance(p, car));
        }
      }
      approachDistances.sort((a, b) => a - b);
      const approachStats = approachDistances.length ? {
        min: approachDistances[0], median: approachDistances[Math.floor(approachDistances.length / 2)],
        max: approachDistances.at(-1), within10: approachDistances.filter(value => value <= 10).length,
        within25: approachDistances.filter(value => value <= 25).length,
      } : null;
      const liveBots = bots.all().filter(bot => bot.alive).length;
      return { ...counters, releaseReasons: { ...counters.releaseReasons }, unavailableReasons: { ...counters.unavailableReasons }, lastScan: { ...lastScan },
        active: states.size, driving, liveBots, drivingShare: liveBots ? driving / liveBots : 0,
        approaching: phaseCounts.approach ?? 0, approachStats, phaseCounts: { ...phaseCounts },
        uniqueAssigned: everAssigned.size, uniqueDrivers: everDrivers.size,
        targetDrivers: driverLimit(), fleetSize: vehicles.snapshot().length,
        recentFailures: structuredClone(recentFailures),
        recentCrashes: structuredClone(recentCrashes),
        vehicleCooldowns: [...vehicleCooldowns].map(([vehicleId, until]) => ({ vehicleId, until })),
        stationaryVehicleFailures: [...stationaryVehicleFailures].map(([vehicleId, failed]) => ({
          vehicleId, ...failed,
        })),
        states: [...states].map(([id, state]) => ({ id, ...structuredClone(state) })) };
    } });
}
