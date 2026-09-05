export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 9051402,
  mode: "battle-royale",
  room: "stair-edge-assist-active",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      {
        command: "entity.spawn",
        args: {
          spec: {
            id: "stair-warehouse-east-edge",
            kind: "player",
            bot: false,
            position: { x: 73.4, y: 0, z: 2.15, angle: -1.5707963267948966 },
          },
        },
      },
      {
        command: "service.call",
        args: { service: "battle-royale", method: "arm", arguments: [] },
      },
      {
        command: "service.call",
        args: {
          service: "movement",
          method: "setInput",
          arguments: ["stair-warehouse-east-edge", { forward: 1, strafe: 0, turn: 0, sprint: false }],
        },
      },
      { command: "game.step", args: { dt: 0.05, steps: 30 } },
      { command: "entity.inspect", args: { entityId: "stair-warehouse-east-edge" } },
      { command: "entity.remove", args: { entityId: "stair-warehouse-east-edge" } },

      {
        command: "entity.spawn",
        args: {
          spec: {
            id: "stair-warehouse-west-edge",
            kind: "player",
            bot: false,
            position: { x: 73.4, y: 0, z: -2.15, angle: -1.5707963267948966 },
          },
        },
      },
      {
        command: "service.call",
        args: {
          service: "movement",
          method: "setInput",
          arguments: ["stair-warehouse-west-edge", { forward: 1, strafe: 0, turn: 0, sprint: false }],
        },
      },
      { command: "game.step", args: { dt: 0.05, steps: 30 } },
      { command: "entity.inspect", args: { entityId: "stair-warehouse-west-edge" } },
      { command: "entity.remove", args: { entityId: "stair-warehouse-west-edge" } },

      {
        command: "entity.spawn",
        args: {
          spec: {
            id: "stair-house-edge",
            kind: "player",
            bot: false,
            position: { x: 128.1, y: 0, z: 122.15, angle: 1.5707963267948966 },
          },
        },
      },
      {
        command: "service.call",
        args: {
          service: "movement",
          method: "setInput",
          arguments: ["stair-house-edge", { forward: 1, strafe: 0, turn: 0, sprint: false }],
        },
      },
      { command: "game.step", args: { dt: 0.05, steps: 30 } },
      { command: "entity.inspect", args: { entityId: "stair-house-edge" } },
      { command: "entity.remove", args: { entityId: "stair-house-edge" } },

      {
        command: "entity.spawn",
        args: {
          spec: {
            id: "stair-no-side-magnet",
            kind: "player",
            bot: false,
            position: { x: 70, y: 0, z: 2.2, angle: 0 },
          },
        },
      },
      {
        command: "service.call",
        args: {
          service: "movement",
          method: "setInput",
          arguments: ["stair-no-side-magnet", { forward: 1, strafe: 0, turn: 0, sprint: false }],
        },
      },
      { command: "game.step", args: { dt: 0.05, steps: 8 } },
      { command: "entity.inspect", args: { entityId: "stair-no-side-magnet" } },
      { command: "entity.remove", args: { entityId: "stair-no-side-magnet" } }
    ],
  },
  requestedAt: "2026-09-05T14:10:00Z",
});
