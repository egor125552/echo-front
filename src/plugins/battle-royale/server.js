export const DEPLOYMENT_DURATION_MS = 0;
export const INITIAL_ZONE_RADIUS = 360;
export const FINAL_ZONE_RADIUS = 35;
export const ZONE_GRACE_MS = 45_000;
export const ZONE_SHRINK_MS = 9 * 60_000;
export const ZONE_DAMAGE_PER_SECOND = 12;
export const REMAINING_THRESHOLDS = [75, 50, 25, 10, 5, 2, 1];

export const manifest = {
  id: "battle-royale",
  version: "1.1.0",
  requires: ["entities", "health", "movement", "map-test-arena"],
  capabilities: ["services.consume", "services.provide", "components.read", "events.on", "events.emit"],
};

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

export async function setup(ctx) {
  const entities = ctx.services.get("entities");
  const health = ctx.services.get("health");
  let phase = "waiting";
  let deploymentStartedAt = 0;
  let deploymentCompletedAt = 0;
  let deploymentInProgress = false;
  let zoneClockStartedAt = 0;
  let startedAt = 0;
  let endedAt = 0;
  let winnerId = null;
  let total = 0;
  let lastZoneDamageAt = 0;
  let zoneClosingAnnounced = false;
  let previousAlive = 0;
  const announced = new Set();
  const placements = new Map();
  const landedHumans = new Set();

  function aliveEntities() {
    return entities.all().filter((entity) => entity.alive);
  }

  function aliveHumans() {
    return entities.all().filter((entity) => (
      entity.alive && !entity.bot && entity.kind === "human"
    ));
  }

  function zoneRadiusAt(now = Date.now()) {
    if (!zoneClockStartedAt || now <= zoneClockStartedAt + ZONE_GRACE_MS) return INITIAL_ZONE_RADIUS;
    const progress = clamp01((now - zoneClockStartedAt - ZONE_GRACE_MS) / ZONE_SHRINK_MS);
    return INITIAL_ZONE_RADIUS + (FINAL_ZONE_RADIUS - INITIAL_ZONE_RADIUS) * progress;
  }

  function status(now = Date.now()) {
    const alive = aliveEntities().length;
    return {
      mode: "battle-royale",
      phase,
      alive,
      total,
      deploymentEndsAt: null,
      deployment: {
        active: deploymentInProgress,
        startedAt: deploymentStartedAt || null,
        completedAt: deploymentCompletedAt || null,
      },
      startedAt: startedAt || null,
      ended: phase === "ended",
      endedAt: endedAt || null,
      winnerId,
      zone: {
        x: 0,
        z: 0,
        radius: zoneRadiusAt(now),
        graceEndsAt: zoneClockStartedAt ? zoneClockStartedAt + ZONE_GRACE_MS : null,
      },
    };
  }

  function emitRemaining(alive) {
    for (const threshold of REMAINING_THRESHOLDS) {
      if (alive <= threshold && previousAlive > threshold && !announced.has(threshold)) {
        announced.add(threshold);
        ctx.events.emit("battle-royale:remaining", { alive, threshold });
      }
    }
    previousAlive = alive;
  }

  function finish(now = Date.now()) {
    if (phase === "ended") return;
    const survivors = aliveEntities();
    if (survivors.length > 1) return;
    phase = "ended";
    endedAt = now;
    winnerId = survivors[0]?.id ?? null;
    if (winnerId) placements.set(winnerId, 1);
    ctx.events.emit("battle-royale:ended", {
      winnerId,
      alive: survivors.length,
      total,
      endedAt,
    });
  }

  function completeDeployment(now = Date.now()) {
    if (!deploymentInProgress) return false;
    const humans = aliveHumans();
    if (humans.length > 0 && !humans.every((entity) => landedHumans.has(entity.id))) return false;
    deploymentInProgress = false;
    deploymentCompletedAt = now;
    zoneClockStartedAt = now;
    lastZoneDamageAt = 0;
    ctx.events.emit("battle-royale:deployment-complete", {
      completedAt: now,
      durationMs: Math.max(0, now - deploymentStartedAt),
    });
    return true;
  }

  function arm(now = Date.now()) {
    if (phase !== "waiting") return status(now);
    total = entities.all().length;
    previousAlive = aliveEntities().length;
    startedAt = now;
    deploymentStartedAt = now;
    deploymentCompletedAt = 0;
    deploymentInProgress = true;
    zoneClockStartedAt = 0;
    landedHumans.clear();
    phase = "active";
    ctx.events.emit("battle-royale:deployment", {
      total,
      deploymentEndsAt: null,
      durationMs: 0,
      immediate: true,
      startedAt: now,
    });
    ctx.events.emit("battle-royale:started", {
      total,
      startedAt: now,
      deployment: true,
      zone: { x: 0, z: 0, radius: INITIAL_ZONE_RADIUS },
    });
    return status(now);
  }

  function applyZone(now) {
    if (phase !== "active" || !zoneClockStartedAt || now < zoneClockStartedAt + ZONE_GRACE_MS) return;
    if (lastZoneDamageAt && now - lastZoneDamageAt < 1000) return;
    lastZoneDamageAt = now;
    const radius = zoneRadiusAt(now);
    for (const entity of aliveEntities()) {
      const transform = ctx.components.get(entity.id, "Transform");
      if (!transform) continue;
      const distance = Math.hypot(transform.x, transform.z);
      if (distance <= radius) continue;
      const result = health.applyDamage(entity.id, ZONE_DAMAGE_PER_SECOND, {
        attackerId: null,
        weaponId: "zone",
        now,
      });
      if (result.killed) ctx.events.emit("feedback:sound", { recipientId: entity.id, key: "death.full" });
      if (!entity.bot) {
        ctx.events.emit("battle-royale:zone-damage", {
          entityId: entity.id,
          distance,
          radius,
        });
      }
    }
  }

  function tick(now = Date.now()) {
    if (phase === "active" && !zoneClosingAnnounced && zoneClockStartedAt && now >= zoneClockStartedAt + ZONE_GRACE_MS) {
      zoneClosingAnnounced = true;
      ctx.events.emit("battle-royale:zone-closing", {
        startedAt: now,
        radius: zoneRadiusAt(now),
      });
    }
    applyZone(now);
    if (phase === "active") finish(now);
  }

  ctx.events.on("parachute:landed", ({ entityId, now }) => {
    const entity = entities.get(entityId);
    if (!entity || entity.bot || entity.kind !== "human") return;
    landedHumans.add(entityId);
    completeDeployment(Number(now) || Date.now());
  });

  ctx.events.on("entity:died", ({ entityId, killerId }) => {
    if (phase !== "active") return;
    const alive = aliveEntities().length;
    const placement = alive + 1;
    placements.set(entityId, placement);
    ctx.events.emit("battle-royale:eliminated", { entityId, killerId, alive, placement, total });
    emitRemaining(alive);
    if (deploymentInProgress) completeDeployment(Date.now());
    finish(Date.now());
  });

  ctx.services.provide("battle-royale", {
    arm,
    tick,
    status,
    zoneRadiusAt,
    placementOf(entityId) { return placements.get(entityId) ?? null; },
    canAct() { return phase === "active"; },
    isActive() { return phase === "active"; },
    zoneSteeringTarget(entityId, now = Date.now()) {
      const transform = ctx.components.get(entityId, "Transform");
      if (!transform || phase !== "active") return null;
      const radius = zoneRadiusAt(now);
      const distance = Math.hypot(transform.x, transform.z);
      if (distance < radius * 0.82) return null;
      return { x: 0, y: 0, z: 0, distance, radius };
    },
  });
}
