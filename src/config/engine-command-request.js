const START = 2000015800000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 158,
  mode: "battle-royale",
  room: "engine-lab-navigation-face-158",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: { commands: [
    { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [START] } },
    { command: "entity.spawn", args: { spec: { id: "nav-player-158", kind: "human", name: "Navigation Player", bot: false, team: 15801, health: 400, weapons: [], position: { x: 20, y: 0, z: 0, angle: 2.7 } } } },
    { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["nav-player-158", { x: 20, y: 0, z: 0, angle: 2.7 }] } },
    { command: "game.step", args: { dt: 0.02, steps: 2, now: START + 20 } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["nav-player-158", { navigationNextPressed: true }, START + 80] } },
    { command: "service.call", args: { service: "navigation", method: "stateFor", arguments: ["nav-player-158", START + 90] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["nav-player-158", { navigationFacePressed: true }, START + 100] } },
    { command: "service.call", args: { service: "navigation-face", method: "assertFacing", arguments: ["nav-player-158", 0.0001] } },
    { command: "service.call", args: { service: "navigation-face", method: "stateFor", arguments: ["nav-player-158"] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["nav-player-158", { navigationTogglePressed: true }, START + 120] } },
    { command: "service.call", args: { service: "navigation", method: "stateFor", arguments: ["nav-player-158", START + 130] } },
    { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["nav-player-158", { x: 20, y: 0, z: 0, angle: -2.4 }] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["nav-player-158", { navigationFacePressed: true }, START + 150] } },
    { command: "service.call", args: { service: "navigation-face", method: "assertFacing", arguments: ["nav-player-158", 0.0001] } },
    { command: "service.call", args: { service: "navigation-face", method: "stateFor", arguments: ["nav-player-158"] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["nav-player-158", { forward: 1 }, START + 170] } },
    { command: "game.step", args: { dt: 0.02, steps: 30, now: START + 180 } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["nav-player-158"] } },
    { command: "service.call", args: { service: "navigation", method: "stateFor", arguments: ["nav-player-158", START + 800] } }
  ] },
  requestedAt: "2026-08-29T20:10:00Z"
});
