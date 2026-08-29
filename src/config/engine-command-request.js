const START = 2000019100000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 191,
  mode: "battle-royale",
  room: "engine-play-continuous-stair-191",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: { commands: [
    { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [START] } },
    { command: "entity.spawn", args: { spec: { id: "explorer-191", kind: "human", name: "Continuous Stair Explorer", bot: false, team: 19101, health: 400, weapons: ["pistol"], position: { x: 140.2, y: 0, z: 123.7, angle: 0 } } } },
    { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["explorer-191", { x: 140.2, y: 0, z: 123.7, angle: 0 }] } },
    { command: "service.call", args: { service: "parachute", method: "finishMovement", arguments: [0.02, START + 20] } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["explorer-191"] } },

    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["explorer-191", { forward: 1 }, START + 100] } },
    { command: "game.step", args: { dt: 0.02, steps: 55, now: START + 120 } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["explorer-191"] } },
    { command: "game.step", args: { dt: 0.02, steps: 75, now: START + 1300 } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["explorer-191"] } },

    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["explorer-191", { turn: 1 }, START + 3000] } },
    { command: "game.step", args: { dt: 0.02, steps: 95, now: START + 3020 } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["explorer-191", { forward: 1 }, START + 5100] } },
    { command: "game.step", args: { dt: 0.02, steps: 130, now: START + 5120 } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["explorer-191"] } }
  ] },
  requestedAt: "2026-08-29T22:50:00+03:00"
});
