const START = 2000020800000;
const PLAYER = "engine-nav-probe-208";

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 208,
  mode: "battle-royale",
  room: "engine-runtime-smoke-208",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: { commands: [
    { command: "service.call", args: { service: "building-design-validator", method: "validateAll", arguments: [] } },
    { command: "service.call", args: { service: "building-factory", method: "list", arguments: [] } },
    { command: "service.call", args: { service: "match-api", method: "connectHuman", arguments: [PLAYER] } },
    { command: "service.call", args: { service: "movement", method: "teleport", arguments: [PLAYER, { x: 94, y: 0, z: 24 }] } },
    { command: "service.call", args: { service: "navigation", method: "selectTarget", arguments: [PLAYER, "two-storey-house", START, { announce: false }] } },
    { command: "service.call", args: { service: "navigation", method: "toggle", arguments: [PLAYER, START + 1] } },
    { command: "service.call", args: { service: "navigation", method: "stateFor", arguments: [PLAYER, START + 2] } },
    { command: "service.call", args: { service: "vehicles", method: "enter", arguments: [PLAYER, START + 3, "br-jeep-1"] } },
    { command: "service.call", args: { service: "navigation", method: "stateFor", arguments: [PLAYER, START + 4] } },
    { command: "service.call", args: { service: "vehicles", method: "exit", arguments: [PLAYER, START + 5, "engine-control"] } },
    { command: "service.call", args: { service: "navigation", method: "stateFor", arguments: [PLAYER, START + 6] } },
    { command: "service.call", args: { service: "match-api", method: "disconnectHuman", arguments: [PLAYER] } }
  ] },
  requestedAt: "2026-08-30T18:42:00+02:00"
});
