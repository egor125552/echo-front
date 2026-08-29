import * as entities from "../plugins/entities/server.js";
import * as physics from "../plugins/rapier-physics/server.js";
import * as ragdollStability from "../plugins/battle-royale-ragdoll-stability/server.js";
import * as ragdollSelfCollision from "../plugins/battle-royale-ragdoll-self-collision/server.js";
import * as liveCharacterQueries from "../plugins/rapier-live-character-queries/server.js";
import * as map from "../plugins/battle-royale-map/server.js";
import * as worldExpansion from "../plugins/battle-royale-world-expansion/server.js";
import * as buildingNavigation from "../plugins/battle-royale-building-navigation/server.js";
import * as groundNavigation from "../plugins/battle-royale-ground-navigation/server.js";
import * as cratePhysics from "../plugins/battle-royale-crate-physics/server.js";
import * as movement from "../plugins/movement/server.js";
import * as jump from "../plugins/battle-royale-jump/server.js";
import * as teams from "../plugins/teams/server.js";
import * as health from "../plugins/health/server.js";
import * as ragdollDamage from "../plugins/battle-royale-ragdoll-damage/server.js";
import * as armor from "../plugins/armor/server.js";
import * as targetAssist from "../plugins/target-assist/server.js";
import * as combat from "../plugins/combat/server.js";
import * as healthRegeneration from "../plugins/health-regeneration/server.js";
import * as weapons from "../plugins/weapons/server.js";
import * as botController from "../plugins/bot-controller/server.js";
import * as botNavigation from "../plugins/bot-navigation/server.js";
import * as botLoadouts from "../plugins/battle-royale-bot-loadouts/server.js";
import * as spatialGrid from "../plugins/battle-royale-spatial-grid/server.js";
import * as botPerception from "../plugins/bot-perception/server.js";
import * as battleRoyale from "../plugins/battle-royale/server.js";
import * as parachute from "../plugins/battle-royale-parachute/server.js";
import * as botInterest from "../plugins/battle-royale-bot-interest/server.js";
import * as warehousePriority from "../plugins/battle-royale-bot-warehouse-priority/server.js";
import * as botAiRollout from "../plugins/battle-royale-bot-rollout/server.js";
import * as botStateMachine from "../plugins/battle-royale-bot-state-machine/server.js";
import * as botBrain from "../plugins/battle-royale-bot-brain/server.js";
import * as botAwareness from "../plugins/battle-royale-bot-awareness/server.js";
import * as botCoverFire from "../plugins/battle-royale-bot-cover-fire/server.js";
import * as botCombat from "../plugins/battle-royale-bot-combat/server.js";
import * as warehouseTraffic from "../plugins/battle-royale-bot-warehouse-traffic/server.js";
import * as warehouseCombatFlow from "../plugins/battle-royale-bot-warehouse-combat-flow/server.js";
import * as botObserver from "../plugins/battle-royale-observer/server.js";
import * as botFill from "../plugins/battle-royale-bot-fill/server.js";
import * as vehicle from "../plugins/battle-royale-vehicle/server.js";
import * as vehicleFleet from "../plugins/battle-royale-vehicle-fleet/server.js";
import * as ragdoll from "../plugins/battle-royale-ragdoll/server.js";
import * as ragdollTuning from "../plugins/battle-royale-ragdoll-tuning/server.js";
import * as fleetPedestrianRagdoll from "../plugins/battle-royale-fleet-pedestrian-ragdoll/server.js";
import * as matchApi from "../plugins/battle-royale-match-api/server.js";
import * as vehicleIntegration from "../plugins/battle-royale-vehicle-integration/server.js";
import * as parachuteIntegration from "../plugins/battle-royale-parachute-integration/server.js";
import * as parachuteCanopy from "../plugins/battle-royale-parachute-canopy/server.js";
import * as parachuteDynamics from "../plugins/battle-royale-parachute-dynamics/server.js";
import * as parachuteRapierFlight from "../plugins/battle-royale-parachute-rapier-flight/server.js";
import * as worldSafety from "../plugins/battle-royale-world-safety/server.js";
import * as botParachute from "../plugins/battle-royale-bot-parachute/server.js";
import * as ragdollIntegration from "../plugins/battle-royale-ragdoll-integration/server.js";
import * as parkourRagdoll from "../plugins/battle-royale-parkour-ragdoll/server.js";
import * as navigation from "../plugins/battle-royale-navigation/index.js";
import * as navigationFace from "../plugins/battle-royale-navigation-face/server.js";
import * as navigationLifecycle from "../plugins/battle-royale-navigation-lifecycle/server.js";
import * as dropzoneVehicle from "../plugins/battle-royale-dropzone-vehicle/server.js";

export const battleRoyalePreset = [
  entities,
  physics,
  ragdollStability,
  ragdollSelfCollision,
  liveCharacterQueries,
  map,
  worldExpansion,
  buildingNavigation,
  groundNavigation,
  cratePhysics,
  movement,
  jump,
  teams,
  health,
  ragdollDamage,
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
  botAwareness,
  botCoverFire,
  botCombat,
  warehouseTraffic,
  warehouseCombatFlow,
  botObserver,
  botFill,
  vehicle,
  vehicleFleet,
  ragdoll,
  ragdollTuning,
  fleetPedestrianRagdoll,
  matchApi,
  vehicleIntegration,
  parachuteIntegration,
  parachuteCanopy,
  parachuteDynamics,
  parachuteRapierFlight,
  worldSafety,
  botParachute,
  ragdollIntegration,
  parkourRagdoll,
  navigation,
  navigationFace,
  navigationLifecycle,
  dropzoneVehicle,
];
