const START = 2000015700000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 157,
  mode: "battle-royale",
  room: "engine-lab-slow-player-vehicle-bot-touch-157",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: { commands: [
    { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [START] } },
    { command: "entity.spawn", args: { spec: { id: "slow-driver-157", kind: "human", name: "Slow Driver", bot: false, team: 15701, health: 400, weapons: [], position: { x: 96.4, y: 1.1, z: 24, angle: 0 } } } },
    { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["slow-driver-157", { x: 96.4, y: 1.1, z: 24, angle: 0 }] } },
    { command: "game.step", args: { dt: 0.02, steps: 2, now: START + 20 } },
    { command: "service.call", args: { service: "vehicles", method: "enter", arguments: ["slow-driver-157", START + 60, "br-jeep-1"] } },
    { command: "service.call", args: { service: "vehicles", method: "setInput", arguments: ["slow-driver-157", { forward: 1 }] } },
    { command: "game.step", args: { dt: 0.02, steps: 75, now: START + 80 } },
    { command: "service.call", args: { service: "vehicles", method: "setInput", arguments: ["slow-driver-157", { forward: 0 }] } },
    { command: "service.call", args: { service: "vehicles", method: "stateFor", arguments: ["br-jeep-1"] } },
    { command: "entity.spawn", args: { spec: { id: "slow-target-bot-157", kind: "human", name: "Slow Target Bot", bot: true, team: 15701, health: 400, weapons: [], position: { x: 94.1, y: 1.1, z: 19.8, angle: 0 } } } },
    { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["slow-target-bot-157", { x: 94.1, y: 1.1, z: 19.8, angle: 0 }] } },
    { command: "service.call", args: { service: "bots", method: "isBot", arguments: ["slow-target-bot-157"] } },
    { command: "game.step", args: { dt: 0.02, steps: 45, now: START + 1700 } },
    { command: "service.call", args: { service: "vehicles", method: "stateFor", arguments: ["br-jeep-1"] } },
    { command: "service.call", args: { service: "ragdoll", method: "isActive", arguments: ["slow-target-bot-157"] } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["slow-target-bot-157"] } },
    { command: "service.call", args: { service: "fleet-pedestrian-ragdoll", method: "summary", arguments: [] } }
  ] },
  requestedAt: "2026-08-29T20:05:00Z"
});
