const PLAYER = "network-recovery-probe-220";

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 220,
  mode: "battle-royale",
  room: "network-recovery-220",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "service.call", args: { service: "match-api", method: "connectHuman", arguments: [PLAYER] } },
      { command: "service.call", args: { service: "match-api", method: "snapshotFor", arguments: [PLAYER] } }
    ]
  },
  requestedAt: "2026-08-30T23:25:00+03:00"
});
