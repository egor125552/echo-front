const START = 2000021300000;
const PLAYER = "engine-door-stair-213";

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 213,
  mode: "battle-royale",
  room: "engine-door-stair-213",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: { commands: [
    { command: "service.call", args: { service: "building-design-validator", method: "validateAll", arguments: [] } },
    { command: "service.call", args: { service: "match-api", method: "connectHuman", arguments: [PLAYER] } },
    { command: "service.call", args: { service: "movement", method: "teleport", arguments: [PLAYER, { x: 151, y: 0, z: 120, angle: -1.5707963267948966 }] } },
    { command: "service.call", args: { service: "parachute", method: "finishMovement", arguments: [0.016, START] } },

    { command: "service.call", args: { service: "navigation", method: "selectTarget", arguments: [PLAYER, "two-storey-house", START + 1, { announce: false }] } },
    { command: "service.call", args: { service: "navigation", method: "toggle", arguments: [PLAYER, START + 2] } },
    { command: "service.call", args: { service: "navigation", method: "stateFor", arguments: [PLAYER, START + 3] } },
    { command: "service.call", args: { service: "navigation", method: "stop", arguments: [PLAYER, START + 4, "engine-door-probe", { announce: false }] } },

    { command: "service.call", args: { service: "movement", method: "teleport", arguments: [PLAYER, { x: 146.2, y: 0, z: 120, angle: -1.5707963267948966 }] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: [PLAYER, { interactPressed: true }, START + 10] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: [PLAYER, { forward: 1, strafe: 0, sprint: false }, START + 11] } },
    { command: "game.step", args: { dt: 0.05, steps: 68, now: START + 12 } },
    { command: "service.call", args: { service: "movement", method: "setInput", arguments: [PLAYER, {}] } },
    { command: "entity.inspect", args: { entityId: PLAYER } },
    { command: "service.call", args: { service: "map", method: "locationAt", arguments: [{ x: 135.2, y: 3.15, z: 120 }] } },
    { command: "service.call", args: { service: "match-api", method: "disconnectHuman", arguments: [PLAYER] } }
  ] },
  requestedAt: "2026-08-30T21:14:00+03:00"
});
