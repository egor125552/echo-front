const START = 2000021200000;
const PLAYER = "engine-ordinary-player-212";
const LANDING = { x: 20, y: 0, z: 40 };

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 212,
  mode: "battle-royale",
  room: "engine-ordinary-player-212",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: { commands: [
    { command: "service.call", args: { service: "match-api", method: "connectHuman", arguments: [PLAYER] } },
    { command: "service.call", args: { service: "movement", method: "teleport", arguments: [PLAYER, { ...LANDING, angle: 0 }] } },
    { command: "service.call", args: { service: "parachute", method: "finishMovement", arguments: [0.016, START] } },
    { command: "service.call", args: { service: "dropzone-vehicle", method: "placeNear", arguments: [PLAYER, LANDING, START + 1] } },
    { command: "service.call", args: { service: "dropzone-vehicle", method: "assignedFor", arguments: [PLAYER] } },

    { command: "service.call", args: { service: "navigation", method: "selectTarget", arguments: [PLAYER, "loot-house", START + 10, { announce: false }] } },
    { command: "service.call", args: { service: "navigation", method: "toggle", arguments: [PLAYER, START + 11] } },
    { command: "service.call", args: { service: "movement", method: "teleport", arguments: [PLAYER, { x: 30, y: 0, z: 40, angle: 0 }] } },
    { command: "service.call", args: { service: "vehicles", method: "enter", arguments: [PLAYER, START + 12, "br-supercar-1"] } },
    { command: "service.call", args: { service: "navigation", method: "stateFor", arguments: [PLAYER, START + 13] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: [PLAYER, { forward: 1, strafe: 0, sprint: false }, START + 14] } },
    { command: "game.step", args: { dt: 0.05, steps: 60, now: START + 15 } },
    { command: "service.call", args: { service: "vehicles", method: "stateFor", arguments: ["br-supercar-1"] } },
    { command: "service.call", args: { service: "navigation", method: "stateFor", arguments: [PLAYER, START + 3016] } },
    { command: "service.call", args: { service: "navigation-stability", method: "stateFor", arguments: [PLAYER] } },
    { command: "service.call", args: { service: "vehicles", method: "exit", arguments: [PLAYER, START + 3017, "engine-control-playtest"] } },
    { command: "service.call", args: { service: "navigation", method: "stateFor", arguments: [PLAYER, START + 3018] } },

    { command: "service.call", args: { service: "movement", method: "teleport", arguments: [PLAYER, { x: -162.8, y: 0, z: 95, angle: -1.5707963267948966 }] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: [PLAYER, { interactPressed: true }, START + 4000] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: [PLAYER, { forward: 1 }, START + 4001] } },
    { command: "game.step", args: { dt: 0.05, steps: 18, now: START + 4002 } },
    { command: "service.call", args: { service: "movement", method: "setInput", arguments: [PLAYER, {}] } },
    { command: "entity.inspect", args: { entityId: PLAYER } },
    { command: "service.call", args: { service: "map", method: "acousticProfileAt", arguments: [{ x: -166.2, y: 0, z: 95 }] } },
    { command: "service.call", args: { service: "map", method: "acousticOcclusionBetween", arguments: [{ x: -166.2, y: 0, z: 99.2 }, { x: -158, y: 0, z: 99.2 }] } },

    { command: "service.call", args: { service: "weapons", method: "grant", arguments: [PLAYER, "rifle"] } },
    { command: "service.call", args: { service: "movement", method: "teleport", arguments: [PLAYER, { x: -168.3, y: 0, z: 90.2, angle: 0 }] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: [PLAYER, { interactPressed: true }, START + 5000] } },
    { command: "entity.inspect", args: { entityId: PLAYER } },
    { command: "service.call", args: { service: "match-api", method: "disconnectHuman", arguments: [PLAYER] } }
  ] },
  requestedAt: "2026-08-30T20:19:00+03:00"
});
