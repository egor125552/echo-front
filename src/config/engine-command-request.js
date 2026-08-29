const START = 2000019300000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 193,
  mode: "battle-royale",
  room: "engine-play-crate-reach-193",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: { commands: [
    { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [START] } },
    { command: "entity.spawn", args: { spec: { id: "explorer-193", kind: "human", name: "Crate Sweep Explorer", bot: false, team: 19301, health: 400, weapons: ["pistol"], position: { x: -178, y: 0, z: 90.8, angle: -1.57079632679 } } } },
    { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["explorer-193", { x: -178, y: 0, z: 90.8, angle: -1.57079632679 }] } },
    { command: "service.call", args: { service: "parachute", method: "finishMovement", arguments: [0.02, START + 20] } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["explorer-193"] } },

    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["explorer-193", { forward: 1 }, START + 100] } },
    { command: "game.step", args: { dt: 0.02, steps: 20, now: START + 120 } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["explorer-193"] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["explorer-193", { interactPressed: true }, START + 600] } },
    { command: "service.call", args: { service: "map", method: "interact", arguments: [{ entityId: "explorer-193", x: -179.3, y: 0, z: 90.8, now: START + 700 }] } },

    { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["explorer-193", { x: -178, y: 0, z: 90.8, angle: -1.57079632679 }] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["explorer-193", { forward: 1 }, START + 800] } },
    { command: "game.step", args: { dt: 0.02, steps: 48, now: START + 820 } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["explorer-193"] } }
  ] },
  requestedAt: "2026-08-29T22:56:00+03:00"
});
