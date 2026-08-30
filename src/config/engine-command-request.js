const START = 2000020900000;
const PLAYER = "engine-nav-ground-probe-209";

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 209,
  mode: "battle-royale",
  room: "engine-runtime-smoke-209",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: { commands: [
    { command: "service.call", args: { service: "building-design-validator", method: "validateAll", arguments: [] } },
    { command: "service.call", args: { service: "match-api", method: "connectHuman", arguments: [PLAYER] } },
    { command: "service.call", args: { service: "movement", method: "teleport", arguments: [PLAYER, { x: 94, y: 0, z: 24 }] } },
    { command: "service.call", args: { service: "parachute", method: "finishMovement", arguments: [0.016, START] } },
    { command: "service.call", args: { service: "parachute", method: "stateFor", arguments: [PLAYER] } },
    { command: "service.call", args: { service: "navigation", method: "selectTarget", arguments: [PLAYER, "two-storey-house", START + 1, { announce: false }] } },
    { command: "service.call", args: { service: "navigation", method: "toggle", arguments: [PLAYER, START + 2] } },
    { command: "service.call", args: { service: "navigation", method: "stateFor", arguments: [PLAYER, START + 3] } },
    { command: "service.call", args: { service: "vehicles", method: "enter", arguments: [PLAYER, START + 4, "br-jeep-1"] } },
    { command: "service.call", args: { service: "navigation", method: "stateFor", arguments: [PLAYER, START + 5] } },
    { command: "service.call", args: { service: "vehicles", method: "exit", arguments: [PLAYER, START + 6, "engine-control"] } },
    { command: "service.call", args: { service: "navigation", method: "stateFor", arguments: [PLAYER, START + 7] } },
    { command: "service.call", args: { service: "match-api", method: "disconnectHuman", arguments: [PLAYER] } }
  ] },
  requestedAt: "2026-08-30T18:44:00+02:00"
});
