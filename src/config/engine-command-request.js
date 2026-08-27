export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 63,
  mode: "battle-royale",
  room: "engine-lab-bot-parachutes-63",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      {
        command: "service.call",
        args: { service: "battle-royale", method: "arm", arguments: [2000001900000] }
      },
      {
        command: "service.call",
        args: { service: "bot-parachutes", method: "summary", arguments: [] }
      },
      {
        command: "service.call",
        args: { service: "bot-parachutes", method: "assignmentFor", arguments: ["br-bot-18"] }
      },
      {
        command: "service.call",
        args: { service: "bot-parachutes", method: "assignmentFor", arguments: ["br-bot-23"] }
      },
      {
        command: "service.call",
        args: { service: "bot-parachutes", method: "assignmentFor", arguments: ["br-bot-63"] }
      },
      { command: "game.step", args: { dt: 0.05, steps: 300, now: 2000001900050 } },
      {
        command: "service.call",
        args: { service: "bot-parachutes", method: "summary", arguments: [] }
      },
      {
        command: "service.call",
        args: { service: "parachute", method: "stateFor", arguments: ["br-bot-18"] }
      },
      { command: "entity.inspect", args: { entityId: "br-bot-18" } },
      { command: "game.step", args: { dt: 0.05, steps: 600, now: 2000001915050 } },
      {
        command: "service.call",
        args: { service: "bot-parachutes", method: "summary", arguments: [] }
      },
      {
        command: "service.call",
        args: { service: "parachute", method: "stateFor", arguments: ["br-bot-23"] }
      },
      { command: "entity.inspect", args: { entityId: "br-bot-23" } },
      { command: "game.step", args: { dt: 0.05, steps: 500, now: 2000001945050 } },
      {
        command: "service.call",
        args: { service: "bot-parachutes", method: "summary", arguments: [] }
      },
      {
        command: "service.call",
        args: { service: "battle-royale", method: "status", arguments: [2000001970050] }
      },
      {
        command: "service.call",
        args: { service: "bot-parachutes", method: "assignmentFor", arguments: ["br-bot-18"] }
      },
      {
        command: "service.call",
        args: { service: "bot-parachutes", method: "assignmentFor", arguments: ["br-bot-23"] }
      },
      {
        command: "service.call",
        args: { service: "bot-parachutes", method: "assignmentFor", arguments: ["br-bot-63"] }
      },
      { command: "entity.inspect", args: { entityId: "br-bot-18" } },
      { command: "entity.inspect", args: { entityId: "br-bot-23" } },
      { command: "entity.inspect", args: { entityId: "br-bot-63" } }
    ]
  },
  requestedAt: "2026-08-27T10:45:00Z"
});