const DROP_BODY = "rapier-diagnostics-drop-221";

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 221,
  mode: "battle-royale",
  room: "rapier-diagnostics-221",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "physics.stats", args: {} },
      {
        command: "physics.shape-cast-capsule",
        args: {
          origin: { x: 994, y: 0.79, z: 0 },
          direction: { x: 1, y: 0, z: 0 },
          maxDistance: 20,
          worldOnly: true
        }
      },
      {
        command: "service.call",
        args: {
          service: "physics",
          method: "createDynamicCuboid",
          arguments: [
            DROP_BODY,
            {
              x: 320,
              y: 8,
              z: 320,
              hx: 0.5,
              hy: 0.5,
              hz: 0.5,
              mass: 20,
              friction: 0.7,
              restitution: 0.02,
              ccd: true,
              metadata: {
                kind: "diagnostic-drop",
                accessibleName: "диагностическое тело",
                contactForceThreshold: 100
              }
            }
          ]
        }
      },
      { command: "game.step", args: { dt: 0.05, steps: 60 } },
      { command: "physics.contact-forces", args: { limit: 16 } },
      { command: "physics.stats", args: {} }
    ]
  },
  requestedAt: "2026-08-31T12:00:00+03:00"
});
