export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 73,
  mode: "battle-royale",
  room: "engine-lab-rapier-vehicle-73",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [2000003300000] } },
      { command: "entity.spawn", args: { spec: { id: "vehicle-driver-73", kind: "human", name: "Vehicle Driver", bot: false, team: 99173, health: 200, weapons: [], position: { x: 94, y: 0, z: 24, angle: 0 } } } },
      { command: "service.call", args: { service: "vehicles", method: "enter", arguments: ["vehicle-driver-73", 2000003300050] } },
      { command: "service.call", args: { service: "vehicles", method: "summary", arguments: [] } },
      { command: "service.call", args: { service: "vehicles", method: "setInput", arguments: ["vehicle-driver-73", { "forward": 1, "strafe": 0, "sprint": false }] } },
      { command: "game.step", args: { dt: 0.0166666667, steps: 120, now: 2000003300100 } },
      { command: "service.call", args: { service: "vehicles", method: "summary", arguments: [] } },
      { command: "service.call", args: { service: "vehicles", method: "setInput", arguments: ["vehicle-driver-73", { "forward": 1, "strafe": 1, "sprint": false }] } },
      { command: "game.step", args: { dt: 0.0166666667, steps: 120, now: 2000003302100 } },
      { command: "service.call", args: { service: "vehicles", method: "summary", arguments: [] } },
      { command: "service.call", args: { service: "vehicles", method: "setInput", arguments: ["vehicle-driver-73", { "forward": 0, "strafe": 0, "sprint": true }] } },
      { command: "game.step", args: { dt: 0.0166666667, steps: 60, now: 2000003304100 } },
      { command: "service.call", args: { service: "vehicles", method: "summary", arguments: [] } },
      { command: "service.call", args: { service: "vehicles", method: "setInput", arguments: ["vehicle-driver-73", { "forward": -1, "strafe": -0.6, "sprint": false }] } },
      { command: "game.step", args: { dt: 0.0166666667, steps: 120, now: 2000003305100 } },
      { command: "service.call", args: { service: "vehicles", method: "summary", arguments: [] } },
      { command: "entity.inspect", args: { entityId: "vehicle-driver-73" } },
      { command: "service.call", args: { service: "physics", method: "stats", arguments: [] } }
    ]
  },
  requestedAt: "2026-08-27T16:40:00Z"
});