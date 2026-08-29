export const manifest = {
  id: "battle-royale-fleet-pedestrian-ragdoll",
  version: "1.3.0",
  requires: [
    "battle-royale-vehicle-fleet",
    "battle-royale-ragdoll",
    "rapier-physics",
    "entities",
  ],
  capabilities: ["services.consume", "services.provide", "events.emit"],
};

const VEHICLE_PEDESTRIAN_HIT_SPEED = 3.0;
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
  const world = physics.world;
  const characterColliderOwners = new Map();
  const lastVehicleHitAt = new Map();
  let detectedHits = 0;
  let botHits = 0;
  let playerHits = 0;
  let contactCandidates = 0;
  let cooldownRejectedHits = 0;
  let peakDetectedImpactSpeed = 0;

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

  function detectFleetPedestrianHits(now, beforeFleet = []) {
    const beforeById = new Map(beforeFleet.map((vehicle) => [vehicle.id, vehicle]));
    const afterFleet = typeof vehicles.snapshot === "function" ? vehicles.snapshot() : [];

    for (const vehicle of afterFleet) {
      if (!vehicle?.id) continue;
      const before = beforeById.get(vehicle.id);
      const impactSpeed = Math.max(speedOf(before), speedOf(vehicle));
      if (impactSpeed < VEHICLE_PEDESTRIAN_HIT_SPEED) continue;

      const body = physics.dynamicBody(vehicle.id);
      const chassisCollider = body?.collider?.(0);
      if (!chassisCollider) continue;

      const hitIds = new Set();
      world.contactPairsWith(chassisCollider, (other) => {
        contactCandidates += 1;
        const entityId = characterColliderOwners.get(other.handle);
        if (!entityId || entityId === vehicle.driverId || ragdoll.isActive(entityId)) return;
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

      if (!hitIds.size) continue;
      const beforeVelocity = before?.linvel ?? null;
      const afterVelocity = vehicle.linvel ?? body.linvel?.() ?? { x: 0, y: 0, z: 0 };
      const linvel = velocityMagnitude(beforeVelocity) >= velocityMagnitude(afterVelocity)
        ? beforeVelocity
        : afterVelocity;
      const horizontal = Math.hypot(Number(linvel?.x) || 0, Number(linvel?.z) || 0) || 1;

      // Slow impacts should mostly knock a pedestrian over. Fast impacts carry
      // noticeably more of the vehicle's momentum and can throw them clear of
      // the chassis instead of repeatedly trapping them underneath it.
      const carry = Math.min(0.9, 0.5 + impactSpeed * 0.018);
      const knock = Math.min(5.2, 0.8 + impactSpeed * 0.14);
      const lift = Math.min(2.8, 0.65 + impactSpeed * 0.07);

      for (const entityId of hitIds) {
        const entity = entities.get(entityId);
        const activated = ragdoll.activate(entityId, {
          reason: "vehicle-hit",
          vehicleId: vehicle.id,
          driverId: vehicle.driverId ?? null,
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
        if (!activated) continue;

        lastVehicleHitAt.set(hitKey(vehicle.id, entityId), now);
        detectedHits += 1;
        if (entity?.bot) botHits += 1;
        else playerHits += 1;
        peakDetectedImpactSpeed = Math.max(peakDetectedImpactSpeed, impactSpeed);
        ctx.events.emit("ragdoll:fleet-vehicle-hit", {
          entityId,
          bot: Boolean(entity?.bot),
          vehicleId: vehicle.id,
          vehicleKind: vehicle.kind,
          driverId: vehicle.driverId ?? null,
          speed: impactSpeed,
          speedKph: impactSpeed * 3.6,
          now,
        });
      }
    }
  }

  const originalTickPhysics = vehicles.tickPhysics.bind(vehicles);
  vehicles.tickPhysics = (dt, now = Date.now()) => {
    const beforeFleet = typeof vehicles.snapshot === "function" ? vehicles.snapshot() : [];
    const result = originalTickPhysics(dt, now);
    detectFleetPedestrianHits(now, beforeFleet);
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
        peakDetectedImpactSpeed,
        peakDetectedImpactSpeedKph: peakDetectedImpactSpeed * 3.6,
      };
    },
  });
}
