const START = 2000021500000;
const PLAYER = "engine-vehicle-door-215";
const LANDING = { x: 150, y: 0, z: 120 };

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 215,
  mode: "battle-royale",
  room: "engine-vehicle-door-215",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: { commands: [
    { command: "service.call", args: { service: "match-api", method: "connectHuman", arguments: [PLAYER] } },
    { command: "service.call", args: { service: "movement", method: "teleport", arguments: [PLAYER, { ...LANDING, angle: 0 }] } },
    { command: "service.call", args: { service: "parachute", method: "finishMovement", arguments: [0.016, START] } },
    { command: "service.call", args: { service: "dropzone-vehicle", method: "placeNear", arguments: [PLAYER, LANDING, START + 1] } },
    { command: "service.call", args: { service: "dropzone-vehicle", method: "assignedFor", arguments: [PLAYER] } },
    { command: "service.call", args: { service: "movement", method: "teleport", arguments: [PLAYER, { x: 160.5, y: 0, z: 120, angle: 0 }] } },
    { command: "service.call", args: { service: "vehicles", method: "enter", arguments: [PLAYER, START + 2, "br-supercar-1"] } },
    { command: "service.call", args: { service: "navigation", method: "selectTarget", arguments: [PLAYER, "two-storey-house", START + 3, { announce: false }] } },
    { command: "service.call", args: { service: "navigation", method: "toggle", arguments: [PLAYER, START + 4] } },
    { command: "service.call", args: { service: "navigation", method: "stateFor", arguments: [PLAYER, START + 5] } },
    { command: "service.call", args: { service: "vehicles", method: "exit", arguments: [PLAYER, START + 6, "engine-control"] } },
    { command: "service.call", args: { service: "match-api", method: "disconnectHuman", arguments: [PLAYER] } }
  ] },
  requestedAt: "2026-08-30T21:18:00+03:00"
});
