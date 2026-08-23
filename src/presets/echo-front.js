import * as entities from "../plugins/entities/server.js";
import * as physics from "../plugins/rapier-physics/server.js";
import * as map from "../plugins/map-test-arena/server.js";
import * as movement from "../plugins/movement/server.js";
import * as teams from "../plugins/teams/server.js";
import * as tdm from "../plugins/tdm/server.js";
import * as openingRound from "../plugins/opening-round/server.js";
import * as health from "../plugins/health/server.js";
import * as armor from "../plugins/armor/server.js";
import * as spawnProtection from "../plugins/spawn-protection/server.js";
import * as targetAssist from "../plugins/target-assist/server.js";
import * as combat from "../plugins/combat/server.js";
import * as healthRegeneration from "../plugins/health-regeneration/server.js";
import * as weapons from "../plugins/weapons/server.js";
import * as weaponProgression from "../plugins/weapon-progression/server.js";
import * as respawn from "../plugins/respawn/server.js";
import * as botController from "../plugins/bot-controller/server.js";
import * as botLoadouts from "../plugins/bot-loadouts/server.js";
import * as botPerception from "../plugins/bot-perception/server.js";
import * as botCombat from "../plugins/bot-combat/server.js";
import * as botFill from "../plugins/bot-fill/server.js";
import * as matchApi from "../plugins/match-api/server.js";

export const echoFrontPreset = [
  entities,
  physics,
  map,
  movement,
  teams,
  tdm,
  openingRound,
  health,
  armor,
  spawnProtection,
  targetAssist,
  combat,
  healthRegeneration,
  weapons,
  weaponProgression,
  respawn,
  botController,
  botLoadouts,
  botPerception,
  botCombat,
  botFill,
  matchApi,
];
