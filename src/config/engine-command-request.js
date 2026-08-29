const START = 2000015300000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 153,
  mode: "battle-royale",
  room: "engine-lab-player-vehicle-bot-hit-153",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: { commands: [
    { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [START] } },
    { command: "entity.spawn", args: { spec: { id: "vehicle-driver-153", kind: "human", name: "Vehicle Driver", bot: false, team: 15301, health: 400, weapons: [], position: { x: 96.4, y: 1.1, z: 24, angle: 0 } } } },
    { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["vehicle-driver-153", { x: 96.4, y: 1.1, z: 24, angle: 0 }] } },
    { command: "game.step", args: { dt: 0.02, steps: 2, now: START + 20 } },
    { command: "service.call", args: { service: "vehicles", method: "enter", arguments: ["vehicle-driver-153", START + 60, "br-jeep-1"] } },
    { command: "service.call", args: { service: "vehicles", method: "setInput", arguments: ["vehicle-driver-153", { forward: 1 }] } },
    { command: "game.step", args: { dt: 0.02, steps: 250, now: START + 80 } },
    { command: "service.call", args: { service: "vehicles", method: "stateFor", arguments: ["br-jeep-1"] } },
    { command: "service.call", args: { service: "fleet-pedestrian-ragdoll", method: "summary", arguments: [] } },
    { command: "entity.spawn", args: { spec: { id: "vehicle-target-bot-153", kind: "human", name: "Vehicle Target Bot", bot: true, team: 15301, health: 400, weapons: [], position: { x: 94.9, y: 1.1, z: -5, angle: 0 } } } },
    { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["vehicle-target-bot-153", { x: 94.9, y: 1.1, z: -5, angle: 0 }] } },
    { command: "game.step", args: { dt: 0.02, steps: 100, now: START + 5200 } },
    { command: "service.call", args: { service: "vehicles", method: "setInput", arguments: ["vehicle-driver-153", { forward: 0 }] } },
    { command: "service.call", args: { service: "ragdoll", method: "isActive", arguments: ["vehicle-target-bot-153"] } },
    { command: "service.call", args: { service: "ragdoll", method: "stateFor", arguments: ["vehicle-target-bot-153"] } },
    { command: "service.call", args: { service: "entities", method: "get", arguments: ["vehicle-target-bot-153"] } },
    { command: "service.call", args: { service: "fleet-pedestrian-ragdoll", method: "summary", arguments: [] } }
  ] },
  requestedAt: "2026-08-29T19:45:00Z"
});
