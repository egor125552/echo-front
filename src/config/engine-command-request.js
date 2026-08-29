const START = 2000016400000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 164,
  mode: "battle-royale",
  room: "engine-lab-navigation-parachute-164",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: { commands: [
    { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [START] } },
    { command: "entity.spawn", args: { spec: { id: "nav-chute-164", kind: "human", name: "Navigation Parachute Player", bot: false, team: 16401, health: 400, weapons: [], position: { x: 20, y: 0, z: 0, angle: 2.7 } } } },
    { command: "service.call", args: { service: "parachute", method: "launch", arguments: ["nav-chute-164", { altitude: 120, x: 20, z: 0, angle: 2.7 }, START + 40] } },
    { command: "service.call", args: { service: "parachute", method: "deploy", arguments: ["nav-chute-164", START + 60] } },
    { command: "service.call", args: { service: "navigation", method: "selectTarget", arguments: ["nav-chute-164", "warehouse", START + 80] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["nav-chute-164", { navigationFacePressed: true, forward: 1 }, START + 100] } },
    { command: "service.call", args: { service: "navigation-face", method: "assertGuidance", arguments: ["nav-chute-164", true, 0] } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["nav-chute-164"] } },
    { command: "service.call", args: { service: "parachute", method: "stateFor", arguments: ["nav-chute-164"] } },
    { command: "service.call", args: { service: "navigation", method: "stateFor", arguments: ["nav-chute-164", START + 110] } },
    { command: "game.step", args: { dt: 0.02, steps: 200, now: START + 120 } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["nav-chute-164"] } },
    { command: "service.call", args: { service: "parachute", method: "stateFor", arguments: ["nav-chute-164"] } },
    { command: "service.call", args: { service: "navigation-face", method: "assertGuidance", arguments: ["nav-chute-164", true, 20] } },
    { command: "service.call", args: { service: "navigation-face", method: "stateFor", arguments: ["nav-chute-164"] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["nav-chute-164", { forward: 1, strafe: 1 }, START + 4150] } },
    { command: "game.step", args: { dt: 0.02, steps: 30, now: START + 4160 } },
    { command: "service.call", args: { service: "navigation-face", method: "stateFor", arguments: ["nav-chute-164"] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["nav-chute-164", { forward: 1, strafe: 0 }, START + 4800] } },
    { command: "game.step", args: { dt: 0.02, steps: 30, now: START + 4810 } },
    { command: "service.call", args: { service: "navigation-face", method: "stateFor", arguments: ["nav-chute-164"] } },
    { command: "service.call", args: { service: "navigation", method: "stateFor", arguments: ["nav-chute-164", START + 5450] } }
  ] },
  requestedAt: "2026-08-29T14:35:00+03:00"
});
