import * as entities from "../plugins/entities/server.js";
import * as physics from "../plugins/rapier-physics/server.js";
import * as map from "../plugins/battle-royale-map/server.js";
import * as groundNavigation from "../plugins/battle-royale-ground-navigation/server.js";
import * as cratePhysics from "../plugins/battle-royale-crate-physics/server.js";
import * as movement from "../plugins/movement/server.js";
import * as teams from "../plugins/teams/server.js";
import * as health from "../plugins/health/server.js";
import * as armor from "../plugins/armor/server.js";
import * as targetAssist from "../plugins/target-assist/server.js";
import * as combat from "../plugins/combat/server.js";
import * as healthRegeneration from "../plugins/health-regeneration/server.js";
import * as weapons from "../plugins/weapons/server.js";
import * as botController from "../plugins/bot-controller/server.js";
import * as botNavigation from "../plugins/bot-navigation/server.js";
import * as botLoadouts from "../plugins/battle-royale-bot-loadouts/server.js";
import * as spatialGrid from "../plugins/battle-royale-spatial-grid/server.js";
import * as botPerception from "../plugins/battle-royale-bot-perception/server.js";
import * as battleRoyale from "../plugins/battle-royale/server.js";
import * as parachute from "../plugins/battle-royale-parachute/server.js";
import * as botInterest from "../plugins/battle-royale-bot-interest/server.js";
import * as warehousePriority from "../plugins/battle-royale-bot-warehouse-priority/server.js";
import * as botAiRollout from "../plugins/battle-royale-bot-rollout/server.js";
import * as botStateMachine from "../plugins/battle-royale-bot-state-machine/server.js";
import * as botBrain from "../plugins/battle-royale-bot-brain/server.js";
import * as botCoverFire from "../plugins/battle-royale-bot-cover-fire/server.js";
import * as botCombat from "../plugins/battle-royale-bot-combat/server.js";
import * as botObserver from "../plugins/battle-royale-observer/server.js";
import * as botFill from "../plugins/battle-royale-bot-fill/server.js";
import * as matchApi from "../plugins/battle-royale-match-api/server.js";
import * as parachuteIntegration from "../plugins/battle-royale-parachute-integration/server.js";
import * as parachuteCanopy from "../plugins/battle-royale-parachute-canopy/server.js";
import * as parachuteDynamics from "../plugins/battle-royale-parachute-dynamics/server.js";
import * as parachuteRapierFlight from "../plugins/battle-royale-parachute-rapier-flight/server.js";
import * as botParachute from "../plugins/battle-royale-bot-parachute/server.js";

export const battleRoyalePreset = [
  entities,
  physics,
  map,
  groundNavigation,
  cratePhysics,
  movement,
  teams,
  health,
  armor,
  targetAssist,
  combat,
  healthRegeneration,
  weapons,
  botController,
  botNavigation,
  botLoadouts,
  spatialGrid,
  botPerception,
  battleRoyale,
  parachute,
  botInterest,
  warehousePriority,
  botAiRollout,
  botStateMachine,
  botBrain,
  botCoverFire,
  botCombat,
  botObserver,
  botFill,
  matchApi,
  parachuteIntegration,
  parachuteCanopy,
  parachuteDynamics,
  parachuteRapierFlight,
  botParachute,
];