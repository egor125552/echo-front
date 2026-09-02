export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 2026090204,
  mode: "battle-royale",
  room: "two-storey-stair-regression",
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
          arguments: ["stair-regression-player"],
        },
      },
      {
        command: "component.patch",
        args: {
          entityId: "stair-regression-player",
          component: "Transform",
          patch: {
            x: 127.8,
            y: 0,
            z: 121.75,
            angle: 1.5707963267948966,
            verticalVelocity: 0,
            grounded: true,
          },
        },
      },
      {
        command: "service.call",
        args: {
          service: "map",
          method: "surfaceAt",
          arguments: [{ x: 131.5, y: 1.6, z: 121.75 }],
        },
      },
      {
        command: "service.call",
        args: {
          service: "map",
          method: "locationAt",
          arguments: [{ x: 131.5, y: 1.6, z: 121.75 }],
        },
      },
      {
        command: "service.call",
        args: {
          service: "match-api",
          method: "handleInput",
          arguments: ["stair-regression-player", { "forward": 1 }],
        },
      },
      {
        command: "game.step",
        args: { "dt": 0.05, "steps": 60 },
      },
      {
        command: "service.call",
        args: {
          service: "match-api",
          method: "handleInput",
          arguments: ["stair-regression-player", {}],
        },
      },
      {
        command: "component.get",
        args: {
          entityId: "stair-regression-player",
          component: "Transform"
        },
      },
      {
        command: "service.call",
        args: {
          service: "match-api",
          method: "snapshotFor",
          arguments: ["stair-regression-player"]
        },
      }
    ]
  },
  requestedAt: "2026-09-02T17:30:00Z",
});
