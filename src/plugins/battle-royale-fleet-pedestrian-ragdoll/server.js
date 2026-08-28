export const manifest = {
  id: "battle-royale-fleet-pedestrian-ragdoll",
  version: "1.2.0",
  requires: [
    "battle-royale-vehicle-fleet",
    "battle-royale-ragdoll",
    "rapier-physics",
    "entities",
  ],
  capabilities: ["services.consume", "services.provide", "events.emit"],
};

const VEHICLE_PEDESTRIAN_HIT_SPEED = 3.0;

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

export async function setup(ctx) {
  const vehicles = ctx.services.get("vehicles");
  const ragdoll = ctx.services.get("ragdoll");
  const physics = ctx.services.get("physics");
  const entities = ctx.services.get("entities");
  const world = physics.world;
  const primaryId = vehicles.vehicleId;
  const characterColliderOwners = new Map();
  let detectedHits = 0;
  let contactCandidates = 0;
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
    return originalRemoveCharacter(entityId);
  };

  function detectFleetPedestrianHits(now, beforeFleet = []) {
    const beforeById = new Map(beforeFleet.map((vehicle) => [vehicle.id, vehicle]));
    const afterFleet = typeof vehicles.snapshot === "function" ? vehicles.snapshot() : [];

    for (const vehicle of afterFleet) {
      if (!vehicle?.id || vehicle.id === primaryId) continue;
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
        if (!entity?.alive || entity.bot) return;
        if (!pairHasActualContact(world, chassisCollider, other)) return;
        hitIds.add(entityId);
      });

      if (!hitIds.size) continue;
      const beforeVelocity = before?.linvel ?? null;
      const afterVelocity = vehicle.linvel ?? body.linvel?.() ?? { x: 0, y: 0, z: 0 };
      const linvel = velocityMagnitude(beforeVelocity) >= velocityMagnitude(afterVelocity)
        ? beforeVelocity
        : afterVelocity;
      const horizontal = Math.hypot(Number(linvel?.x) || 0, Number(linvel?.z) || 0) || 1;
      const knock = Math.min(3.4, 1.0 + impactSpeed * 0.10);

      for (const entityId of hitIds) {
        const activated = ragdoll.activate(entityId, {
          reason: "vehicle-hit",
          velocity: {
            x: (Number(linvel?.x) || 0) * 0.72,
            y: Math.max(0.6, (Number(linvel?.y) || 0) * 0.35 + 0.9),
            z: (Number(linvel?.z) || 0) * 0.72,
          },
          impulse: {
            x: ((Number(linvel?.x) || 0) / horizontal) * knock,
            y: 1.15 + Math.min(1.2, impactSpeed * 0.045),
            z: ((Number(linvel?.z) || 0) / horizontal) * knock,
          },
        }, now);
        if (!activated) continue;
        detectedHits += 1;
        peakDetectedImpactSpeed = Math.max(peakDetectedImpactSpeed, impactSpeed);
        ctx.events.emit("ragdoll:fleet-vehicle-hit", {
          entityId,
          vehicleId: vehicle.id,
          vehicleKind: vehicle.kind,
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
        contactCandidates,
        trackedCharacters: characterColliderOwners.size,
        peakDetectedImpactSpeed,
        peakDetectedImpactSpeedKph: peakDetectedImpactSpeed * 3.6,
      };
    },
  });
}
