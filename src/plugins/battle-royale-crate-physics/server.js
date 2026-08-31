export const CRATE_HALF_X = 0.72;
export const CRATE_HALF_Z = 0.52;
export const CRATE_HEIGHT = 0.72;
export const CRATE_MASS = 72;
export const CRATE_PUSH_FORCE = 620;
export const CRATE_MAX_PUSH_SPEED = 2.15;
export const CRATE_PUSH_DISTANCE = 2.25;
export const CRATE_PUSH_CONE_DOT = 0.42;

export const manifest = {
  id: "battle-royale-crate-physics",
  version: "2.0.0",
  requires: ["rapier-physics", "map-test-arena"],
  capabilities: ["services.consume", "services.provide", "events.emit"],
};

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function horizontalSpeed(state) {
  return Math.hypot(finite(state?.linvel?.x), finite(state?.linvel?.z));
}

function totalSpeed(state) {
  return Math.hypot(
    finite(state?.linvel?.x),
    finite(state?.linvel?.y),
    finite(state?.linvel?.z),
  );
}

function forwardVector(angle) {
  return {
    x: Math.sin(finite(angle)),
    z: -Math.cos(finite(angle)),
  };
}

export async function setup(ctx) {
  const physics = ctx.services.get("physics");
  const map = ctx.services.get("map");
  const crates = Array.isArray(map.crates) ? map.crates : [];
  const byId = new Map();
  const byBodyId = new Map();
  const impactCooldown = new Map();
  const preStepStates = new Map();
  let contactCursor = Number(physics.contactForceCursor?.()) || 0;

  physics.beginBatch?.();
  try {
    for (const crate of crates) {
      if (!crate?.id) continue;

      // Older versions gave each loot crate a static wall collider. Remove it
      // before creating the real rigid body so there is no invisible duplicate
      // pinning the new movable crate in place.
      if (crate.collider) {
        try { physics.removeWall?.(crate.collider); } catch {}
        crate.collider = null;
      }

      const bodyId = `loot-crate:${crate.id}`;
      const baseY = finite(crate.y);
      const entry = physics.createDynamicCuboid(bodyId, {
        x: finite(crate.x),
        y: baseY + CRATE_HEIGHT / 2,
        z: finite(crate.z),
        hx: CRATE_HALF_X,
        hy: CRATE_HEIGHT / 2,
        hz: CRATE_HALF_Z,
        mass: CRATE_MASS,
        friction: 0.52,
        restitution: 0.055,
        linearDamping: 0.24,
        angularDamping: 0.9,
        canSleep: true,
        ccd: false,
        metadata: {
          kind: "loot-crate",
          crateId: crate.id,
          material: "metal",
          accessibleName: "металлический ящик",
          interactionHint: "Удерживайте E и идите вперёд, чтобы толкать. Нажмите E, чтобы открыть",
          contactForceThreshold: 120,
        },
      });

      crate.bodyId = bodyId;
      crate.collider = entry?.colliders?.[0] ?? null;
      crate.hx = CRATE_HALF_X;
      crate.hz = CRATE_HALF_Z;
      crate.height = CRATE_HEIGHT;
      crate.material = "metal";
      byId.set(crate.id, crate);
      byBodyId.set(bodyId, crate);
    }
  } finally {
    physics.endBatch?.();
  }

  function syncCrate(crate) {
    if (!crate?.bodyId) return null;
    const state = physics.dynamicBodyState(crate.bodyId);
    if (!state) return null;
    crate.x = state.x;
    crate.y = state.y - CRATE_HEIGHT / 2;
    crate.z = state.z;
    crate.rotation = state.rotation;
    crate.linvel = state.linvel;
    crate.angvel = state.angvel;
    return state;
  }

  function syncAll() {
    for (const crate of byId.values()) syncCrate(crate);
  }

  function candidateFor(actor, requestedCrateId = null) {
    if (!actor) return null;
    const forward = forwardVector(actor.angle);
    let best = null;
    for (const crate of byId.values()) {
      if (requestedCrateId && crate.id !== requestedCrateId) continue;
      const state = syncCrate(crate);
      if (!state) continue;
      const dx = state.x - finite(actor.x);
      const dz = state.z - finite(actor.z);
      const centerDistance = Math.hypot(dx, dz);
      if (centerDistance > CRATE_PUSH_DISTANCE) continue;
      if (Math.abs((state.y - CRATE_HEIGHT / 2) - finite(actor.y)) > 1.3) continue;
      const facing = centerDistance > 0.001
        ? (dx * forward.x + dz * forward.z) / centerDistance
        : 1;
      if (facing < CRATE_PUSH_CONE_DOT) continue;
      const score = centerDistance + (1 - facing) * 0.75;
      if (!best || score < best.score) best = { crate, state, score, facing };
    }
    return best;
  }

  function applyPush(crateId, actor, forwardAmount = 1, dt = 1 / 60) {
    const candidate = candidateFor(actor, crateId);
    if (!candidate) return null;
    const { crate } = candidate;
    const body = physics.dynamicBody(crate.bodyId);
    const before = physics.dynamicBodyState(crate.bodyId);
    if (!body || !before) return null;

    const direction = forwardVector(actor.angle);
    const amount = clamp(forwardAmount, 0, 1);
    const along = finite(before.linvel.x) * direction.x + finite(before.linvel.z) * direction.z;
    const forceScale = along >= CRATE_MAX_PUSH_SPEED
      ? 0
      : clamp(1 - Math.max(0, along) / CRATE_MAX_PUSH_SPEED, 0.18, 1);
    const force = CRATE_PUSH_FORCE * amount * forceScale;

    if (force > 0) {
      const vector = { x: direction.x * force, y: 0, z: direction.z * force };
      if (typeof body.addForce === "function") body.addForce(vector, true);
      else body.applyImpulse?.({
        x: vector.x * Math.max(0.001, finite(dt, 1 / 60)),
        y: 0,
        z: vector.z * Math.max(0.001, finite(dt, 1 / 60)),
      }, true);
    }

    // Do not let a held interaction turn the crate into a hockey puck. External
    // hits (vehicles, falls) stay free; this cap only trims excessive horizontal
    // speed while the player is actively pushing it.
    const speed = horizontalSpeed(before);
    if (speed > CRATE_MAX_PUSH_SPEED * 1.18 && typeof body.setLinvel === "function") {
      const scale = (CRATE_MAX_PUSH_SPEED * 1.18) / speed;
      body.setLinvel({
        x: finite(before.linvel.x) * scale,
        y: finite(before.linvel.y),
        z: finite(before.linvel.z) * scale,
      }, true);
    }

    return {
      crateId: crate.id,
      bodyId: crate.bodyId,
      x: before.x,
      y: before.y - CRATE_HEIGHT / 2,
      z: before.z,
      speed: horizontalSpeed(before),
      force,
      material: "metal",
    };
  }

  function capturePreStep() {
    preStepStates.clear();
    for (const crate of byId.values()) {
      const state = physics.dynamicBodyState(crate.bodyId);
      if (state) preStepStates.set(crate.bodyId, state);
    }
  }

  function bodyIdsFromContact(record) {
    const ids = [];
    for (const info of [record?.collider1, record?.collider2]) {
      const bodyId = info?.worldObject?.bodyId;
      if (bodyId && byBodyId.has(bodyId)) ids.push(bodyId);
    }
    return [...new Set(ids)];
  }

  function otherContactInfo(record, bodyId) {
    const first = record?.collider1;
    const second = record?.collider2;
    if (first?.worldObject?.bodyId === bodyId) return second ?? null;
    return first ?? null;
  }

  function impactTier(forceRatio, energy) {
    if (forceRatio >= 18 || energy >= 95) return "hard";
    if (forceRatio >= 7 || energy >= 28) return "medium";
    return "light";
  }

  function afterPhysics(now = Date.now()) {
    syncAll();
    const newestCursor = Number(physics.contactForceCursor?.()) || contactCursor;
    const records = (physics.contactForces?.(256, { impactsOnly: true }) ?? [])
      .filter((record) => (Number(record.sequence) || 0) > contactCursor);
    contactCursor = Math.max(contactCursor, newestCursor);

    for (const record of records) {
      const force = Math.max(0, finite(record.totalForceMagnitude));
      if (force < 900) continue;
      for (const bodyId of bodyIdsFromContact(record)) {
        const crate = byBodyId.get(bodyId);
        const before = preStepStates.get(bodyId);
        const current = physics.dynamicBodyState(bodyId);
        if (!crate || !current) continue;

        const other = otherContactInfo(record, bodyId);
        const otherKind = String(other?.worldObject?.kind ?? "");
        const vehicleHit = otherKind.startsWith("vehicle-");
        const speedBefore = totalSpeed(before);
        const speedAfter = totalSpeed(current);
        const speedLoss = Math.max(0, speedBefore - speedAfter);
        if (!vehicleHit && speedBefore < 0.16 && speedLoss < 0.08) continue;

        const previousImpactAt = finite(impactCooldown.get(crate.id), -Infinity);
        if (now - previousImpactAt < 170) continue;

        const mass = Math.max(1, finite(current.mass, CRATE_MASS));
        const forceRatio = force / (mass * 9.81);
        const energy = 0.5 * mass * speedBefore * speedBefore;
        const tier = impactTier(forceRatio, energy);
        const intensity = clamp(
          0.18 + Math.sqrt(Math.max(0, forceRatio)) / 8 + Math.sqrt(Math.max(0, energy)) / 34,
          0.18,
          1,
        );
        impactCooldown.set(crate.id, now);
        ctx.events.emit("crate:impact", {
          crateId: crate.id,
          bodyId,
          material: "metal",
          targetKind: otherKind || null,
          targetMaterial: other?.worldObject?.material ?? null,
          tier,
          intensity,
          contactForceMagnitude: force,
          forceRatio,
          impactEnergy: energy,
          speedBefore,
          speedAfter,
          x: current.x,
          y: current.y - CRATE_HEIGHT / 2,
          z: current.z,
          now,
        });
      }
    }
  }

  syncAll();

  ctx.services.provide("crate-physics", {
    constants: {
      halfX: CRATE_HALF_X,
      halfZ: CRATE_HALF_Z,
      height: CRATE_HEIGHT,
      mass: CRATE_MASS,
      pushForce: CRATE_PUSH_FORCE,
      maxPushSpeed: CRATE_MAX_PUSH_SPEED,
      pushDistance: CRATE_PUSH_DISTANCE,
    },
    crates() { return [...byId.values()]; },
    crate(crateId) { return byId.get(crateId) ?? null; },
    state(crateId) {
      const crate = byId.get(crateId);
      return crate ? syncCrate(crate) : null;
    },
    nearestPushable(actor) {
      const candidate = candidateFor(actor);
      if (!candidate) return null;
      return {
        crateId: candidate.crate.id,
        x: candidate.state.x,
        y: candidate.state.y - CRATE_HEIGHT / 2,
        z: candidate.state.z,
        distance: candidate.score,
        material: "metal",
      };
    },
    applyPush,
    capturePreStep,
    afterPhysics,
    syncAll,
  });
}
