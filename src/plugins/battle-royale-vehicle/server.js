export const VEHICLE_ID = "br-jeep-1";
export const VEHICLE_SPAWN = Object.freeze({ x: 94, y: 1.25, z: 24 });
export const VEHICLE_ENTER_DISTANCE = 3.4;
export const VEHICLE_CHASSIS_MASS = 1380;
export const VEHICLE_MAX_STEER = 0.46;
export const VEHICLE_HIGH_SPEED_STEER = 0.2;
export const VEHICLE_ENGINE_FORCE = 1850;
export const VEHICLE_REVERSE_FORCE = 1150;
export const VEHICLE_NITRO_ENGINE_FORCE = 9200;
export const VEHICLE_NITRO_BURST_SECONDS = 2.5;
export const VEHICLE_NITRO_COOLDOWN_SECONDS = 10;
export const VEHICLE_SERVICE_BRAKE = 18;
export const VEHICLE_HAND_BRAKE = 55;
export const VEHICLE_PARK_BRAKE = 10;
export const VEHICLE_PHYSICS_STEP = 1 / 60;

export const manifest = {
  id: "battle-royale-vehicle",
  version: "1.1.0",
  requires: ["rapier-physics", "movement", "entities", "battle-royale", "map-test-arena"],
  capabilities: [
    "services.consume", "services.provide",
    "components.read", "events.on", "events.emit",
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
  // Rapier's ray-cast vehicle controller uses chassis-local -X as forward in
  // the reference configuration we use here.
  const forward = rotateVector(rotation, { x: -1, y: 0, z: 0 });
  return Math.atan2(forward.x, -forward.z);
}

function forwardVector(rotation) {
  return rotateVector(rotation, { x: -1, y: 0, z: 0 });
}

function rightVector(rotation) {
  return rotateVector(rotation, { x: 0, y: 0, z: 1 });
}

export async function setup(ctx) {
  const physics = ctx.services.get("physics");
  const movement = ctx.services.get("movement");
  const entities = ctx.services.get("entities");
  const battleRoyale = ctx.services.get("battle-royale");
  const RAPIER = physics.RAPIER;

  const spawnRotation = {
    x: 0,
    y: -Math.sin(Math.PI / 4),
    z: 0,
    w: Math.cos(Math.PI / 4),
  };

  const chassis = physics.createDynamicCuboid(VEHICLE_ID, {
    ...VEHICLE_SPAWN,
    hx: 1.72,
    hy: 0.38,
    hz: 0.92,
    rotation: spawnRotation,
    mass: VEHICLE_CHASSIS_MASS,
    friction: 0.72,
    restitution: 0.08,
    linearDamping: 0.025,
    angularDamping: 0.14,
    canSleep: false,
    ccd: true,
    metadata: {
      kind: "vehicle-chassis",
      vehicleId: VEHICLE_ID,
      accessibleName: "внедорожник",
    },
  });

  // A small low-mounted ballast contributes real Rapier mass/inertia and lowers
  // the center of mass without locking pitch/roll. The car may still roll or
  // flip; it is just less comically top-heavy.
  physics.addDynamicCuboidCollider(VEHICLE_ID, {
    x: 0.12,
    y: -0.28,
    z: 0,
    hx: 1.2,
    hy: 0.09,
    hz: 0.66,
    mass: 420,
    friction: 0.7,
    restitution: 0.03,
    sensor: true,
    metadata: {
      kind: "vehicle-ballast",
      vehicleId: VEHICLE_ID,
    },
  });

  const controller = physics.world.createVehicleController(chassis.body);
  const suspensionDirection = { x: 0, y: -1, z: 0 };
  const axle = { x: 0, y: 0, z: -1 };
  const wheelPositions = [
    { x: -1.43, y: -0.27, z: -1.02, axle: "front-left" },
    { x: -1.43, y: -0.27, z: 1.02, axle: "front-right" },
    { x: 1.38, y: -0.27, z: -1.02, axle: "rear-left" },
    { x: 1.38, y: -0.27, z: 1.02, axle: "rear-right" },
  ];

  for (let i = 0; i < wheelPositions.length; i += 1) {
    const wheel = wheelPositions[i];
    controller.addWheel(wheel, suspensionDirection, axle, 0.34, 0.43);
    controller.setWheelSuspensionStiffness(i, 34);
    controller.setWheelSuspensionCompression(i, 5.2);
    controller.setWheelSuspensionRelaxation(i, 6.4);
    controller.setWheelMaxSuspensionTravel(i, 0.34);
    controller.setWheelMaxSuspensionForce(i, 32_000);
    controller.setWheelFrictionSlip(i, 2.25);
    controller.setWheelSideFrictionStiffness(i, 4.6);
  }

  let driverId = null;
  let input = { throttle: 0, steering: 0, handbrake: false, nitro: false };
  // Sprint and handbrake share one input bit. If sprint was already held (or a
  // touch/VoiceOver sprint control was latched) before entering the vehicle,
  // treating it as a fresh handbrake press leaves the jeep unable to move.
  // Require one observed release after entering before Shift can become the
  // handbrake. This preserves intentional handbraking without inheriting stale
  // on-foot sprint state.
  let handbrakeArmed = true;
  let nitroActive = false;
  let nitroBurstRemaining = VEHICLE_NITRO_BURST_SECONDS;
  let nitroCooldownRemaining = 0;
  let nitroRequiresRelease = false;
  let nitroReadyEmitted = true;
  let previousSpeed = 0;
  let peakImpactDelta = 0;
  let physicsFrames = 0;

  function bodyState() {
    return physics.dynamicBodyState(VEHICLE_ID);
  }

  function speedMetersPerSecond(state = bodyState()) {
    if (!state) return 0;
    return Math.hypot(state.linvel.x, state.linvel.y, state.linvel.z);
  }

  function driverEntity() {
    return driverId ? entities.get(driverId) : null;
  }

  function wheelState(i) {
    return {
      index: i,
      name: wheelPositions[i]?.axle ?? `wheel-${i}`,
      contact: Boolean(controller.wheelIsInContact(i)),
      suspensionLength: Number(controller.wheelSuspensionLength(i)) || 0,
      suspensionForce: Number(controller.wheelSuspensionForce(i)) || 0,
      forwardImpulse: Number(controller.wheelForwardImpulse(i)) || 0,
      sideImpulse: Number(controller.wheelSideImpulse(i)) || 0,
      steering: Number(controller.wheelSteering(i)) || 0,
      rotation: Number(controller.wheelRotation(i)) || 0,
    };
  }

  function nitroState() {
    return {
      active: nitroActive,
      requested: Boolean(input.nitro),
      ready: !nitroActive && nitroCooldownRemaining <= 0 && !nitroRequiresRelease,
      burstSecondsRemaining: Math.max(0, nitroBurstRemaining),
      burstSeconds: VEHICLE_NITRO_BURST_SECONDS,
      cooldownSecondsRemaining: Math.max(0, nitroCooldownRemaining),
      cooldownSeconds: VEHICLE_NITRO_COOLDOWN_SECONDS,
      engineForce: nitroActive ? VEHICLE_NITRO_ENGINE_FORCE : VEHICLE_ENGINE_FORCE,
    };
  }

  function state() {
    const body = bodyState();
    if (!body) return null;
    const speed = speedMetersPerSecond(body);
    const forward = forwardVector(body.rotation);
    const forwardSpeed = body.linvel.x * forward.x + body.linvel.y * forward.y + body.linvel.z * forward.z;
    const wheels = wheelPositions.map((_, i) => wheelState(i));
    return {
      id: VEHICLE_ID,
      kind: "offroad",
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
      driverId,
      occupied: Boolean(driverId),
      groundedWheels: wheels.filter((wheel) => wheel.contact).length,
      wheels,
      input: { ...input },
      handbrakeArmed,
      nitro: nitroState(),
      mass: body.mass,
      peakImpactDelta,
      physicsFrames,
    };
  }

  function syncDriver() {
    const driver = driverEntity();
    const body = bodyState();
    if (!driver?.alive || !body) return;
    const transform = ctx.components.get(driver.id, "Transform");
    if (!transform) return;
    const seat = rotateVector(body.rotation, { x: 0.2, y: 0.72, z: 0 });
    const position = {
      x: body.x + seat.x,
      y: body.y + seat.y,
      z: body.z + seat.z,
    };
    physics.teleport(driver.id, position);
    transform.x = position.x;
    transform.y = position.y;
    transform.z = position.z;
    transform.angle = headingFromRotation(body.rotation);
    transform.verticalVelocity = 0;
    transform.grounded = false;
  }

  function stopNitro(now = Date.now(), sourceDriverId = driverId) {
    if (!nitroActive) return false;
    nitroActive = false;
    nitroBurstRemaining = 0;
    nitroCooldownRemaining = VEHICLE_NITRO_COOLDOWN_SECONDS;
    nitroRequiresRelease = true;
    nitroReadyEmitted = false;
    ctx.events.emit("vehicle:nitro-stop", {
      vehicleId: VEHICLE_ID,
      driverId: sourceDriverId,
      cooldownSeconds: VEHICLE_NITRO_COOLDOWN_SECONDS,
      now,
    });
    return true;
  }

  function updateNitroState(dt, now = Date.now()) {
    const safeDt = clamp(dt, 0, 0.1);
    if (nitroCooldownRemaining > 0) {
      nitroCooldownRemaining = Math.max(0, nitroCooldownRemaining - safeDt);
      if (nitroCooldownRemaining <= 0) {
        nitroBurstRemaining = VEHICLE_NITRO_BURST_SECONDS;
        if (!nitroReadyEmitted && driverId) {
          ctx.events.emit("vehicle:nitro-ready", {
            vehicleId: VEHICLE_ID,
            driverId,
            now,
          });
        }
        nitroReadyEmitted = true;
      }
    }

    if (!input.nitro) nitroRequiresRelease = false;
    const requested = Boolean(
      driverId
      && input.nitro
      && input.throttle > 0.08
      && !input.handbrake
    );

    if (nitroActive) {
      if (!requested) {
        stopNitro(now);
        return;
      }
      nitroBurstRemaining = Math.max(0, nitroBurstRemaining - safeDt);
      if (nitroBurstRemaining <= 0) stopNitro(now);
      return;
    }

    if (nitroCooldownRemaining <= 0 && requested && !nitroRequiresRelease) {
      nitroActive = true;
      nitroBurstRemaining = VEHICLE_NITRO_BURST_SECONDS;
      ctx.events.emit("vehicle:nitro-start", {
        vehicleId: VEHICLE_ID,
        driverId,
        burstSeconds: VEHICLE_NITRO_BURST_SECONDS,
        engineForce: VEHICLE_NITRO_ENGINE_FORCE,
        now,
      });
    }
  }

  function enter(playerId, now = Date.now()) {
    if (driverId || !playerId) return false;
    const entity = entities.get(playerId);
    const transform = ctx.components.get(playerId, "Transform");
    const body = bodyState();
    if (!entity?.alive || entity.bot || !transform || !body) return false;
    if (distance3(transform, body) > VEHICLE_ENTER_DISTANCE) return false;
    driverId = playerId;
    input = { throttle: 0, steering: 0, handbrake: false, nitro: false };
    handbrakeArmed = false;
    nitroRequiresRelease = false;
    movement.setInput(playerId, {});
    physics.setCharacterEnabled(playerId, false);
    syncDriver();
    ctx.events.emit("vehicle:entered", {
      entityId: playerId,
      vehicleId: VEHICLE_ID,
      now,
      x: body.x,
      y: body.y,
      z: body.z,
    });
    return true;
  }

  function exitPosition() {
    const body = bodyState();
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

  function exit(playerId, now = Date.now(), reason = "interact") {
    if (!driverId || driverId !== playerId) return false;
    const target = exitPosition();
    stopNitro(now, playerId);
    driverId = null;
    input = { throttle: 0, steering: 0, handbrake: true, nitro: false };
    handbrakeArmed = true;
    physics.setCharacterEnabled(playerId, true);
    if (target) movement.teleport(playerId, target);
    ctx.events.emit("vehicle:exited", {
      entityId: playerId,
      vehicleId: VEHICLE_ID,
      reason,
      now,
      x: target?.x ?? null,
      y: target?.y ?? null,
      z: target?.z ?? null,
    });
    return true;
  }

  function interact(playerId, now = Date.now()) {
    if (driverId === playerId) return exit(playerId, now);
    return enter(playerId, now);
  }

  function setInput(playerId, raw = {}) {
    if (driverId !== playerId) return false;
    const requestedHandbrake = Boolean(raw.sprint);
    if (!handbrakeArmed && !requestedHandbrake) handbrakeArmed = true;
    input = {
      throttle: clamp(raw.forward, -1, 1),
      steering: clamp(raw.strafe, -1, 1),
      handbrake: handbrakeArmed && requestedHandbrake,
      nitro: Boolean(raw.fireHeld),
    };
    return true;
  }

  function steeringAngle(speed) {
    const t = clamp((Math.abs(speed) - 7) / 18, 0, 1);
    return VEHICLE_MAX_STEER + (VEHICLE_HIGH_SPEED_STEER - VEHICLE_MAX_STEER) * t;
  }

  function applyWheelControls() {
    const body = bodyState();
    if (!body) return;
    const speed = speedMetersPerSecond(body);
    const forward = forwardVector(body.rotation);
    const longitudinal = body.linvel.x * forward.x + body.linvel.y * forward.y + body.linvel.z * forward.z;
    const steer = -input.steering * steeringAngle(speed);

    controller.setWheelSteering(0, steer);
    controller.setWheelSteering(1, steer);
    controller.setWheelSteering(2, 0);
    controller.setWheelSteering(3, 0);

    let engineForce = 0;
    let brake = 0;
    if (!driverId) {
      brake = VEHICLE_PARK_BRAKE;
    } else if (input.handbrake) {
      brake = VEHICLE_HAND_BRAKE;
    } else if (input.throttle < -0.08 && longitudinal > 1.25) {
      brake = VEHICLE_SERVICE_BRAKE * Math.abs(input.throttle);
    } else if (input.throttle > 0.08 && longitudinal < -1.25) {
      brake = VEHICLE_SERVICE_BRAKE * input.throttle;
    } else if (input.throttle > 0.08) {
      const force = nitroActive ? VEHICLE_NITRO_ENGINE_FORCE : VEHICLE_ENGINE_FORCE;
      engineForce = force * input.throttle;
    } else if (input.throttle < -0.08) {
      engineForce = VEHICLE_REVERSE_FORCE * input.throttle;
    } else {
      brake = 1.8;
    }

    // AWD: every contact patch contributes real longitudinal tire force. Nitro
    // deliberately goes through this same Rapier wheel controller instead of
    // assigning chassis velocity directly, so grip and collisions still matter.
    for (let i = 0; i < 4; i += 1) {
      controller.setWheelEngineForce(i, engineForce);
      controller.setWheelBrake(i, brake);
    }
  }

  function tickPhysics(dt, now = Date.now()) {
    const safeDt = clamp(dt, 0, 0.1);
    if (!(safeDt > 0)) return;
    updateNitroState(safeDt, now);
    const substeps = Math.max(1, Math.min(6, Math.ceil(safeDt / VEHICLE_PHYSICS_STEP)));
    const subDt = safeDt / substeps;
    for (let i = 0; i < substeps; i += 1) {
      applyWheelControls();
      controller.updateVehicle(
        subDt,
        RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC | RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
        undefined,
        collider => !physics.isCharacterCollider(collider),
      );
      physics.step(subDt);
      physicsFrames += 1;
    }

    const speed = speedMetersPerSecond();
    const delta = Math.max(0, previousSpeed - speed);
    peakImpactDelta = Math.max(peakImpactDelta * 0.985, delta);
    if (delta >= 5.5 && previousSpeed >= 7) {
      const body = bodyState();
      ctx.events.emit("vehicle:impact", {
        vehicleId: VEHICLE_ID,
        driverId,
        deltaSpeed: delta,
        speedBefore: previousSpeed,
        speedAfter: speed,
        x: body?.x ?? 0,
        y: body?.y ?? 0,
        z: body?.z ?? 0,
        now,
      });
    }
    previousSpeed = speed;
    syncDriver();
  }

  ctx.events.on("entity:died", ({ entityId, now }) => {
    if (entityId !== driverId) return;
    // A dead driver's collider stays disabled; just release vehicle control.
    stopNitro(now, entityId);
    driverId = null;
    input = { throttle: 0, steering: 0, handbrake: true, nitro: false };
    handbrakeArmed = true;
    ctx.events.emit("vehicle:driver-lost", { entityId, vehicleId: VEHICLE_ID, now });
  });

  ctx.events.on("entity:removed", ({ entityId }) => {
    if (entityId !== driverId) return;
    stopNitro(Date.now(), entityId);
    driverId = null;
    input = { throttle: 0, steering: 0, handbrake: true, nitro: false };
    handbrakeArmed = true;
  });

  ctx.services.provide("vehicles", {
    vehicleId: VEHICLE_ID,
    enterDistance: VEHICLE_ENTER_DISTANCE,
    interact,
    enter,
    exit,
    setInput,
    tickPhysics,
    isDriving(playerId) { return driverId === playerId; },
    driverId() { return driverId; },
    stateFor(vehicleId = VEHICLE_ID) { return vehicleId === VEHICLE_ID ? state() : null; },
    snapshot() {
      const current = state();
      return current ? [current] : [];
    },
    summary() {
      const current = state();
      return {
        vehicleId: VEHICLE_ID,
        driverId,
        physics: physics.stats(),
        state: current,
      };
    },
  });
}
