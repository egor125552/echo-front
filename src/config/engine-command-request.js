const START = 2000018600000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 186,
  mode: "battle-royale",
  room: "engine-play-grounded-forest-hut-186",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: { commands: [
    { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [START] } },
    { command: "entity.spawn", args: { spec: { id: "explorer-186", kind: "human", name: "Grounded Forest Hut Explorer", bot: false, team: 18601, health: 400, weapons: ["pistol"], position: { x: -115, y: 0, z: -66.5, angle: 0 } } } },
    { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["explorer-186", { x: -115, y: 0, z: -66.5, angle: 0 }] } },
    { command: "service.call", args: { service: "parachute", method: "finishMovement", arguments: [0.02, START + 20] } },
    { command: "service.call", args: { service: "parachute", method: "stateFor", arguments: ["explorer-186"] } },

    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["explorer-186", { forward: 1 }, START + 100] } },
    { command: "game.step", args: { dt: 0.02, steps: 45, now: START + 120 } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["explorer-186"] } },

    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["explorer-186", { strafe: 1 }, START + 1200] } },
    { command: "game.step", args: { dt: 0.02, steps: 70, now: START + 1220 } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["explorer-186"] } },

    { command: "service.call", args: { service: "map", method: "acousticOcclusionBetween", arguments: [{ x: -110, y: 0, z: -67.2 }, { x: -110, y: 0, z: -75 }] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["explorer-186", { interactPressed: true }, START + 2800] } },
    { command: "service.call", args: { service: "map", method: "acousticOcclusionBetween", arguments: [{ x: -110, y: 0, z: -67.2 }, { x: -110, y: 0, z: -75 }] } },

    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["explorer-186", { forward: 1 }, START + 2900] } },
    { command: "game.step", args: { dt: 0.02, steps: 72, now: START + 2920 } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["explorer-186"] } },
    { command: "service.call", args: { service: "map", method: "locationAt", arguments: [{ x: -110, y: 0, z: -74 }] } } },
    { command: "service.call", args: { service: "map", method: "acousticProfileAt", arguments: [{ x: -110, y: 0, z: -74 }] } } },

    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["explorer-186", { strafe: -1 }, START + 4500] } },
    { command: "game.step", args: { dt: 0.02, steps: 34, now: START + 4520 } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["explorer-186"] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["explorer-186", { interactPressed: true }, START + 5300] } },
    { command: "service.call", args: { service: "map", method: "interact", arguments: [{ entityId: "explorer-186", x: -112.1, y: 0, z: -74, now: START + 5400 }] } }
  ] },
  requestedAt: "2026-08-29T22:38:00+03:00"
});
