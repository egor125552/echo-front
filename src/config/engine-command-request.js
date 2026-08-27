export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 84,
  mode: "battle-royale",
  room: "engine-lab-deployment-door-vehicle-84",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [2000004400000] } },
      { command: "entity.spawn", args: { spec: { id: "air-sentinel-84", kind: "human", name: "Air Sentinel", bot: false, team: 99484, health: 200, weapons: [], position: { x: 150, y: 0, z: 120, angle: 0 } } } },
      { command: "service.call", args: { service: "parachute", method: "launch", arguments: ["air-sentinel-84", { "altitude": 300, "x": 150, "z": 120, "angle": 0 }, 2000004400050] } },
      { command: "entity.spawn", args: { spec: { id: "ground-probe-84", kind: "test-human", name: "Ground Probe", bot: false, team: 99401, health: 200, weapons: ["pistol"], position: { x: 78, y: 0, z: 0, angle: -1.57079632679 } } } },
      { command: "service.call", args: { service: "battle-royale", method: "status", arguments: [2000004400100] } },
      { command: "service.call", args: { service: "map", method: "setDoorOpen", arguments: ["warehouse-front-door", true, "ground-probe-84", 2000004400150] } },
      { command: "service.call", args: { service: "movement", method: "setInput", arguments: ["ground-probe-84", { "forward": 1, "strafe": 0, "turn": 0, "sprint": false }] } },
      { command: "game.step", args: { dt: 0.05, steps: 20, now: 2000004400200 } },
      { command: "entity.inspect", args: { entityId: "ground-probe-84" } },
      { command: "service.call", args: { service: "battle-royale", method: "status", arguments: [2000004401200] } },
      { command: "entity.spawn", args: { spec: { id: "deployment-driver-84", kind: "test-human", name: "Deployment Driver", bot: false, team: 99402, health: 200, weapons: [], position: { x: 94, y: 0, z: 24, angle: 0 } } } },
      { command: "service.call", args: { service: "vehicles", method: "enter", arguments: ["deployment-driver-84", 2000004401250] } },
      { command: "service.call", args: { service: "vehicles", method: "setInput", arguments: ["deployment-driver-84", { "forward": 1, "strafe": 0.35, "sprint": false }] } },
      { command: "game.step", args: { dt: 0.05, steps: 80, now: 2000004401300 } },
      { command: "service.call", args: { service: "vehicles", method: "summary", arguments: [] } },
      { command: "service.call", args: { service: "battle-royale", method: "status", arguments: [2000004405300] } },
      { command: "service.call", args: { service: "parachute", method: "stateFor", arguments: ["air-sentinel-84"] } },
      { command: "service.call", args: { service: "physics", method: "stats", arguments: [] } }
    ]
  },
  requestedAt: "2026-08-27T17:54:00Z"
});