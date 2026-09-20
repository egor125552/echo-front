export const FLEET_VEHICLE_COUNT = 76;
export const FLEET_SUPERCAR_COUNT = 25;
export const FLEET_OFFROAD_COUNT = 51;

const ENTER_DISTANCE = 3.4;
const BOT_ENTER_DISTANCE = 6.5;
const PHYSICS_STEP = 1 / 60;

const OFFROAD = Object.freeze({
  kind: "offroad",
  accessibleName: "внедорожник",
  audioProfile: "truck",
  spawnY: 1.25,
  chassis: { hx: 1.72, hy: 0.38, hz: 0.92, mass: 1380, ballastMass: 420 },
  friction: 0.72,
  restitution: 0.08,
  linearDamping: 0.025,
  angularDamping: 0.14,
  wheels: {
    frontX: -1.43, rearX: 1.38, y: -0.27, z: 1.02,
    rest: 0.34, radius: 0.43, stiffness: 34, compression: 5.2, relaxation: 6.4,
    travel: 0.34, maxForce: 32_000, frictionSlip: 2.25, sideStiffness: 4.6,
  },
  engineForce: 1850,
  reverseForce: 1150,
  nitroForce: 9200,
  nitroBurst: 2.5,
  nitroCooldown: 10,
  serviceBrake: 18,
  handBrake: 55,
  parkBrake: 10,
  maxSteer: 0.46,
  highSpeedSteer: 0.2,
});

const SUPERCAR = Object.freeze({
  kind: "supercar",
  accessibleName: "суперкар",
  audioProfile: "sport",
  spawnY: 1.05,
  chassis: { hx: 1.9, hy: 0.28, hz: 0.86, mass: 1050, ballastMass: 300 },
  friction: 0.82,
  restitution: 0.04,
  linearDamping: 0.012,
  angularDamping: 0.17,
  wheels: {
    frontX: -1.55, rearX: 1.48, y: -0.22, z: 0.92,
    rest: 0.22, radius: 0.36, stiffness: 44, compression: 5.8, relaxation: 6.8,
    travel: 0.24, maxForce: 30_000, frictionSlip: 3.1, sideStiffness: 5.4,
  },
  engineForce: 5600,
  reverseForce: 2200,
  nitroForce: 20_000,
  nitroBurst: 3.2,
  nitroCooldown: 8,
  serviceBrake: 36,
  handBrake: 70,
  parkBrake: 14,
  maxSteer: 0.38,
  highSpeedSteer: 0.13,
});

const FLEET_GRID_LIMIT = 840;
const FLEET_GRID_SIZE = 9;

function buildFleetLayout() {
  const layout = [];
  let offroadSerial = 2;
  let supercarSerial = 1;
  let accepted = 0;
  for (let row = 0; row < FLEET_GRID_SIZE; row += 1) {
    const z = -FLEET_GRID_LIMIT + (2 * FLEET_GRID_LIMIT * row) / (FLEET_GRID_SIZE - 1);
    for (let column = 0; column < FLEET_GRID_SIZE; column += 1) {
      const x = -FLEET_GRID_LIMIT + (2 * FLEET_GRID_LIMIT * column) / (FLEET_GRID_SIZE - 1);
      const centralGap = (row === 4 && [3, 4, 5].includes(column))
        || (row === 5 && [3, 4, 5].includes(column));
      if (centralGap) continue;
      const supercar = accepted % 3 === 0;
      layout.push(Object.freeze({
        id: supercar ? `br-supercar-${supercarSerial++}` : `br-jeep-${offroadSerial++}`,
        type: supercar ? "supercar" : "offroad",
        x, z,
      }));
      accepted += 1;
    }
  }
  return Object.freeze(layout);
}

export const FLEET_LAYOUT = buildFleetLayout();

export const manifest = {
  id: "battle-royale-vehicle-fleet",
  version: "1.1.0",
  requires: [
    "battle-royale-vehicle", "battle-royale-world-expansion",
    "rapier-physics", "movement", "entities", "map-test-arena",
  ],
  optional: ["armor"],
  capabilities: [
    "services.consume", "components.read", "events.on", "events.emit",
  ],
};

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}

function distance3(a, b) {
  return Math.hypot(
    (Number(a?.x) || 0) - (Number(b?.x) || 0),
    (Number(a?.y) || 0) - (Number(b?.y) || 0),
    (Number(a?.z) || 0) - (Number(b?.z) || 0),
  );
}

function rotateVector(q, v) {
  const qx = Number(q?.x) || 0;
  const qy = Number(q?.y) || 0;
  const qz = Number(q?.z) || 0;
  const qw = Number(q?.w) || 1;
  const vx = Number(v?.x) || 0;
  const vy = Number(v?.y) || 0;
  const vz = Number(v?.z) || 0;
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  return {
    x: vx + qw * tx + (qy * tz - qz * ty),
    y: vy + qw * ty + (qz * tx - qx * tz),
    z: vz + qw * tz + (qx * ty - qy * tx),
  };
}

function headingFromRotation(rotation) {
  const forward = rotateVector(rotation, { x: -1, y: 0, z: 0 });
  return Math.atan2(forward.x, -forward.z);
}

function forwardVector(rotation) {
  return rotateVector(rotation, { x: -1, y: 0, z: 0 });
}

function rightVector(rotation) {
  return rotateVector(rotation, { x: 0, y: 0, z: 1 });
}

function tuningFor(type) {
  return type === "supercar" ? SUPERCAR : OFFROAD;
}

export async function setup(ctx) {
  const vehicles = ctx.services.get("vehicles");
  const armor = ctx.services.has("armor") ? ctx.services.get("armor") : null;
  const physics = ctx.services.get("physics");
  const movement = ctx.services.get("movement");
  const entities = ctx.services.get("entities");
  const map = ctx.services.get("map");
  const RAPIER = physics.RAPIER;
  const primaryId = vehicles.vehicleId;

  const originalInteract = vehicles.interact.bind(vehicles);
  const originalEnter = vehicles.enter.bind(vehicles);
  const originalExit = vehicles.exit.bind(vehicles);
  const originalSetInput = vehicles.setInput.bind(vehicles);
  const originalTickPhysics = vehicles.tickPhysics.bind(vehicles);
  const originalIsDriving = vehicles.isDriving.bind(vehicles);
  const originalDriverId = vehicles.driverId.bind(vehicles);
  const originalStateFor = vehicles.stateFor.bind(vehicles);
  const originalSnapshot = vehicles.snapshot.bind(vehicles);
  const originalSummary = vehicles.summary.bind(vehicles);

  const extras = new Map();
  const extraDriverVehicle = new Map();
  const extraPassengerVehicle = new Map();
  const PASSENGER_CAPACITY = 3;
  const PASSENGER_SEATS = [
    { x: -0.7, y: 0.65, z: -0.72 },
    { x: -0.7, y: 0.65, z: 0.72 },
    { x: 0.55, y: 0.65, z: 0.72 },
  ];
  const spawnRotation = {
    x: 0,
    y: -Math.sin(Math.PI / 4),
    z: 0,
    w: Math.cos(Math.PI / 4),
  };

  function createExtra(spec) {
    const tuning = tuningFor(spec.type);
    const bodyEntry = physics.createDynamicCuboid(spec.id, {
      x: spec.x,
      y: tuning.spawnY,
      z: spec.z,
      hx: tuning.chassis.hx,
      hy: tuning.chassis.hy,
      hz: tuning.chassis.hz,
      rotation: spawnRotation,
      mass: tuning.chassis.mass,
      friction: tuning.friction,
      restitution: tuning.restitution,
      linearDamping: tuning.linearDamping,
      angularDamping: tuning.angularDamping,
      canSleep: true,
      ccd: true,
      metadata: {
        kind: "vehicle-chassis",
        vehicleId: spec.id,
        vehicleKind: tuning.kind,
        accessibleName: tuning.accessibleName,
      },
    });

    physics.addDynamicCuboidCollider(spec.id, {
      x: 0.12,
      y: tuning.kind === "supercar" ? -0.2 : -0.28,
      z: 0,
      hx: tuning.kind === "supercar" ? 1.35 : 1.2,
      hy: 0.08,
      hz: tuning.kind === "supercar" ? 0.62 : 0.66,
      mass: tuning.chassis.ballastMass,
      friction: tuning.friction,
      restitution: 0.03,
      sensor: true,
      metadata: {
        kind: "vehicle-ballast",
        vehicleId: spec.id,
        vehicleKind: tuning.kind,
      },
    });

    const controller = physics.world.createVehicleController(bodyEntry.body);
    const suspensionDirection = { x: 0, y: -1, z: 0 };
    const axle = { x: 0, y: 0, z: -1 };
    const wheelPositions = [
      { x: tuning.wheels.frontX, y: tuning.wheels.y, z: -tuning.wheels.z, axle: "front-left" },
      { x: tuning.wheels.frontX, y: tuning.wheels.y, z: tuning.wheels.z, axle: "front-right" },
      { x: tuning.wheels.rearX, y: tuning.wheels.y, z: -tuning.wheels.z, axle: "rear-left" },
      { x: tuning.wheels.rearX, y: tuning.wheels.y, z: tuning.wheels.z, axle: "rear-right" },
    ];

    for (let i = 0; i < wheelPositions.length; i += 1) {
      controller.addWheel(
        wheelPositions[i], suspensionDirection, axle,
        tuning.wheels.rest, tuning.wheels.radius,
      );
      controller.setWheelSuspensionStiffness(i, tuning.wheels.stiffness);
      controller.setWheelSuspensionCompression(i, tuning.wheels.compression);
      controller.setWheelSuspensionRelaxation(i, tuning.wheels.relaxation);
      controller.setWheelMaxSuspensionTravel(i, tuning.wheels.travel);
      controller.setWheelMaxSuspensionForce(i, tuning.wheels.maxForce);
      controller.setWheelFrictionSlip(i, tuning.wheels.frictionSlip);
      controller.setWheelSideFrictionStiffness(i, tuning.wheels.sideStiffness);
    }

    const entry = {
      id: spec.id,
      type: spec.type,
      tuning,
      controller,
      body: bodyEntry.body,
      wheelPositions,
      driverId: null,
      passengerIds: [],
      input: { throttle: 0, steering: 0, handbrake: false, nitro: false },
      handbrakeArmed: true,
      nitroActive: false,
      nitroBurstRemaining: tuning.nitroBurst,
      nitroCooldownRemaining: 0,
      nitroRequiresRelease: false,
      nitroReadyEmitted: true,
      previousSpeed: 0,
      peakImpactDelta: 0,
      physicsFrames: 0,
    };
    extras.set(entry.id, entry);
    return entry;
  }

  for (const spec of FLEET_LAYOUT) createExtra(spec);

  function bodyState(entry) {
    return physics.dynamicBodyState(entry.id);
  }

  function speedMetersPerSecond(entry, state = bodyState(entry)) {
    if (!state) return 0;
    return Math.hypot(state.linvel.x, state.linvel.y, state.linvel.z);
  }

  function wheelState(entry, i) {
    return {
      index: i,
      name: entry.wheelPositions[i]?.axle ?? `wheel-${i}`,
      contact: Boolean(entry.controller.wheelIsInContact(i)),
      suspensionLength: Number(entry.controller.wheelSuspensionLength(i)) || 0,
      suspensionForce: Number(entry.controller.wheelSuspensionForce(i)) || 0,
      forwardImpulse: Number(entry.controller.wheelForwardImpulse(i)) || 0,
      sideImpulse: Number(entry.controller.wheelSideImpulse(i)) || 0,
      steering: Number(entry.controller.wheelSteering(i)) || 0,
      rotation: Number(entry.controller.wheelRotation(i)) || 0,
    };
  }

  function nitroState(entry) {
    return {
      active: entry.nitroActive,
      requested: Boolean(entry.input.nitro),
      ready: !entry.nitroActive
        && entry.nitroCooldownRemaining <= 0
        && !entry.nitroRequiresRelease,
      burstSecondsRemaining: Math.max(0, entry.nitroBurstRemaining),
      burstSeconds: entry.tuning.nitroBurst,
      cooldownSecondsRemaining: Math.max(0, entry.nitroCooldownRemaining),
      cooldownSeconds: entry.tuning.nitroCooldown,
      engineForce: entry.nitroActive ? entry.tuning.nitroForce : entry.tuning.engineForce,
    };
  }

  function extraState(entry) {
    const body = bodyState(entry);
    if (!body) return null;
    const speed = speedMetersPerSecond(entry, body);
    const forward = forwardVector(body.rotation);
    const forwardSpeed = body.linvel.x * forward.x
      + body.linvel.y * forward.y
      + body.linvel.z * forward.z;
    const wheels = entry.wheelPositions.map((_, i) => wheelState(entry, i));
    return {
      id: entry.id,
      kind: entry.tuning.kind,
      accessibleName: entry.tuning.accessibleName,
      audioProfile: entry.tuning.audioProfile,
      x: body.x,
      y: body.y,
      z: body.z,
      angle: headingFromRotation(body.rotation),
      rotation: body.rotation,
      linvel: body.linvel,
      angvel: body.angvel,
      speed,
      speedKph: speed * 3.6,
      forwardSpeed,
      driverId: entry.driverId,
      passengerIds: [...entry.passengerIds],
      passengerCount: entry.passengerIds.length,
      passengerCapacity: PASSENGER_CAPACITY,
      occupied: Boolean(entry.driverId),
      groundedWheels: wheels.filter((wheel) => wheel.contact).length,
      wheels,
      input: { ...entry.input },
      handbrakeArmed: entry.handbrakeArmed,
      nitro: nitroState(entry),
      mass: body.mass,
      peakImpactDelta: entry.peakImpactDelta,
      physicsFrames: entry.physicsFrames,
    };
  }

  function enrichPrimary(state) {
    return state ? {
      ...state,
      kind: "offroad",
      accessibleName: "внедорожник",
      audioProfile: "truck",
    } : null;
  }

  function stateFor(vehicleId = primaryId) {
    if (vehicleId === primaryId) return enrichPrimary(originalStateFor(primaryId));
    const entry = extras.get(vehicleId);
    return entry ? extraState(entry) : null;
  }

  function compactNetworkNitro(raw = {}) {
    return {
      active: Boolean(raw.active),
      ready: Boolean(raw.ready),
      cooldownSecondsRemaining: Math.max(0, Number(raw.cooldownSecondsRemaining) || 0),
      cooldownSeconds: Math.max(0, Number(raw.cooldownSeconds) || 0),
    };
  }

  function compactNetworkInput(raw = {}) {
    return {
      throttle: Number(raw.throttle) || 0,
      handbrake: Boolean(raw.handbrake),
    };
  }

  function compactPrimaryNetworkState(state) {
    if (!state) return null;
    return {
      id: state.id,
      kind: state.kind ?? "offroad",
      accessibleName: state.accessibleName ?? "внедорожник",
      audioProfile: state.audioProfile ?? "truck",
      x: Number(state.x) || 0,
      y: Number(state.y) || 0,
      z: Number(state.z) || 0,
      angle: Number(state.angle) || 0,
      speedKph: Math.max(0, Number(state.speedKph) || (Number(state.speed) || 0) * 3.6),
      forwardSpeed: Number(state.forwardSpeed) || 0,
      driverId: state.driverId ?? null,
      occupied: Boolean(state.occupied ?? state.driverId),
      groundedWheels: Math.max(0, Number(state.groundedWheels) || 0),
      input: compactNetworkInput(state.input),
      nitro: compactNetworkNitro(state.nitro),
    };
  }

  function networkExtraState(entry, body = bodyState(entry)) {
    if (!body) return null;
    const speed = Math.hypot(
      Number(body.linvel?.x) || 0,
      Number(body.linvel?.y) || 0,
      Number(body.linvel?.z) || 0,
    );
    const forward = forwardVector(body.rotation);
    const forwardSpeed = (Number(body.linvel?.x) || 0) * forward.x
      + (Number(body.linvel?.y) || 0) * forward.y
      + (Number(body.linvel?.z) || 0) * forward.z;
    let groundedWheels = 0;
    for (let i = 0; i < entry.wheelPositions.length; i += 1) {
      if (entry.controller.wheelIsInContact(i)) groundedWheels += 1;
    }
    return {
      id: entry.id,
      kind: entry.tuning.kind,
      accessibleName: entry.tuning.accessibleName,
      audioProfile: entry.tuning.audioProfile,
      x: Number(body.x) || 0,
      y: Number(body.y) || 0,
      z: Number(body.z) || 0,
      angle: headingFromRotation(body.rotation),
      speedKph: speed * 3.6,
      forwardSpeed,
      driverId: entry.driverId,
      occupied: Boolean(entry.driverId),
      groundedWheels,
      input: compactNetworkInput(entry.input),
      nitro: compactNetworkNitro(nitroState(entry)),
    };
  }

  function networkSnapshot(options = {}) {
    const center = options.center ?? null;
    const radius = Math.max(0, Number(options.radius) || Infinity);
    const observedEntityId = options.observedEntityId ?? null;
    const withinInterest = (vehicle) => {
      if (!vehicle) return false;
      if (vehicle.driverId === observedEntityId) return true;
      if (center && Number.isFinite(radius)) return distance3(center, vehicle) <= radius;
      return true;
    };

    const result = [];
    const primary = compactPrimaryNetworkState(enrichPrimary(originalStateFor(primaryId)));
    if (withinInterest(primary)) result.push(primary);

    for (const entry of extras.values()) {
      const body = bodyState(entry);
      if (!body) continue;
      const alwaysInclude = entry.driverId === observedEntityId
        || entry.passengerIds.includes(observedEntityId);
      if (!alwaysInclude && center && Number.isFinite(radius) && distance3(center, body) > radius) {
        continue;
      }
      const state = networkExtraState(entry, body);
      if (state) result.push(state);
    }
    return result;
  }

  function snapshot() {
    const primary = originalSnapshot().map(enrichPrimary).filter(Boolean);
    const additional = [...extras.values()].map(extraState).filter(Boolean);
    return [...primary, ...additional];
  }

  function extraDriverEntry(playerId) {
    const vehicleId = extraDriverVehicle.get(playerId);
    return vehicleId ? extras.get(vehicleId) ?? null : null;
  }

  function isDriving(playerId) {
    return originalIsDriving(playerId) || extraDriverVehicle.has(playerId);
  }

  function vehicleForDriver(playerId) {
    if (originalIsDriving(playerId)) return enrichPrimary(originalStateFor(primaryId));
    const entry = extraDriverEntry(playerId);
    return entry ? extraState(entry) : null;
  }

  function nearestAvailableVehicle(playerId, requestedVehicleId = null) {
    const transform = ctx.components.get(playerId, "Transform");
    if (!transform) return null;
    const candidates = snapshot()
      .filter((vehicle) => !vehicle.occupied)
      .filter((vehicle) => !requestedVehicleId || vehicle.id === requestedVehicleId)
      .map((vehicle) => ({ vehicle, distance: distance3(transform, vehicle) }))
      .filter((entry) => entry.distance <= ENTER_DISTANCE)
      .sort((a, b) => a.distance - b.distance);
    return candidates[0]?.vehicle ?? null;
  }

  function syncExtraDriver(entry) {
    if (!entry.driverId) return;
    const entity = entities.get(entry.driverId);
    const body = bodyState(entry);
    if (!entity?.alive || !body) return;
    const transform = ctx.components.get(entry.driverId, "Transform");
    if (!transform) return;
    const seat = rotateVector(body.rotation, {
      x: entry.tuning.kind === "supercar" ? 0.12 : 0.2,
      y: entry.tuning.kind === "supercar" ? 0.5 : 0.72,
      z: 0,
    });
    const position = { x: body.x + seat.x, y: body.y + seat.y, z: body.z + seat.z };
    physics.teleport(entry.driverId, position);
    transform.x = position.x;
    transform.y = position.y;
    transform.z = position.z;
    transform.angle = headingFromRotation(body.rotation);
    transform.verticalVelocity = 0;
    transform.grounded = false;
  }


  function syncExtraPassengers(entry) {
    const body = bodyState(entry);
    if (!body) return;
    for (let i = entry.passengerIds.length - 1; i >= 0; i--) {
      const passengerId = entry.passengerIds[i];
      const entity = entities.get(passengerId);
      const transform = ctx.components.get(passengerId, "Transform");
      if (!entity?.alive || !transform) {
        entry.passengerIds.splice(i, 1);
        extraPassengerVehicle.delete(passengerId);
        continue;
      }
      const seatSpec = PASSENGER_SEATS[i] ?? PASSENGER_SEATS[PASSENGER_SEATS.length - 1];
      const seat = rotateVector(body.rotation, seatSpec);
      const position = { x: body.x + seat.x, y: body.y + seat.y, z: body.z + seat.z };
      physics.teleport(passengerId, position);
      transform.x = position.x;
      transform.y = position.y;
      transform.z = position.z;
      transform.angle = headingFromRotation(body.rotation);
      transform.verticalVelocity = 0;
      transform.grounded = false;
    }
  }

  function isPassenger(playerId) {
    return extraPassengerVehicle.has(playerId);
  }

  function passengerVehicle(playerId) {
    const vehicleId = extraPassengerVehicle.get(playerId);
    return vehicleId ? extras.get(vehicleId) ?? null : null;
  }

  function vehicleForPassenger(playerId) {
    const entry = passengerVehicle(playerId);
    return entry ? extraState(entry) : null;
  }

  function enterPassenger(playerId, vehicleId, now = Date.now()) {
    if (!playerId || isDriving(playerId) || isPassenger(playerId)) return false;
    const entry = extras.get(vehicleId);
    const entity = entities.get(playerId);
    const transform = ctx.components.get(playerId, "Transform");
    const body = entry ? bodyState(entry) : null;
    if (!entry?.driverId || entry.passengerIds.length >= PASSENGER_CAPACITY || !entity?.alive || !transform || transform.downed || transform.ragdollActive || !body) return false;
    if (distance3(transform, body) > ENTER_DISTANCE + 1.2) return false;
    armor?.cancelPlating?.(playerId, "vehicle-enter");
    entry.passengerIds.push(playerId);
    extraPassengerVehicle.set(playerId, entry.id);
    movement.setInput(playerId, {});
    physics.setCharacterEnabled(playerId, false);
    syncExtraPassengers(entry);
    ctx.events.emit("vehicle:passenger-entered", { entityId: playerId, vehicleId: entry.id, now });
    return true;
  }

  function exitPassenger(playerId, now = Date.now(), reason = "interact") {
    const entry = passengerVehicle(playerId);
    if (!entry) return false;
    const index = entry.passengerIds.indexOf(playerId);
    if (index >= 0) entry.passengerIds.splice(index, 1);
    extraPassengerVehicle.delete(playerId);
    physics.setCharacterEnabled(playerId, true);
    const target = exitPosition(entry);
    if (target) {
      const spread = index >= 0 ? (index - 1) * 1.1 : 0;
      movement.teleport(playerId, { ...target, z: target.z + spread });
    }
    ctx.events.emit("vehicle:passenger-exited", { entityId: playerId, vehicleId: entry.id, reason, now });
    return true;
  }

  function stopExtraNitro(entry, now = Date.now(), sourceDriverId = entry.driverId) {
    if (!entry.nitroActive) return false;
    entry.nitroActive = false;
    entry.nitroBurstRemaining = 0;
    entry.nitroCooldownRemaining = entry.tuning.nitroCooldown;
    entry.nitroRequiresRelease = true;
    entry.nitroReadyEmitted = false;
    ctx.events.emit("vehicle:nitro-stop", {
      vehicleId: entry.id,
      driverId: sourceDriverId,
      cooldownSeconds: entry.tuning.nitroCooldown,
      now,
    });
    return true;
  }

  function updateExtraNitro(entry, dt, now) {
    const safeDt = clamp(dt, 0, 0.1);
    if (entry.nitroCooldownRemaining > 0) {
      entry.nitroCooldownRemaining = Math.max(0, entry.nitroCooldownRemaining - safeDt);
      if (entry.nitroCooldownRemaining <= 0) {
        entry.nitroBurstRemaining = entry.tuning.nitroBurst;
        if (!entry.nitroReadyEmitted && entry.driverId) {
          ctx.events.emit("vehicle:nitro-ready", {
            vehicleId: entry.id,
            driverId: entry.driverId,
            now,
          });
        }
        entry.nitroReadyEmitted = true;
      }
    }

    if (!entry.input.nitro) entry.nitroRequiresRelease = false;
    const requested = Boolean(
      entry.driverId
      && entry.input.nitro
      && entry.input.throttle > 0.08
      && !entry.input.handbrake
    );
    if (entry.nitroActive) {
      if (!requested) {
        stopExtraNitro(entry, now);
        return;
      }
      entry.nitroBurstRemaining = Math.max(0, entry.nitroBurstRemaining - safeDt);
      if (entry.nitroBurstRemaining <= 0) stopExtraNitro(entry, now);
      return;
    }

    if (entry.nitroCooldownRemaining <= 0 && requested && !entry.nitroRequiresRelease) {
      entry.nitroActive = true;
      entry.nitroBurstRemaining = entry.tuning.nitroBurst;
      ctx.events.emit("vehicle:nitro-start", {
        vehicleId: entry.id,
        driverId: entry.driverId,
        burstSeconds: entry.tuning.nitroBurst,
        engineForce: entry.tuning.nitroForce,
        now,
      });
    }
  }

  function enterExtra(entry, playerId, now = Date.now(), maxDistance = ENTER_DISTANCE) {
    if (entry.driverId || !playerId || isDriving(playerId) || isPassenger(playerId)) return false;
    const entity = entities.get(playerId);
    const transform = ctx.components.get(playerId, "Transform");
    const body = bodyState(entry);
    if (!entity?.alive || !transform || transform.downed || !body) return false;
    if (distance3(transform, body) > maxDistance) return false;

    armor?.cancelPlating?.(playerId, "vehicle-enter");
    entry.driverId = playerId;
    entry.body?.wakeUp?.();
    extraDriverVehicle.set(playerId, entry.id);
    entry.input = { throttle: 0, steering: 0, handbrake: false, nitro: false };
    entry.handbrakeArmed = false;
    entry.nitroRequiresRelease = false;
    movement.setInput(playerId, {});
    physics.setCharacterEnabled(playerId, false);
    syncExtraDriver(entry);
    syncExtraPassengers(entry);
    ctx.events.emit("vehicle:entered", {
      entityId: playerId,
      vehicleId: entry.id,
      vehicleKind: entry.tuning.kind,
      vehicleName: entry.tuning.accessibleName,
      now,
      x: body.x,
      y: body.y,
      z: body.z,
    });
    return true;
  }

  function exitPosition(entry) {
    const body = bodyState(entry);
    if (!body) return null;
    const right = rightVector(body.rotation);
    const x = body.x + right.x * 2.35;
    const z = body.z + right.z * 2.35;
    const rayOriginY = body.y + 3;
    const support = physics.raycastSupportWorld(
      { x, y: rayOriginY, z },
      { x: 0, y: -1, z: 0 },
      8,
    );
    const y = support ? rayOriginY - support.distance : Math.max(0, body.y - 0.7);
    return { x, y, z, angle: headingFromRotation(body.rotation) };
  }

  function exitExtra(entry, playerId, now = Date.now(), reason = "interact") {
    if (!entry.driverId || entry.driverId !== playerId) return false;
    const target = exitPosition(entry);
    for (const passengerId of [...entry.passengerIds].reverse()) {
      exitPassenger(passengerId, now, reason);
    }
    stopExtraNitro(entry, now, playerId);
    entry.driverId = null;
    extraDriverVehicle.delete(playerId);
    entry.input = { throttle: 0, steering: 0, handbrake: true, nitro: false };
    entry.handbrakeArmed = true;
    physics.setCharacterEnabled(playerId, true);
    if (target) movement.teleport(playerId, target);
    ctx.events.emit("vehicle:exited", {
      entityId: playerId,
      vehicleId: entry.id,
      vehicleKind: entry.tuning.kind,
      vehicleName: entry.tuning.accessibleName,
      reason,
      now,
      x: target?.x ?? null,
      y: target?.y ?? null,
      z: target?.z ?? null,
    });
    return true;
  }

  function enter(playerId, now = Date.now(), vehicleId = null) {
    if (isDriving(playerId) || isPassenger(playerId) || ctx.components.get(playerId, "Transform")?.ragdollActive) return false;
    const target = nearestAvailableVehicle(playerId, vehicleId);
    if (!target) return false;
    if (target.id === primaryId) {
      const entered = originalEnter(playerId, now);
      if (entered) armor?.cancelPlating?.(playerId, "vehicle-enter");
      return entered;
    }
    const entry = extras.get(target.id);
    return entry ? enterExtra(entry, playerId, now) : false;
  }

  function enterBot(playerId, now = Date.now(), vehicleId = null) {
    if (!entities.get(playerId)?.bot || isDriving(playerId) || isPassenger(playerId) || ctx.components.get(playerId, "Transform")?.ragdollActive || !vehicleId) return false;
    if (vehicleId === primaryId) return originalEnter(playerId, now);
    const entry = extras.get(vehicleId);
    return entry ? enterExtra(entry, playerId, now, BOT_ENTER_DISTANCE) : false;
  }

  function exit(playerId, now = Date.now(), reason = "interact") {
    if (isPassenger(playerId)) return exitPassenger(playerId, now, reason);
    if (originalIsDriving(playerId)) return originalExit(playerId, now, reason);
    const entry = extraDriverEntry(playerId);
    return entry ? exitExtra(entry, playerId, now, reason) : false;
  }

  function interact(playerId, now = Date.now()) {
    if (isPassenger(playerId)) return exitPassenger(playerId, now, "interact");
    if (isDriving(playerId)) return exit(playerId, now, "interact");
    return enter(playerId, now);
  }

  function setInput(playerId, raw = {}) {
    if (originalIsDriving(playerId)) return originalSetInput(playerId, raw);
    const entry = extraDriverEntry(playerId);
    if (!entry) return false;
    const requestedHandbrake = Boolean(raw.sprint);
    if (!entry.handbrakeArmed && !requestedHandbrake) entry.handbrakeArmed = true;
    entry.input = {
      throttle: clamp(raw.forward, -1, 1),
      steering: clamp(raw.strafe, -1, 1),
      handbrake: entry.handbrakeArmed && requestedHandbrake,
      nitro: Boolean(raw.fireHeld),
    };
    // Rapier puts a stationary chassis to sleep. Wheel engine-force changes
    // alone do not necessarily wake the rigid body, so a bot may command
    // reverse twice and remain at the exact same coordinates. Wake only on
    // real drive input, not on idle/braking (parked cars should stay asleep).
    if (Math.abs(entry.input.throttle) > .08 && !entry.input.handbrake
      && entry.body?.isSleeping?.()) entry.body.wakeUp();
    return true;
  }

  function steeringAngle(entry, speed) {
    const t = clamp((Math.abs(speed) - 7) / 18, 0, 1);
    return entry.tuning.maxSteer
      + (entry.tuning.highSpeedSteer - entry.tuning.maxSteer) * t;
  }

  function applyExtraWheelControls(entry) {
    const body = bodyState(entry);
    if (!body) return;
    const speed = speedMetersPerSecond(entry, body);
    const forward = forwardVector(body.rotation);
    const longitudinal = body.linvel.x * forward.x
      + body.linvel.y * forward.y
      + body.linvel.z * forward.z;
    const steer = -entry.input.steering * steeringAngle(entry, speed);

    entry.controller.setWheelSteering(0, steer);
    entry.controller.setWheelSteering(1, steer);
    entry.controller.setWheelSteering(2, 0);
    entry.controller.setWheelSteering(3, 0);

    let engineForce = 0;
    let brake = 0;
    if (!entry.driverId) {
      brake = entry.tuning.parkBrake;
    } else if (entry.input.handbrake) {
      brake = entry.tuning.handBrake;
    } else if (entry.input.throttle < -0.08 && longitudinal > 1.25) {
      brake = entry.tuning.serviceBrake * Math.abs(entry.input.throttle);
    } else if (entry.input.throttle > 0.08 && longitudinal < -1.25) {
      brake = entry.tuning.serviceBrake * entry.input.throttle;
    } else if (entry.input.throttle > 0.08) {
      const force = entry.nitroActive ? entry.tuning.nitroForce : entry.tuning.engineForce;
      engineForce = force * entry.input.throttle;
    } else if (entry.input.throttle < -0.08) {
      engineForce = entry.tuning.reverseForce * entry.input.throttle;
    } else {
      brake = entry.tuning.kind === "supercar" ? 2.3 : 1.8;
    }

    for (let i = 0; i < 4; i += 1) {
      entry.controller.setWheelEngineForce(i, engineForce);
      entry.controller.setWheelBrake(i, brake);
    }
  }

  function finishExtraSubstep(entry) {
    const speed = speedMetersPerSecond(entry);
    const delta = Math.max(0, entry.previousSpeed - speed);
    entry.tickPeakDelta = Math.max(Number(entry.tickPeakDelta) || 0, delta);
    entry.peakImpactDelta = Math.max(entry.peakImpactDelta * 0.985, delta);
    entry.previousSpeed = speed;
    entry.physicsFrames += 1;
  }

  function emitExtraCrash(entry, speedBefore, speedAfter, contactCursor, now) {
    if (!entry.driverId) return;
    const delta = Math.max(0, Number(entry.tickPeakDelta) || 0, speedBefore - speedAfter);
    const forceImpact = (physics.contactForces?.(256, {
      bodyId: entry.id,
      impactsOnly: true,
    }) ?? [])
      .filter((record) => (Number(record.sequence) || 0) > contactCursor)
      .sort((a, b) => (Number(b.totalForceMagnitude) || 0) - (Number(a.totalForceMagnitude) || 0))[0] ?? null;
    const totalMass = entry.tuning.chassis.mass + entry.tuning.chassis.ballastMass;
    const metrics = forceImpact
      ? vehicles.crashMetricsForForce?.(forceImpact.totalForceMagnitude, {
        totalMass,
        deltaSpeed: delta,
        speedBefore,
      })
      : null;
    const forceBacked = Boolean(speedBefore >= 2.5 && metrics && metrics.severity >= 1.25);
    const speedFallback = Boolean(!forceImpact && delta >= 5.5 && speedBefore >= 7);
    if (!forceBacked && !speedFallback) return;

    const body = bodyState(entry);
    const firstBodyId = forceImpact?.collider1?.worldObject?.bodyId ?? null;
    const secondBodyId = forceImpact?.collider2?.worldObject?.bodyId ?? null;
    const otherContact = forceImpact
      ? (firstBodyId === entry.id ? forceImpact.collider2 : secondBodyId === entry.id ? forceImpact.collider1 : null)
      : null;
    const fallbackSeverity = clamp(delta * 1.1, 0, 45);
    ctx.events.emit("vehicle:impact", {
      vehicleId: entry.id,
      vehicleKind: entry.tuning.kind,
      driverId: entry.driverId,
      impactSource: forceBacked ? "rapier-contact-force" : "speed-fallback",
      crashSeverity: forceBacked ? metrics.severity : fallbackSeverity,
      crashTier: forceBacked ? metrics.tier : (fallbackSeverity >= 16 ? "severe" : fallbackSeverity >= 8 ? "moderate" : "light"),
      contactForceMagnitude: forceBacked ? metrics.force : null,
      maxContactForceMagnitude: forceBacked ? (Number(forceImpact.maxForceMagnitude) || 0) : null,
      forceRatio: forceBacked ? metrics.forceRatio : null,
      contactSequence: forceBacked ? forceImpact.sequence : null,
      contactDirection: forceBacked ? forceImpact.maxForceDirection ?? null : null,
      otherBodyId: otherContact?.worldObject?.bodyId ?? null,
      otherKind: otherContact?.worldObject?.kind ?? null,
      otherEntityId: otherContact?.entityId ?? null,
      deltaSpeed: delta,
      speedBefore,
      speedAfter,
      x: body?.x ?? 0,
      y: body?.y ?? 0,
      z: body?.z ?? 0,
      now,
    });
  }

  function extraNeedsVehicleUpdate(entry) {
    if (entry.driverId || entry.passengerIds.length > 0) return true;
    return !(entry.body?.isSleeping?.() ?? false);
  }

  function tickPhysics(dt, now = Date.now()) {
    const safeDt = clamp(dt, 0, 0.1);
    if (!(safeDt > 0)) return;
    const contactCursor = Number(physics.contactForceCursor?.()) || 0;
    const speedBeforeTick = new Map();
    for (const entry of extras.values()) {
      updateExtraNitro(entry, safeDt, now);
      speedBeforeTick.set(entry.id, entry.previousSpeed);
      entry.tickPeakDelta = 0;
    }

    // The primary jeep still owns the shared Rapier step. Additional vehicle
    // controllers inject wheel forces into that exact same step.
    const originalPhysicsStep = physics.step;
    physics.step = (subDt = PHYSICS_STEP) => {
      const updatedEntries = [];
      for (const entry of extras.values()) {
        if (!extraNeedsVehicleUpdate(entry)) continue;
        applyExtraWheelControls(entry);
        entry.controller.updateVehicle(
          subDt,
          RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC | RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
          undefined,
          collider => !physics.isCharacterCollider(collider),
        );
        updatedEntries.push(entry);
      }
      const result = originalPhysicsStep(subDt);
      for (const entry of updatedEntries) finishExtraSubstep(entry);
      return result;
    };
    try {
      originalTickPhysics(safeDt, now);
    } finally {
      physics.step = originalPhysicsStep;
    }

    for (const entry of extras.values()) {
      emitExtraCrash(
        entry,
        Math.max(0, Number(speedBeforeTick.get(entry.id)) || 0),
        speedMetersPerSecond(entry),
        contactCursor,
        now,
      );
      syncExtraDriver(entry);
      syncExtraPassengers(entry);
    }
  }

  function driverId(vehicleId = primaryId) {
    if (vehicleId === primaryId) return originalDriverId();
    return extras.get(vehicleId)?.driverId ?? null;
  }

  function summary() {
    const fleet = snapshot();
    const supercars = fleet.filter((vehicle) => vehicle.kind === "supercar");
    const offroad = fleet.filter((vehicle) => vehicle.kind === "offroad");
    let minimumSeparation = Infinity;
    for (let i = 0; i < fleet.length; i += 1) {
      for (let j = i + 1; j < fleet.length; j += 1) {
        minimumSeparation = Math.min(minimumSeparation, distance3(fleet[i], fleet[j]));
      }
    }
    return {
      total: fleet.length,
      supercars: supercars.length,
      offroad: offroad.length,
      occupied: fleet.filter((vehicle) => vehicle.occupied).length,
      sleepingExtras: [...extras.values()].filter((entry) => entry.body?.isSleeping?.()).length,
      activeExtraControllers: [...extras.values()].filter(extraNeedsVehicleUpdate).length,
      minimumSeparation: Number.isFinite(minimumSeparation) ? minimumSeparation : null,
      worldHalfSize: map.halfSize,
      vehicles: fleet,
      primary: originalSummary(),
    };
  }

  function assertFleet(expected = {}) {
    const state = summary();
    const minTotal = Number(expected.minTotal ?? FLEET_VEHICLE_COUNT);
    const minSupercars = Number(expected.minSupercars ?? FLEET_SUPERCAR_COUNT);
    const minOffroad = Number(expected.minOffroad ?? FLEET_OFFROAD_COUNT);
    if (state.total < minTotal) throw new Error(`Expected at least ${minTotal} vehicles, got ${state.total}`);
    if (state.supercars < minSupercars) {
      throw new Error(`Expected at least ${minSupercars} supercars, got ${state.supercars}`);
    }
    if (state.offroad < minOffroad) {
      throw new Error(`Expected at least ${minOffroad} offroad vehicles, got ${state.offroad}`);
    }
    for (const vehicle of state.vehicles) {
      for (const value of [vehicle.x, vehicle.y, vehicle.z, vehicle.speed]) {
        if (!Number.isFinite(value)) throw new Error(`Non-finite vehicle state for ${vehicle.id}`);
      }
      if (Math.abs(vehicle.x) >= map.halfSize || Math.abs(vehicle.z) >= map.halfSize) {
        throw new Error(`Vehicle ${vehicle.id} spawned outside the expanded world`);
      }
    }
    return state;
  }

  function assertVehicle(vehicleId, expected = {}) {
    const vehicle = stateFor(vehicleId);
    if (!vehicle) throw new Error(`Vehicle not found: ${vehicleId}`);
    if (expected.kind && vehicle.kind !== expected.kind) {
      throw new Error(`Expected ${vehicleId} kind ${expected.kind}, got ${vehicle.kind}`);
    }
    if (Number.isFinite(expected.minSpeedKph) && vehicle.speedKph < Number(expected.minSpeedKph)) {
      throw new Error(`Expected ${vehicleId} >= ${expected.minSpeedKph} km/h, got ${vehicle.speedKph}`);
    }
    if (expected.occupied !== undefined && vehicle.occupied !== Boolean(expected.occupied)) {
      throw new Error(`Expected ${vehicleId} occupied=${Boolean(expected.occupied)}, got ${vehicle.occupied}`);
    }
    return vehicle;
  }

  ctx.events.on("entity:died", ({ entityId, now }) => {
    const eventNow = Number(now) || Date.now();
    const passengerEntry = passengerVehicle(entityId);
    if (passengerEntry) {
      const index = passengerEntry.passengerIds.indexOf(entityId);
      if (index >= 0) passengerEntry.passengerIds.splice(index, 1);
      extraPassengerVehicle.delete(entityId);
    }
    const entry = extraDriverEntry(entityId);
    if (!entry) return;
    for (const passengerId of [...entry.passengerIds].reverse()) {
      exitPassenger(passengerId, eventNow, "driver-lost");
    }
    stopExtraNitro(entry, eventNow, entityId);
    entry.driverId = null;
    extraDriverVehicle.delete(entityId);
    entry.input = { throttle: 0, steering: 0, handbrake: true, nitro: false };
    entry.handbrakeArmed = true;
    ctx.events.emit("vehicle:driver-lost", {
      entityId,
      vehicleId: entry.id,
      vehicleKind: entry.tuning.kind,
      now: eventNow,
    });
  });

  ctx.events.on("entity:removed", ({ entityId, now }) => {
    const eventNow = Number(now) || Date.now();
    const passengerEntry = passengerVehicle(entityId);
    if (passengerEntry) {
      const index = passengerEntry.passengerIds.indexOf(entityId);
      if (index >= 0) passengerEntry.passengerIds.splice(index, 1);
      extraPassengerVehicle.delete(entityId);
    }
    const entry = extraDriverEntry(entityId);
    if (!entry) return;
    for (const passengerId of [...entry.passengerIds].reverse()) {
      exitPassenger(passengerId, eventNow, "driver-removed");
    }
    stopExtraNitro(entry, eventNow, entityId);
    entry.driverId = null;
    extraDriverVehicle.delete(entityId);
    entry.input = { throttle: 0, steering: 0, handbrake: true, nitro: false };
    entry.handbrakeArmed = true;
  });

  if (armor?.startPlating) {
    const originalStartPlating = armor.startPlating.bind(armor);
    armor.startPlating = (entityId, now = Date.now()) => {
      if (isDriving(entityId) || isPassenger(entityId)) return false;
      return originalStartPlating(entityId, now);
    };
  }

  Object.assign(vehicles, {
    enterDistance: ENTER_DISTANCE,
    interact,
    enter,
    enterBot,
    exit,
    setInput,
    tickPhysics,
    isDriving,
    driverId,
    stateFor,
    vehicleForDriver,
    snapshot,
    networkSnapshot,
    summary,
    assertFleet,
    assertVehicle,
    enterPassenger,
    exitPassenger,
    isPassenger,
    vehicleForPassenger,
    passengerIds(vehicleId) { return [...(extras.get(vehicleId)?.passengerIds ?? [])]; },
    passengerCapacity: PASSENGER_CAPACITY,
    fleetLayout: FLEET_LAYOUT,
  });
}
