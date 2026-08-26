export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 29,
  mode: "battle-royale",
  room: "engine-lab-full-br-29",
  command: "engine.batch",
  repeat: 240,
  frameEvery: 4,
  args: {
    commands: [
      { command: "service.call", args: { service: "match-api", method: "connectHuman", arguments: ["engine-observer-29"] } },
      { command: "game.step", args: { dt: 0.05, steps: 100 } },
      { command: "service.call", args: { service: "br-observer", method: "snapshot", arguments: [{ "resetInterval": true, "sampleLimit": 24 }] } },
      { command: "match.info", args: {} }
    ]
  },
  requestedAt: "2026-08-26T10:55:00Z"
});