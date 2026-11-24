export const manifest = {
  id: "weapon-progression",
  version: "1.0.0",
  requires: ["entities", "weapons"],
  capabilities: ["services.consume", "services.provide", "events.on"],
};

export async function setup(ctx) {
  const entities = ctx.services.get("entities");
  const weapons = ctx.services.get("weapons");
  let completedRounds = 0;

  function unlockRoundTwoWeaponsFor(entityId) {
    const entity = entities.get(entityId);
    if (!entity) return false;
    if (entity.bot) {
      return weapons.grant(entityId, "sniper");
    }
    const grantedRifle = weapons.grant(entityId, "rifle");
    const grantedSniper = weapons.grant(entityId, "sniper");
    return grantedRifle || grantedSniper;
  }

  ctx.events.on("match:ended", () => {
    completedRounds += 1;
    if (completedRounds !== 1) return;
    for (const entity of entities.all()) unlockRoundTwoWeaponsFor(entity.id);
  });

  ctx.events.on("entity:spawned", ({ entityId }) => {
    if (completedRounds < 1) return;
    unlockRoundTwoWeaponsFor(entityId);
  });

  ctx.services.provide("weapon-progression", {
    get completedRounds() {
      return completedRounds;
    },
    isRifleUnlocked(entityId) {
      return weapons.has(entityId, "rifle");
    },
    isSniperUnlocked(entityId) {
      return weapons.has(entityId, "sniper");
    },
  });
}
