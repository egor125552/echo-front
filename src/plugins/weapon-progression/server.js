export const manifest = {
  id: "weapon-progression",
  version: "1.0.0",
  requires: ["entities", "weapons"],
  capabilities: ["services.consume", "services.provide", "events.on"],
};

export async function setup(ctx) {
  const entities = ctx.services.get("entities");
  const weapons = ctx.services.get("weapons");
  const teams = ctx.services.has?.("teams") ? ctx.services.get("teams") : null;
  let completedRounds = 0;

  function teamKeyFor(entity) {
    if (!entity) return "default";
    return teams?.teamOf?.(entity.id) ?? entity.team ?? "default";
  }

  function teamHasSniperBot(teamKey, excludeId = null) {
    for (const candidate of entities.all()) {
      if (!candidate.bot || candidate.id === excludeId) continue;
      if (teamKeyFor(candidate) !== teamKey) continue;
      if (weapons.has(candidate.id, "sniper")) return true;
    }
    return false;
  }

  function unlockRoundTwoWeaponsFor(entityId) {
    const entity = entities.get(entityId);
    if (!entity) return false;
    if (entity.bot) {
      if (weapons.has(entityId, "sniper")) return false;
      const teamKey = teamKeyFor(entity);
      if (teamHasSniperBot(teamKey, entityId)) return false;
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
