export const manifest = {
  id: "bot-loadouts",
  version: "1.0.0",
  requires: [],
  optional: ["armor", "weapons"],
  capabilities: ["services.provide"],
};

export async function setup(ctx) {
  ctx.services.provide("bot-loadouts", {
    create(serial, team) {
      const supportsArmor = ctx.hasPlugin("armor");
      const armored = supportsArmor && serial % 2 === 0;
      return {
        id: `bot-${serial}`,
        kind: "bot",
        name: armored ? `Бот ${serial} в броне` : `Бот ${serial}`,
        bot: true,
        team,
        health: 100,
        ...(armored ? { armor: 50 } : {}),
        weapons: armored ? ["rifle", "pistol"] : ["pistol", "rifle"],
      };
    },
  });
}
