export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 71,
  mode: "battle-royale",
  room: "engine-lab-warehouse-combat-flow-71",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [2000003000000] } },
      { command: "game.step", args: { dt: 0.05, steps: 500, now: 2000003000050 } },
      { command: "game.step", args: { dt: 0.05, steps: 500, now: 2000003025050 } },
      { command: "game.step", args: { dt: 0.05, steps: 500, now: 2000003050050 } },
      { command: "entity.spawn", args: { spec: { id: "warehouse-flow-sentinel-71", kind: "human", name: "Flow Sentinel", bot: false, team: 97000, health: 1, weapons: [], position: { x: -390, y: 0, z: -390, angle: 0 } } } },
      { command: "service.call", args: { service: "health", method: "applyDamage", arguments: ["warehouse-flow-sentinel-71", 5, { "weaponId": "engine-sentinel", "now": 2000003075100 }] } },
      { command: "service.call", args: { service: "map", method: "setDoorOpen", arguments: ["warehouse-front-door", true, null, 2000003075150] } },

      { command: "entity.spawn", args: { spec: { id: "warehouse-target-71", kind: "test-human", name: "Warehouse Target", bot: false, team: 99000, health: 99999, weapons: [], position: { x: 70, y: 0, z: 0, angle: 0 } } } },
      { command: "entity.spawn", args: { spec: { id: "warehouse-single-71", kind: "bot", name: "Warehouse Single", bot: true, team: 18, health: 5000, weapons: ["rifle"], position: { x: 80, y: 0, z: 0, angle: -1.5707963267948966 } } } },
      { command: "game.step", args: { dt: 0.05, steps: 160, now: 2000003075200 } },
      { command: "entity.inspect", args: { entityId: "warehouse-single-71" } },
      { command: "entity.inspect", args: { entityId: "warehouse-target-71" } },
      { command: "service.call", args: { service: "warehouse-combat-flow", method: "summary", arguments: [] } },

      { command: "entity.spawn", args: { spec: { id: "warehouse-crowd-1-71", kind: "bot", name: "Crowd 1", bot: true, team: 18, health: 5000, weapons: ["rifle"], position: { x: 78.4, y: 0, z: -0.9, angle: -1.5707963267948966 } } } },
      { command: "entity.spawn", args: { spec: { id: "warehouse-crowd-2-71", kind: "bot", name: "Crowd 2", bot: true, team: 18, health: 5000, weapons: ["rifle"], position: { x: 79.1, y: 0, z: -0.6, angle: -1.5707963267948966 } } } },
      { command: "entity.spawn", args: { spec: { id: "warehouse-crowd-3-71", kind: "bot", name: "Crowd 3", bot: true, team: 18, health: 5000, weapons: ["rifle"], position: { x: 79.8, y: 0, z: -0.3, angle: -1.5707963267948966 } } } },
      { command: "entity.spawn", args: { spec: { id: "warehouse-crowd-4-71", kind: "bot", name: "Crowd 4", bot: true, team: 18, health: 5000, weapons: ["rifle"], position: { x: 80.5, y: 0, z: 0, angle: -1.5707963267948966 } } } },
      { command: "entity.spawn", args: { spec: { id: "warehouse-crowd-5-71", kind: "bot", name: "Crowd 5", bot: true, team: 18, health: 5000, weapons: ["rifle"], position: { x: 79.8, y: 0, z: 0.3, angle: -1.5707963267948966 } } } },
      { command: "entity.spawn", args: { spec: { id: "warehouse-crowd-6-71", kind: "bot", name: "Crowd 6", bot: true, team: 18, health: 5000, weapons: ["rifle"], position: { x: 79.1, y: 0, z: 0.6, angle: -1.5707963267948966 } } } },
      { command: "entity.spawn", args: { spec: { id: "warehouse-crowd-7-71", kind: "bot", name: "Crowd 7", bot: true, team: 18, health: 5000, weapons: ["rifle"], position: { x: 78.4, y: 0, z: 0.9, angle: -1.5707963267948966 } } } },
      { command: "game.step", args: { dt: 0.05, steps: 300, now: 2000003083300 } },
      { command: "service.call", args: { service: "warehouse-combat-flow", method: "summary", arguments: [] } },
      { command: "service.call", args: { service: "warehouse-traffic", method: "summary", arguments: [] } },
      { command: "entity.inspect", args: { entityId: "warehouse-crowd-1-71" } },
      { command: "entity.inspect", args: { entityId: "warehouse-crowd-4-71" } },
      { command: "entity.inspect", args: { entityId: "warehouse-crowd-7-71" } },
      { command: "entity.inspect", args: { entityId: "warehouse-target-71" } }
    ]
  },
  requestedAt: "2026-08-27T13:12:00Z"
});