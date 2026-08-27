export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 74,
  mode: "battle-royale",
  room: "engine-lab-rapier-vehicle-74",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [2000003400000] } },
      { command: "entity.spawn", args: { spec: { id: "vehicle-driver-74", kind: "human", name: "Vehicle Driver", bot: false, team: 99174, health: 200, weapons: [], position: { x: 94, y: 0, z: 24, angle: 0 } } } },
      { command: "service.call", args: { service: "vehicles", method: "enter", arguments: ["vehicle-driver-74", 2000003400050] } },
      { command: "service.call", args: { service: "vehicles", method: "summary", arguments: [] } },
      { command: "service.call", args: { service: "vehicles", method: "setInput", arguments: ["vehicle-driver-74", { "forward": 1, "strafe": 0, "sprint": false }] } },
      { command: "game.step", args: { dt: 0.0166666667, steps: 120, now: 2000003400100 } },
      { command: "service.call", args: { service: "vehicles", method: "summary", arguments: [] } },
      { command: "service.call", args: { service: "vehicles", method: "setInput", arguments: ["vehicle-driver-74", { "forward": 1, "strafe": 1, "sprint": false }] } },
      { command: "game.step", args: { dt: 0.0166666667, steps: 120, now: 2000003402100 } },
      { command: "service.call", args: { service: "vehicles", method: "summary", arguments: [] } },
      { command: "service.call", args: { service: "vehicles", method: "setInput", arguments: ["vehicle-driver-74", { "forward": 0, "strafe": 0, "sprint": true }] } },
      { command: "game.step", args: { dt: 0.0166666667, steps: 60, now: 2000003404100 } },
      { command: "service.call", args: { service: "vehicles", method: "summary", arguments: [] } },
      { command: "service.call", args: { service: "vehicles", method: "setInput", arguments: ["vehicle-driver-74", { "forward": -1, "strafe": -0.6, "sprint": false }] } },
      { command: "game.step", args: { dt: 0.0166666667, steps: 120, now: 2000003405100 } },
      { command: "service.call", args: { service: "vehicles", method: "summary", arguments: [] } },
      { command: "entity.inspect", args: { entityId: "vehicle-driver-74" } },
      { command: "service.call", args: { service: "physics", method: "stats", arguments: [] } }
    ]
  },
  requestedAt: "2026-08-27T16:50:00Z"
});