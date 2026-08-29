const START = 2000017700000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 177,
  mode: "battle-royale",
  room: "engine-lab-building-ground-route-177",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: { commands: [
    { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [START] } },
    { command: "entity.spawn", args: { spec: { id: "builder-177", kind: "human", name: "Ground Building Walker", bot: false, team: 17701, health: 400, weapons: ["pistol"], position: { x: 130, y: 3.2, z: 120, angle: 0 } } } },
    { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["builder-177", { x: 130, y: 3.2, z: 120, angle: 1.57079632679 }] } },
    { command: "game.step", args: { dt: 0.02, steps: 3, now: START + 20 } },
    { command: "service.call", args: { service: "parachute", method: "stateFor", arguments: ["builder-177"] } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["builder-177"] } },

    { command: "service.call", args: { service: "map", method: "setDoorOpen", arguments: ["two-storey-front-door", true, "builder-177", START + 100] } },
    { command: "service.call", args: { service: "navigation", method: "registerTarget", arguments: [{ id: "outside-two-storey-test-177", name: "Точка снаружи дома", kind: "point", order: 1, arriveDistance: 2.5, position: { x: 150, y: 0, z: 120 }, metadata: { verticalTolerance: 1.5 } }] } },
    { command: "service.call", args: { service: "navigation", method: "selectTarget", arguments: ["builder-177", "outside-two-storey-test-177", START + 120] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["builder-177", { navigationFacePressed: true }, START + 130] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["builder-177", { forward: 1 }, START + 140] } },

    { command: "game.step", args: { dt: 0.02, steps: 150, now: START + 200 } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["builder-177"] } },
    { command: "service.call", args: { service: "navigation", method: "stateFor", arguments: ["builder-177", START + 3200] } },

    { command: "game.step", args: { dt: 0.02, steps: 150, now: START + 3300 } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["builder-177"] } },
    { command: "service.call", args: { service: "navigation", method: "stateFor", arguments: ["builder-177", START + 6300] } },

    { command: "game.step", args: { dt: 0.02, steps: 150, now: START + 6400 } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["builder-177"] } },
    { command: "service.call", args: { service: "navigation", method: "stateFor", arguments: ["builder-177", START + 9400] } },

    { command: "game.step", args: { dt: 0.02, steps: 150, now: START + 9500 } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["builder-177"] } },
    { command: "service.call", args: { service: "navigation-face", method: "stateFor", arguments: ["builder-177"] } },
    { command: "service.call", args: { service: "parachute", method: "stateFor", arguments: ["builder-177"] } }
  ] },
  requestedAt: "2026-08-29T21:16:00+03:00"
});