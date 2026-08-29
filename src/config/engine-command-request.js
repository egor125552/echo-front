const START = 2000016000000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 160,
  mode: "battle-royale",
  room: "engine-lab-navigation-guidance-arrival-160",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: { commands: [
    { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [START] } },
    { command: "entity.spawn", args: { spec: { id: "nav-player-160", kind: "human", name: "Navigation Arrival Player", bot: false, team: 16001, health: 400, weapons: [], position: { x: 20, y: 0, z: 0, angle: 2.7 } } } },
    { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["nav-player-160", { x: 20, y: 0, z: 0, angle: 2.7 }] } },
    { command: "game.step", args: { dt: 0.02, steps: 2, now: START + 20 } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["nav-player-160", { navigationNextPressed: true }, START + 80] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["nav-player-160", { navigationFacePressed: true }, START + 100] } },
    { command: "service.call", args: { service: "navigation-face", method: "assertGuidance", arguments: ["nav-player-160", true, 0] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["nav-player-160", { forward: 1, sprint: true }, START + 120] } },
    { command: "game.step", args: { dt: 0.02, steps: 900, now: START + 140 } },
    { command: "service.call", args: { service: "navigation", method: "assertState", arguments: ["nav-player-160", { active: false }] } },
    { command: "service.call", args: { service: "navigation-face", method: "assertGuidance", arguments: ["nav-player-160", false, 20] } },
    { command: "service.call", args: { service: "navigation-face", method: "stateFor", arguments: ["nav-player-160"] } },
    { command: "service.call", args: { service: "navigation", method: "stateFor", arguments: ["nav-player-160", START + 18200] } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["nav-player-160"] } }
  ] },
  requestedAt: "2026-08-29T20:25:00Z"
});
