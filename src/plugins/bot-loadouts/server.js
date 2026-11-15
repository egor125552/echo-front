export const manifest = {
  id: "bot-loadouts",
  version: "1.2.0",
  requires: ["entities", "weapons"],
  optional: ["armor"],
  capabilities: ["services.consume", "services.provide", "components.read"],
};

const HEALTH_BY_SLOT = [135, 150, 165, 180];
const ARMOR_BY_SLOT = [50, 75, 50, 100];
const RESERVE_BY_SLOT = [2, 2, 2, 3];

export async function setup(ctx) {
  ctx.services.get("entities");

  ctx.services.provide("bot-loadouts", {
    create(serial, team) {
      const index = (serial - 1) % HEALTH_BY_SLOT.length;
      const health = HEALTH_BY_SLOT[index];
      const armorValue = ctx.hasPlugin("armor") ? ARMOR_BY_SLOT[index] : 0;
      const armorReserve = ctx.hasPlugin("armor") ? RESERVE_BY_SLOT[index] : 0;
      const armored = armorValue > 0;
      // Two rifle slots survive the normal initial bot-to-human replacement.
      // Keep a quick pistol specialist as well, instead of making clones.
      const getsRifle = serial % 4 !== 0;

      return {
        id: `bot-${serial}`,
        kind: "bot",
        name: getsRifle
          ? (armored ? `Бот ${serial} с автоматом и бронёй` : `Бот ${serial} с автоматом`)
          : (armored ? `Бот ${serial} с пистолетом и бронёй` : `Бот ${serial} с пистолетом`),
        bot: true,
        team,
        health,
        ...(armored ? { armor: armorValue, armorReserve } : {}),
        weapons: getsRifle ? ["rifle", "pistol"] : ["pistol"],
      };
    },
  });
}
