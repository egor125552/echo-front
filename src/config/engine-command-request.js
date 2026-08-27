export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 78,
  mode: "battle-royale",
  room: "engine-lab-shared-rapier-br-78",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [2000003800000] } },
      { command: "entity.spawn", args: { spec: { id: "deployment-sentinel-78", kind: "human", name: "Deployment Sentinel", bot: false, team: 98078, health: 1, weapons: [], position: { x: -390, y: 0, z: -390, angle: 0 } } } },
      { command: "service.call", args: { service: "health", method: "applyDamage", arguments: ["deployment-sentinel-78", 5, { "weaponId": "engine-sentinel", "now": 2000003800050 }] } },
      { command: "entity.spawn", args: { spec: { id: "br-probe-a-78", kind: "test-human", name: "BR Probe A", bot: false, team: 98001, health: 200, weapons: ["pistol"], position: { x: 120, y: 0, z: 100, angle: 0 } } } },
      { command: "entity.spawn", args: { spec: { id: "br-probe-b-78", kind: "test-human", name: "BR Probe B", bot: false, team: 98002, health: 200, weapons: ["pistol"], position: { x: 120, y: 0, z: 90, angle: 3.14159 } } } },
      { command: "service.call", args: { service: "physics", method: "raycast", arguments: [{ "x": 120, "y": 1, "z": 100 }, { "x": 0, "y": 0, "z": -1 }, 20, "br-probe-a-78"] } },
      { command: "service.call", args: { service: "combat", method: "damage", arguments: ["br-probe-b-78", 60, { "attackerId": "br-probe-a-78", "weaponId": "pistol", "now": 2000003800100 }] } },
      { command: "entity.inspect", args: { entityId: "br-probe-b-78" } },
      { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["br-probe-a-78", { "x": 78, "y": 0, "z": 0, "angle": -1.57079632679 }] } },
      { command: "service.call", args: { service: "movement", method: "setInput", arguments: ["br-probe-a-78", { "forward": 1, "strafe": 0, "turn": 0, "sprint": false }] } },
      { command: "game.step", args: { dt: 0.05, steps: 20, now: 2000003800150 } },
      { command: "entity.inspect", args: { entityId: "br-probe-a-78" } },
      { command: "service.call", args: { service: "map", method: "setDoorOpen", arguments: ["warehouse-front-door", true, "br-probe-a-78", 2000003801200] } },
      { command: "game.step", args: { dt: 0.05, steps: 25, now: 2000003801250 } },
      { command: "entity.inspect", args: { entityId: "br-probe-a-78" } },
      { command: "entity.spawn", args: { spec: { id: "vehicle-driver-78", kind: "test-human", name: "Vehicle Driver", bot: false, team: 98003, health: 200, weapons: [], position: { x: 94, y: 0, z: 24, angle: 0 } } } },
      { command: "service.call", args: { service: "vehicles", method: "enter", arguments: ["vehicle-driver-78", 2000003802600] } },
      { command: "service.call", args: { service: "vehicles", method: "setInput", arguments: ["vehicle-driver-78", { "forward": 1, "strafe": 0.65, "sprint": false }] } },
      { command: "game.step", args: { dt: 0.05, steps: 80, now: 2000003802650 } },
      { command: "service.call", args: { service: "vehicles", method: "summary", arguments: [] } },
      { command: "entity.inspect", args: { entityId: "vehicle-driver-78" } },
      { command: "service.call", args: { service: "vehicles", method: "exit", arguments: ["vehicle-driver-78", 2000003806700, "engine-control"] } },
      { command: "service.call", args: { service: "movement", method: "setInput", arguments: ["vehicle-driver-78", { "forward": 1, "strafe": 0, "turn": 0, "sprint": false }] } },
      { command: "game.step", args: { dt: 0.05, steps: 20, now: 2000003806750 } },
      { command: "entity.inspect", args: { entityId: "vehicle-driver-78" } },
      { command: "service.call", args: { service: "physics", method: "stats", arguments: [] } }
    ]
  },
  requestedAt: "2026-08-27T17:23:00Z"
});