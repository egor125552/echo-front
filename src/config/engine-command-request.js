export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 65,
  mode: "battle-royale",
  room: "engine-lab-bot-awareness-65",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      {
        command: "service.call",
        args: { service: "battle-royale", method: "arm", arguments: [2000002200000] }
      },
      { command: "game.step", args: { dt: 0.05, steps: 1400, now: 2000002200050 } },
      {
        command: "service.call",
        args: { service: "battle-royale", method: "status", arguments: [2000002270050] }
      },

      {
        command: "entity.spawn",
        args: {
          spec: {
            id: "awareness-open-bot",
            kind: "bot",
            name: "Open Field Bot",
            bot: true,
            team: 81001,
            health: 200,
            weapons: ["rifle"],
            position: { x: -250, y: 0, z: -250, angle: 3.141592653589793 }
          }
        }
      },
      {
        command: "entity.spawn",
        args: {
          spec: {
            id: "awareness-open-human",
            kind: "test-human",
            name: "Open Field Human",
            bot: false,
            team: 81002,
            health: 200,
            weapons: [],
            position: { x: -250, y: 0, z: -195, angle: 0 }
          }
        }
      },
      {
        command: "service.call",
        args: { service: "bot-awareness", method: "stateFor", arguments: ["awareness-open-bot", 2000002270100] }
      },
      { command: "game.step", args: { dt: 0.05, steps: 40, now: 2000002270100 } },
      { command: "entity.inspect", args: { entityId: "awareness-open-bot" } },
      { command: "entity.inspect", args: { entityId: "awareness-open-human" } },
      {
        command: "service.call",
        args: { service: "bot-brain", method: "stateFor", arguments: ["awareness-open-bot"] }
      },

      {
        command: "entity.spawn",
        args: {
          spec: {
            id: "awareness-warehouse-bot",
            kind: "bot",
            name: "Warehouse Bot",
            bot: true,
            team: 82001,
            health: 200,
            weapons: ["rifle"],
            position: { x: 60, y: 3.2, z: -8, angle: 3.141592653589793 }
          }
        }
      },
      {
        command: "entity.spawn",
        args: {
          spec: {
            id: "awareness-warehouse-human",
            kind: "test-human",
            name: "Warehouse Human",
            bot: false,
            team: 82002,
            health: 200,
            weapons: [],
            position: { x: 60, y: 3.2, z: 0, angle: 0 }
          }
        }
      },
      {
        command: "entity.spawn",
        args: {
          spec: {
            id: "awareness-blocker-1",
            kind: "blocker",
            name: "Friendly Blocker 1",
            bot: false,
            team: 82001,
            health: 200,
            weapons: [],
            position: { x: 60, y: 3.2, z: -5.5, angle: 0 }
          }
        }
      },
      {
        command: "entity.spawn",
        args: {
          spec: {
            id: "awareness-blocker-2",
            kind: "blocker",
            name: "Friendly Blocker 2",
            bot: false,
            team: 82001,
            health: 200,
            weapons: [],
            position: { x: 60, y: 3.2, z: -3.0, angle: 0 }
          }
        }
      },
      {
        command: "entity.spawn",
        args: {
          spec: {
            id: "awareness-blocker-3",
            kind: "blocker",
            name: "Friendly Blocker 3",
            bot: false,
            team: 82001,
            health: 200,
            weapons: [],
            position: { x: 60, y: 3.2, z: -0.8, angle: 0 }
          }
        }
      },
      {
        command: "service.call",
        args: { service: "bot-awareness", method: "stateFor", arguments: ["awareness-warehouse-bot", 2000002272200] }
      },
      { command: "game.step", args: { dt: 0.05, steps: 35, now: 2000002272200 } },
      { command: "entity.inspect", args: { entityId: "awareness-warehouse-human" } },
      {
        command: "service.call",
        args: { service: "bot-brain", method: "stateFor", arguments: ["awareness-warehouse-bot"] }
      },

      {
        command: "entity.spawn",
        args: {
          spec: {
            id: "awareness-threat-bot",
            kind: "bot",
            name: "Threat Priority Bot",
            bot: true,
            team: 83001,
            health: 200,
            weapons: ["rifle"],
            position: { x: 250, y: 0, z: 240, angle: 3.141592653589793 }
          }
        }
      },
      {
        command: "entity.spawn",
        args: {
          spec: {
            id: "awareness-attacker-human",
            kind: "test-human",
            name: "Attacker Human",
            bot: false,
            team: 83002,
            health: 200,
            weapons: [],
            position: { x: 250, y: 0, z: 258, angle: 0 }
          }
        }
      },
      {
        command: "entity.spawn",
        args: {
          spec: {
            id: "awareness-close-decoy",
            kind: "test-human",
            name: "Closer Decoy",
            bot: false,
            team: 83003,
            health: 200,
            weapons: [],
            position: { x: 255, y: 0, z: 245, angle: 0 }
          }
        }
      },
      {
        command: "service.call",
        args: {
          service: "combat",
          method: "damage",
          arguments: ["awareness-threat-bot", 5, { "attackerId": "awareness-attacker-human", "weaponId": "engine-probe", "now": 2000002274000 }]
        }
      },
      {
        command: "service.call",
        args: { service: "bot-awareness", method: "stateFor", arguments: ["awareness-threat-bot", 2000002274050] }
      },
      { command: "game.step", args: { dt: 0.05, steps: 36, now: 2000002274050 } },
      { command: "entity.inspect", args: { entityId: "awareness-attacker-human" } },
      { command: "entity.inspect", args: { entityId: "awareness-close-decoy" } },
      {
        command: "service.call",
        args: { service: "bot-brain", method: "stateFor", arguments: ["awareness-threat-bot"] }
      }
    ]
  },
  requestedAt: "2026-08-27T11:20:00Z"
});