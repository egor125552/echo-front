export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 118,
  mode: "battle-royale",
  room: "engine-lab-startup-118",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "service.call", args: {
        service: "ragdoll-stability",
        method: "summary",
        arguments: []
      } }
    ]
  },
  requestedAt: "2026-08-28T14:48:00Z"
});
