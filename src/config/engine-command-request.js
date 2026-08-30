const START = 2000020200000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 202,
  mode: "battle-royale",
  room: "engine-play-supercar-safe-arrival-202",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: { commands: [
    { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [START] } },
    { command: "entity.spawn", args: { spec: { id: "driver-202", kind: "human", name: "Safe Arrival Driver", bot: false, team: 20201, health: 400, weapons: ["pistol"], position: { x: -92.5, y: 0, z: 520, angle: 0 } } } },
    { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["driver-202", { x: -92.5, y: 0, z: 520, angle: 0 }] } },
    { command: "service.call", args: { service: "parachute", method: "finishMovement", arguments: [0.02, START + 20] } },
    { command: "service.call", args: { service: "vehicles", method: "enter", arguments: ["driver-202", START + 40, "br-supercar-1"] } },
    { command: "service.call", args: { service: "vehicles", method: "vehicleForDriver", arguments: ["driver-202"] } },

    { command: "service.call", args: { service: "navigation", method: "selectTarget", arguments: ["driver-202", "two-storey-house", START + 80] } },
    { command: "service.call", args: { service: "navigation-stability", method: "previewDistance", arguments: ["driver-202"] } },
    { command: "service.call", args: { service: "navigation", method: "toggle", arguments: ["driver-202", START + 100] } },
    { command: "service.call", args: { service: "navigation-face", method: "enableGuidance", arguments: ["driver-202", START + 120] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["driver-202", { forward: 1, fireHeld: true }, START + 140] } },

    { command: "game.step", args: { dt: 0.02, steps: 250, now: START + 160 } },
    { command: "service.call", args: { service: "vehicles", method: "vehicleForDriver", arguments: ["driver-202"] } },
    { command: "game.step", args: { dt: 0.02, steps: 250, now: START + 5180 } },
    { command: "service.call", args: { service: "vehicles", method: "vehicleForDriver", arguments: ["driver-202"] } },
    { command: "game.step", args: { dt: 0.02, steps: 250, now: START + 10200 } },
    { command: "service.call", args: { service: "vehicles", method: "vehicleForDriver", arguments: ["driver-202"] } },
    { command: "game.step", args: { dt: 0.02, steps: 250, now: START + 15220 } },

    { command: "service.call", args: { service: "vehicles", method: "vehicleForDriver", arguments: ["driver-202"] } },
    { command: "service.call", args: { service: "navigation", method: "stateFor", arguments: ["driver-202", START + 20240] } },
    { command: "service.call", args: { service: "navigation-stability", method: "stateFor", arguments: ["driver-202"] } },
    { command: "service.call", args: { service: "parkour-ragdoll", method: "summary", arguments: [] } },
    { command: "service.call", args: { service: "match-api", method: "snapshotFor", arguments: ["driver-202", START + 20260] } },

    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["driver-202", { forward: 0, fireHeld: false }, START + 20280] } },
    { command: "game.step", args: { dt: 0.02, steps: 50, now: START + 20300 } },
    { command: "service.call", args: { service: "vehicles", method: "vehicleForDriver", arguments: ["driver-202"] } },
    { command: "service.call", args: { service: "navigation-stability", method: "stateFor", arguments: ["driver-202"] } },
    { command: "service.call", args: { service: "parkour-ragdoll", method: "summary", arguments: [] } },
    { command: "service.call", args: { service: "match-api", method: "snapshotFor", arguments: ["driver-202", START + 21320] } }
  ] },
  requestedAt: "2026-08-30T09:25:00+03:00"
});
