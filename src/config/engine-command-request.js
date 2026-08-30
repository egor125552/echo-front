const START = 2000021600000;
const PLAYER = "engine-nav-sanity-216";

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 216,
  mode: "battle-royale",
  room: "engine-nav-sanity-216",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: { commands: [
    { command: "service.call", args: { service: "match-api", method: "connectHuman", arguments: [PLAYER] } },
    { command: "service.call", args: { service: "movement", method: "teleport", arguments: [PLAYER, { x: 151.5, y: 0, z: 114.8, angle: 0 }] } },
    { command: "service.call", args: { service: "parachute", method: "finishMovement", arguments: [0.016, START] } },
    { command: "service.call", args: { service: "navigation", method: "selectTarget", arguments: [PLAYER, "two-storey-house", START + 1, { announce: false }] } },
    { command: "service.call", args: { service: "navigation", method: "toggle", arguments: [PLAYER, START + 2] } },
    { command: "service.call", args: { service: "navigation", method: "stateFor", arguments: [PLAYER, START + 3] } },
    { command: "service.call", args: { service: "navigation", method: "stop", arguments: [PLAYER, START + 4, "probe-one", { announce: false }] } },

    { command: "service.call", args: { service: "movement", method: "teleport", arguments: [PLAYER, { x: 133.5, y: 0, z: 115.36, angle: 0 }] } },
    { command: "service.call", args: { service: "navigation", method: "selectTarget", arguments: [PLAYER, "two-storey-house", START + 5, { announce: false }] } },
    { command: "service.call", args: { service: "navigation", method: "toggle", arguments: [PLAYER, START + 6] } },
    { command: "service.call", args: { service: "navigation", method: "stateFor", arguments: [PLAYER, START + 7] } },
    { command: "service.call", args: { service: "navigation", method: "stop", arguments: [PLAYER, START + 8, "probe-two", { announce: false }] } },
    { command: "service.call", args: { service: "match-api", method: "disconnectHuman", arguments: [PLAYER] } }
  ] },
  requestedAt: "2026-08-30T21:51:00+03:00"
});
