const START = 2000017100000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 171,
  mode: "battle-royale",
  room: "engine-lab-parachute-checkpoint-171",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: { commands: [
    { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [START] } },
    { command: "entity.spawn", args: { spec: { id: "nav-air-171", kind: "human", name: "Parachute Checkpoint Player", bot: false, team: 17101, health: 400, weapons: [], position: { x: -80, y: 0, z: -60, angle: 2.8 } } } },
    { command: "service.call", args: { service: "parachute", method: "launch", arguments: ["nav-air-171", { altitude: 180, x: -80, z: -60, angle: 2.8 }, START + 20] } },
    { command: "service.call", args: { service: "parachute", method: "deploy", arguments: ["nav-air-171", START + 40, { automatic: false }] } },
    { command: "service.call", args: { service: "navigation", method: "selectTarget", arguments: ["nav-air-171", "warehouse", START + 60] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["nav-air-171", { navigationFacePressed: true }, START + 80] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["nav-air-171", { forward: 1 }, START + 100] } },

    { command: "game.step", args: { dt: 0.02, steps: 100, now: START + 120 } },
    { command: "service.call", args: { service: "navigation-face", method: "stateFor", arguments: ["nav-air-171"] } },
    { command: "service.call", args: { service: "parachute", method: "stateFor", arguments: ["nav-air-171"] } },

    { command: "game.step", args: { dt: 0.02, steps: 100, now: START + 2120 } },
    { command: "service.call", args: { service: "navigation-face", method: "stateFor", arguments: ["nav-air-171"] } },
    { command: "service.call", args: { service: "parachute", method: "stateFor", arguments: ["nav-air-171"] } },

    { command: "game.step", args: { dt: 0.02, steps: 100, now: START + 4120 } },
    { command: "service.call", args: { service: "navigation-face", method: "stateFor", arguments: ["nav-air-171"] } },
    { command: "service.call", args: { service: "parachute", method: "stateFor", arguments: ["nav-air-171"] } },

    { command: "game.step", args: { dt: 0.02, steps: 100, now: START + 6120 } },
    { command: "service.call", args: { service: "navigation-face", method: "stateFor", arguments: ["nav-air-171"] } },
    { command: "service.call", args: { service: "parachute", method: "stateFor", arguments: ["nav-air-171"] } },

    { command: "game.step", args: { dt: 0.02, steps: 100, now: START + 8120 } },
    { command: "service.call", args: { service: "navigation-face", method: "stateFor", arguments: ["nav-air-171"] } },
    { command: "service.call", args: { service: "parachute", method: "stateFor", arguments: ["nav-air-171"] } },

    { command: "game.step", args: { dt: 0.02, steps: 100, now: START + 10120 } },
    { command: "service.call", args: { service: "navigation-face", method: "stateFor", arguments: ["nav-air-171"] } },
    { command: "service.call", args: { service: "parachute", method: "stateFor", arguments: ["nav-air-171"] } },

    { command: "game.step", args: { dt: 0.02, steps: 100, now: START + 12120 } },
    { command: "service.call", args: { service: "navigation-face", method: "stateFor", arguments: ["nav-air-171"] } },
    { command: "service.call", args: { service: "parachute", method: "stateFor", arguments: ["nav-air-171"] } },

    { command: "game.step", args: { dt: 0.02, steps: 100, now: START + 14120 } },
    { command: "service.call", args: { service: "navigation-face", method: "stateFor", arguments: ["nav-air-171"] } },
    { command: "service.call", args: { service: "parachute", method: "stateFor", arguments: ["nav-air-171"] } }
  ] },
  requestedAt: "2026-08-29T17:08:00+03:00"
});
