import { CHARACTER_HALF_HEIGHT, CHARACTER_RADIUS } from "../rapier-physics/server.js";

export const manifest = {
  id: "rapier-live-character-queries",
  version: "1.0.0",
  requires: ["rapier-physics"],
  capabilities: ["services.consume"],
};

export async function setup(ctx) {
  const physics = ctx.services.get("physics");
  const RAPIER = physics.RAPIER;
  const characters = new Map();

  const originalCreateCharacter = physics.createCharacter.bind(physics);
  const originalRemoveCharacter = physics.removeCharacter.bind(physics);
  const originalStats = typeof physics.stats === "function" ? physics.stats.bind(physics) : null;

  let exactRaycasts = 0;
  let exactCharacterHits = 0;

  physics.createCharacter = (entityId, position = {}) => {
    const entry = originalCreateCharacter(entityId, position);
    if (entry?.collider) characters.set(entityId, entry.collider);
    return entry;
  };

  physics.removeCharacter = (entityId) => {
    characters.delete(entityId);
    return originalRemoveCharacter(entityId);
  };

  function makeRay(origin, direction) {
    const length = Math.hypot(
      Number(direction?.x) || 0,
      Number(direction?.y) || 0,
      Number(direction?.z) || 0,
    ) || 1;
    return new RAPIER.Ray(
      {
        x: Number(origin?.x) || 0,
        y: Number(origin?.y) || 0,
        z: Number(origin?.z) || 0,
      },
      {
        x: (Number(direction?.x) || 0) / length,
        y: (Number(direction?.y) || 0) / length,
        z: (Number(direction?.z) || 0) / length,
      },
    );
  }

  // Character colliders are upright capsules (half-height at most 0.45 m,
  // radius 0.32 m). The enclosing sphere cannot intersect a ray segment if
  // its closest-point distance is greater than 0.77 m. Skip expensive native
  // Collider.castRay calls in that case; the actual hit still uses Rapier.
  // Include a generous epsilon for floating point and collider pose reads.
  const MAX_CHARACTER_BOUND_SQUARED = (CHARACTER_HALF_HEIGHT + CHARACTER_RADIUS + 0.02) ** 2;

  function capsuleCanIntersectRay(ray, maxDistance, collider) {
    const center = collider.translation();
    const dx = center.x - ray.origin.x;
    const dy = center.y - ray.origin.y;
    const dz = center.z - ray.origin.z;
    const projection = dx * ray.dir.x + dy * ray.dir.y + dz * ray.dir.z;
    const t = Math.max(0, Math.min(maxDistance, projection));
    const x = dx - ray.dir.x * t;
    const y = dy - ray.dir.y * t;
    const z = dz - ray.dir.z * t;
    return x * x + y * y + z * z <= MAX_CHARACTER_BOUND_SQUARED;
  }

  function currentCharacterHit(ray, maxDistance, excludeEntityId = null) {
    let best = null;
    const maximum = Math.max(0, Number(maxDistance) || 0);
    for (const [entityId, collider] of characters) {
      if (entityId === excludeEntityId || !collider) continue;
      try {
        if (typeof collider.isValid === "function" && !collider.isValid()) continue;
        if (typeof collider.isEnabled === "function" && !collider.isEnabled()) continue;
        if (!capsuleCanIntersectRay(ray, maximum, collider)) continue;
        const distance = Number(collider.castRay(ray, maximum, true));
        if (!Number.isFinite(distance) || distance < 0 || distance > maximum) continue;
        if (best && distance >= best.distance) continue;
        best = {
          entityId,
          distance,
          colliderHandle: collider.handle ?? null,
          worldObject: null,
        };
      } catch {
        // A collider may disappear between entity removal and a query. Ignore it;
        // removeCharacter will delete the stale entry on the same game turn.
      }
    }
    return best;
  }

  physics.raycast = (origin, direction, maxDistance, excludeEntityId = null) => {
    exactRaycasts += 1;
    const ray = makeRay(origin, direction);
    const characterHit = currentCharacterHit(ray, maxDistance, excludeEntityId);
    // World queries deliberately exclude CharacterController colliders. Their
    // broad-phase proxies may be one physics step old while a shared dynamic
    // vehicle exists; direct Collider.castRay above always uses their current
    // Rapier pose. Static geometry and dynamic rigid bodies stay on Rapier's
    // world broad phase.
    const worldHit = physics.raycastWorld(origin, direction, maxDistance);
    if (characterHit && (!worldHit || characterHit.distance <= worldHit.distance)) {
      exactCharacterHits += 1;
      return characterHit;
    }
    return worldHit;
  };

  const VEHICLE_PIERCE_KINDS = new Set(["vehicle-chassis", "vehicle-ballast", "vehicle-presence"]);

  physics.lineOfSight = (from, to, excludeEntityId = null, targetEntityId = null, options = null) => {
    const dx = (Number(to?.x) || 0) - (Number(from?.x) || 0);
    const fromHeight = physics.characterAimHeight?.(excludeEntityId) ?? 1;
    const toHeight = physics.characterAimHeight?.(targetEntityId) ?? 1;
    const dy = (Number(to?.y) || 0) + toHeight - (Number(from?.y) || 0) - fromHeight;
    const dz = (Number(to?.z) || 0) - (Number(from?.z) || 0);
    const distance = Math.hypot(dx, dy, dz);
    if (distance < 0.001) return true;
    const pierceVehicles = Boolean(options?.pierceVehicles);
    const targetVehicleId = options?.targetVehicleId ?? null;
    const dirX = dx / distance;
    const dirY = dy / distance;
    const dirZ = dz / distance;
    let startOffset = 0;
    const maxSteps = pierceVehicles ? 8 : 1;
    for (let stepIdx = 0; stepIdx < maxSteps; stepIdx += 1) {
      const remaining = distance + 0.15 - startOffset;
      if (remaining <= 0.05) return true;
      const hit = physics.raycast(
        {
          x: (Number(from?.x) || 0) + dirX * startOffset,
          y: (Number(from?.y) || 0) + fromHeight + dirY * startOffset,
          z: (Number(from?.z) || 0) + dirZ * startOffset,
        },
        { x: dirX, y: dirY, z: dirZ },
        remaining,
        excludeEntityId,
      );
      if (!hit) return true;
      if (targetEntityId !== null && hit.entityId === targetEntityId) return true;
      const hitVehicleId = hit.worldObject?.vehicleId ?? hit.worldObject?.bodyId ?? null;
      if (targetVehicleId && hitVehicleId === targetVehicleId) return true;
      if (!pierceVehicles) return false;
      const hitKind = hit.worldObject?.kind ?? null;
      if (!VEHICLE_PIERCE_KINDS.has(hitKind)) return false;
      startOffset += Math.max(0.45, (Number(hit.distance) || 0) + 0.45);
    }
    return false;
  };

  if (originalStats) {
    physics.stats = () => ({
      ...originalStats(),
      liveCharacterQueries: true,
      liveCharacterCount: characters.size,
      exactRaycasts,
      exactCharacterHits,
    });
  }
}
