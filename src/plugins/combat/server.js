export const manifest = {
  id: "combat",
  version: "1.2.0",
  requires: ["health"],
  capabilities: ["services.consume", "services.provide", "events.emit"],
};

export async function setup(ctx) {
  const health = ctx.services.get("health");
  let armorVariant = 0;

  function emitFeedback(recipientId, key) {
    if (!recipientId) return;
    ctx.events.emit("feedback:sound", { recipientId, key });
  }

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

      if (packet.armorAbsorbed > 0) {
        armorVariant = (armorVariant % 2) + 1;
        const armorHitKey = `armor.hit${armorVariant}`;

        if (packet.attackerId && !packet.spawnProtected) {
          emitFeedback(packet.attackerId, armorHitKey);
          if (packet.armorBroke) emitFeedback(packet.attackerId, "armor.break");
        }

        // The defender hears armor, not a flesh hit. When the last plate is
        // broken they also get an explicit self-break cue.
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
        killed: result.killed,
        now: packet.now,
      });
      return outcome;
    },
  });
}
