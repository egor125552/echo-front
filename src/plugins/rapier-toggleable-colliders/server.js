export const manifest = {
  id: "rapier-toggleable-colliders",
  version: "1.0.0",
  requires: ["rapier-physics"],
  capabilities: ["services.consume"],
};

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function directionUnit(direction = {}) {
  const length = Math.hypot(finite(direction.x), finite(direction.y), finite(direction.z)) || 1;
  return {
    x: finite(direction.x) / length,
    y: finite(direction.y) / length,
    z: finite(direction.z) / length,
  };
}

export async function setup(ctx) {
  const physics = ctx.services.get("physics");
  const disabled = new Set();

  const originalSetWallEnabled = physics.setWallEnabled.bind(physics);
  const originalComputeColliderMovement = physics.controller.computeColliderMovement.bind(physics.controller);
  const originalRaycast = physics.raycast.bind(physics);
  const originalRaycastWorld = physics.raycastWorld.bind(physics);

  physics.setWallEnabled = (collider, enabled) => {
    if (!collider) return false;
    const desired = Boolean(enabled);
    if (desired) disabled.delete(collider.handle);
    else disabled.add(collider.handle);
    return originalSetWallEnabled(collider, desired);
  };

  // KinematicCharacterController accepts a predicate as its final argument.
  // Rapier may temporarily keep a disabled static collider in the broad-phase
  // when dynamic bodies exist, so filter it out explicitly on the same tick.
  physics.controller.computeColliderMovement = (
    collider,
    desiredTranslation,
    filterFlags,
    filterGroups,
    filterPredicate,
  ) => originalComputeColliderMovement(
    collider,
    desiredTranslation,
    filterFlags,
    filterGroups,
    (candidate) => (
      !disabled.has(candidate.handle)
      && (typeof filterPredicate !== "function" || filterPredicate(candidate))
    ),
  );

  function skipDisabled(original, origin, direction, maxDistance, trailingArgs = []) {
    const unit = directionUnit(direction);
    const total = Math.max(0, finite(maxDistance));
    let travelled = 0;
    let cursor = {
      x: finite(origin?.x),
      y: finite(origin?.y, 1),
      z: finite(origin?.z),
    };

    for (let attempt = 0; attempt < 16; attempt += 1) {
      const remaining = total - travelled;
      if (remaining <= 0.001) return null;
      const hit = original(cursor, direction, remaining, ...trailingArgs);
      if (!hit) return null;
      if (!disabled.has(hit.colliderHandle)) {
        return {
          ...hit,
          distance: travelled + finite(hit.distance),
        };
      }
      const advance = Math.max(0.04, finite(hit.distance) + 0.04);
      travelled += advance;
      cursor = {
        x: finite(origin?.x) + unit.x * travelled,
        y: finite(origin?.y, 1) + unit.y * travelled,
        z: finite(origin?.z) + unit.z * travelled,
      };
    }
    return null;
  }

  physics.raycastWorld = (origin, direction, maxDistance) => (
    skipDisabled(originalRaycastWorld, origin, direction, maxDistance)
  );
  physics.raycast = (origin, direction, maxDistance, excludeEntityId = null) => (
    skipDisabled(originalRaycast, origin, direction, maxDistance, [excludeEntityId])
  );

  // lineOfSight closes over the original raycast inside rapier-physics, so
  // replace it too to guarantee that open doors don't block shots/perception.
  physics.lineOfSight = (from, to, excludeEntityId = null, targetEntityId = null) => {
    const dx = finite(to?.x) - finite(from?.x);
    const dy = finite(to?.y) - finite(from?.y);
    const dz = finite(to?.z) - finite(from?.z);
    const distance = Math.hypot(dx, dy, dz);
    if (distance < 0.001) return true;
    const hit = physics.raycast(
      { x: finite(from?.x), y: finite(from?.y) + 1, z: finite(from?.z) },
      { x: dx, y: dy, z: dz },
      distance + 0.15,
      excludeEntityId,
    );
    if (!hit) return true;
    return targetEntityId !== null && hit.entityId === targetEntityId;
  };

  ctx.services.provide("toggleable-colliders", {
    isDisabled(colliderOrHandle) {
      const handle = typeof colliderOrHandle === "object" ? colliderOrHandle?.handle : colliderOrHandle;
      return disabled.has(handle);
    },
    disabledCount() {
      return disabled.size;
    },
  });
}
