const START = 2000016900000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 169,
  mode: "battle-royale",
  room: "engine-lab-parachute-navigation-169",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: { commands: [
    { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [START] } },
    { command: "entity.spawn", args: { spec: { id: "nav-air-169", kind: "human", name: "Parachute Navigation Player", bot: false, team: 16901, health: 400, weapons: [], position: { x: -180, y: 0, z: -140, angle: 2.7 } } } },
    { command: "service.call", args: { service: "parachute", method: "launch", arguments: ["nav-air-169", { altitude: 220, x: -180, z: -140, angle: 2.7 }, START + 20] } },
    { command: "service.call", args: { service: "parachute", method: "deploy", arguments: ["nav-air-169", START + 40, { automatic: false }] } },
    { command: "service.call", args: { service: "navigation", method: "selectTarget", arguments: ["nav-air-169", "warehouse", START + 60] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["nav-air-169", { navigationFacePressed: true }, START + 80] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["nav-air-169", { forward: 1 }, START + 100] } },
    { command: "service.call", args: { service: "navigation-face", method: "stateFor", arguments: ["nav-air-169"] } },
    { command: "service.call", args: { service: "parachute", method: "stateFor", arguments: ["nav-air-169"] } },

    { command: "game.step", args: { dt: 0.02, steps: 25, now: START + 120 } },
    { command: "service.call", args: { service: "navigation-face", method: "stateFor", arguments: ["nav-air-169"] } },
    { command: "service.call", args: { service: "parachute", method: "stateFor", arguments: ["nav-air-169"] } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["nav-air-169"] } },

    { command: "game.step", args: { dt: 0.02, steps: 25, now: START + 620 } },
    { command: "service.call", args: { service: "navigation-face", method: "stateFor", arguments: ["nav-air-169"] } },
    { command: "service.call", args: { service: "parachute", method: "stateFor", arguments: ["nav-air-169"] } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["nav-air-169"] } },

    { command: "game.step", args: { dt: 0.02, steps: 25, now: START + 1120 } },
    { command: "service.call", args: { service: "navigation-face", method: "stateFor", arguments: ["nav-air-169"] } },
    { command: "service.call", args: { service: "parachute", method: "stateFor", arguments: ["nav-air-169"] } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["nav-air-169"] } },

    { command: "game.step", args: { dt: 0.02, steps: 25, now: START + 1620 } },
    { command: "service.call", args: { service: "navigation-face", method: "stateFor", arguments: ["nav-air-169"] } },
    { command: "service.call", args: { service: "parachute", method: "stateFor", arguments: ["nav-air-169"] } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["nav-air-169"] } },

    { command: "game.step", args: { dt: 0.02, steps: 25, now: START + 2120 } },
    { command: "service.call", args: { service: "navigation-face", method: "stateFor", arguments: ["nav-air-169"] } },
    { command: "service.call", args: { service: "parachute", method: "stateFor", arguments: ["nav-air-169"] } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["nav-air-169"] } },

    { command: "game.step", args: { dt: 0.02, steps: 25, now: START + 2620 } },
    { command: "service.call", args: { service: "navigation-face", method: "stateFor", arguments: ["nav-air-169"] } },
    { command: "service.call", args: { service: "parachute", method: "stateFor", arguments: ["nav-air-169"] } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["nav-air-169"] } },

    { command: "game.step", args: { dt: 0.02, steps: 50, now: START + 3120 } },
    { command: "service.call", args: { service: "navigation-face", method: "stateFor", arguments: ["nav-air-169"] } },
    { command: "service.call", args: { service: "parachute", method: "stateFor", arguments: ["nav-air-169"] } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["nav-air-169"] } }
  ] },
  requestedAt: "2026-08-29T16:58:00+03:00"
});
