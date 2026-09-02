export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 2026090205,
  mode: "battle-royale",
  room: "two-storey-stair-traversal",
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
          arguments: ["stair-traversal-player"],
        },
      },
      {
        command: "component.patch",
        args: {
          entityId: "stair-traversal-player",
          component: "Parachute",
          patch: {
            phase: "landed",
            airborne: false,
            deployed: false,
            simulatedVerticalVelocity: 0,
            savedControl: null,
            beforeMovementX: null,
            beforeMovementY: null,
            beforeMovementZ: null,
            groundDistance: 0,
            landingApproach: false,
            turnRate: 0,
            glideSpeed: 0,
            brake: 0,
            airSpeed: 0
          },
        },
      },
      {
        command: "service.call",
        args: {
          service: "movement",
          method: "teleport",
          arguments: [
            "stair-traversal-player",
            { "x": 127.8, "y": 0, "z": 121.75, "angle": 1.5707963267948966 }
          ],
        },
      },
      {
        command: "service.call",
        args: {
          service: "map",
          method: "surfaceAt",
          arguments: [{ "x": 131.5, "y": 1.6, "z": 121.75 }],
        },
      },
      {
        command: "service.call",
        args: {
          service: "map",
          method: "locationAt",
          arguments: [{ "x": 131.5, "y": 1.6, "z": 121.75 }],
        },
      },
      {
        command: "service.call",
        args: {
          service: "match-api",
          method: "handleInput",
          arguments: ["stair-traversal-player", { "forward": 1 }],
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
          arguments: ["stair-traversal-player", {}],
        },
      },
      {
        command: "component.get",
        args: {
          entityId: "stair-traversal-player",
          component: "Transform"
        },
      },
      {
        command: "service.call",
        args: {
          service: "match-api",
          method: "snapshotFor",
          arguments: ["stair-traversal-player"]
        },
      }
    ]
  },
  requestedAt: "2026-09-02T17:34:00Z",
});
