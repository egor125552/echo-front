export const manifest = {
  id: "bot-loadouts",
  version: "2.1.0",
  requires: ["entities", "weapons"],
  optional: ["armor"],
  capabilities: ["services.consume", "services.provide"],
};

const ARMOR_LEVELS = [0, 50, 100, 150];

export async function setup(ctx) {
  ctx.services.get("entities");

  ctx.services.provide("bot-loadouts", {
    create(serial, team) {
      const rifle = serial % 4 === 0;
      const armorCurrent = ARMOR_LEVELS[serial % ARMOR_LEVELS.length];
      return {
        id: `br-bot-${serial}`,
        kind: "bot",
        name: `Боец ${serial}`,
        bot: true,
        team,
        health: 200,
        armorPlates: 3,
        armorPlateValue: 50,
        armorCurrent,
        armorReserve: 0,
        weapons: rifle ? ["rifle"] : ["pistol"],
      };
    },
  });
}
