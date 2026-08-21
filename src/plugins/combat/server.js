export const manifest = {
  id: "combat",
  version: "1.0.0",
  requires: ["health"],
  capabilities: ["services.consume", "services.provide", "events.emit"],
};

export async function setup(ctx) {
  const health = ctx.services.get("health");
  let armorVariant = 0;

  ctx.services.provide("combat", {
    damage(targetId, amount, source = {}) {
      const packet = {
        targetId,
        amount,
        remaining: amount,
        attackerId: source.attackerId ?? null,
        weaponId: source.weaponId ?? null,
        now: source.now ?? Date.now(),
        armorAbsorbed: 0,
        armorBroke: false,
        spawnProtected: false,
      };
      ctx.events.emit("combat:damage:before", packet);
      const result = health.applyDamage(targetId, packet.remaining, source);

      if (packet.attackerId && !packet.spawnProtected) {
        if (packet.armorAbsorbed > 0) {
          armorVariant = (armorVariant % 2) + 1;
          ctx.events.emit("feedback:sound", {
            recipientId: packet.attackerId,
            key: `armor.hit${armorVariant}`,
          });
          if (packet.armorBroke) {
            ctx.events.emit("feedback:sound", {
              recipientId: packet.attackerId,
              key: "armor.break",
            });
          }
        } else if (result.applied > 0) {
          ctx.events.emit("feedback:sound", {
            recipientId: packet.attackerId,
            key: "hit.enemy",
          });
        }
      }

      if (result.applied > 0 || packet.armorAbsorbed > 0) {
        ctx.events.emit("feedback:sound", {
          recipientId: targetId,
          key: "hit.player",
        });
      }

      if (result.killed) {
        if (packet.attackerId) {
          ctx.events.emit("feedback:sound", {
            recipientId: packet.attackerId,
            key: "enemy.killed",
          });
        }
        ctx.events.emit("feedback:sound", {
          recipientId: targetId,
          key: "death.full",
        });
      }

      return {
        ...result,
        armorAbsorbed: packet.armorAbsorbed,
        armorBroke: packet.armorBroke,
        spawnProtected: packet.spawnProtected,
      };
    },
  });
}
