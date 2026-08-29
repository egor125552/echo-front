const START = 2000018800000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 188,
  mode: "battle-royale",
  room: "engine-play-loot-house-188",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: { commands: [
    { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [START] } },
    { command: "entity.spawn", args: { spec: { id: "explorer-188", kind: "human", name: "Loot House Explorer", bot: false, team: 18801, health: 400, weapons: ["pistol"], position: { x: -161.5, y: 0, z: 90, angle: -1.57079632679 } } } },
    { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["explorer-188", { x: -161.5, y: 0, z: 90, angle: -1.57079632679 }] } },
    { command: "service.call", args: { service: "parachute", method: "finishMovement", arguments: [0.02, START + 20] } },
    { command: "service.call", args: { service: "parachute", method: "stateFor", arguments: ["explorer-188"] } },

    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["explorer-188", { forward: 1 }, START + 100] } },
    { command: "game.step", args: { dt: 0.02, steps: 45, now: START + 120 } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["explorer-188"] } },

    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["explorer-188", { strafe: -1 }, START + 1200] } },
    { command: "game.step", args: { dt: 0.02, steps: 74, now: START + 1220 } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["explorer-188"] } },

    { command: "service.call", args: { service: "map", method: "acousticOcclusionBetween", arguments: [{ x: -162.2, y: 0, z: 95 }, { x: -171, y: 0, z: 95 }] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["explorer-188", { interactPressed: true }, START + 2800] } },
    { command: "service.call", args: { service: "map", method: "acousticOcclusionBetween", arguments: [{ x: -162.2, y: 0, z: 95 }, { x: -171, y: 0, z: 95 }] } },

    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["explorer-188", { forward: 1 }, START + 2900] } },
    { command: "game.step", args: { dt: 0.02, steps: 105, now: START + 2920 } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["explorer-188"] } },
    { command: "service.call", args: { service: "map", method: "locationAt", arguments: [{ x: -174, y: 0, z: 95 }] } },
    { command: "service.call", args: { service: "map", method: "acousticProfileAt", arguments: [{ x: -174, y: 0, z: 95 }] } },

    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["explorer-188", { forward: 1 }, START + 5200] } },
    { command: "game.step", args: { dt: 0.02, steps: 115, now: START + 5220 } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["explorer-188"] } },

    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["explorer-188", { strafe: 1 }, START + 7600] } },
    { command: "game.step", args: { dt: 0.02, steps: 62, now: START + 7620 } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["explorer-188"] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["explorer-188", { interactPressed: true }, START + 9000] } },
    { command: "service.call", args: { service: "map", method: "interact", arguments: [{ entityId: "explorer-188", x: -181, y: 0, z: 90.8, now: START + 9100 }] } }
  ] },
  requestedAt: "2026-08-29T22:41:00+03:00"
});
