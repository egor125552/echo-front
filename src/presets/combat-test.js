import * as entities from "../plugins/entities/server.js";
import * as physics from "../plugins/rapier-physics/server.js";
import * as map from "../plugins/map-test-arena/server.js";
import * as movement from "../plugins/movement/server.js";
import * as teams from "../plugins/teams/server.js";
import * as health from "../plugins/health/server.js";
import * as combat from "../plugins/combat/server.js";
import * as weapons from "../plugins/weapons/server.js";
import * as respawn from "../plugins/respawn/server.js";

export const combatTestPreset = [
  entities,
  physics,
  map,
  movement,
  teams,
  health,
  combat,
  weapons,
  respawn,
];
