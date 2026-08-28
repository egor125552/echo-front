export const manifest = {
  id: "battle-royale-ragdoll-damage",
  version: "1.0.0",
  requires: ["health"],
  capabilities: ["services.consume", "services.provide", "events.on"],
};

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

  // Ordinary hard ragdoll impacts: the range requested for normal gameplay.
  if (s < 14) return clamp(Math.round(5 + (s - 4)), 5, 15);

  // Severe impacts rise progressively instead of being hard-capped at 15 HP.
  // This keeps high falls and major head/torso impacts meaningfully dangerous.
  if (s < 20) return Math.round(15 + (s - 14) * (10 / 6));; // 15..25
  if (s < 30) return Math.round(25 + (s - 20) * 2);         // 25..45
  if (s < 40) return Math.round(45 + (s - 30) * 2.5);       // 45..70
  return 100;
}

export async function setup(ctx) {
  const health = ctx.services.get("health");
  const latestImpact = new Map();
  let adjustedHits = 0;
  let adjustedDamage = 0;

  ctx.events.on("ragdoll:impact", (impact = {}) => {
    if (!impact.entityId) return;
    latestImpact.set(impact.entityId, {
      severity: Number(impact.severity) || 0,
      deltaVelocity: Number(impact.deltaVelocity) || 0,
      part: impact.part ?? null,
      now: Number(impact.now) || Date.now(),
    });
  });

  const originalApplyDamage = health.applyDamage.bind(health);
  health.applyDamage = (targetId, amount, source = {}) => {
    if (source?.weaponId !== "ragdoll-impact") {
      return originalApplyDamage(targetId, amount, source);
    }

    const impact = latestImpact.get(targetId);
    const adjusted = damageForSeverity(impact?.severity);
    if (adjusted <= 0) return { applied: 0, killed: false };

    const result = originalApplyDamage(targetId, adjusted, source);
    adjustedHits += result.applied > 0 ? 1 : 0;
    adjustedDamage += Number(result.applied) || 0;
    return result;
  };

  ctx.services.provide("ragdoll-damage-model", {
    damageForSeverity,
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
        trackedImpacts: latestImpact.size,
      };
    },
  });
}
