export const manifest = {
  id: "battle-royale-fleet-pedestrian-ragdoll",
  version: "1.1.0",
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

  // Rapier itself intentionally exposes colliders without gameplay entity ids.
  // Track ownership at the same creation boundary used by the core ragdoll plugin,
  // so every fleet chassis can resolve a real contact back to the pedestrian.
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

  function detectFleetPedestrianHits(now) {
    const fleet = typeof vehicles.snapshot === "function" ? vehicles.snapshot() : [];
    for (const vehicle of fleet) {
      if (!vehicle?.id || vehicle.id === primaryId) continue;
      const speed = Math.max(0, Number(vehicle.speed) || 0);
      if (speed < VEHICLE_PEDESTRIAN_HIT_SPEED) continue;

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
      const linvel = vehicle.linvel ?? body.linvel?.() ?? { x: 0, y: 0, z: 0 };
      const horizontal = Math.hypot(Number(linvel.x) || 0, Number(linvel.z) || 0) || 1;
      const knock = Math.min(3.4, 1.0 + speed * 0.10);

      for (const entityId of hitIds) {
        const activated = ragdoll.activate(entityId, {
          reason: "vehicle-hit",
          velocity: {
            x: (Number(linvel.x) || 0) * 0.72,
            y: Math.max(0.6, (Number(linvel.y) || 0) * 0.35 + 0.9),
            z: (Number(linvel.z) || 0) * 0.72,
          },
          impulse: {
            x: ((Number(linvel.x) || 0) / horizontal) * knock,
            y: 1.15 + Math.min(1.2, speed * 0.045),
            z: ((Number(linvel.z) || 0) / horizontal) * knock,
          },
        }, now);
        if (!activated) continue;
        detectedHits += 1;
        ctx.events.emit("ragdoll:fleet-vehicle-hit", {
          entityId,
          vehicleId: vehicle.id,
          vehicleKind: vehicle.kind,
          speed,
          speedKph: speed * 3.6,
          now,
        });
      }
    }
  }

  const originalTickPhysics = vehicles.tickPhysics.bind(vehicles);
  vehicles.tickPhysics = (dt, now = Date.now()) => {
    const result = originalTickPhysics(dt, now);
    detectFleetPedestrianHits(now);
    return result;
  };

  ctx.services.provide("fleet-pedestrian-ragdoll", {
    summary() {
      return {
        detectedHits,
        contactCandidates,
        trackedCharacters: characterColliderOwners.size,
      };
    },
  });
}
