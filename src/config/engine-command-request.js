export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 64,
  mode: "battle-royale",
  room: "engine-lab-bot-parachutes-64",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      {
        command: "service.call",
        args: { service: "battle-royale", method: "arm", arguments: [2000002000000] }
      },
      {
        command: "service.call",
        args: {
          service: "bot-parachutes",
          method: "retarget",
          arguments: [
            ["br-bot-1","br-bot-2","br-bot-3","br-bot-4","br-bot-5","br-bot-6","br-bot-7","br-bot-8","br-bot-9","br-bot-10","br-bot-11","br-bot-12","br-bot-13","br-bot-14","br-bot-15","br-bot-16","br-bot-17","br-bot-18","br-bot-19","br-bot-20","br-bot-21","br-bot-22","br-bot-23","br-bot-24"],
            { "x": 56.5, "y": 3.2, "z": 7, "kind": "stress-warehouse-upper" },
            { "deployAltitude": 190 }
          ]
        }
      },
      {
        command: "service.call",
        args: { service: "bot-parachutes", method: "summary", arguments: [] }
      },
      { command: "game.step", args: { dt: 0.05, steps: 300, now: 2000002000050 } },
      {
        command: "service.call",
        args: { service: "bot-parachutes", method: "summary", arguments: [] }
      },
      { command: "entity.inspect", args: { entityId: "br-bot-1" } },
      { command: "entity.inspect", args: { entityId: "br-bot-12" } },
      { command: "entity.inspect", args: { entityId: "br-bot-24" } },
      { command: "game.step", args: { dt: 0.05, steps: 650, now: 2000002015050 } },
      {
        command: "service.call",
        args: { service: "bot-parachutes", method: "summary", arguments: [] }
      },
      {
        command: "service.call",
        args: { service: "bot-parachutes", method: "assignmentFor", arguments: ["br-bot-1"] }
      },
      {
        command: "service.call",
        args: { service: "bot-parachutes", method: "assignmentFor", arguments: ["br-bot-12"] }
      },
      {
        command: "service.call",
        args: { service: "bot-parachutes", method: "assignmentFor", arguments: ["br-bot-24"] }
      },
      { command: "game.step", args: { dt: 0.05, steps: 650, now: 2000002047550 } },
      {
        command: "service.call",
        args: { service: "bot-parachutes", method: "summary", arguments: [] }
      },
      {
        command: "service.call",
        args: { service: "battle-royale", method: "status", arguments: [2000002080050] }
      },
      { command: "entity.inspect", args: { entityId: "br-bot-1" } },
      { command: "entity.inspect", args: { entityId: "br-bot-12" } },
      { command: "entity.inspect", args: { entityId: "br-bot-24" } }
    ]
  },
  requestedAt: "2026-08-27T10:55:00Z"
});