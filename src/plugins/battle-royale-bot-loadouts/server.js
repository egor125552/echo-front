export const manifest = {
  id: "bot-loadouts",
  version: "2.1.0",
  requires: ["entities", "weapons"],
  optional: ["armor"],
  capabilities: ["services.consume", "services.provide"],
};

const ARMOR_LEVELS = [50, 100, 100, 150];
const RESERVE_LEVELS = [1, 2, 2, 3];

export async function setup(ctx) {
  ctx.services.get("entities");

  ctx.services.provide("bot-loadouts", {
    create(serial, team) {
      const rifle = serial % 2 === 0;
      const armorCurrent = ARMOR_LEVELS[serial % ARMOR_LEVELS.length];
      const armorReserve = RESERVE_LEVELS[serial % RESERVE_LEVELS.length];
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
        armorReserve,
        weapons: rifle ? ["rifle"] : ["pistol"],
      };
    },
  });
}
