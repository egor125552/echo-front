const START = 2000017600000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 176,
  mode: "battle-royale",
  room: "engine-lab-building-route-176",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: { commands: [
    { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [START] } },
    { command: "service.call", args: { service: "map", method: "setDoorOpen", arguments: ["two-storey-front-door", true, "builder-176", START + 10] } },
    { command: "entity.spawn", args: { spec: { id: "builder-176", kind: "human", name: "Generated Building Walker", bot: false, team: 17601, health: 400, weapons: ["pistol"], position: { x: 130, y: 3.2, z: 120, angle: 0 } } } },
    { command: "service.call", args: { service: "navigation", method: "registerTarget", arguments: [{ id: "outside-two-storey-test", name: "Точка снаружи дома", kind: "point", order: 1, arriveDistance: 2.5, position: { x: 150, y: 0, z: 120 }, metadata: { verticalTolerance: 1.5 } }] } },
    { command: "service.call", args: { service: "navigation", method: "selectTarget", arguments: ["builder-176", "outside-two-storey-test", START + 30] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["builder-176", { navigationFacePressed: true }, START + 40] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["builder-176", { forward: 1 }, START + 50] } },

    { command: "game.step", args: { dt: 0.02, steps: 150, now: START + 100 } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["builder-176"] } },
    { command: "service.call", args: { service: "navigation", method: "stateFor", arguments: ["builder-176", START + 3100] } },

    { command: "game.step", args: { dt: 0.02, steps: 150, now: START + 3200 } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["builder-176"] } },
    { command: "service.call", args: { service: "navigation", method: "stateFor", arguments: ["builder-176", START + 6200] } },

    { command: "game.step", args: { dt: 0.02, steps: 150, now: START + 6300 } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["builder-176"] } },
    { command: "service.call", args: { service: "navigation", method: "stateFor", arguments: ["builder-176", START + 9300] } },

    { command: "game.step", args: { dt: 0.02, steps: 150, now: START + 9400 } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["builder-176"] } },
    { command: "service.call", args: { service: "navigation", method: "stateFor", arguments: ["builder-176", START + 12400] } },

    { command: "game.step", args: { dt: 0.02, steps: 150, now: START + 12500 } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["builder-176"] } },
    { command: "service.call", args: { service: "navigation-face", method: "stateFor", arguments: ["builder-176"] } },
    { command: "service.call", args: { service: "map", method: "locationAt", arguments: [{ x: 150, y: 0, z: 120 }] } }
  ] },
  requestedAt: "2026-08-29T21:12:00+03:00"
});