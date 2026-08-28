const START = 2000012600000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 126,
  mode: "battle-royale",
  room: "engine-lab-vehicle-turn-126",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [START] } },
      { command: "entity.spawn", args: { spec: {
        id: "turn-test-126", kind: "human", name: "Turn Test", bot: false,
        team: 12601, health: 1000, weapons: [], position: { x: 94, y: 0, z: 24, angle: 0 }
      } } },
      { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["turn-test-126", { x: 94, y: 0, z: 24, angle: 0 }] } },
      { command: "game.step", args: { dt: 0.02, steps: 1, now: START + 20 } },
      { command: "service.call", args: { service: "vehicles", method: "enter", arguments: ["turn-test-126", START + 50, "br-jeep-1"] } },
      { command: "service.call", args: { service: "vehicles", method: "setInput", arguments: ["turn-test-126", { forward: 1, strafe: 1, fireHeld: true }] } },
      { command: "game.step", args: { dt: 0.02, steps: 50, now: START + 60 } },
      { command: "service.call", args: { service: "vehicles", method: "stateFor", arguments: ["br-jeep-1"] } },
      { command: "service.call", args: { service: "vehicles", method: "setInput", arguments: ["turn-test-126", { forward: 1, strafe: 0, fireHeld: true }] } },
      { command: "game.step", args: { dt: 0.02, steps: 100 } },
      { command: "service.call", args: { service: "vehicles", method: "stateFor", arguments: ["br-jeep-1"] } },
      { command: "service.call", args: { service: "parkour-ragdoll", method: "summary", arguments: [] } }
    ]
  },
  requestedAt: "2026-08-28T16:10:00Z"
});
