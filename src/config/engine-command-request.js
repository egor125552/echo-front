const START = 2000019200000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 192,
  mode: "battle-royale",
  room: "engine-play-full-stair-192",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: { commands: [
    { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [START] } },
    { command: "entity.spawn", args: { spec: { id: "explorer-192", kind: "human", name: "Full Stair Explorer", bot: false, team: 19201, health: 400, weapons: ["pistol"], position: { x: 140.2, y: 0, z: 123.7, angle: 0 } } } },
    { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["explorer-192", { x: 140.2, y: 0, z: 123.7, angle: 0 }] } },
    { command: "service.call", args: { service: "parachute", method: "finishMovement", arguments: [0.02, START + 20] } },

    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["explorer-192", { forward: 1 }, START + 100] } },
    { command: "game.step", args: { dt: 0.02, steps: 65, now: START + 120 } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["explorer-192"] } },
    { command: "game.step", args: { dt: 0.02, steps: 65, now: START + 1500 } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["explorer-192"] } },
    { command: "game.step", args: { dt: 0.02, steps: 55, now: START + 2900 } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["explorer-192"] } },

    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["explorer-192", { turn: 1 }, START + 4100] } },
    { command: "game.step", args: { dt: 0.02, steps: 95, now: START + 4120 } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["explorer-192", { forward: 1 }, START + 6200] } },
    { command: "game.step", args: { dt: 0.02, steps: 70, now: START + 6220 } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["explorer-192"] } },
    { command: "game.step", args: { dt: 0.02, steps: 85, now: START + 7700 } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["explorer-192"] } },
    { command: "game.step", args: { dt: 0.02, steps: 55, now: START + 9500 } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["explorer-192"] } }
  ] },
  requestedAt: "2026-08-29T22:53:00+03:00"
});
