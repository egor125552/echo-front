export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 224,
  mode: "battle-royale",
  room: "force-crash-probe-224",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "entity.list", args: { bot: false, alive: true, limit: 12 } },
      { command: "service.methods", args: { service: "vehicles" } },
      { command: "service.methods", args: { service: "ragdoll-damage-model" } },
      {
        command: "service.call",
        args: {
          service: "vehicles",
          method: "crashMetricsForForce",
          arguments: [30000, { totalMass: 1800, deltaSpeed: 2, speedBefore: 12 }]
        }
      },
      {
        command: "service.call",
        args: {
          service: "vehicles",
          method: "crashMetricsForForce",
          arguments: [120000, { totalMass: 1800, deltaSpeed: 8, speedBefore: 25 }]
        }
      },
      { command: "service.call", args: { service: "ragdoll-damage-model", method: "summary", arguments: [] } },
      { command: "physics.stats", args: {} }
    ]
  },
  requestedAt: "2026-08-31T12:46:00+03:00"
});
