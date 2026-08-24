import * as entities from "../plugins/entities/server.js";
import * as physics from "../plugins/rapier-physics/server.js";
import * as map from "../plugins/battle-royale-map/server.js";
import * as movement from "../plugins/movement/server.js";
import * as teams from "../plugins/teams/server.js";
import * as health from "../plugins/health/server.js";
import * as armor from "../plugins/armor/server.js";
import * as targetAssist from "../plugins/target-assist/server.js";
import * as combat from "../plugins/combat/server.js";
import * as healthRegeneration from "../plugins/health-regeneration/server.js";
import * as weapons from "../plugins/weapons/server.js";
import * as botController from "../plugins/bot-controller/server.js";
import * as botLoadouts from "../plugins/battle-royale-bot-loadouts/server.js";
import * as spatialGrid from "../plugins/battle-royale-spatial-grid/server.js";
import * as botPerception from "../plugins/battle-royale-bot-perception/server.js";
import * as battleRoyale from "../plugins/battle-royale/server.js";
import * as botCombat from "../plugins/battle-royale-bot-combat/server.js";
import * as botFill from "../plugins/battle-royale-bot-fill/server.js";
import * as matchApi from "../plugins/battle-royale-match-api/server.js";

export const battleRoyalePreset = [
  entities,
  physics,
  map,
  movement,
  teams,
  health,
  armor,
  targetAssist,
  combat,
  healthRegeneration,
  weapons,
  botController,
  botLoadouts,
  spatialGrid,
  botPerception,
  battleRoyale,
  botCombat,
  botFill,
  matchApi,
];
