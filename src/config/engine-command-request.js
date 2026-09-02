export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 2026090202,
  mode: "battle-royale",
  room: "building-navigation-arrival",
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
          arguments: ["navigation-test-player"],
        },
      },
      {
        command: "service.call",
        args: {
          service: "movement",
          method: "teleport",
          arguments: ["navigation-test-player", { x: 110, y: 0, z: 20, angle: 0 }],
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
          service: "match-api",
          method: "handleInput",
          arguments: ["navigation-test-player", { forward: 1, strafe: 0, turn: 0, sprint: false, fireHeld: false }],
        },
      },
      { command: "game.step", args: { dt: 0.05, steps: 235 } },
      {
        command: "service.call",
        args: { service: "match-api", method: "handleInput", arguments: ["navigation-test-player", {}] },
      },
      {
        command: "service.call",
        args: { service: "navigation", method: "stateFor", arguments: ["navigation-test-player"] },
      },
      { command: "component.get", args: { entityId: "navigation-test-player", component: "Transform" } },
      {
        command: "service.call",
        args: { service: "navigation", method: "availableTargets", arguments: ["navigation-test-player"] },
      },
      {
        command: "service.call",
        args: {
          service: "movement",
          method: "teleport",
          arguments: ["navigation-test-player", { x: -70, y: 0, z: -45, angle: 2.4 }],
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
        args: { service: "navigation", method: "toggle", arguments: ["navigation-test-player"] },
      },
      {
        command: "service.call",
        args: { service: "navigation-face", method: "enableGuidance", arguments: ["navigation-test-player"] },
      },
      {
        command: "service.call",
        args: {
          service: "match-api",
          method: "handleInput",
          arguments: ["navigation-test-player", { forward: 1, strafe: 0, turn: 0, sprint: false, fireHeld: false }],
        },
      },
      { command: "game.step", args: { dt: 0.05, steps: 267 } },
      {
        command: "service.call",
        args: { service: "match-api", method: "handleInput", arguments: ["navigation-test-player", {}] },
      },
      {
        command: "service.call",
        args: { service: "navigation", method: "stateFor", arguments: ["navigation-test-player"] },
      },
      { command: "component.get", args: { entityId: "navigation-test-player", component: "Transform" } },
      {
        command: "service.call",
        args: { service: "navigation", method: "availableTargets", arguments: ["navigation-test-player"] },
      }
    ],
  },
  requestedAt: "2026-09-02T17:20:00Z",
});
