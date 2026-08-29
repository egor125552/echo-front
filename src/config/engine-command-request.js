const START = 2000016500000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 165,
  mode: "battle-royale",
  room: "engine-lab-navigation-vehicle-override-165",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: { commands: [
    { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [START] } },
    { command: "entity.spawn", args: { spec: { id: "nav-driver-165", kind: "human", name: "Navigation Override Driver", bot: false, team: 16501, health: 400, weapons: [], position: { x: 94, y: 0, z: 24, angle: 0 } } } },
    { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["nav-driver-165", { x: 94, y: 0, z: 24, angle: 0 }] } },
    { command: "game.step", args: { dt: 0.02, steps: 2, now: START + 20 } },
    { command: "service.call", args: { service: "vehicles", method: "enter", arguments: ["nav-driver-165", START + 70, "br-jeep-1"] } },
    { command: "service.call", args: { service: "navigation", method: "selectTarget", arguments: ["nav-driver-165", "warehouse", START + 80] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["nav-driver-165", { navigationFacePressed: true }, START + 100] } },
    { command: "service.call", args: { service: "match-api", method: "snapshotFor", arguments: ["nav-driver-165", START + 110] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["nav-driver-165", { forward: 1 }, START + 120] } },
    { command: "game.step", args: { dt: 0.02, steps: 100, now: START + 140 } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["nav-driver-165", { forward: 1, strafe: 1 }, START + 2200] } },
    { command: "game.step", args: { dt: 0.02, steps: 30, now: START + 2210 } },
    { command: "service.call", args: { service: "navigation-face", method: "stateFor", arguments: ["nav-driver-165"] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["nav-driver-165", { forward: 1, strafe: 0 }, START + 2850] } },
    { command: "game.step", args: { dt: 0.02, steps: 30, now: START + 2860 } },
    { command: "service.call", args: { service: "navigation-face", method: "stateFor", arguments: ["nav-driver-165"] } },
    { command: "service.call", args: { service: "match-api", method: "snapshotFor", arguments: ["nav-driver-165", START + 3500] } }
  ] },
  requestedAt: "2026-08-29T14:38:00+03:00"
});
