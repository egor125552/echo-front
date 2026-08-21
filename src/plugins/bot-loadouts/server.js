export const manifest = {
  id: "bot-loadouts",
  version: "1.1.0",
  requires: [],
  optional: ["armor", "weapons"],
  capabilities: ["services.provide"],
};

const HEALTH_BY_SLOT = [90, 105, 120, 135];
const ARMOR_BY_SLOT = [0, 35, 0, 65];

export async function setup(ctx) {
  ctx.services.provide("bot-loadouts", {
    create(serial, team) {
      const index = (serial - 1) % HEALTH_BY_SLOT.length;
      const health = HEALTH_BY_SLOT[index];
      const armorValue = ctx.hasPlugin("armor") ? ARMOR_BY_SLOT[index] : 0;
      const armored = armorValue > 0;
      return {
        id: `bot-${serial}`,
        kind: "bot",
        name: armored ? `Бот ${serial} в броне` : `Бот ${serial}`,
        bot: true,
        team,
        health,
        ...(armored ? { armor: armorValue } : {}),
        weapons: serial % 2 === 0 ? ["rifle", "pistol"] : ["pistol", "rifle"],
      };
    },
  });
}
