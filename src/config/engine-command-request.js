export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 2026090203,
  mode: "battle-royale",
  room: "keyboard-camera-turn",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      {
        command: "service.call",
        args: { service: "match-api", method: "connectHuman", arguments: ["camera-turn-test-player"] },
      },
      {
        command: "service.call",
        args: {
          service: "movement",
          method: "teleport",
          arguments: ["camera-turn-test-player", { x: 0, y: 0, z: 0, angle: 0 }],
        },
      },
      {
        command: "service.call",
        args: {
          service: "match-api",
          method: "handleInput",
          arguments: ["camera-turn-test-player", { forward: 0, strafe: 0, turn: 1, sprint: false, fireHeld: false }],
        },
      },
      { command: "game.step", args: { dt: 0.05, steps: 10 } },
      {
        command: "service.call",
        args: { service: "match-api", method: "handleInput", arguments: ["camera-turn-test-player", {}] },
      },
      { command: "component.get", args: { entityId: "camera-turn-test-player", component: "Transform" } },
      {
        command: "service.call",
        args: {
          service: "match-api",
          method: "handleInput",
          arguments: ["camera-turn-test-player", { forward: 0, strafe: 0, turn: -1, sprint: false, fireHeld: false }],
        },
      },
      { command: "game.step", args: { dt: 0.05, steps: 20 } },
      {
        command: "service.call",
        args: { service: "match-api", method: "handleInput", arguments: ["camera-turn-test-player", {}] },
      },
      { command: "component.get", args: { entityId: "camera-turn-test-player", component: "Transform" } }
    ],
  },
  requestedAt: "2026-09-02T17:22:00Z",
});
