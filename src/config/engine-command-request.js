const START = 2000012500000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 125,
  mode: "battle-royale",
  room: "engine-lab-vehicle-crash-125",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [START] } },
      { command: "entity.spawn", args: { spec: {
        id: "crash-test-125",
        kind: "human",
        name: "Crash Test",
        bot: false,
        team: 12501,
        health: 1000,
        weapons: [],
        position: { x: 94, y: 0, z: 24, angle: 0 }
      } } },
      { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["crash-test-125", { x: 94, y: 0, z: 24, angle: 0 }] } },
      { command: "game.step", args: { dt: 0.02, steps: 1, now: START + 20 } },
      { command: "service.call", args: { service: "vehicles", method: "enter", arguments: ["crash-test-125", START + 50, "br-jeep-1"] } },
      { command: "service.call", args: { service: "vehicles", method: "setInput", arguments: ["crash-test-125", { forward: 1, fireHeld: true }] } },
      { command: "game.step", args: { dt: 0.02, steps: 500, now: START + 60 } },
      { command: "service.call", args: { service: "vehicles", method: "stateFor", arguments: ["br-jeep-1"] } },
      { command: "service.call", args: { service: "parkour-ragdoll", method: "summary", arguments: [] } },
      { command: "game.step", args: { dt: 0.02, steps: 500 } },
      { command: "service.call", args: { service: "vehicles", method: "stateFor", arguments: ["br-jeep-1"] } },
      { command: "service.call", args: { service: "parkour-ragdoll", method: "summary", arguments: [] } },
      { command: "game.step", args: { dt: 0.02, steps: 500 } },
      { command: "service.call", args: { service: "vehicles", method: "stateFor", arguments: ["br-jeep-1"] } },
      { command: "service.call", args: { service: "parkour-ragdoll", method: "summary", arguments: [] } },
      { command: "service.call", args: { service: "ragdoll-stability", method: "assertStable", arguments: [{ maxSpread: 10, maxSpeed: 100 }] } }
    ]
  },
  requestedAt: "2026-08-28T16:04:00Z"
});
