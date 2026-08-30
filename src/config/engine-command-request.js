const START = 2000020400000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 204,
  mode: "battle-royale",
  room: "engine-trace-supercar-crash-204",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: { commands: [
    { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [START] } },
    { command: "entity.spawn", args: { spec: { id: "driver-204", kind: "human", name: "Crash Trace Driver", bot: false, team: 20401, health: 400, weapons: ["pistol"], position: { x: -92.5, y: 0, z: 520, angle: 0 } } } },
    { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["driver-204", { x: -92.5, y: 0, z: 520, angle: 0 }] } },
    { command: "service.call", args: { service: "parachute", method: "finishMovement", arguments: [0.02, START + 20] } },
    { command: "service.call", args: { service: "vehicles", method: "enter", arguments: ["driver-204", START + 40, "br-supercar-1"] } },
    { command: "service.call", args: { service: "navigation", method: "selectTarget", arguments: ["driver-204", "two-storey-house", START + 60] } },
    { command: "service.call", args: { service: "navigation", method: "toggle", arguments: ["driver-204", START + 80] } },
    { command: "service.call", args: { service: "navigation-face", method: "enableGuidance", arguments: ["driver-204", START + 100] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["driver-204", { forward: 1, fireHeld: true }, START + 120] } },

    { command: "game.step", args: { dt: 0.02, steps: 100, now: START + 140 } },
    { command: "service.call", args: { service: "vehicles", method: "vehicleForDriver", arguments: ["driver-204"] } },
    { command: "game.step", args: { dt: 0.02, steps: 100, now: START + 2160 } },
    { command: "service.call", args: { service: "vehicles", method: "vehicleForDriver", arguments: ["driver-204"] } },
    { command: "game.step", args: { dt: 0.02, steps: 100, now: START + 4180 } },
    { command: "service.call", args: { service: "vehicles", method: "vehicleForDriver", arguments: ["driver-204"] } },
    { command: "game.step", args: { dt: 0.02, steps: 100, now: START + 6200 } },
    { command: "service.call", args: { service: "vehicles", method: "vehicleForDriver", arguments: ["driver-204"] } },
    { command: "game.step", args: { dt: 0.02, steps: 100, now: START + 8220 } },
    { command: "service.call", args: { service: "vehicles", method: "vehicleForDriver", arguments: ["driver-204"] } },
    { command: "game.step", args: { dt: 0.02, steps: 100, now: START + 10240 } },
    { command: "service.call", args: { service: "vehicles", method: "vehicleForDriver", arguments: ["driver-204"] } },
    { command: "game.step", args: { dt: 0.02, steps: 100, now: START + 12260 } },
    { command: "service.call", args: { service: "vehicles", method: "vehicleForDriver", arguments: ["driver-204"] } },
    { command: "game.step", args: { dt: 0.02, steps: 100, now: START + 14280 } },
    { command: "service.call", args: { service: "vehicles", method: "vehicleForDriver", arguments: ["driver-204"] } },
    { command: "game.step", args: { dt: 0.02, steps: 100, now: START + 16300 } },
    { command: "service.call", args: { service: "vehicles", method: "vehicleForDriver", arguments: ["driver-204"] } },

    { command: "service.call", args: { service: "parkour-ragdoll", method: "summary", arguments: [] } },
    { command: "service.call", args: { service: "navigation-stability", method: "stateFor", arguments: ["driver-204"] } },
    { command: "service.call", args: { service: "navigation", method: "stateFor", arguments: ["driver-204", START + 18340] } }
  ] },
  requestedAt: "2026-08-30T09:34:00+03:00"
});
