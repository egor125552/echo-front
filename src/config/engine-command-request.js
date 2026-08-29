const START = 2000017400000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 174,
  mode: "battle-royale",
  room: "engine-lab-parachute-manual-174",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: { commands: [
    { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [START] } },
    { command: "entity.spawn", args: { spec: { id: "nav-air-174", kind: "human", name: "Parachute Manual Player", bot: false, team: 17401, health: 400, weapons: [], position: { x: -80, y: 0, z: -60, angle: 2.8 } } } },
    { command: "service.call", args: { service: "parachute", method: "launch", arguments: ["nav-air-174", { altitude: 140, x: -80, z: -60, angle: 2.8 }, START + 20] } },
    { command: "service.call", args: { service: "parachute", method: "deploy", arguments: ["nav-air-174", START + 40, { automatic: false }] } },
    { command: "service.call", args: { service: "navigation", method: "selectTarget", arguments: ["nav-air-174", "warehouse", START + 60] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["nav-air-174", { navigationFacePressed: true }, START + 80] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["nav-air-174", { forward: 1 }, START + 100] } },
    { command: "game.step", args: { dt: 0.02, steps: 150, now: START + 120 } },
    { command: "service.call", args: { service: "navigation-face", method: "stateFor", arguments: ["nav-air-174"] } },

    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["nav-air-174", { forward: 1, strafe: 1 }, START + 3200] } },
    { command: "game.step", args: { dt: 0.02, steps: 60, now: START + 3220 } },
    { command: "service.call", args: { service: "navigation-face", method: "stateFor", arguments: ["nav-air-174"] } },
    { command: "service.call", args: { service: "air-navigation", method: "stateFor", arguments: ["nav-air-174"] } },

    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["nav-air-174", { forward: 1, strafe: 0 }, START + 4500] } },
    { command: "game.step", args: { dt: 0.02, steps: 150, now: START + 4520 } },
    { command: "service.call", args: { service: "navigation-face", method: "stateFor", arguments: ["nav-air-174"] } },
    { command: "service.call", args: { service: "air-navigation", method: "stateFor", arguments: ["nav-air-174"] } },
    { command: "service.call", args: { service: "air-navigation", method: "assertStable", arguments: ["nav-air-174", { maxSteeringReversals: 1, minControlSamples: 300 }] } }
  ] },
  requestedAt: "2026-08-29T17:36:00+03:00"
});
