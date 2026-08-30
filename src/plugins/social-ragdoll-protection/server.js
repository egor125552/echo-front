export const manifest = {
  id: "social-ragdoll-protection",
  version: "1.0.0",
  requires: ["social", "health", "battle-royale-fleet-pedestrian-ragdoll"],
  capabilities: ["services.consume", "events.on", "events.emit"],
};

const FRIEND_VEHICLE_PROTECTION_MS = 6500;

export async function setup(ctx) {
  const social = ctx.services.get("social");
  const health = ctx.services.get("health");
  const recentVehicleHits = new Map();

  ctx.events.on("ragdoll:fleet-vehicle-hit", ({ entityId, driverId, now } = {}) => {
    if (!entityId || !driverId) return;
    recentVehicleHits.set(entityId, {
      driverId,
      expiresAt: (Number(now) || Date.now()) + FRIEND_VEHICLE_PROTECTION_MS,
    });
  });

  ctx.events.on("ragdoll:ended", ({ entityId } = {}) => recentVehicleHits.delete(entityId));
  ctx.events.on("entity:removed", ({ entityId } = {}) => recentVehicleHits.delete(entityId));

  const originalApplyDamage = health.applyDamage.bind(health);
  health.applyDamage = (targetId, amount, source = {}) => {
    if (source?.weaponId === "ragdoll-impact") {
      const recent = recentVehicleHits.get(targetId);
      const now = Number(source?.now) || Date.now();
      if (recent && now <= recent.expiresAt && social.isFriend(recent.driverId, targetId)) {
        ctx.events.emit("combat:friend-protected", {
          attackerId: recent.driverId,
          targetId,
          weaponId: "vehicle-ragdoll-impact",
          requested: amount,
          now,
        });
        return { applied: 0, killed: false, friendProtected: true };
      }
      if (recent && now > recent.expiresAt) recentVehicleHits.delete(targetId);
    }
    return originalApplyDamage(targetId, amount, source);
  };
}
