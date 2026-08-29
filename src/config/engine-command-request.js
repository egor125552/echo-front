const START = 2000017900000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 179,
  mode: "battle-royale",
  room: "engine-lab-north-stair-building-179",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: { commands: [
    { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [START] } },
    { command: "entity.spawn", args: { spec: { id: "builder-179", kind: "human", name: "North Stair Walker", bot: false, team: 17901, health: 400, weapons: ["pistol"], position: { x: 265, y: 3.2, z: -191, angle: 3.14159265359 } } } },
    { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["builder-179", { x: 265, y: 3.2, z: -191, angle: 3.14159265359 }] } },
    { command: "game.step", args: { dt: 0.02, steps: 3, now: START + 20 } },
    { command: "service.call", args: { service: "parachute", method: "stateFor", arguments: ["builder-179"] } },
    { command: "service.call", args: { service: "building-factory", method: "list", arguments: [] } },
    { command: "service.call", args: { service: "building-navigation", method: "requiredWaypoints", arguments: [{ x: 265, y: 3.2, z: -191 }, { x: 265, y: 0, z: -172 }] } },
    { command: "service.call", args: { service: "map", method: "setDoorOpen", arguments: ["north-stair-front-door", true, "builder-179", START + 100] } },
    { command: "service.call", args: { service: "navigation", method: "registerTarget", arguments: [{ id: "north-stair-outside-test", name: "Точка за северным домом", kind: "point", order: 1, arriveDistance: 2.5, position: { x: 265, y: 0, z: -172 }, metadata: { verticalTolerance: 1.5 } }] } },
    { command: "service.call", args: { service: "navigation", method: "selectTarget", arguments: ["builder-179", "north-stair-outside-test", START + 120] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["builder-179", { navigationFacePressed: true }, START + 130] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["builder-179", { forward: 1 }, START + 140] } },

    { command: "game.step", args: { dt: 0.02, steps: 150, now: START + 200 } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["builder-179"] } },
    { command: "service.call", args: { service: "navigation", method: "stateFor", arguments: ["builder-179", START + 3200] } },
    { command: "service.call", args: { service: "map", method: "acousticProfileAt", arguments: [{ x: 265, y: 1.6, z: -185 }] } },

    { command: "game.step", args: { dt: 0.02, steps: 150, now: START + 3300 } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["builder-179"] } },
    { command: "service.call", args: { service: "navigation", method: "stateFor", arguments: ["builder-179", START + 6300] } },

    { command: "game.step", args: { dt: 0.02, steps: 150, now: START + 6400 } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["builder-179"] } },
    { command: "service.call", args: { service: "navigation-face", method: "stateFor", arguments: ["builder-179"] } },
    { command: "service.call", args: { service: "match-api", method: "snapshotFor", arguments: ["builder-179", START + 9500] } }
  ] },
  requestedAt: "2026-08-29T21:24:00+03:00"
});