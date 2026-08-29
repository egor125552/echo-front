const START = 2000015900000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 159,
  mode: "battle-royale",
  room: "engine-lab-navigation-guidance-toggle-159",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: { commands: [
    { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [START] } },
    { command: "entity.spawn", args: { spec: { id: "nav-player-159", kind: "human", name: "Navigation Guidance Player", bot: false, team: 15901, health: 400, weapons: [], position: { x: 20, y: 0, z: 0, angle: 2.7 } } } },
    { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["nav-player-159", { x: 20, y: 0, z: 0, angle: 2.7 }] } },
    { command: "game.step", args: { dt: 0.02, steps: 2, now: START + 20 } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["nav-player-159", { navigationNextPressed: true }, START + 80] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["nav-player-159", { navigationFacePressed: true }, START + 100] } },
    { command: "service.call", args: { service: "navigation-face", method: "assertGuidance", arguments: ["nav-player-159", true, 0] } },
    { command: "service.call", args: { service: "navigation", method: "stateFor", arguments: ["nav-player-159", START + 110] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["nav-player-159", { forward: 1, sprint: true }, START + 120] } },
    { command: "game.step", args: { dt: 0.02, steps: 250, now: START + 140 } },
    { command: "service.call", args: { service: "navigation-face", method: "assertGuidance", arguments: ["nav-player-159", true, 20] } },
    { command: "service.call", args: { service: "navigation-face", method: "stateFor", arguments: ["nav-player-159"] } },
    { command: "service.call", args: { service: "navigation", method: "stateFor", arguments: ["nav-player-159", START + 5200] } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["nav-player-159"] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["nav-player-159", { navigationFacePressed: true }, START + 5250] } },
    { command: "service.call", args: { service: "navigation-face", method: "assertGuidance", arguments: ["nav-player-159", false, 20] } },
    { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["nav-player-159", { x: 45, y: 0, z: -20, angle: -2.4 }] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["nav-player-159", { forward: 1 }, START + 5300] } },
    { command: "game.step", args: { dt: 0.02, steps: 30, now: START + 5320 } },
    { command: "service.call", args: { service: "navigation-face", method: "stateFor", arguments: ["nav-player-159"] } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["nav-player-159"] } }
  ] },
  requestedAt: "2026-08-29T20:20:00Z"
});
