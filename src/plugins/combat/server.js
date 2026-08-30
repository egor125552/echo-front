export const manifest = {
  id: "combat",
  version: "1.3.0",
  requires: ["health"],
  optional: ["social"],
  capabilities: ["services.consume", "services.provide", "events.emit"],
};

export async function setup(ctx) {
  const health = ctx.services.get("health");
  const social = ctx.services.has("social") ? ctx.services.get("social") : null;
  let armorVariant = 0;

  function emitFeedback(recipientId, key) {
    if (!recipientId) return;
    ctx.events.emit("feedback:sound", { recipientId, key });
  }

  ctx.services.provide("combat", {
    damage(targetId, amount, source = {}) {
      const attackerId = source.attackerId ?? null;
      const now = source.now ?? Date.now();

      if (attackerId && social?.isFriend(attackerId, targetId)) {
        ctx.events.emit("combat:friend-protected", {
          attackerId,
          targetId,
          weaponId: source.weaponId ?? null,
          requested: amount,
          now,
        });
        return {
          applied: 0,
          killed: false,
          armorAbsorbed: 0,
          armorBroke: false,
          spawnProtected: false,
          friendProtected: true,
        };
      }

      const packet = {
        targetId,
        amount,
        remaining: amount,
        attackerId,
        weaponId: source.weaponId ?? null,
        now,
        armorAbsorbed: 0,
        armorBroke: false,
        spawnProtected: false,
      };
      ctx.events.emit("combat:damage:before", packet);
      const result = health.applyDamage(targetId, packet.remaining, source);

      if (packet.armorAbsorbed > 0) {
        armorVariant = (armorVariant % 2) + 1;
        const armorHitKey = `armor.hit${armorVariant}`;

        if (packet.attackerId && !packet.spawnProtected) {
          emitFeedback(packet.attackerId, armorHitKey);
          if (packet.armorBroke) emitFeedback(packet.attackerId, "armor.break");
        }

        emitFeedback(targetId, armorHitKey);
        if (packet.armorBroke) emitFeedback(targetId, "armor.self-break");
      } else if (result.applied > 0) {
        if (packet.attackerId && !packet.spawnProtected) {
          emitFeedback(packet.attackerId, "hit.enemy");
        }
        emitFeedback(targetId, "hit.player");
      }

      if (result.killed) {
        if (packet.attackerId) emitFeedback(packet.attackerId, "enemy.killed");
        emitFeedback(targetId, "death.full");
      }

      const outcome = {
        ...result,
        armorAbsorbed: packet.armorAbsorbed,
        armorBroke: packet.armorBroke,
        spawnProtected: packet.spawnProtected,
        friendProtected: false,
      };
      ctx.events.emit("combat:damage", {
        targetId,
        attackerId: packet.attackerId,
        weaponId: packet.weaponId,
        requested: amount,
        healthApplied: result.applied,
        armorAbsorbed: packet.armorAbsorbed,
        armorBroke: packet.armorBroke,
        spawnProtected: packet.spawnProtected,
        friendProtected: false,
        killed: result.killed,
        now: packet.now,
      });
      return outcome;
    },
  });
}
