const START = 2000019800000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 198,
  mode: "battle-royale",
  room: "engine-play-navigation-stability-198",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: { commands: [
    { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [START] } },
    { command: "entity.spawn", args: { spec: { id: "driver-198", kind: "human", name: "Navigation Driver", bot: false, team: 19801, health: 400, weapons: ["pistol"], position: { x: 94, y: 0, z: 24, angle: 0 } } } },
    { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["driver-198", { x: 94, y: 0, z: 24, angle: 0 }] } },
    { command: "service.call", args: { service: "parachute", method: "finishMovement", arguments: [0.02, START + 20] } },
    { command: "service.call", args: { service: "vehicles", method: "enter", arguments: ["driver-198", START + 40, "br-jeep-1"] } },
    { command: "service.call", args: { service: "vehicles", method: "vehicleForDriver", arguments: ["driver-198"] } },

    { command: "service.call", args: { service: "navigation", method: "selectTarget", arguments: ["driver-198", "two-storey-house", START + 80] } },
    { command: "service.call", args: { service: "navigation-stability", method: "previewDistance", arguments: ["driver-198"] } },
    { command: "service.call", args: { service: "match-api", method: "snapshotFor", arguments: ["driver-198", START + 90] } },
    { command: "service.call", args: { service: "navigation", method: "toggle", arguments: ["driver-198", START + 100] } },
    { command: "service.call", args: { service: "navigation", method: "stateFor", arguments: ["driver-198", START + 120] } },
    { command: "service.call", args: { service: "navigation-face", method: "enableGuidance", arguments: ["driver-198", START + 140] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["driver-198", { forward: 1, fireHeld: true }, START + 160] } },

    { command: "game.step", args: { dt: 0.02, steps: 150, now: START + 180 } },
    { command: "service.call", args: { service: "vehicles", method: "vehicleForDriver", arguments: ["driver-198"] } },
    { command: "service.call", args: { service: "navigation", method: "stateFor", arguments: ["driver-198", START + 3200] } },
    { command: "service.call", args: { service: "navigation-stability", method: "stateFor", arguments: ["driver-198"] } },

    { command: "game.step", args: { dt: 0.02, steps: 150, now: START + 3220 } },
    { command: "service.call", args: { service: "vehicles", method: "vehicleForDriver", arguments: ["driver-198"] } },
    { command: "service.call", args: { service: "navigation", method: "stateFor", arguments: ["driver-198", START + 6240] } },
    { command: "service.call", args: { service: "navigation-stability", method: "stateFor", arguments: ["driver-198"] } },

    { command: "game.step", args: { dt: 0.02, steps: 200, now: START + 6260 } },
    { command: "service.call", args: { service: "vehicles", method: "vehicleForDriver", arguments: ["driver-198"] } },
    { command: "service.call", args: { service: "navigation", method: "stateFor", arguments: ["driver-198", START + 10280] } },
    { command: "service.call", args: { service: "navigation-stability", method: "stateFor", arguments: ["driver-198"] } },

    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["driver-198", { forward: 1, fireHeld: false }, START + 10300] } },
    { command: "game.step", args: { dt: 0.02, steps: 250, now: START + 10320 } },
    { command: "service.call", args: { service: "vehicles", method: "vehicleForDriver", arguments: ["driver-198"] } },
    { command: "service.call", args: { service: "navigation", method: "stateFor", arguments: ["driver-198", START + 15340] } },
    { command: "service.call", args: { service: "navigation-stability", method: "stateFor", arguments: ["driver-198"] } },
    { command: "service.call", args: { service: "match-api", method: "snapshotFor", arguments: ["driver-198", START + 15360] } }
  ] },
  requestedAt: "2026-08-30T08:48:00+03:00"
});
