export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 70,
  mode: "battle-royale",
  room: "engine-lab-warehouse-traffic-70",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      {
        command: "service.call",
        args: { service: "battle-royale", method: "arm", arguments: [2000002800000] }
      },
      { command: "game.step", args: { dt: 0.05, steps: 500, now: 2000002800050 } },
      { command: "game.step", args: { dt: 0.05, steps: 500, now: 2000002825050 } },
      { command: "game.step", args: { dt: 0.05, steps: 500, now: 2000002850050 } },
      {
        command: "entity.spawn",
        args: {
          spec: {
            id: "warehouse-traffic-sentinel-70",
            kind: "human",
            name: "Warehouse Traffic Sentinel",
            bot: false,
            team: 97000,
            health: 1,
            weapons: [],
            position: { x: -390, y: 0, z: -390, angle: 0 }
          }
        }
      },
      {
        command: "service.call",
        args: {
          service: "health",
          method: "applyDamage",
          arguments: ["warehouse-traffic-sentinel-70", 5, { "weaponId": "engine-sentinel", "now": 2000002875100 }]
        }
      },

      {
        command: "entity.spawn",
        args: {
          spec: {
            id: "warehouse-single-70",
            kind: "bot",
            name: "Warehouse Single Bot",
            bot: true,
            team: 98000,
            health: 5000,
            weapons: [],
            position: { x: 76.8, y: 0, z: 13.5, angle: 3.141592653589793 }
          }
        }
      },
      {
        command: "service.call",
        args: {
          service: "bot-state-machine",
          method: "resolve",
          arguments: [
            "warehouse-single-70",
            { "goal": "investigate", "score": 1, "target": { "kind": "poi-interest", "x": 60, "y": 0, "z": 0 }, "holdUntil": 2000002910000 },
            { "now": 2000002875200, "force": true }
          ]
        }
      },
      { command: "game.step", args: { dt: 0.05, steps: 200, now: 2000002875200 } },
      { command: "entity.inspect", args: { entityId: "warehouse-single-70" } },
      {
        command: "service.call",
        args: { service: "warehouse-traffic", method: "stateFor", arguments: ["warehouse-single-70"] }
      },

      { command: "entity.spawn", args: { spec: { id: "warehouse-crowd-1-70", kind: "bot", name: "Warehouse Crowd 1", bot: true, team: 98100, health: 5000, weapons: [], position: { x: 78.5, y: 0, z: -6, angle: 3.141592653589793 } } } },
      { command: "entity.spawn", args: { spec: { id: "warehouse-crowd-2-70", kind: "bot", name: "Warehouse Crowd 2", bot: true, team: 98100, health: 5000, weapons: [], position: { x: 79, y: 0, z: -4, angle: 3.141592653589793 } } } },
      { command: "entity.spawn", args: { spec: { id: "warehouse-crowd-3-70", kind: "bot", name: "Warehouse Crowd 3", bot: true, team: 98100, health: 5000, weapons: [], position: { x: 79.5, y: 0, z: -2, angle: 3.141592653589793 } } } },
      { command: "entity.spawn", args: { spec: { id: "warehouse-crowd-4-70", kind: "bot", name: "Warehouse Crowd 4", bot: true, team: 98100, health: 5000, weapons: [], position: { x: 80, y: 0, z: 0, angle: 3.141592653589793 } } } },
      { command: "entity.spawn", args: { spec: { id: "warehouse-crowd-5-70", kind: "bot", name: "Warehouse Crowd 5", bot: true, team: 98100, health: 5000, weapons: [], position: { x: 79.5, y: 0, z: 2, angle: 3.141592653589793 } } } },
      { command: "entity.spawn", args: { spec: { id: "warehouse-crowd-6-70", kind: "bot", name: "Warehouse Crowd 6", bot: true, team: 98100, health: 5000, weapons: [], position: { x: 79, y: 0, z: 4, angle: 3.141592653589793 } } } },
      { command: "entity.spawn", args: { spec: { id: "warehouse-crowd-7-70", kind: "bot", name: "Warehouse Crowd 7", bot: true, team: 98100, health: 5000, weapons: [], position: { x: 78.5, y: 0, z: 6, angle: 3.141592653589793 } } } },

      { command: "service.call", args: { service: "bot-state-machine", method: "resolve", arguments: ["warehouse-crowd-1-70", { "goal": "investigate", "score": 1, "target": { "kind": "poi-interest", "x": 60, "y": 0, "z": 0 }, "holdUntil": 2000002930000 }, { "now": 2000002885300, "force": true }] } },
      { command: "service.call", args: { service: "bot-state-machine", method: "resolve", arguments: ["warehouse-crowd-2-70", { "goal": "investigate", "score": 1, "target": { "kind": "poi-interest", "x": 60, "y": 0, "z": 0 }, "holdUntil": 2000002930000 }, { "now": 2000002885300, "force": true }] } },
      { command: "service.call", args: { service: "bot-state-machine", method: "resolve", arguments: ["warehouse-crowd-3-70", { "goal": "investigate", "score": 1, "target": { "kind": "poi-interest", "x": 60, "y": 0, "z": 0 }, "holdUntil": 2000002930000 }, { "now": 2000002885300, "force": true }] } },
      { command: "service.call", args: { service: "bot-state-machine", method: "resolve", arguments: ["warehouse-crowd-4-70", { "goal": "investigate", "score": 1, "target": { "kind": "poi-interest", "x": 60, "y": 0, "z": 0 }, "holdUntil": 2000002930000 }, { "now": 2000002885300, "force": true }] } },
      { command: "service.call", args: { service: "bot-state-machine", method: "resolve", arguments: ["warehouse-crowd-5-70", { "goal": "investigate", "score": 1, "target": { "kind": "poi-interest", "x": 60, "y": 0, "z": 0 }, "holdUntil": 2000002930000 }, { "now": 2000002885300, "force": true }] } },
      { command: "service.call", args: { service: "bot-state-machine", method: "resolve", arguments: ["warehouse-crowd-6-70", { "goal": "investigate", "score": 1, "target": { "kind": "poi-interest", "x": 60, "y": 0, "z": 0 }, "holdUntil": 2000002930000 }, { "now": 2000002885300, "force": true }] } },
      { command: "service.call", args: { service: "bot-state-machine", method: "resolve", arguments: ["warehouse-crowd-7-70", { "goal": "investigate", "score": 1, "target": { "kind": "poi-interest", "x": 60, "y": 0, "z": 0 }, "holdUntil": 2000002930000 }, { "now": 2000002885300, "force": true }] } },

      { command: "game.step", args: { dt: 0.05, steps: 300, now: 2000002885300 } },
      { command: "service.call", args: { service: "warehouse-traffic", method: "summary", arguments: [] } },
      { command: "entity.inspect", args: { entityId: "warehouse-crowd-1-70" } },
      { command: "entity.inspect", args: { entityId: "warehouse-crowd-4-70" } },
      { command: "entity.inspect", args: { entityId: "warehouse-crowd-7-70" } }
    ]
  },
  requestedAt: "2026-08-27T12:45:00Z"
});