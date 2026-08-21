import * as entities from "../plugins/entities/server.js";
import * as physics from "../plugins/rapier-physics/server.js";
import * as map from "../plugins/map-test-arena/server.js";
import * as movement from "../plugins/movement/server.js";

export const walkingTestPreset = [entities, physics, map, movement];
