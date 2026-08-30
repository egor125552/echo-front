const START = 2000021000000;
const PLAYER = "engine-stair-probe-210";

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 210,
  mode: "battle-royale",
  room: "engine-runtime-stair-probe-210",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: { commands: [
    { command: "service.call", args: { service: "match-api", method: "connectHuman", arguments: [PLAYER] } },
    { command: "service.call", args: { service: "movement", method: "teleport", arguments: [PLAYER, { x: 140.2, y: 0, z: 122.15, angle: 0 }] } },
    { command: "service.call", args: { service: "parachute", method: "finishMovement", arguments: [0.016, START] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: [PLAYER, { forward: 1, sprint: false }, START + 1] } },
    { command: "game.step", args: { dt: 0.05, steps: 55, now: START + 2 } },
    { command: "service.call", args: { service: "movement", method: "setInput", arguments: [PLAYER, {}] } },
    { command: "entity.inspect", args: { entityId: PLAYER } },
    { command: "service.call", args: { service: "map", method: "locationAt", arguments: [{ x: 140.2, y: 3.2, z: 114.9 }] } },
    { command: "service.call", args: { service: "movement", method: "teleport", arguments: [PLAYER, { x: 73.85, y: 0, z: 0, angle: -1.5707963267948966 }] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: [PLAYER, { forward: 1, sprint: false }, START + 5000] } },
    { command: "game.step", args: { dt: 0.05, steps: 55, now: START + 5001 } },
    { command: "service.call", args: { service: "movement", method: "setInput", arguments: [PLAYER, {}] } },
    { command: "entity.inspect", args: { entityId: PLAYER } },
    { command: "service.call", args: { service: "match-api", method: "disconnectHuman", arguments: [PLAYER] } }
  ] },
  requestedAt: "2026-08-30T20:03:00+03:00"
});
