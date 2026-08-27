export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 68,
  mode: "battle-royale",
  room: "engine-lab-journal-fixes-68",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      {
        command: "service.call",
        args: { service: "battle-royale", method: "arm", arguments: [2000002600000] }
      },
      {
        command: "entity.spawn",
        args: {
          spec: {
            id: "journal-regen-human",
            kind: "test-human",
            name: "Journal Regen Human",
            bot: false,
            team: 90001,
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
            id: "journal-regen-bot",
            kind: "bot",
            name: "Journal Regen Bot",
            bot: true,
            team: 90002,
            health: 200,
            weapons: [],
            position: { x: -330, y: 0, z: 0, angle: 0 }
          }
        }
      },
      {
        command: "service.call",
        args: {
          service: "health",
          method: "applyDamage",
          arguments: ["journal-regen-human", 107, { "weaponId": "fall-impact", "now": 2000002600050 }]
        }
      },
      {
        command: "service.call",
        args: {
          service: "health",
          method: "applyDamage",
          arguments: ["journal-regen-bot", 50, { "weaponId": "engine-probe", "now": 2000002600050 }]
        }
      },
      { command: "entity.inspect", args: { entityId: "journal-regen-human" } },
      { command: "entity.inspect", args: { entityId: "journal-regen-bot" } },
      {
        command: "service.call",
        args: { service: "battle-royale", method: "status", arguments: [2000002600100] }
      },
      { command: "game.step", args: { dt: 0.05, steps: 120, now: 2000002600100 } },
      { command: "entity.inspect", args: { entityId: "journal-regen-human" } },
      { command: "entity.inspect", args: { entityId: "journal-regen-bot" } },
      {
        command: "service.call",
        args: { service: "battle-royale", method: "status", arguments: [2000002606100] }
      },
      {
        command: "service.call",
        args: {
          service: "ground-navigation",
          method: "waypoint",
          arguments: [{ "x": 40, "y": 0, "z": 0 }, { "x": 55, "y": 0, "z": 5 }]
        }
      },
      {
        command: "service.call",
        args: {
          service: "ground-navigation",
          method: "waypoint",
          arguments: [{ "x": 43.65, "y": 0, "z": 13.55 }, { "x": 55, "y": 0, "z": 5 }]
        }
      },
      {
        command: "service.call",
        args: {
          service: "ground-navigation",
          method: "waypoint",
          arguments: [{ "x": 76.35, "y": 0, "z": 13.55 }, { "x": 55, "y": 0, "z": 5 }]
        }
      },
      {
        command: "service.call",
        args: {
          service: "ground-navigation",
          method: "waypoint",
          arguments: [{ "x": 60, "y": 0, "z": 0 }, { "x": 55, "y": 3.2, "z": 7 }]
        }
      },
      {
        command: "service.call",
        args: {
          service: "ground-navigation",
          method: "waypoint",
          arguments: [{ "x": 66.1, "y": 0, "z": 3.35 }, { "x": 55, "y": 3.2, "z": 7 }]
        }
      },
      {
        command: "service.call",
        args: {
          service: "ground-navigation",
          method: "waypoint",
          arguments: [{ "x": 73.9, "y": 0, "z": 3.35 }, { "x": 55, "y": 3.2, "z": 7 }]
        }
      }
    ]
  },
  requestedAt: "2026-08-27T12:20:00Z"
});