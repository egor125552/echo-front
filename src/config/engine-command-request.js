const START = 2000019900000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 199,
  mode: "battle-royale",
  room: "engine-play-supercar-navigation-199",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: { commands: [
    { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [START] } },
    { command: "entity.spawn", args: { spec: { id: "driver-199", kind: "human", name: "Supercar Navigation Driver", bot: false, team: 19901, health: 400, weapons: ["pistol"], position: { x: -92.5, y: 0, z: 520, angle: 0 } } } },
    { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["driver-199", { x: -92.5, y: 0, z: 520, angle: 0 }] } },
    { command: "service.call", args: { service: "parachute", method: "finishMovement", arguments: [0.02, START + 20] } },
    { command: "service.call", args: { service: "vehicles", method: "enter", arguments: ["driver-199", START + 40, "br-supercar-1"] } },
    { command: "service.call", args: { service: "vehicles", method: "vehicleForDriver", arguments: ["driver-199"] } },

    { command: "service.call", args: { service: "navigation", method: "selectTarget", arguments: ["driver-199", "two-storey-house", START + 80] } },
    { command: "service.call", args: { service: "navigation-stability", method: "previewDistance", arguments: ["driver-199"] } },
    { command: "service.call", args: { service: "match-api", method: "snapshotFor", arguments: ["driver-199", START + 90] } },
    { command: "service.call", args: { service: "navigation", method: "toggle", arguments: ["driver-199", START + 100] } },
    { command: "service.call", args: { service: "navigation-face", method: "enableGuidance", arguments: ["driver-199", START + 120] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["driver-199", { forward: 1, fireHeld: true }, START + 140] } },

    { command: "game.step", args: { dt: 0.02, steps: 250, now: START + 160 } },
    { command: "service.call", args: { service: "vehicles", method: "vehicleForDriver", arguments: ["driver-199"] } },
    { command: "service.call", args: { service: "navigation", method: "stateFor", arguments: ["driver-199", START + 5180] } },
    { command: "service.call", args: { service: "navigation-stability", method: "stateFor", arguments: ["driver-199"] } },

    { command: "game.step", args: { dt: 0.02, steps: 250, now: START + 5200 } },
    { command: "service.call", args: { service: "vehicles", method: "vehicleForDriver", arguments: ["driver-199"] } },
    { command: "service.call", args: { service: "navigation", method: "stateFor", arguments: ["driver-199", START + 10220] } },
    { command: "service.call", args: { service: "navigation-stability", method: "stateFor", arguments: ["driver-199"] } },

    { command: "game.step", args: { dt: 0.02, steps: 250, now: START + 10240 } },
    { command: "service.call", args: { service: "vehicles", method: "vehicleForDriver", arguments: ["driver-199"] } },
    { command: "service.call", args: { service: "navigation", method: "stateFor", arguments: ["driver-199", START + 15260] } },
    { command: "service.call", args: { service: "navigation-stability", method: "stateFor", arguments: ["driver-199"] } },

    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["driver-199", { forward: 1, fireHeld: false }, START + 15280] } },
    { command: "game.step", args: { dt: 0.02, steps: 250, now: START + 15300 } },
    { command: "service.call", args: { service: "vehicles", method: "vehicleForDriver", arguments: ["driver-199"] } },
    { command: "service.call", args: { service: "navigation", method: "stateFor", arguments: ["driver-199", START + 20320] } },
    { command: "service.call", args: { service: "navigation-stability", method: "stateFor", arguments: ["driver-199"] } },
    { command: "service.call", args: { service: "match-api", method: "snapshotFor", arguments: ["driver-199", START + 20340] } }
  ] },
  requestedAt: "2026-08-30T08:51:00+03:00"
});
