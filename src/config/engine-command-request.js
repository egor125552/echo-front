export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 2026090201,
  mode: "battle-royale",
  room: "building-navigation-arrival",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      {
        command: "entity.spawn",
        args: {
          spec: {
            id: "navigation-test-player",
            kind: "player",
            name: "Navigation test player",
            bot: false,
            team: 1,
            position: { x: 110, y: 0, z: 20, angle: 0 },
          },
        },
      },
      {
        command: "service.call",
        args: {
          service: "navigation",
          method: "selectTarget",
          arguments: ["navigation-test-player", "warehouse"],
        },
      },
      {
        command: "service.call",
        args: {
          service: "navigation",
          method: "toggle",
          arguments: ["navigation-test-player"],
        },
      },
      {
        command: "service.call",
        args: {
          service: "navigation-face",
          method: "enableGuidance",
          arguments: ["navigation-test-player"],
        },
      },
      {
        command: "service.call",
        args: {
          service: "movement",
          method: "setInput",
          arguments: [
            "navigation-test-player",
            { forward: 1, strafe: 0, turn: 0, sprint: false, fireHeld: false },
          ],
        },
      },
      {
        command: "game.step",
        args: { dt: 0.05, steps: 500 },
      },
      {
        command: "service.call",
        args: {
          service: "navigation",
          method: "stateFor",
          arguments: ["navigation-test-player"],
        },
      },
      {
        command: "component.get",
        args: { entityId: "navigation-test-player", component: "Transform" },
      },
      {
        command: "service.call",
        args: {
          service: "navigation",
          method: "availableTargets",
          arguments: ["navigation-test-player"],
        },
      },
      {
        command: "service.call",
        args: {
          service: "movement",
          method: "teleport",
          arguments: [
            "navigation-test-player",
            { x: -70, y: 0, z: -45, angle: 2.4 },
          ],
        },
      },
      {
        command: "service.call",
        args: {
          service: "navigation",
          method: "selectTarget",
          arguments: ["navigation-test-player", "forest-hut"],
        },
      },
      {
        command: "service.call",
        args: {
          service: "navigation",
          method: "toggle",
          arguments: ["navigation-test-player"],
        },
      },
      {
        command: "service.call",
        args: {
          service: "navigation-face",
          method: "enableGuidance",
          arguments: ["navigation-test-player"],
        },
      },
      {
        command: "service.call",
        args: {
          service: "movement",
          method: "setInput",
          arguments: [
            "navigation-test-player",
            { forward: 1, strafe: 0, turn: 0, sprint: false, fireHeld: false },
          ],
        },
      },
      {
        command: "game.step",
        args: { dt: 0.05, steps: 500 },
      },
      {
        command: "service.call",
        args: {
          service: "navigation",
          method: "stateFor",
          arguments: ["navigation-test-player"],
        },
      },
      {
        command: "component.get",
        args: { entityId: "navigation-test-player", component: "Transform" },
      },
      {
        command: "service.call",
        args: {
          service: "navigation",
          method: "availableTargets",
          arguments: ["navigation-test-player"],
        },
      }
    ],
  },
  requestedAt: "2026-09-02T17:30:00Z",
});
