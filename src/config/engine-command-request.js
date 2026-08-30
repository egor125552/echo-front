const START = 2000021100000;
const PLAYER = "engine-user-playtest-211";
const LANDING = { x: 20, y: 0, z: 40 };

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 211,
  mode: "battle-royale",
  room: "engine-user-playtest-211",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: { commands: [
    { command: "service.call", args: { service: "building-design-validator", method: "validateAll", arguments: [] } },
    { command: "service.call", args: { service: "match-api", method: "connectHuman", arguments: [PLAYER] } },
    { command: "service.call", args: { service: "movement", method: "teleport", arguments: [PLAYER, { ...LANDING, angle: 0 }] } },
    { command: "service.call", args: { service: "parachute", method: "finishMovement", arguments: [0.016, START] } },
    { command: "service.call", args: { service: "dropzone-vehicle", method: "placeNear", arguments: [PLAYER, LANDING, START + 1] } },
    { command: "service.call", args: { service: "dropzone-vehicle", method: "assignedFor", arguments: [PLAYER] } },
    { command: "service.call", args: { service: "dropzone-vehicle", method: "assertNear", arguments: [LANDING, 18, PLAYER] } },

    { command: "service.call", args: { service: "navigation", method: "selectTarget", arguments: [PLAYER, "loot-house", START + 10, { announce: false }] } },
    { command: "service.call", args: { service: "navigation", method: "toggle", arguments: [PLAYER, START + 11] } },
    { command: "service.call", args: { service: "navigation", method: "stateFor", arguments: [PLAYER, START + 12] } },
    { command: "service.call", args: { service: "vehicles", method: "enter", arguments: [PLAYER, START + 13, "br-supercar-1"] } },
    { command: "service.call", args: { service: "navigation", method: "stateFor", arguments: [PLAYER, START + 14] } },
    { command: "service.call", args: { service: "vehicles", method: "exit", arguments: [PLAYER, START + 15, "engine-control-playtest"] } },
    { command: "service.call", args: { service: "navigation", method: "stateFor", arguments: [PLAYER, START + 16] } },

    { command: "service.call", args: { service: "map", method: "acousticProfileAt", arguments: [{ x: -166.7, y: 0, z: 99.2 }] } },
    { command: "service.call", args: { service: "map", method: "acousticOcclusionBetween", arguments: [{ x: -166.7, y: 0, z: 99.2 }, { x: -158, y: 0, z: 99.2 }] } },

    { command: "service.call", args: { service: "movement", method: "teleport", arguments: [PLAYER, { x: 139.15, y: 0, z: 122.15, angle: 0 }] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: [PLAYER, { forward: 1, sprint: false }, START + 20] } },
    { command: "game.step", args: { dt: 0.05, steps: 60, now: START + 21 } },
    { command: "service.call", args: { service: "movement", method: "setInput", arguments: [PLAYER, {}] } },
    { command: "entity.inspect", args: { entityId: PLAYER } },

    { command: "service.call", args: { service: "movement", method: "teleport", arguments: [PLAYER, { x: -181.7, y: 0, z: 99.8, angle: 0 }] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: [PLAYER, { interactPressed: true }, START + 30] } },
    { command: "entity.inspect", args: { entityId: PLAYER } },
    { command: "service.call", args: { service: "navigation-stability", method: "stateFor", arguments: [PLAYER] } },
    { command: "service.call", args: { service: "match-api", method: "disconnectHuman", arguments: [PLAYER] } }
  ] },
  requestedAt: "2026-08-30T20:16:00+03:00"
});
