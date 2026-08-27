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

  function currentCharacterHit(ray, maxDistance, excludeEntityId = null) {
    let best = null;
    const maximum = Math.max(0, Number(maxDistance) || 0);
    for (const [entityId, collider] of characters) {
      if (entityId === excludeEntityId || !collider) continue;
      try {
        if (typeof collider.isValid === "function" && !collider.isValid()) continue;
        if (typeof collider.isEnabled === "function" && !collider.isEnabled()) continue;
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

  physics.lineOfSight = (from, to, excludeEntityId = null, targetEntityId = null) => {
    const dx = (Number(to?.x) || 0) - (Number(from?.x) || 0);
    const dy = (Number(to?.y) || 0) - (Number(from?.y) || 0);
    const dz = (Number(to?.z) || 0) - (Number(from?.z) || 0);
    const distance = Math.hypot(dx, dy, dz);
    if (distance < 0.001) return true;
    const hit = physics.raycast(
      {
        x: Number(from?.x) || 0,
        y: (Number(from?.y) || 0) + 1,
        z: Number(from?.z) || 0,
      },
      { x: dx, y: dy, z: dz },
      distance + 0.15,
      excludeEntityId,
    );
    if (!hit) return true;
    return targetEntityId !== null && hit.entityId === targetEntityId;
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
