const START = 2000019000000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 190,
  mode: "battle-royale",
  room: "engine-play-two-storey-stairs-190",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: { commands: [
    { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [START] } },
    { command: "entity.spawn", args: { spec: { id: "explorer-190", kind: "human", name: "Two Storey Stair Explorer", bot: false, team: 19001, health: 400, weapons: ["pistol"], position: { x: 130, y: 0, z: 131, angle: 0 } } } },
    { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["explorer-190", { x: 130, y: 0, z: 131, angle: 0 }] } },
    { command: "service.call", args: { service: "parachute", method: "finishMovement", arguments: [0.02, START + 20] } },

    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["explorer-190", { forward: 1 }, START + 100] } },
    { command: "game.step", args: { dt: 0.02, steps: 55, now: START + 120 } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["explorer-190"] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["explorer-190", { strafe: 1 }, START + 1300] } },
    { command: "game.step", args: { dt: 0.02, steps: 78, now: START + 1320 } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["explorer-190"] } },

    { command: "service.call", args: { service: "map", method: "acousticOcclusionBetween", arguments: [{ x: 135, y: 0, z: 130 }, { x: 135, y: 0, z: 122.5 }] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["explorer-190", { interactPressed: true }, START + 3000] } },
    { command: "service.call", args: { service: "map", method: "acousticOcclusionBetween", arguments: [{ x: 135, y: 0, z: 130 }, { x: 135, y: 0, z: 122.5 }] } },

    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["explorer-190", { forward: 1 }, START + 3100] } },
    { command: "game.step", args: { dt: 0.02, steps: 62, now: START + 3120 } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["explorer-190"] } },

    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["explorer-190", { strafe: 1 }, START + 4500] } },
    { command: "game.step", args: { dt: 0.02, steps: 80, now: START + 4520 } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["explorer-190"] } },

    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["explorer-190", { forward: 1 }, START + 6200] } },
    { command: "game.step", args: { dt: 0.02, steps: 55, now: START + 6220 } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["explorer-190"] } },
    { command: "game.step", args: { dt: 0.02, steps: 75, now: START + 7400 } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["explorer-190"] } },
    { command: "service.call", args: { service: "map", method: "locationAt", arguments: [{ x: 140.2, y: 3.2, z: 114.9 }] } },

    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["explorer-190", { turn: 1 }, START + 9000] } },
    { command: "game.step", args: { dt: 0.02, steps: 95, now: START + 9020 } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["explorer-190", { forward: 1 }, START + 11000] } },
    { command: "game.step", args: { dt: 0.02, steps: 120, now: START + 11020 } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["explorer-190"] } }
  ] },
  requestedAt: "2026-08-29T22:47:00+03:00"
});
