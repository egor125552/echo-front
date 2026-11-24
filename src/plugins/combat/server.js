export const manifest = {
  id: "combat",
  version: "1.5.0",
  requires: ["health"],
  optional: ["social", "teams", "entities"],
  capabilities: ["services.consume", "services.provide", "events.emit"],
};

export async function setup(ctx) {
  const health = ctx.services.get("health");
  const social = ctx.services.has("social") ? ctx.services.get("social") : null;
  const teams = ctx.services.has("teams") ? ctx.services.get("teams") : null;
  const entities = ctx.services.has("entities") ? ctx.services.get("entities") : null;
  let armorVariant = 0;

  function entityMeta(id) {
    const entity = id ? entities?.get?.(id) : null;
    return {
      name: entity?.name ? String(entity.name) : null,
      isHuman: Boolean(entity && !entity.bot && entity.kind === "human"),
      electro: Boolean(entity?.electroLukashenko),
    };
  }

  function emitFeedback(recipientId, key, extra = null) {
    if (!recipientId) return;
    ctx.events.emit("feedback:sound", extra ? { recipientId, key, ...extra } : { recipientId, key });
  }

  ctx.services.provide("combat", {
    damage(targetId, amount, source = {}) {
      const attackerId = source.attackerId ?? null;
      const now = source.now ?? Date.now();
      const weaponId = source.weaponId ?? null;
      const sameTeam = Boolean(
        attackerId
        && targetId
        && attackerId !== targetId
        && weaponId !== "bleed-out"
        && weaponId !== "zone"
        && (teams?.teamOf?.(attackerId) ?? 0) > 0
        && teams.teamOf(attackerId) === teams.teamOf(targetId),
      );

      if (sameTeam || (attackerId && social?.protectsFriendlyFire?.(attackerId, targetId))) {
        ctx.events.emit("combat:friend-protected", {
          attackerId,
          targetId,
          weaponId,
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
        distance: Number.isFinite(Number(source.distance)) ? Number(source.distance) : null,
        distanceMultiplier: Number.isFinite(Number(source.distanceMultiplier))
          ? Number(source.distanceMultiplier)
          : 1,
        now,
        armorAbsorbed: 0,
        armorBroke: false,
        spawnProtected: false,
      };
      ctx.events.emit("combat:damage:before", packet);
      const result = health.applyDamage(targetId, packet.remaining, source);

      const targetInfo = entityMeta(targetId);
      const attackerInfo = entityMeta(packet.attackerId);
      const combatMeta = {
        targetId,
        targetName: targetInfo.name,
        targetIsHuman: targetInfo.isHuman,
        targetElectro: targetInfo.electro,
        attackerId: packet.attackerId,
        attackerName: attackerInfo.name,
        attackerIsHuman: attackerInfo.isHuman,
        weaponId: packet.weaponId,
      };

      if (packet.armorAbsorbed > 0) {
        armorVariant = (armorVariant % 2) + 1;
        const armorHitKey = `armor.hit${armorVariant}`;

        if (packet.attackerId && !packet.spawnProtected) {
          emitFeedback(packet.attackerId, armorHitKey);
          if (packet.armorBroke) emitFeedback(packet.attackerId, "armor.break", combatMeta);
        }

        emitFeedback(targetId, armorHitKey);
        if (packet.armorBroke) emitFeedback(targetId, "armor.self-break", combatMeta);
      } else if (result.applied > 0) {
        if (packet.attackerId && !packet.spawnProtected) {
          emitFeedback(packet.attackerId, "hit.enemy");
        }
        emitFeedback(targetId, "hit.player");
      }

      if (result.killed) {
        if (packet.attackerId) emitFeedback(packet.attackerId, "enemy.killed", combatMeta);
        emitFeedback(targetId, "death.full", combatMeta);
        if (targetInfo.isHuman || attackerInfo.isHuman) {
          ctx.events.emit("combat:killfeed", {
            killerId: packet.attackerId,
            killerName: attackerInfo.name,
            killerIsHuman: attackerInfo.isHuman,
            victimId: targetId,
            victimName: targetInfo.name,
            victimIsHuman: targetInfo.isHuman,
            victimElectro: targetInfo.electro,
            weaponId: packet.weaponId,
            now: packet.now,
          });
        }
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
        distance: packet.distance,
        distanceMultiplier: packet.distanceMultiplier,
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
