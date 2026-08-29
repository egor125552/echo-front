const START = 2000015000000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 150,
  mode: "battle-royale",
  room: "engine-lab-player-vehicle-bot-hit-150",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: { commands: [
    { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [START] } },
    { command: "entity.spawn", args: { spec: { id: "vehicle-driver-150", kind: "human", name: "Vehicle Driver", bot: false, team: 15001, health: 400, weapons: [], position: { x: 96.4, y: 1.1, z: 24, angle: 0 } } } },
    { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["vehicle-driver-150", { x: 96.4, y: 1.1, z: 24, angle: 0 }] } },
    { command: "game.step", args: { dt: 0.02, steps: 2, now: START + 20 } },
    { command: "service.call", args: { service: "vehicles", method: "enter", arguments: ["vehicle-driver-150", START + 60, "br-jeep-1"] } },
    { command: "service.call", args: { service: "vehicles", method: "setInput", arguments: ["vehicle-driver-150", { forward: 1 }] } },
    { command: "game.step", args: { dt: 0.02, steps: 250, now: START + 80 } },
    { command: "service.call", args: { service: "vehicles", method: "stateFor", arguments: ["br-jeep-1"] } },
    { command: "entity.spawn", args: { spec: { id: "vehicle-target-bot-150", kind: "human", name: "Vehicle Target Bot", bot: true, team: 15001, health: 400, weapons: [], position: { x: 94, y: 1.1, z: 5, angle: 0 } } } },
    { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["vehicle-target-bot-150", { x: 94, y: 1.1, z: 5, angle: 0 }] } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["vehicle-target-bot-150"] } },
    { command: "game.step", args: { dt: 0.02, steps: 140, now: START + 5200 } },
    { command: "service.call", args: { service: "vehicles", method: "setInput", arguments: ["vehicle-driver-150", { forward: 0 }] } },
    { command: "service.call", args: { service: "vehicles", method: "stateFor", arguments: ["br-jeep-1"] } },
    { command: "service.call", args: { service: "ragdoll", method: "isActive", arguments: ["vehicle-target-bot-150"] } },
    { command: "service.call", args: { service: "ragdoll", method: "stateFor", arguments: ["vehicle-target-bot-150"] } },
    { command: "service.call", args: { service: "entities", method: "get", arguments: ["vehicle-target-bot-150"] } },
    { command: "service.call", args: { service: "fleet-pedestrian-ragdoll", method: "summary", arguments: [] } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["vehicle-target-bot-150"] } }
  ] },
  requestedAt: "2026-08-29T19:30:00Z"
});
