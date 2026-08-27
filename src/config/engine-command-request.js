export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 76,
  mode: "battle-royale",
  room: "engine-lab-rapier-vehicle-crash-76",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [2000003600000] } },
      { command: "entity.spawn", args: { spec: { id: "vehicle-deployment-sentinel-76", kind: "human", name: "Vehicle Deployment Sentinel", bot: false, team: 99270, health: 1, weapons: [], position: { x: -390, y: 0, z: -390, angle: 0 } } } },
      { command: "service.call", args: { service: "health", method: "applyDamage", arguments: ["vehicle-deployment-sentinel-76", 5, { "weaponId": "engine-sentinel", "now": 2000003600050 }] } },
      { command: "entity.spawn", args: { spec: { id: "vehicle-driver-76", kind: "test-human", name: "Vehicle Driver", bot: false, team: 99276, health: 200, weapons: [], position: { x: 94, y: 0, z: 24, angle: 0 } } } },
      { command: "service.call", args: { service: "vehicles", method: "enter", arguments: ["vehicle-driver-76", 2000003600100] } },
      { command: "service.call", args: { service: "vehicles", method: "setInput", arguments: ["vehicle-driver-76", { "forward": 1, "strafe": 0, "sprint": false }] } },
      { command: "game.step", args: { dt: 0.05, steps: 500, now: 2000003600150 } },
      { command: "service.call", args: { service: "vehicles", method: "summary", arguments: [] } },
      { command: "game.step", args: { dt: 0.05, steps: 200, now: 2000003625150 } },
      { command: "service.call", args: { service: "vehicles", method: "summary", arguments: [] } },
      { command: "service.call", args: { service: "vehicles", method: "setInput", arguments: ["vehicle-driver-76", { "forward": -1, "strafe": -0.7, "sprint": false }] } },
      { command: "game.step", args: { dt: 0.05, steps: 100, now: 2000003635150 } },
      { command: "service.call", args: { service: "vehicles", method: "summary", arguments: [] } },
      { command: "entity.inspect", args: { entityId: "vehicle-driver-76" } },
      { command: "service.call", args: { service: "physics", method: "stats", arguments: [] } }
    ]
  },
  requestedAt: "2026-08-27T17:15:00Z"
});