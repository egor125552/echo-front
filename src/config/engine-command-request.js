const START = 2000020700000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 207,
  mode: "battle-royale",
  room: "engine-runtime-smoke-207",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: { commands: [
    { command: "service.call", args: { service: "death-fall-tuning", method: "profile", arguments: [] } },
    { command: "service.call", args: { service: "ragdoll-tuning", method: "currentReason", arguments: ["death"] } },
    { command: "service.call", args: { service: "battle-royale", method: "status", arguments: [START] } },
    { command: "service.call", args: { service: "match-api", method: "snapshot", arguments: [START] } }
  ] },
  requestedAt: "2026-08-30T16:45:00+03:00"
});
