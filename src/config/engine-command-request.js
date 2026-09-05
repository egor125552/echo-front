export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 9051403,
  mode: "battle-royale",
  room: "stair-forgiving-collision",
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
      { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [] } },
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
            id: "stair-warehouse-descend-edge",
            kind: "player",
            bot: false,
            position: { x: 66.6, y: 3.2, z: 2.15, angle: 1.5707963267948966 },
          },
        },
      },
      {
        command: "service.call",
        args: {
          service: "movement",
          method: "setInput",
          arguments: ["stair-warehouse-descend-edge", { forward: 1, strafe: 0, turn: 0, sprint: false }],
        },
      },
      { command: "game.step", args: { dt: 0.05, steps: 30 } },
      { command: "entity.inspect", args: { entityId: "stair-warehouse-descend-edge" } },
      { command: "entity.remove", args: { entityId: "stair-warehouse-descend-edge" } },

      {
        command: "entity.spawn",
        args: {
          spec: {
            id: "stair-warehouse-edge-sprint",
            kind: "player",
            bot: false,
            position: { x: 73.4, y: 0, z: 2.15, angle: -1.5707963267948966 },
          },
        },
      },
      {
        command: "service.call",
        args: {
          service: "movement",
          method: "setInput",
          arguments: ["stair-warehouse-edge-sprint", { forward: 1, strafe: 0, turn: 0, sprint: true }],
        },
      },
      { command: "game.step", args: { dt: 0.05, steps: 20 } },
      { command: "entity.inspect", args: { entityId: "stair-warehouse-edge-sprint" } },
      { command: "entity.remove", args: { entityId: "stair-warehouse-edge-sprint" } },

      {
        command: "entity.spawn",
        args: {
          spec: {
            id: "stair-warehouse-parallel-outside",
            kind: "player",
            bot: false,
            position: { x: 73.4, y: 0, z: 2.65, angle: -1.5707963267948966 },
          },
        },
      },
      {
        command: "service.call",
        args: {
          service: "movement",
          method: "setInput",
          arguments: ["stair-warehouse-parallel-outside", { forward: 1, strafe: 0, turn: 0, sprint: false }],
        },
      },
      { command: "game.step", args: { dt: 0.05, steps: 20 } },
      { command: "entity.inspect", args: { entityId: "stair-warehouse-parallel-outside" } },
      { command: "entity.remove", args: { entityId: "stair-warehouse-parallel-outside" } }
    ],
  },
  requestedAt: "2026-09-05T14:18:00Z",
});
