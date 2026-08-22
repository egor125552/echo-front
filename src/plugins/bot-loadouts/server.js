export const manifest = {
  id: "bot-loadouts",
  version: "1.2.0",
  requires: ["entities", "weapons"],
  optional: ["armor"],
  capabilities: ["services.consume", "services.provide", "components.read"],
};

const HEALTH_BY_SLOT = [90, 105, 120, 135];
const ARMOR_BY_SLOT = [0, 35, 0, 65];

export async function setup(ctx) {
  const entities = ctx.services.get("entities");

  function rifleBotExists() {
    for (const entity of entities.all()) {
      if (!entity.bot) continue;
      const inventory = ctx.components.get(entity.id, "Weapons");
      if (inventory?.items?.some((item) => item.id === "rifle")) return true;
    }
    return false;
  }

  ctx.services.provide("bot-loadouts", {
    create(serial, team) {
      const index = (serial - 1) % HEALTH_BY_SLOT.length;
      const health = HEALTH_BY_SLOT[index];
      const armorValue = ctx.hasPlugin("armor") ? ARMOR_BY_SLOT[index] : 0;
      const armored = armorValue > 0;
      const getsRifle = !rifleBotExists();

      return {
        id: `bot-${serial}`,
        kind: "bot",
        name: getsRifle
          ? (armored ? `Бот ${serial} с автоматом и бронёй` : `Бот ${serial} с автоматом`)
          : (armored ? `Бот ${serial} с пистолетом и бронёй` : `Бот ${serial} с пистолетом`),
        bot: true,
        team,
        health,
        ...(armored ? { armor: armorValue } : {}),
        weapons: getsRifle ? ["rifle"] : ["pistol"],
      };
    },
  });
}
