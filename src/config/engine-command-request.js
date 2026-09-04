export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 202609041647,
  mode: "battle-royale",
  room: "battle-royale-portability-audit",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      {
        command: "service.call",
        args: {
          service: "match-api",
          method: "connectHuman",
          arguments: ["engine-two-minute-audit"],
        },
      },
      { command: "engine.status", args: {} },
      {
        command: "service.call",
        args: { service: "building-design-validator", method: "validateAll", arguments: [] },
      },
      {
        command: "service.call",
        args: { service: "building-factory", method: "list", arguments: [] },
      },
      { command: "game.step", args: { dt: 0.05, steps: 500 } },
      { command: "match.info", args: {} },
      {
        command: "service.call",
        args: { service: "bot-parachutes", method: "summary", arguments: [] },
      },
      {
        command: "service.call",
        args: { service: "building-ai-portability", method: "summary", arguments: [] },
      },
      {
        command: "service.call",
        args: { service: "bot-building-stairs", method: "summary", arguments: [] },
      },
      { command: "game.step", args: { dt: 0.05, steps: 500 } },
      { command: "match.info", args: {} },
      {
        command: "service.call",
        args: { service: "bot-parachutes", method: "summary", arguments: [] },
      },
      {
        command: "service.call",
        args: { service: "building-ai-portability", method: "summary", arguments: [] },
      },
      {
        command: "service.call",
        args: { service: "bot-building-stairs", method: "summary", arguments: [] },
      },
      { command: "game.step", args: { dt: 0.05, steps: 500 } },
      { command: "match.info", args: {} },
      {
        command: "service.call",
        args: { service: "bot-parachutes", method: "summary", arguments: [] },
      },
      {
        command: "service.call",
        args: { service: "building-ai-portability", method: "summary", arguments: [] },
      },
      {
        command: "service.call",
        args: { service: "bot-building-stairs", method: "summary", arguments: [] },
      },
      {
        command: "service.call",
        args: { service: "warehouse-traffic", method: "summary", arguments: [] },
      },
      {
        command: "service.call",
        args: { service: "warehouse-combat-flow", method: "summary", arguments: [] },
      },
      { command: "game.step", args: { dt: 0.05, steps: 500 } },
      { command: "match.info", args: {} },
      {
        command: "service.call",
        args: { service: "bot-parachutes", method: "summary", arguments: [] },
      },
      {
        command: "service.call",
        args: { service: "building-ai-portability", method: "summary", arguments: [] },
      },
      {
        command: "service.call",
        args: { service: "bot-building-stairs", method: "summary", arguments: [] },
      },
      { command: "physics.stats", args: {} },
      { command: "game.step", args: { dt: 0.05, steps: 400 } },
      { command: "match.info", args: {} },
      {
        command: "service.call",
        args: { service: "bot-parachutes", method: "summary", arguments: [] },
      },
      {
        command: "service.call",
        args: { service: "building-ai-portability", method: "summary", arguments: [] },
      },
      {
        command: "service.call",
        args: { service: "bot-building-stairs", method: "summary", arguments: [] },
      },
    ],
  },
  requestedAt: "2026-09-04T16:47:00Z",
});
