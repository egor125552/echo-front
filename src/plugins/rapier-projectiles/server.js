import { evaluateCoverProtection } from "../../game/crouch-squad-inventory.js";

export const MAX_PROJECTILE_POOL = 192;
export const PROJECTILE_MAX_STEP = 1 / 60;
export const DEFAULT_PROJECTILE_RADIUS = 0.004;
export const DEFAULT_PROJECTILE_MASS = 0.006;

export const WEAPON_FALLOFF_PROFILES = Object.freeze({
  pistol: Object.freeze({ fullRange: 10, maxRange: 28, minMultiplier: 0.4 }),
  rifle: Object.freeze({ fullRange: 12, maxRange: 28, minMultiplier: 0.45 }),
  marksman: Object.freeze({ fullRange: 20, maxRange: 92, minMultiplier: 0.38 }),
  sniper: Object.freeze({ fullRange: 25, maxRange: 155, minMultiplier: 0.35 }),
  "electro-rifle": Object.freeze({ fullRange: 250, maxRange: 280, minMultiplier: 1.0 }),
});

export function computeDistanceDamageMultiplier(distanceMeters, weaponId = null, weaponRange = null) {
  const dist = Math.max(0, Number(distanceMeters) || 0);
  const profile = weaponId ? WEAPON_FALLOFF_PROFILES[weaponId] : null;
  const maxRange = Math.max(1, Number(weaponRange) || profile?.maxRange || 30);
  const fullRange = profile ? Math.min(profile.fullRange, maxRange * 0.85) : maxRange * 0.3;
  const minMultiplier = profile ? profile.minMultiplier : 0.4;
  if (dist <= fullRange) return 1;
  const span = Math.max(1, maxRange - fullRange);
  const t = Math.max(0, Math.min(1, (dist - fullRange) / span));
  return Number((1 - (1 - minMultiplier) * t).toFixed(4));
}

export const manifest = {
  id: "rapier-projectiles",
  version: "1.3.0",
  requires: ["rapier-physics", "entities", "teams", "combat"],
  optional: ["battle-royale-vehicle", "battle-royale-vehicle-fleet"],
  capabilities: ["services.consume", "services.provide", "events.emit", "components.read"],
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

function projectileRadius(value) {
  return Math.max(0.002, Math.min(0.02, finite(value, DEFAULT_PROJECTILE_RADIUS)));
}

function projectileMass(value) {
  return Math.max(0.001, Math.min(0.03, finite(value, DEFAULT_PROJECTILE_MASS)));
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

  function applyPhysicalProfile(slot, spec = {}) {
    const radius = projectileRadius(spec.radius);
    const mass = projectileMass(spec.mass);
    slot.radius = radius;
    slot.mass = mass;
    try { slot.collider.setShape(new RAPIER.Ball(radius)); } catch {}
    try { slot.collider.setMass(mass); } catch {}
    try { slot.collider.setFriction(0); } catch {}
    try { slot.collider.setRestitution(0); } catch {}
    return { radius, mass };
  }

  function createSlot() {
    const index = slots.length;
    const bodyId = `projectile-pool:${index}`;
    const entry = physics.createDynamicCuboid(bodyId, {
      x: 0,
      y: -1000 - index,
      z: 0,
      hx: DEFAULT_PROJECTILE_RADIUS,
      hy: DEFAULT_PROJECTILE_RADIUS,
      hz: DEFAULT_PROJECTILE_RADIUS,
      mass: DEFAULT_PROJECTILE_MASS,
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
      originX: 0,
      originY: 0,
      originZ: 0,
      dirX: 0,
      dirY: 0,
      dirZ: -1,
      piercesVehicles: false,
      piercedVehicleCount: 0,
      radius: DEFAULT_PROJECTILE_RADIUS,
      mass: DEFAULT_PROJECTILE_MASS,
      lifetimeSeconds: 0,
      ageSeconds: 0,
      spawnedAt: 0,
      generation: 0,
      lastReason: "created",
    };
    applyPhysicalProfile(slot, slot);
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
    const physical = applyPhysicalProfile(slot, spec);
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

    const originX = finite(spec.origin?.x);
    const originY = finite(spec.origin?.y, 1);
    const originZ = finite(spec.origin?.z);
    slot.originX = originX;
    slot.originY = originY;
    slot.originZ = originZ;
    slot.dirX = direction.x;
    slot.dirY = direction.y;
    slot.dirZ = direction.z;
    slot.piercesVehicles = Boolean(spec.piercesVehicles || weaponId === "electro-rifle");
    slot.piercedVehicleCount = 0;

    setSlotEnabled(slot, true);
    slot.body.setTranslation({
      x: originX,
      y: originY,
      z: originZ,
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
      radius: physical.radius,
      mass: physical.mass,
      shape: "ball",
      poolIndex: slot.index,
      now: slot.spawnedAt,
    });
    return slot.projectileId;
  }

  function fallbackRagdollOwner(collider) {
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

  function vehicleOccupantForCollider(slot, otherHandle) {
    const shooterId = slot?.shooterId ?? null;
    const info = physics.colliderInfo?.(otherHandle);
    const object = info?.worldObject ?? null;
    if (!object || !["vehicle-chassis", "vehicle-ballast", "vehicle-presence"].includes(object.kind)) return null;
    const vehicleId = object.vehicleId ?? object.bodyId ?? null;
    if (!vehicleId || !ctx.services.has("vehicles")) return null;
    const vehicles = ctx.services.get("vehicles");
    const state = vehicles.stateFor?.(vehicleId) ?? null;
    const occupants = [state?.driverId ?? vehicles.driverId?.(vehicleId) ?? null, ...(state?.passengerIds ?? vehicles.passengerIds?.(vehicleId) ?? [])]
      .filter(Boolean);
    if (!occupants.length) return { vehicleId, targetId: null, hostile: [], multiplier: 0, kind: state?.kind ?? object.vehicleKind ?? null };
    const hostile = occupants.filter(id => id !== shooterId && teams.teamOf(id) !== teams.teamOf(shooterId));
    if (!hostile.length) return { vehicleId, targetId: null, hostile: [], multiplier: 0, kind: state?.kind ?? object.vehicleKind ?? null, friendlyBlocked: true };
    const seed = Math.abs(String(slot?.projectileId ?? "").split("").reduce((n, ch) => ((n * 33) ^ ch.charCodeAt(0)) | 0, 5381));
    const targetId = hostile[seed % hostile.length];
    const kind = state?.kind ?? object.vehicleKind ?? null;
    const multiplier = slot?.piercesVehicles ? 1 : (kind === "supercar" ? 0.5 : 0.35);
    return { vehicleId, targetId, hostile, multiplier, kind };
  }

  function advanceProjectilePastVehicle(slot, impactPos, vehicleId) {
    const dx = slot.dirX;
    const dy = slot.dirY;
    const dz = slot.dirZ;
    let exitPos = {
      x: impactPos.x + dx * 2.6,
      y: impactPos.y + dy * 2.6,
      z: impactPos.z + dz * 2.6,
    };
    if (typeof physics.raycast === "function") {
      for (let dist = 0.35; dist <= 6.0; dist += 0.3) {
        const probe = {
          x: impactPos.x + dx * dist,
          y: impactPos.y + dy * dist,
          z: impactPos.z + dz * dist,
        };
        const hit = physics.raycast(probe, { x: dx, y: dy, z: dz }, 0.32, slot.shooterId);
        const hitVid = hit?.worldObject?.vehicleId ?? hit?.worldObject?.bodyId ?? null;
        if (!hit || hitVid !== vehicleId) {
          exitPos = hit?.entityId
            ? probe
            : {
                x: probe.x + dx * 0.15,
                y: probe.y + dy * 0.15,
                z: probe.z + dz * 0.15,
              };
          break;
        }
      }
    }
    slot.piercedVehicleCount += 1;
    slot.body.setTranslation(exitPos, true);
    slot.body.setLinvel({
      x: dx * slot.speed,
      y: dy * slot.speed,
      z: dz * slot.speed,
    }, true);
    slot.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  function resolveContact(slot, otherHandle, now) {
    if (!slot?.active) return;
    if (slotsByCollider.has(otherHandle)) return;
    const other = typeof world.getCollider === "function" ? world.getCollider(otherHandle) : null;
    let targetId = physics.entityIdForCollider?.(other ?? otherHandle) ?? null;
    if (!targetId && other) targetId = fallbackRagdollOwner(other);
    if (targetId && targetId === slot.shooterId) return;
    const vehicleHit = !targetId ? vehicleOccupantForCollider(slot, otherHandle) : null;
    if (vehicleHit?.targetId) targetId = vehicleHit.targetId;
    if (targetId === slot.shooterId && !vehicleHit?.vehicleId) return;

    const position = slot.body.translation();
    const velocity = slot.body.linvel();
    const impactX = finite(position?.x);
    const impactY = finite(position?.y);
    const impactZ = finite(position?.z);

    // Vehicle-piercing weapon hitting an empty/parked car hull punches straight through it!
    if (
      slot.piercesVehicles
      && vehicleHit?.vehicleId
      && !vehicleHit.targetId
      && !vehicleHit.friendlyBlocked
      && slot.piercedVehicleCount < 3
    ) {
      ctx.events.emit("sound:spatial", {
        entityId: slot.shooterId,
        key: "armor.hit",
        surface: "metal",
        x: impactX,
        y: impactY,
        z: impactZ,
        radius: 65,
      });
      advanceProjectilePastVehicle(slot, { x: impactX, y: impactY, z: impactZ }, vehicleHit.vehicleId);
      return;
    }

    const target = targetId ? entities.get(targetId) : null;
    const sameTeam = targetId
      ? teams.teamOf(slot.shooterId) === teams.teamOf(targetId)
      : Boolean(vehicleHit?.friendlyBlocked);
    let damaged = false;
    let damageResult = null;
    const travelDistance = Math.hypot(
      impactX - slot.originX,
      impactY - slot.originY,
      impactZ - slot.originZ,
    );
    const distanceMultiplier = computeDistanceDamageMultiplier(travelDistance, slot.weaponId, slot.range);
    const vehicleMultiplier = vehicleHit?.targetId ? vehicleHit.multiplier : 1;
    const totalMultiplier = distanceMultiplier * vehicleMultiplier;
    const damageAmount = slot.damage > 0
      ? Math.max(1, Math.round(slot.damage * totalMultiplier))
      : 0;

    let blockedByCover = false;
    if (target?.alive && targetId !== slot.shooterId && !sameTeam) {
      const targetTransform = ctx.components.get(targetId, "Transform");
      const shooterTransform = ctx.components.get(slot.shooterId, "Transform");
      const rawCoverCheck = evaluateCoverProtection({
        targetTransform,
        shooterTransform,
        projectileId: slot.projectileId,
      });
      // Vehicle-piercing rounds shred straight through vehicle cover!
      const pierceCover = Boolean(slot.piercesVehicles && rawCoverCheck.coverKind === "vehicle");
      const coverCheck = pierceCover
        ? { ...rawCoverCheck, blockedByCover: false, damageScale: 1 }
        : rawCoverCheck;
      if (coverCheck.blockedByCover) {
        blockedByCover = true;
        ctx.events.emit("tactics:cover-blocked", {
          targetId,
          shooterId: slot.shooterId,
          weaponId: slot.weaponId,
          inCover: coverCheck.inCover,
          coverKind: coverCheck.coverKind,
          ricochetMaterial: coverCheck.ricochetMaterial,
          x: impactX,
          y: impactY,
          z: impactZ,
          now,
        });
        if (coverCheck.inCover) {
          ctx.events.emit("sound:spatial", {
            entityId: targetId,
            key: "armor.hit",
            surface: coverCheck.ricochetMaterial ?? "concrete",
            x: impactX,
            y: impactY,
            z: impactZ,
            radius: 42,
          });
        }
      } else {
        const finalDamage = damageAmount > 0
          ? Math.max(1, Math.round(damageAmount * coverCheck.damageScale))
          : 0;
        const targetsToHit = (slot.piercesVehicles && vehicleHit?.hostile?.length > 1)
          ? vehicleHit.hostile
          : [targetId];
        if (slot.piercesVehicles && vehicleHit?.vehicleId) {
          ctx.events.emit("sound:spatial", {
            entityId: slot.shooterId,
            key: "armor.break",
            surface: "metal",
            x: impactX,
            y: impactY,
            z: impactZ,
            radius: 75,
          });
        }
        for (const hitTargetId of targetsToHit) {
          const hitEntity = entities.get(hitTargetId);
          if (!hitEntity?.alive) continue;
          const res = combat.damage(hitTargetId, finalDamage, {
            attackerId: slot.shooterId,
            weaponId: slot.weaponId,
            projectileId: slot.projectileId,
            distance: travelDistance,
            distanceMultiplier,
            crouchMitigated: coverCheck.crouching,
            inCover: coverCheck.inCover,
            vehiclePierced: Boolean(slot.piercesVehicles && vehicleHit?.vehicleId),
            now,
          });
          if (hitTargetId === targetId) damageResult = res;
          if ((Number(res?.applied) || 0) > 0 || (Number(res?.armorAbsorbed) || 0) > 0) {
            damaged = true;
          }
        }
        hitTotal += 1;
      }
    } else if (!targetId) {
      worldImpactTotal += 1;
    }

    ctx.events.emit("projectile:impact", {
      projectileId: slot.projectileId,
      shooterId: slot.shooterId,
      targetId,
      vehicleId: vehicleHit?.vehicleId ?? null,
      vehicleKind: vehicleHit?.kind ?? null,
      vehiclePierced: Boolean(slot.piercesVehicles && vehicleHit?.vehicleId),
      damageMultiplier: totalMultiplier,
      distanceMultiplier,
      distance: travelDistance,
      weaponId: slot.weaponId,
      damaged,
      blockedByCover,
      friendBlocked: Boolean(sameTeam),
      x: impactX,
      y: impactY,
      z: impactZ,
      speed: Math.hypot(finite(velocity?.x), finite(velocity?.y), finite(velocity?.z)),
      radius: slot.radius,
      mass: slot.mass,
      shape: "ball",
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
        radius: slot.radius,
        mass: slot.mass,
        shape: "ball",
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
        projectileShape: "ball",
        gravityDriven: true,
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
