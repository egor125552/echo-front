export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 82,
  mode: "battle-royale",
  room: "engine-lab-shared-rapier-crash-82",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [2000004200000] } },
      { command: "entity.spawn", args: { spec: { id: "deployment-sentinel-82", kind: "human", name: "Deployment Sentinel", bot: false, team: 99282, health: 1, weapons: [], position: { x: -390, y: 0, z: -390, angle: 0 } } } },
      { command: "service.call", args: { service: "health", method: "applyDamage", arguments: ["deployment-sentinel-82", 5, { "weaponId": "engine-sentinel", "now": 2000004200050 }] } },
      { command: "entity.spawn", args: { spec: { id: "crash-driver-82", kind: "test-human", name: "Crash Driver", bot: false, team: 99201, health: 10000, weapons: [], position: { x: 94, y: 0, z: 24, angle: 0 } } } },
      { command: "service.call", args: { service: "vehicles", method: "enter", arguments: ["crash-driver-82", 2000004200100] } },
      { command: "service.call", args: { service: "vehicles", method: "setInput", arguments: ["crash-driver-82", { "forward": 1, "strafe": 0, "sprint": false }] } },
      { command: "game.step", args: { dt: 0.05, steps: 500, now: 2000004200150 } },
      { command: "service.call", args: { service: "vehicles", method: "summary", arguments: [] } },
      { command: "game.step", args: { dt: 0.05, steps: 500, now: 2000004225150 } },
      { command: "service.call", args: { service: "vehicles", method: "summary", arguments: [] } },
      { command: "game.step", args: { dt: 0.05, steps: 300, now: 2000004250150 } },
      { command: "service.call", args: { service: "vehicles", method: "summary", arguments: [] } },
      { command: "service.call", args: { service: "vehicles", method: "setInput", arguments: ["crash-driver-82", { "forward": -1, "strafe": 0.45, "sprint": false }] } },
      { command: "game.step", args: { dt: 0.05, steps: 120, now: 2000004265150 } },
      { command: "service.call", args: { service: "vehicles", method: "summary", arguments: [] } },
      { command: "entity.inspect", args: { entityId: "crash-driver-82" } },
      { command: "service.call", args: { service: "physics", method: "stats", arguments: [] } }
    ]
  },
  requestedAt: "2026-08-27T17:46:00Z"
});