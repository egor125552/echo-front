export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 9051405,
  mode: "battle-royale",
  room: "stair-full-edge-traversal",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      {
        command: "entity.spawn",
        args: { spec: { id: "warehouse-edge-full-up", kind: "player", bot: false, position: { x: 73.4, y: 0, z: 2.15, angle: -1.5707963267948966 } } },
      },
      { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [] } },
      { command: "service.call", args: { service: "movement", method: "setInput", arguments: ["warehouse-edge-full-up", { forward: 1, strafe: 0, turn: 0, sprint: false }] } },
      { command: "game.step", args: { dt: 0.05, steps: 60 } },
      { command: "entity.inspect", args: { entityId: "warehouse-edge-full-up" } },
      { command: "entity.remove", args: { entityId: "warehouse-edge-full-up" } },

      {
        command: "entity.spawn",
        args: { spec: { id: "house-edge-full-up", kind: "player", bot: false, position: { x: 128.1, y: 0, z: 122.15, angle: 1.5707963267948966 } } },
      },
      { command: "service.call", args: { service: "movement", method: "setInput", arguments: ["house-edge-full-up", { forward: 1, strafe: 0, turn: 0, sprint: false }] } },
      { command: "game.step", args: { dt: 0.05, steps: 60 } },
      { command: "entity.inspect", args: { entityId: "house-edge-full-up" } },
      { command: "entity.remove", args: { entityId: "house-edge-full-up" } },

      {
        command: "entity.spawn",
        args: { spec: { id: "warehouse-edge-full-down", kind: "player", bot: false, position: { x: 66.6, y: 3.2, z: 2.15, angle: 1.5707963267948966 } } },
      },
      { command: "service.call", args: { service: "movement", method: "setInput", arguments: ["warehouse-edge-full-down", { forward: 1, strafe: 0, turn: 0, sprint: false }] } },
      { command: "game.step", args: { dt: 0.05, steps: 60 } },
      { command: "entity.inspect", args: { entityId: "warehouse-edge-full-down" } },
      { command: "entity.remove", args: { entityId: "warehouse-edge-full-down" } },

      {
        command: "entity.spawn",
        args: { spec: { id: "warehouse-center-full-up", kind: "player", bot: false, position: { x: 73.4, y: 0, z: 0, angle: -1.5707963267948966 } } },
      },
      { command: "service.call", args: { service: "movement", method: "setInput", arguments: ["warehouse-center-full-up", { forward: 1, strafe: 0, turn: 0, sprint: false }] } },
      { command: "game.step", args: { dt: 0.05, steps: 60 } },
      { command: "entity.inspect", args: { entityId: "warehouse-center-full-up" } },
      { command: "entity.remove", args: { entityId: "warehouse-center-full-up" } }
    ],
  },
  requestedAt: "2026-09-05T14:34:00Z",
});
