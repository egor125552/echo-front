export const manifest = {
  id: "battle-royale-fleet-pedestrian-ragdoll",
  version: "1.3.4",
  requires: [
    "battle-royale-vehicle-fleet",
    "battle-royale-ragdoll",
    "rapier-physics",
    "entities",
    "bot-controller",
  ],
  capabilities: ["services.consume", "services.provide", "events.emit"],
};

const VEHICLE_PEDESTRIAN_HIT_SPEED = 3.0;
const FORCE_BACKED_MIN_SPEED = 1.8;
const FORCE_BACKED_MIN_NEWTONS = 80_000;
const FORCE_REFERENCE_NEWTONS = 1_000_000;
const SAME_VEHICLE_HIT_COOLDOWN_MS = 1200;

function pairHasActualContact(world, colliderA, colliderB) {
  let touching = false;
  world.contactPair(colliderA, colliderB, (manifold) => {
    if (manifold.numContacts() > 0 || manifold.numSolverContacts() > 0) touching = true;
  });
  return touching;
}

function speedOf(vehicle) {
  return Math.max(0, Number(vehicle?.speed) || 0);
}

function velocityMagnitude(vector) {
  return Math.hypot(Number(vector?.x) || 0, Number(vector?.y) || 0, Number(vector?.z) || 0);
}

function hitKey(vehicleId, entityId) {
  return `${vehicleId}:${entityId}`;
}

export async function setup(ctx) {
  const vehicles = ctx.services.get("vehicles");
  const ragdoll = ctx.services.get("ragdoll");
  const physics = ctx.services.get("physics");
  const entities = ctx.services.get("entities");
  const bots = ctx.services.get("bots");
  const world = physics.world;
  const characterColliderOwners = new Map();
  const lastVehicleHitAt = new Map();
  let detectedHits = 0;
  let botHits = 0;
  let playerHits = 0;
  let contactCandidates = 0;
  let cooldownRejectedHits = 0;
  let peakDetectedImpactSpeed = 0;
  let lastHit = null;

  const originalCreateCharacter = physics.createCharacter.bind(physics);
  physics.createCharacter = (entityId, position) => {
    const entry = originalCreateCharacter(entityId, position);
    if (entry?.collider) characterColliderOwners.set(entry.collider.handle, entityId);
    return entry;
  };
  const originalRemoveCharacter = physics.removeCharacter.bind(physics);
  physics.removeCharacter = (entityId) => {
    for (const [handle, owner] of characterColliderOwners) {
      if (owner === entityId) characterColliderOwners.delete(handle);
    }
    for (const key of lastVehicleHitAt.keys()) {
      if (key.endsWith(`:${entityId}`)) lastVehicleHitAt.delete(key);
    }
    return originalRemoveCharacter(entityId);
  };

  function detectFleetPedestrianHits(now, beforeFleet = [], contactForceCursor = 0) {
    const beforeById = new Map(beforeFleet.map((vehicle) => [vehicle.id, vehicle]));
    const afterFleet = typeof vehicles.snapshot === "function" ? vehicles.snapshot() : [];

    for (const vehicle of afterFleet) {
      if (!vehicle?.id) continue;
      const before = beforeById.get(vehicle.id);
      const impactDriverId = vehicle.driverId ?? before?.driverId ?? null;
      const impactSpeed = Math.max(speedOf(before), speedOf(vehicle));

      const body = physics.dynamicBody(vehicle.id);
      if (!body) continue;

      const hitIds = new Set();
      // The outer presence shell also has real contacts. A pedestrian can
      // hit the side of that shell without ever touching the smaller chassis.
      for (let index = 0; index < body.numColliders(); index++) {
        const chassisCollider = body.collider(index);
        if (!chassisCollider || chassisCollider.isSensor()) continue;
        world.contactPairsWith(chassisCollider, (other) => {
        contactCandidates += 1;
        const entityId = characterColliderOwners.get(other.handle);
        if (!entityId
          || entityId === vehicle.driverId
          || entityId === before?.driverId
          || ragdoll.isActive(entityId)) return;
        const entity = entities.get(entityId);
        if (!entity?.alive) return;
        if (!pairHasActualContact(world, chassisCollider, other)) return;

        const key = hitKey(vehicle.id, entityId);
        const previousHitAt = Number(lastVehicleHitAt.get(key)) || -Infinity;
        if (now - previousHitAt < SAME_VEHICLE_HIT_COOLDOWN_MS) {
          cooldownRejectedHits += 1;
          return;
        }
        hitIds.add(entityId);
        });
      }

      if (!hitIds.size) continue;
      const stepForces = typeof physics.contactForces === "function"
        ? physics.contactForces(128, { bodyId: vehicle.id, impactsOnly: true })
          .filter((record) => Number(record.sequence) > Number(contactForceCursor || 0))
        : [];
      const forceFor = (entityId) => stepForces
        .filter((record) => record.collider1?.entityId === entityId || record.collider2?.entityId === entityId)
        .reduce((best, record) => Math.max(best, Number(record.totalForceMagnitude) || 0), 0);
      const beforeVelocity = before?.linvel ?? null;
      const afterVelocity = vehicle.linvel ?? body.linvel?.() ?? { x: 0, y: 0, z: 0 };
      const linvel = velocityMagnitude(beforeVelocity) >= velocityMagnitude(afterVelocity)
        ? beforeVelocity
        : afterVelocity;
      const horizontal = Math.hypot(Number(linvel?.x) || 0, Number(linvel?.z) || 0) || 1;

      for (const entityId of hitIds) {
        const contactForce = forceFor(entityId);
        const forceBacked = impactSpeed >= FORCE_BACKED_MIN_SPEED && contactForce >= FORCE_BACKED_MIN_NEWTONS;
        if (!forceBacked && impactSpeed < VEHICLE_PEDESTRIAN_HIT_SPEED) continue;
        const forceScale = forceBacked
          ? Math.min(2.2, Math.max(0.45, Math.sqrt(contactForce / FORCE_REFERENCE_NEWTONS)))
          : 1;
        const carry = Math.min(0.94, 0.46 + impactSpeed * 0.019 + (forceScale - 1) * 0.08);
        const knock = Math.min(6.2, (0.7 + impactSpeed * 0.13) * forceScale);
        const lift = Math.min(3.2, (0.55 + impactSpeed * 0.055) * Math.sqrt(forceScale));
        const entityBefore = entities.get(entityId);
        const wasBot = Boolean(bots.isBot(entityId));
        const activated = ragdoll.activate(entityId, {
          reason: "vehicle-hit",
          vehicleId: vehicle.id,
          driverId: impactDriverId,
          impactSpeed,
          velocity: {
            x: (Number(linvel?.x) || 0) * carry,
            y: Math.max(0.45, (Number(linvel?.y) || 0) * 0.3 + lift * 0.45),
            z: (Number(linvel?.z) || 0) * carry,
          },
          impulse: {
            x: ((Number(linvel?.x) || 0) / horizontal) * knock,
            y: lift,
            z: ((Number(linvel?.z) || 0) / horizontal) * knock,
          },
        }, now);
        const entityAfter = entities.get(entityId);
        lastHit = {
          entityId,
          entityName: entityBefore?.name ?? null,
          isBot: wasBot,
          entityBotBefore: Boolean(entityBefore?.bot),
          entityBotAfter: Boolean(entityAfter?.bot),
          aliveBefore: Boolean(entityBefore?.alive),
          aliveAfter: Boolean(entityAfter?.alive),
          vehicleId: vehicle.id,
          driverId: impactDriverId,
          currentDriverId: vehicle.driverId ?? null,
          previousDriverId: before?.driverId ?? null,
          impactSpeed,
          impactSpeedKph: impactSpeed * 3.6,
          contactForce,
          forceBacked,
          forceScale,
          knock,
          lift,
          activated: Boolean(activated),
          now,
        };
        if (!activated) continue;

        lastVehicleHitAt.set(hitKey(vehicle.id, entityId), now);
        detectedHits += 1;
        if (wasBot) botHits += 1;
        else playerHits += 1;
        peakDetectedImpactSpeed = Math.max(peakDetectedImpactSpeed, impactSpeed);
        ctx.events.emit("ragdoll:fleet-vehicle-hit", {
          entityId,
          bot: wasBot,
          vehicleId: vehicle.id,
          vehicleKind: vehicle.kind,
          driverId: impactDriverId,
          speed: impactSpeed,
          speedKph: impactSpeed * 3.6,
          contactForce,
          forceBacked,
          forceScale,
          now,
        });
      }
    }
  }

  const originalTickPhysics = vehicles.tickPhysics.bind(vehicles);
  vehicles.tickPhysics = (dt, now = Date.now()) => {
    const beforeFleet = typeof vehicles.snapshot === "function" ? vehicles.snapshot() : [];
    const contactForceCursor = typeof physics.contactForceCursor === "function" ? physics.contactForceCursor() : 0;
    const result = originalTickPhysics(dt, now);
    detectFleetPedestrianHits(now, beforeFleet, contactForceCursor);
    return result;
  };

  ctx.services.provide("fleet-pedestrian-ragdoll", {
    summary() {
      return {
        detectedHits,
        botHits,
        playerHits,
        contactCandidates,
        cooldownRejectedHits,
        trackedCharacters: characterColliderOwners.size,
        trackedHitCooldowns: lastVehicleHitAt.size,
        hitCooldownMs: SAME_VEHICLE_HIT_COOLDOWN_MS,
        minimumHitSpeed: VEHICLE_PEDESTRIAN_HIT_SPEED,
        minimumHitSpeedKph: VEHICLE_PEDESTRIAN_HIT_SPEED * 3.6,
        forceBackedMinSpeed: FORCE_BACKED_MIN_SPEED,
        forceBackedMinSpeedKph: FORCE_BACKED_MIN_SPEED * 3.6,
        forceBackedMinNewtons: FORCE_BACKED_MIN_NEWTONS,
        peakDetectedImpactSpeed,
        peakDetectedImpactSpeedKph: peakDetectedImpactSpeed * 3.6,
        lastHit,
      };
    },
  });
}
