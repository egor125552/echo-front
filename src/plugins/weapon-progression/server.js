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

  function unlockRifleFor(entityId) {
    const entity = entities.get(entityId);
    if (!entity || entity.bot) return false;
    return weapons.grant(entityId, "rifle");
  }

  ctx.events.on("match:ended", () => {
    completedRounds += 1;
    if (completedRounds !== 1) return;
    for (const entity of entities.all()) unlockRifleFor(entity.id);
  });

  ctx.events.on("entity:spawned", ({ entityId, spec }) => {
    if (spec?.bot || completedRounds < 1) return;
    unlockRifleFor(entityId);
  });

  ctx.services.provide("weapon-progression", {
    get completedRounds() {
      return completedRounds;
    },
    isRifleUnlocked(entityId) {
      return weapons.has(entityId, "rifle");
    },
  });
}
