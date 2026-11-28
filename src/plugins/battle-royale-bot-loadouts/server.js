export const manifest = {
  id: "bot-loadouts",
  version: "2.1.0",
  requires: ["entities", "weapons"],
  optional: ["armor"],
  capabilities: ["services.consume", "services.provide"],
};

const ARMOR_LEVELS = [150, 150, 150, 150];
const RESERVE_LEVELS = [3, 3, 4, 4];

export const RARE_MARKSMAN_SERIAL = 12;
export const RARE_RIFLE_SERIAL = 24;

export function createBotLoadout(serial, team) {
  const armorCurrent = ARMOR_LEVELS[serial % ARMOR_LEVELS.length];
  const armorReserve = RESERVE_LEVELS[serial % RESERVE_LEVELS.length];
  let botWeapons = ["pistol"];
  if (serial === RARE_MARKSMAN_SERIAL) {
    botWeapons = ["marksman", "pistol"];
  } else if (serial === RARE_RIFLE_SERIAL) {
    botWeapons = ["rifle", "pistol"];
  }
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
}

export async function setup(ctx) {
  ctx.services.get("entities");

  ctx.services.provide("bot-loadouts", {
    create: createBotLoadout,
  });
}
