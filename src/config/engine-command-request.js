export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 75,
  mode: "battle-royale",
  room: "engine-lab-rapier-vehicle-75",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [2000003500000] } },
      { command: "entity.spawn", args: { spec: { id: "vehicle-deployment-sentinel-75", kind: "human", name: "Vehicle Deployment Sentinel", bot: false, team: 99170, health: 1, weapons: [], position: { x: -390, y: 0, z: -390, angle: 0 } } } },
      { command: "service.call", args: { service: "health", method: "applyDamage", arguments: ["vehicle-deployment-sentinel-75", 5, { "weaponId": "engine-sentinel", "now": 2000003500050 }] } },
      { command: "service.call", args: { service: "battle-royale", method: "status", arguments: [2000003500100] } },
      { command: "entity.spawn", args: { spec: { id: "vehicle-driver-75", kind: "test-human", name: "Vehicle Driver", bot: false, team: 99175, health: 200, weapons: [], position: { x: 94, y: 0, z: 24, angle: 0 } } } },
      { command: "service.call", args: { service: "vehicles", method: "enter", arguments: ["vehicle-driver-75", 2000003500150] } },
      { command: "service.call", args: { service: "vehicles", method: "summary", arguments: [] } },
      { command: "service.call", args: { service: "vehicles", method: "setInput", arguments: ["vehicle-driver-75", { "forward": 1, "strafe": 0, "sprint": false }] } },
      { command: "game.step", args: { dt: 0.0166666667, steps: 120, now: 2000003500200 } },
      { command: "service.call", args: { service: "vehicles", method: "summary", arguments: [] } },
      { command: "service.call", args: { service: "vehicles", method: "setInput", arguments: ["vehicle-driver-75", { "forward": 1, "strafe": 1, "sprint": false }] } },
      { command: "game.step", args: { dt: 0.0166666667, steps: 120, now: 2000003502200 } },
      { command: "service.call", args: { service: "vehicles", method: "summary", arguments: [] } },
      { command: "service.call", args: { service: "vehicles", method: "setInput", arguments: ["vehicle-driver-75", { "forward": 0, "strafe": 0, "sprint": true }] } },
      { command: "game.step", args: { dt: 0.0166666667, steps: 60, now: 2000003504200 } },
      { command: "service.call", args: { service: "vehicles", method: "summary", arguments: [] } },
      { command: "service.call", args: { service: "vehicles", method: "setInput", arguments: ["vehicle-driver-75", { "forward": -1, "strafe": -0.6, "sprint": false }] } },
      { command: "game.step", args: { dt: 0.0166666667, steps: 120, now: 2000003505200 } },
      { command: "service.call", args: { service: "vehicles", method: "summary", arguments: [] } },
      { command: "entity.inspect", args: { entityId: "vehicle-driver-75" } },
      { command: "service.call", args: { service: "physics", method: "stats", arguments: [] } }
    ]
  },
  requestedAt: "2026-08-27T17:00:00Z"
});