export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 69,
  mode: "battle-royale",
  room: "engine-lab-journal-regen-69",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      {
        command: "service.call",
        args: { service: "battle-royale", method: "arm", arguments: [2000002700000] }
      },
      {
        command: "entity.spawn",
        args: {
          spec: {
            id: "journal-regen-human-69",
            kind: "human",
            name: "Journal Regen Human",
            bot: false,
            team: 91001,
            health: 200,
            weapons: [],
            position: { x: -350, y: 0, z: 0, angle: 0 }
          }
        }
      },
      {
        command: "entity.spawn",
        args: {
          spec: {
            id: "journal-regen-bot-69",
            kind: "bot",
            name: "Journal Regen Bot",
            bot: true,
            team: 91002,
            health: 200,
            weapons: [],
            position: { x: -330, y: 0, z: 0, angle: 0 }
          }
        }
      },
      {
        command: "service.call",
        args: {
          service: "combat",
          method: "damage",
          arguments: ["journal-regen-human-69", 107, { "attackerId": "journal-regen-bot-69", "weaponId": "fall-impact", "now": 2000002700050 }]
        }
      },
      {
        command: "service.call",
        args: {
          service: "combat",
          method: "damage",
          arguments: ["journal-regen-bot-69", 50, { "attackerId": "journal-regen-human-69", "weaponId": "engine-probe", "now": 2000002700050 }]
        }
      },
      { command: "entity.inspect", args: { entityId: "journal-regen-human-69" } },
      { command: "entity.inspect", args: { entityId: "journal-regen-bot-69" } },
      {
        command: "service.call",
        args: { service: "battle-royale", method: "status", arguments: [2000002700100] }
      },
      { command: "game.step", args: { dt: 0.05, steps: 120, now: 2000002700100 } },
      { command: "entity.inspect", args: { entityId: "journal-regen-human-69" } },
      { command: "entity.inspect", args: { entityId: "journal-regen-bot-69" } },
      {
        command: "service.call",
        args: { service: "battle-royale", method: "status", arguments: [2000002706100] }
      }
    ]
  },
  requestedAt: "2026-08-27T12:24:00Z"
});