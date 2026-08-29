const START = 2000017000000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 170,
  mode: "battle-royale",
  room: "engine-lab-parachute-navigation-170",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: { commands: [
    { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [START] } },
    { command: "entity.spawn", args: { spec: { id: "nav-air-170", kind: "human", name: "Parachute Navigation Player", bot: false, team: 17001, health: 400, weapons: [], position: { x: -180, y: 0, z: -140, angle: 2.7 } } } },
    { command: "service.call", args: { service: "parachute", method: "launch", arguments: ["nav-air-170", { altitude: 220, x: -180, z: -140, angle: 2.7 }, START + 20] } },
    { command: "service.call", args: { service: "parachute", method: "deploy", arguments: ["nav-air-170", START + 40, { automatic: false }] } },
    { command: "service.call", args: { service: "navigation", method: "selectTarget", arguments: ["nav-air-170", "warehouse", START + 60] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["nav-air-170", { navigationFacePressed: true }, START + 80] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["nav-air-170", { forward: 1 }, START + 100] } },

    { command: "game.step", args: { dt: 0.02, steps: 25, now: START + 120 } },
    { command: "service.call", args: { service: "navigation-face", method: "stateFor", arguments: ["nav-air-170"] } },
    { command: "service.call", args: { service: "parachute", method: "stateFor", arguments: ["nav-air-170"] } },

    { command: "game.step", args: { dt: 0.02, steps: 25, now: START + 620 } },
    { command: "service.call", args: { service: "navigation-face", method: "stateFor", arguments: ["nav-air-170"] } },
    { command: "service.call", args: { service: "parachute", method: "stateFor", arguments: ["nav-air-170"] } },

    { command: "game.step", args: { dt: 0.02, steps: 25, now: START + 1120 } },
    { command: "service.call", args: { service: "navigation-face", method: "stateFor", arguments: ["nav-air-170"] } },
    { command: "service.call", args: { service: "parachute", method: "stateFor", arguments: ["nav-air-170"] } },

    { command: "game.step", args: { dt: 0.02, steps: 25, now: START + 1620 } },
    { command: "service.call", args: { service: "navigation-face", method: "stateFor", arguments: ["nav-air-170"] } },
    { command: "service.call", args: { service: "parachute", method: "stateFor", arguments: ["nav-air-170"] } },

    { command: "game.step", args: { dt: 0.02, steps: 25, now: START + 2120 } },
    { command: "service.call", args: { service: "navigation-face", method: "stateFor", arguments: ["nav-air-170"] } },
    { command: "service.call", args: { service: "parachute", method: "stateFor", arguments: ["nav-air-170"] } },

    { command: "game.step", args: { dt: 0.02, steps: 25, now: START + 2620 } },
    { command: "service.call", args: { service: "navigation-face", method: "stateFor", arguments: ["nav-air-170"] } },
    { command: "service.call", args: { service: "parachute", method: "stateFor", arguments: ["nav-air-170"] } },

    { command: "game.step", args: { dt: 0.02, steps: 50, now: START + 3120 } },
    { command: "service.call", args: { service: "navigation-face", method: "stateFor", arguments: ["nav-air-170"] } },
    { command: "service.call", args: { service: "parachute", method: "stateFor", arguments: ["nav-air-170"] } }
  ] },
  requestedAt: "2026-08-29T17:03:00+03:00"
});
