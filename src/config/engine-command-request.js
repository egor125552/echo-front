const START = 2000012000000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 120,
  mode: "battle-royale",
  room: "engine-lab-ragdoll-energy-120",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "service.call", args: {
        service: "battle-royale",
        method: "arm",
        arguments: [START]
      } },
      { command: "entity.spawn", args: { spec: {
        id: "launch-test-120",
        kind: "human",
        name: "Launch Test",
        bot: true,
        team: 12001,
        health: 400,
        weapons: [],
        position: { x: 300, y: 2, z: 300, angle: 0 }
      } } },
      { command: "service.call", args: {
        service: "ragdoll",
        method: "activate",
        arguments: [
          "launch-test-120",
          { reason: "vehicle-eject", position: { x: 300, y: 2, z: 300 }, angle: 0, velocity: { x: 0, y: 0, z: 0 } }
        ]
      } },
      { command: "service.call", args: {
        service: "ragdoll-stability",
        method: "applyVelocityDeltaToLatest",
        arguments: [{ x: 180, y: 400, z: -120 }]
      } },
      { command: "game.step", args: { dt: 0.02, steps: 5, now: START + 20 } },
      { command: "service.call", args: {
        service: "ragdoll-stability",
        method: "summary",
        arguments: []
      } },
      { command: "service.call", args: {
        service: "ragdoll-stability",
        method: "assertStable",
        arguments: [{ maxSpread: 12, maxSpeed: 500 }]
      } },
      { command: "service.call", args: {
        service: "ragdoll",
        method: "stateFor",
        arguments: ["launch-test-120"]
      } }
    ]
  },
  requestedAt: "2026-08-28T15:27:00Z"
});
