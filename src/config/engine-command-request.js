const START = 2000016300000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 163,
  mode: "battle-royale",
  room: "engine-lab-navigation-vehicle-163",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: { commands: [
    { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [START] } },
    { command: "entity.spawn", args: { spec: { id: "nav-driver-163", kind: "human", name: "Navigation Vehicle Driver", bot: false, team: 16301, health: 400, weapons: [], position: { x: 94, y: 0, z: 24, angle: 0 } } } },
    { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["nav-driver-163", { x: 94, y: 0, z: 24, angle: 0 }] } },
    { command: "game.step", args: { dt: 0.02, steps: 2, now: START + 20 } },
    { command: "service.call", args: { service: "vehicles", method: "enter", arguments: ["nav-driver-163", START + 70, "br-jeep-1"] } },
    { command: "service.call", args: { service: "navigation", method: "selectTarget", arguments: ["nav-driver-163", "warehouse", START + 80] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["nav-driver-163", { navigationFacePressed: true }, START + 100] } },
    { command: "service.call", args: { service: "navigation-face", method: "assertGuidance", arguments: ["nav-driver-163", true, 0] } },
    { command: "service.call", args: { service: "vehicles", method: "vehicleForDriver", arguments: ["nav-driver-163"] } },
    { command: "service.call", args: { service: "navigation", method: "stateFor", arguments: ["nav-driver-163", START + 110] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["nav-driver-163", { forward: 1 }, START + 120] } },
    { command: "game.step", args: { dt: 0.02, steps: 200, now: START + 140 } },
    { command: "service.call", args: { service: "vehicles", method: "vehicleForDriver", arguments: ["nav-driver-163"] } },
    { command: "service.call", args: { service: "navigation-face", method: "assertGuidance", arguments: ["nav-driver-163", true, 20] } },
    { command: "service.call", args: { service: "navigation-face", method: "stateFor", arguments: ["nav-driver-163"] } },
    { command: "service.call", args: { service: "navigation", method: "stateFor", arguments: ["nav-driver-163", START + 4200] } }
  ] },
  requestedAt: "2026-08-29T14:31:00+03:00"
});
