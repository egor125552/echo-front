export const manifest = {
  id: "bot-loadouts",
  version: "2.1.0",
  requires: ["entities", "weapons"],
  optional: ["armor"],
  capabilities: ["services.consume", "services.provide"],
};

const ARMOR_LEVELS = [150, 150, 150, 150];
const RESERVE_LEVELS = [3, 3, 4, 4];

export async function setup(ctx) {
  ctx.services.get("entities");

  ctx.services.provide("bot-loadouts", {
    create(serial, team) {
      const sniper = serial % 5 === 0;
      const marksman = !sniper && serial % 2 === 0;
      const armorCurrent = ARMOR_LEVELS[serial % ARMOR_LEVELS.length];
      const armorReserve = RESERVE_LEVELS[serial % RESERVE_LEVELS.length];
      const botWeapons = sniper
        ? ["sniper", "rifle", "pistol"]
        : marksman
          ? ["marksman", "rifle", "pistol"]
          : ["rifle", "pistol"];
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
        weapons: botWeapons,
      };
    },
  });
}
