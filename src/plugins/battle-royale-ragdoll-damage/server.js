export const manifest = {
  id: "battle-royale-ragdoll-damage",
  version: "1.3.0",
  requires: ["health"],
  capabilities: ["services.consume", "services.provide", "events.on"],
};

const RAGDOLL_DAMAGE_INTERVAL_MS = 420;
const VEHICLE_CRASH_DAMAGE_INTERVAL_MS = 650;

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}

// Game-realistic injury curve built on the impact severity already measured from
// real Rapier velocity changes. Body-part sensitivity is already included by the
// ragdoll (head > torso > legs > arms/hands), so ordinary tumbles stay in the
// 5-15 HP range while genuinely extreme impacts can still be dangerous or fatal.
function damageForSeverity(severity) {
  const s = Math.max(0, Number(severity) || 0);
  if (s < 4) return 0;

  if (s < 14) return clamp(Math.round(5 + (s - 4)), 5, 15);
  if (s < 20) return Math.round(15 + (s - 14) * (10 / 6));
  if (s < 30) return Math.round(25 + (s - 20) * 2);
  if (s < 40) return Math.round(45 + (s - 30) * 2.5);
  return 100;
}

function vehicleCrashDamageForSeverity(severity) {
  const s = Math.max(0, Number(severity) || 0);
  const base = damageForSeverity(s);
  if (base <= 0) return 0;
  // The initial cabin trauma is only part of the injury. The actual ragdoll may
  // still add body-part damage on subsequent contacts with the world.
  const scale = clamp(0.58 + s / 120, 0.60, 0.82);
  return Math.min(80, Math.round(base * scale));
}

export async function setup(ctx) {
  const health = ctx.services.get("health");
  const latestImpact = new Map();
  const lastDamageAt = new Map();
  const lastVehicleCrashAt = new Map();
  let adjustedHits = 0;
  let adjustedDamage = 0;
  let throttledHits = 0;
  let vehicleCrashHits = 0;
  let vehicleCrashDamage = 0;
  let vehicleCrashThrottled = 0;

  ctx.events.on("ragdoll:impact", (impact = {}) => {
    if (!impact.entityId) return;
    latestImpact.set(impact.entityId, {
      severity: Number(impact.severity) || 0,
      deltaVelocity: Number(impact.deltaVelocity) || 0,
      part: impact.part ?? null,
      now: Number(impact.now) || Date.now(),
    });
  });

  ctx.events.on("vehicle:occupant-crash-trauma", (payload = {}) => {
    if (!payload.entityId || payload.impactSource !== "rapier-contact-force") return;
    const severity = Math.max(0, Number(payload.crashSeverity) || 0);
    const damage = vehicleCrashDamageForSeverity(severity);
    if (damage <= 0) return;
    const now = Number(payload.now) || Date.now();
    const previous = Number(lastVehicleCrashAt.get(payload.entityId)) || -Infinity;
    if (now - previous < VEHICLE_CRASH_DAMAGE_INTERVAL_MS) {
      vehicleCrashThrottled += 1;
      return;
    }
    lastVehicleCrashAt.set(payload.entityId, now);
    const result = health.applyDamage(payload.entityId, damage, {
      attackerId: null,
      weaponId: "vehicle-crash-force",
      now,
    });
    if ((Number(result.applied) || 0) > 0) vehicleCrashHits += 1;
    vehicleCrashDamage += Number(result.applied) || 0;
  });

  ctx.events.on("ragdoll:ended", ({ entityId }) => {
    latestImpact.delete(entityId);
    lastDamageAt.delete(entityId);
  });
  ctx.events.on("entity:removed", ({ entityId }) => {
    latestImpact.delete(entityId);
    lastDamageAt.delete(entityId);
    lastVehicleCrashAt.delete(entityId);
  });

  const originalApplyDamage = health.applyDamage.bind(health);
  health.applyDamage = (targetId, amount, source = {}) => {
    if (source?.weaponId !== "ragdoll-impact") {
      return originalApplyDamage(targetId, amount, source);
    }

    const impact = latestImpact.get(targetId);
    const adjusted = damageForSeverity(impact?.severity);
    if (adjusted <= 0) return { applied: 0, killed: false };

    const now = Number(source?.now) || Number(impact?.now) || Date.now();
    const previous = Number(lastDamageAt.get(targetId)) || -Infinity;
    if (now - previous < RAGDOLL_DAMAGE_INTERVAL_MS) {
      throttledHits += 1;
      return { applied: 0, killed: false };
    }
    lastDamageAt.set(targetId, now);

    const result = originalApplyDamage(targetId, adjusted, source);
    adjustedHits += result.applied > 0 ? 1 : 0;
    adjustedDamage += Number(result.applied) || 0;
    return result;
  };

  ctx.services.provide("ragdoll-damage-model", {
    damageForSeverity,
    vehicleCrashDamageForSeverity,
    estimate(impact = {}) {
      return {
        severity: Number(impact.severity) || 0,
        deltaVelocity: Number(impact.deltaVelocity) || 0,
        part: impact.part ?? null,
        damage: damageForSeverity(impact.severity),
      };
    },
    summary() {
      return {
        adjustedHits,
        adjustedDamage,
        throttledHits,
        vehicleCrashHits,
        vehicleCrashDamage,
        vehicleCrashThrottled,
        intervalMs: RAGDOLL_DAMAGE_INTERVAL_MS,
        vehicleCrashIntervalMs: VEHICLE_CRASH_DAMAGE_INTERVAL_MS,
        trackedImpacts: latestImpact.size,
      };
    },
  });
}
