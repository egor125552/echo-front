export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 202609042255,
  mode: "battle-royale",
  room: "br-final-120s-regression",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      {
        command: "service.call",
        args: { service: "match-api", method: "connectHuman", arguments: ["engine-final-regression"] },
      },
      { command: "game.step", args: { dt: 0.05, steps: 500 } },
      { command: "match.info", args: {} },
      { command: "game.step", args: { dt: 0.05, steps: 500 } },
      { command: "match.info", args: {} },
      { command: "game.step", args: { dt: 0.05, steps: 500 } },
      { command: "match.info", args: {} },
      { command: "game.step", args: { dt: 0.05, steps: 500 } },
      { command: "match.info", args: {} },
      { command: "game.step", args: { dt: 0.05, steps: 400 } },
      { command: "match.info", args: {} },
      {
        command: "service.call",
        args: { service: "bot-parachutes", method: "summary", arguments: [] },
      },
      {
        command: "service.call",
        args: { service: "dropzone-vehicle", method: "summary", arguments: [] },
      },
      {
        command: "service.call",
        args: { service: "building-ai-portability", method: "summary", arguments: [] },
      },
      { command: "physics.stats", args: {} },
    ],
  },
  requestedAt: "2026-09-04T22:55:00+03:00",
});
