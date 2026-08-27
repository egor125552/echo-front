export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 83,
  mode: "battle-royale",
  room: "engine-lab-shared-rapier-parachute-83",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [2000004300000] } },
      { command: "entity.spawn", args: { spec: { id: "deployment-sentinel-83", kind: "human", name: "Deployment Sentinel", bot: false, team: 99383, health: 1, weapons: [], position: { x: -390, y: 0, z: -390, angle: 0 } } } },
      { command: "service.call", args: { service: "health", method: "applyDamage", arguments: ["deployment-sentinel-83", 5, { "weaponId": "engine-sentinel", "now": 2000004300050 }] } },
      { command: "entity.spawn", args: { spec: { id: "parachute-probe-83", kind: "human", name: "Parachute Probe", bot: false, team: 99301, health: 200, weapons: [], position: { x: 150, y: 0, z: 100, angle: 0 } } } },
      { command: "service.call", args: { service: "parachute", method: "launch", arguments: ["parachute-probe-83", { "altitude": 160, "x": 150, "z": 100, "angle": 0 }, 2000004300100] } },
      { command: "game.step", args: { dt: 0.05, steps: 40, now: 2000004300150 } },
      { command: "service.call", args: { service: "parachute", method: "stateFor", arguments: ["parachute-probe-83"] } },
      { command: "service.call", args: { service: "parachute", method: "deploy", arguments: ["parachute-probe-83", 2000004302150, { "automatic": false }] } },
      { command: "service.call", args: { service: "movement", method: "setInput", arguments: ["parachute-probe-83", { "forward": 1, "strafe": 0, "turn": 0, "sprint": false }] } },
      { command: "game.step", args: { dt: 0.05, steps: 300, now: 2000004302200 } },
      { command: "service.call", args: { service: "parachute", method: "stateFor", arguments: ["parachute-probe-83"] } },
      { command: "game.step", args: { dt: 0.05, steps: 300, now: 2000004317200 } },
      { command: "service.call", args: { service: "parachute", method: "stateFor", arguments: ["parachute-probe-83"] } },
      { command: "entity.inspect", args: { entityId: "parachute-probe-83" } },
      { command: "service.call", args: { service: "vehicles", method: "summary", arguments: [] } },
      { command: "service.call", args: { service: "physics", method: "stats", arguments: [] } }
    ]
  },
  requestedAt: "2026-08-27T17:49:00Z"
});