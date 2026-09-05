export const MAX_PROJECTILE_POOL = 192;
export const PROJECTILE_MAX_STEP = 1 / 60;

export const manifest = {
  id: "rapier-projectiles",
  version: "1.1.0",
  requires: ["rapier-physics", "entities", "teams", "combat"],
  capabilities: ["services.consume", "services.provide", "events.emit"],
};

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function colliderHandle(colliderOrHandle) {
  if (Number.isFinite(Number(colliderOrHandle))) return Number(colliderOrHandle);
  const handle = Number(colliderOrHandle?.handle);
  return Number.isFinite(handle) ? handle : null;
}

function normalize3(direction = {}) {
  const x = finite(direction.x);
  const y = finite(direction.y);
  const z = finite(direction.z);
  const length = Math.hypot(x, y, z);
  if (!(length > 0.000001)) return null;
  return { x: x / length, y: y / length, z: z / length };
}

export async function setup(ctx) {
  const physics = ctx.services.get("physics");
  const entities = ctx.services.get("entities");
  const teams = ctx.services.get("teams");
  const combat = ctx.services.get("combat");
  const world = physics.world;
  const RAPIER = physics.RAPIER;

  const slots = [];
  const slotsByCollider = new Map();
  const colliderOwners = new Map();
  let shotSerial = 0;
  let activeCount = 0;
  let physicsStepCount = 0;
  let currentNow = Date.now();
  let spawnedTotal = 0;
  let hitTotal = 0;
  let worldImpactTotal = 0;
  let expiredTotal = 0;
  let recycledAtCapacity = 0;
  let peakActive = 0;
  let collisionEventsTotal = 0;

  const previousEntityIdForCollider = typeof physics.entityIdForCollider === "function"
    ? physics.entityIdForCollider.bind(physics)
    : null;
  const previousRegisterEntityCollider = typeof physics.registerEntityCollider === "function"
    ? physics.registerEntityCollider.bind(physics)
    : null;
  const previousUnregisterEntityCollider = typeof physics.unregisterEntityCollider === "function"
    ? physics.unregisterEntityCollider.bind(physics)
    : null;

  physics.entityIdForCollider = (colliderOrHandle) => {
    const handle = colliderHandle(colliderOrHandle);
    if (handle != null && colliderOwners.has(handle)) return colliderOwners.get(handle);
    return previousEntityIdForCollider?.(colliderOrHandle) ?? null;
  };

  physics.registerEntityCollider = (colliderOrHandle, entityId) => {
    const handle = colliderHandle(colliderOrHandle);
    if (handle == null || !entityId) return false;
    previousRegisterEntityCollider?.(colliderOrHandle, entityId);
    colliderOwners.set(handle, entityId);
    return true;
  };

  physics.unregisterEntityCollider = (colliderOrHandle) => {
    const handle = colliderHandle(colliderOrHandle);
    previousUnregisterEntityCollider?.(colliderOrHandle);
    if (handle == null) return false;
    return colliderOwners.delete(handle);
  };

  // Movement creates character colliders lazily as entities spawn. Register every
  // one in the shared resolver so a collision event can identify the actual entity
  // without any hand-written overlap or trajectory math.
  const originalCreateCharacter = physics.createCharacter.bind(physics);
  physics.createCharacter = (entityId, position) => {
    const entry = originalCreateCharacter(entityId, position);
    if (entry?.collider) physics.registerEntityCollider(entry.collider, entityId);
    return entry;
  };
  const originalRemoveCharacter = physics.removeCharacter.bind(physics);
  physics.removeCharacter = (entityId) => {
    for (const [handle, ownerId] of colliderOwners) {
      if (ownerId === entityId) colliderOwners.delete(handle);
    }
    return originalRemoveCharacter(entityId);
  };

  function setSlotEnabled(slot, enabled) {
    try { slot.body.setEnabled(Boolean(enabled)); } catch {}
    try { slot.collider.setEnabled(Boolean(enabled)); } catch {}
  }

  function createSlot() {
    const index = slots.length;
    const bodyId = `projectile-pool:${index}`;
    const entry = physics.createDynamicCuboid(bodyId, {
      x: 0,
      y: -1000 - index,
      z: 0,
      hx: 0.018,
      hy: 0.018,
      hz: 0.018,
      mass: 0.006,
      friction: 0,
      restitution: 0,
      linearDamping: 0,
      angularDamping: 0,
      canSleep: false,
      ccd: true,
      metadata: {
        kind: "projectile",
        projectilePoolIndex: index,
        material: "bullet",
        contactForceThreshold: Number.MAX_SAFE_INTEGER,
      },
    });
    const slot = {
      index,
      bodyId,
      body: entry.body,
      collider: entry.colliders[0],
      active: false,
      projectileId: null,
      shooterId: null,
      weaponId: null,
      damage: 0,
      speed: 0,
      range: 0,
      lifetimeSeconds: 0,
      ageSeconds: 0,
      spawnedAt: 0,
      generation: 0,
      lastReason: "created",
    };
    try {
      const activeEvents = Number(slot.collider.activeEvents?.()) || 0;
      slot.collider.setActiveEvents(activeEvents | RAPIER.ActiveEvents.COLLISION_EVENTS);
    } catch {}
    setSlotEnabled(slot, false);
    slots.push(slot);
    slotsByCollider.set(slot.collider.handle, slot);
    return slot;
  }

  function deactivate(slot, reason = "inactive") {
    if (!slot?.active) return false;
    slot.active = false;
    slot.lastReason = reason;
    activeCount = Math.max(0, activeCount - 1);
    try { slot.body.setLinvel({ x: 0, y: 0, z: 0 }, false); } catch {}
    try { slot.body.setAngvel({ x: 0, y: 0, z: 0 }, false); } catch {}
    setSlotEnabled(slot, false);
    if (reason === "expired") expiredTotal += 1;
    return true;
  }

  function acquireSlot() {
    const inactive = slots.find((slot) => !slot.active);
    if (inactive) return inactive;
    if (slots.length < MAX_PROJECTILE_POOL) return createSlot();

    let oldest = slots[0];
    for (const slot of slots) {
      if (slot.spawnedAt < oldest.spawnedAt) oldest = slot;
    }
    deactivate(oldest, "capacity-recycle");
    recycledAtCapacity += 1;
    return oldest;
  }

  function spawn(spec = {}) {
    const direction = normalize3(spec.direction);
    const shooterId = spec.shooterId ?? null;
    const weaponId = String(spec.weaponId ?? "unknown");
    const speed = Math.max(1, finite(spec.speed, 120));
    const range = Math.max(1, finite(spec.range, 28));
    if (!direction || !shooterId) return null;

    const slot = acquireSlot();
    slot.generation += 1;
    shotSerial += 1;
    slot.projectileId = `projectile:${shotSerial}`;
    slot.shooterId = shooterId;
    slot.weaponId = weaponId;
    slot.damage = Math.max(0, finite(spec.damage));
    slot.speed = speed;
    slot.range = range;
    slot.lifetimeSeconds = range / speed;
    slot.ageSeconds = 0;
    slot.spawnedAt = finite(spec.now, currentNow);
    slot.lastReason = "flying";

    setSlotEnabled(slot, true);
    slot.body.setTranslation({
      x: finite(spec.origin?.x),
      y: finite(spec.origin?.y, 1),
      z: finite(spec.origin?.z),
    }, true);
    slot.body.setLinvel({
      x: direction.x * speed,
      y: direction.y * speed,
      z: direction.z * speed,
    }, true);
    slot.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    slot.active = true;
    activeCount += 1;
    peakActive = Math.max(peakActive, activeCount);
    spawnedTotal += 1;

    ctx.events.emit("projectile:spawned", {
      projectileId: slot.projectileId,
      shooterId,
      weaponId,
      speed,
      range,
      poolIndex: slot.index,
      now: slot.spawnedAt,
    });
    return slot.projectileId;
  }

  function fallbackRagdollOwner(collider) {
    // battle-royale-ragdoll decorates physics.raycast with the owning entity for
    // its body-part colliders. A tiny Rapier ray originating at that collider's
    // own center is only an ownership lookup; collision and trajectory still come
    // exclusively from the CCD collision event that brought us here.
    if (!collider || typeof physics.raycast !== "function") return null;
    try {
      const p = collider.translation();
      const hit = physics.raycast(
        { x: finite(p?.x), y: finite(p?.y), z: finite(p?.z) },
        { x: 0, y: 1, z: 0 },
        0.002,
        null,
      );
      return hit?.colliderHandle === collider.handle ? (hit.entityId ?? null) : null;
    } catch {
      return null;
    }
  }

  function resolveContact(slot, otherHandle, now) {
    if (!slot?.active) return;
    if (slotsByCollider.has(otherHandle)) return;
    const other = typeof world.getCollider === "function" ? world.getCollider(otherHandle) : null;
    let targetId = physics.entityIdForCollider?.(other ?? otherHandle) ?? null;
    if (!targetId && other) targetId = fallbackRagdollOwner(other);
    const target = targetId ? entities.get(targetId) : null;
    const sameTeam = targetId
      ? teams.teamOf(slot.shooterId) === teams.teamOf(targetId)
      : false;
    let damaged = false;
    let damageResult = null;

    if (target?.alive && targetId !== slot.shooterId && !sameTeam) {
      damageResult = combat.damage(targetId, slot.damage, {
        attackerId: slot.shooterId,
        weaponId: slot.weaponId,
        projectileId: slot.projectileId,
        now,
      });
      damaged = Boolean((Number(damageResult?.applied) || 0) > 0
        || (Number(damageResult?.armorAbsorbed) || 0) > 0);
      hitTotal += 1;
    } else if (!targetId) {
      worldImpactTotal += 1;
    }

    const position = slot.body.translation();
    const velocity = slot.body.linvel();
    ctx.events.emit("projectile:impact", {
      projectileId: slot.projectileId,
      shooterId: slot.shooterId,
      targetId,
      weaponId: slot.weaponId,
      damaged,
      friendBlocked: Boolean(targetId && sameTeam),
      x: finite(position?.x),
      y: finite(position?.y),
      z: finite(position?.z),
      speed: Math.hypot(finite(velocity?.x), finite(velocity?.y), finite(velocity?.z)),
      ageSeconds: slot.ageSeconds,
      now,
    });
    deactivate(slot, "impact");
  }

  function handleCollisionEvent(handle1, handle2, started) {
    if (!started) return;
    const slot1 = slotsByCollider.get(handle1) ?? null;
    const slot2 = slotsByCollider.get(handle2) ?? null;
    if (!slot1 && !slot2) return;
    collisionEventsTotal += 1;
    if (slot1?.active && !slot2) resolveContact(slot1, handle2, currentNow);
    if (slot2?.active && !slot1) resolveContact(slot2, handle1, currentNow);
  }

  // Rapier's EventQueue is owned by the shared physics plugin. Intercept the
  // actual world.step call so the same queue can be drained for COLLISION_EVENTS
  // immediately after CCD solving, while leaving contact-force events for the
  // existing physics diagnostics to drain afterwards.
  const originalWorldStep = world.step.bind(world);
  world.step = (eventQueue) => {
    const result = originalWorldStep(eventQueue);
    if (eventQueue && typeof eventQueue.drainCollisionEvents === "function") {
      eventQueue.drainCollisionEvents((handle1, handle2, started) => {
        handleCollisionEvent(handle1, handle2, Boolean(started));
      });
    }
    return result;
  };

  function afterPhysicsStep(dt) {
    const safeDt = Math.max(0, Math.min(0.1, finite(dt)));
    physicsStepCount += 1;
    for (const slot of slots) {
      if (!slot.active) continue;
      slot.ageSeconds += safeDt;
      if (slot.ageSeconds >= slot.lifetimeSeconds) deactivate(slot, "expired");
    }
  }

  const originalPhysicsStep = physics.step.bind(physics);
  physics.step = (dt) => {
    const result = originalPhysicsStep(dt);
    afterPhysicsStep(dt);
    return result;
  };

  function activeSnapshot(limit = 8) {
    const result = [];
    for (const slot of slots) {
      if (!slot.active) continue;
      const position = slot.body.translation();
      const velocity = slot.body.linvel();
      result.push({
        projectileId: slot.projectileId,
        poolIndex: slot.index,
        shooterId: slot.shooterId,
        weaponId: slot.weaponId,
        ageSeconds: slot.ageSeconds,
        lifetimeSeconds: slot.lifetimeSeconds,
        x: finite(position?.x),
        y: finite(position?.y),
        z: finite(position?.z),
        vx: finite(velocity?.x),
        vy: finite(velocity?.y),
        vz: finite(velocity?.z),
      });
      if (result.length >= Math.max(1, Math.floor(finite(limit, 8)))) break;
    }
    return result;
  }

  const api = {
    spawn,
    beginFrame(now = Date.now()) { currentNow = finite(now, Date.now()); },
    hasActive() { return activeCount > 0; },
    activeCount() { return activeCount; },
    physicsStepCount() { return physicsStepCount; },
    maxPhysicsStep: PROJECTILE_MAX_STEP,
    activeSnapshot,
    stats() {
      return {
        engine: "rapier3d",
        collisionSource: "rapier-collision-events",
        pooled: true,
        poolSize: slots.length,
        poolCapacity: MAX_PROJECTILE_POOL,
        active: activeCount,
        peakActive,
        spawnedTotal,
        hitTotal,
        worldImpactTotal,
        expiredTotal,
        recycledAtCapacity,
        collisionEventsTotal,
        physicsStepCount,
      };
    },
  };

  ctx.services.provide("projectiles", api);
}
