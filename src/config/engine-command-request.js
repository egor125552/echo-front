export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 2,
  mode: "battle-royale",
  room: "engine-lab",
  command: "engine.batch",
  args: {
    commands: [
      {
        command: "entity.spawn",
        args: {
          spec: {
            id: "engine-test-bot",
            kind: "player",
            name: "Engine Test Bot",
            bot: true,
            alive: true,
            team: 2,
            position: { x: 0, y: 0, z: 0 }
          }
        }
      },
      {
        command: "component.patch",
        args: {
          entityId: "engine-test-bot",
          component: "Input",
          patch: { forward: 1, sprint: true }
        }
      },
      {
        command: "game.step",
        args: { steps: 3, dt: 0.05 }
      },
      {
        command: "entity.inspect",
        args: { entityId: "engine-test-bot" }
      },
      {
        command: "entity.remove",
        args: { entityId: "engine-test-bot" }
      }
    ]
  },
  requestedAt: "2026-08-25T20:12:00Z",
});
