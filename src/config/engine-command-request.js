export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 37,
  mode: "battle-royale",
  room: "engine-lab-decoy-search-36",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "bot.inspect", args: { entityId: "br-bot-2" } },
      { command: "service.call", args: { service: "bot-brain", method: "stateFor", arguments: ["br-bot-2"] } },
      { command: "game.step", args: { dt: 0.05, steps: 200 } },
      { command: "bot.inspect", args: { entityId: "br-bot-2" } },
      { command: "service.call", args: { service: "bot-brain", method: "stateFor", arguments: ["br-bot-2"] } },
      { command: "game.step", args: { dt: 0.05, steps: 200 } },
      { command: "bot.inspect", args: { entityId: "br-bot-2" } },
      { command: "service.call", args: { service: "bot-brain", method: "stateFor", arguments: ["br-bot-2"] } },
      { command: "service.call", args: { service: "br-observer", method: "snapshot", arguments: [{ resetInterval: true, sampleLimit: 64 }] } }
    ]
  },
  requestedAt: "2026-08-26T13:49:00Z"
});
