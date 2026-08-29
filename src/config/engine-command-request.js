const START = 2000017300000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 173,
  mode: "battle-royale",
  room: "engine-lab-parachute-landing-173",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: { commands: [
    { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [START] } },
    { command: "entity.spawn", args: { spec: { id: "nav-air-173", kind: "human", name: "Parachute Landing Player", bot: false, team: 17301, health: 400, weapons: [], position: { x: -80, y: 0, z: -60, angle: 2.8 } } } },
    { command: "service.call", args: { service: "parachute", method: "launch", arguments: ["nav-air-173", { altitude: 180, x: -80, z: -60, angle: 2.8 }, START + 20] } },
    { command: "service.call", args: { service: "parachute", method: "deploy", arguments: ["nav-air-173", START + 40, { automatic: false }] } },
    { command: "service.call", args: { service: "navigation", method: "selectTarget", arguments: ["nav-air-173", "warehouse", START + 60] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["nav-air-173", { navigationFacePressed: true }, START + 80] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["nav-air-173", { forward: 1 }, START + 100] } },

    { command: "game.step", args: { dt: 0.02, steps: 500, now: START + 120 } },
    { command: "service.call", args: { service: "air-navigation", method: "stateFor", arguments: ["nav-air-173"] } },
    { command: "service.call", args: { service: "navigation-face", method: "stateFor", arguments: ["nav-air-173"] } },

    { command: "game.step", args: { dt: 0.02, steps: 500, now: START + 10120 } },
    { command: "service.call", args: { service: "air-navigation", method: "stateFor", arguments: ["nav-air-173"] } },
    { command: "service.call", args: { service: "navigation-face", method: "stateFor", arguments: ["nav-air-173"] } },

    { command: "game.step", args: { dt: 0.02, steps: 500, now: START + 20120 } },
    { command: "service.call", args: { service: "air-navigation", method: "stateFor", arguments: ["nav-air-173"] } },
    { command: "service.call", args: { service: "parachute", method: "stateFor", arguments: ["nav-air-173"] } },
    { command: "service.call", args: { service: "navigation-face", method: "stateFor", arguments: ["nav-air-173"] } },

    { command: "game.step", args: { dt: 0.02, steps: 400, now: START + 30120 } },
    { command: "service.call", args: { service: "air-navigation", method: "stateFor", arguments: ["nav-air-173"] } },
    { command: "service.call", args: { service: "parachute", method: "stateFor", arguments: ["nav-air-173"] } },
    { command: "service.call", args: { service: "navigation-face", method: "stateFor", arguments: ["nav-air-173"] } },
    { command: "service.call", args: { service: "air-navigation", method: "assertStable", arguments: ["nav-air-173", { maxSteeringReversals: 1, minControlSamples: 1000, minBrakeEntries: 1, minHoldEntries: 1 }] } }
  ] },
  requestedAt: "2026-08-29T17:28:00+03:00"
});
