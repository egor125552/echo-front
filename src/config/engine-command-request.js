export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 60,
  mode: "battle-royale",
  room: "engine-lab-parachute-60",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      {
        command: "entity.spawn",
        args: {
          spec: {
            id: "engine-parachute-60",
            kind: "human",
            name: "Warehouse Parachute Pilot",
            bot: false,
            team: 999999,
            health: 200,
            weapons: ["pistol"],
            position: { x: 0, y: 0, z: 0, angle: 0 }
          }
        }
      },
      {
        command: "entity.spawn",
        args: {
          spec: {
            id: "engine-parachute-sentinel-60",
            kind: "human",
            name: "Deployment Sentinel",
            bot: false,
            team: 999998,
            health: 200,
            weapons: ["pistol"],
            position: { x: -220, y: 0, z: -220, angle: 0 }
          }
        }
      },
      {
        command: "service.call",
        args: { service: "battle-royale", method: "arm", arguments: [2000001600000] }
      },
      {
        command: "service.call",
        args: {
          service: "parachute",
          method: "launch",
          arguments: ["engine-parachute-sentinel-60", { altitude: 1000, x: -220, z: -220, angle: 0 }, 2000001600010]
        }
      },
      {
        command: "service.call",
        args: { service: "map", method: "setDoorOpen", arguments: ["warehouse-front-door", true, "engine-parachute-60", 2000001600020] }
      },

      {
        command: "service.call",
        args: {
          service: "parachute",
          method: "launch",
          arguments: ["engine-parachute-60", { altitude: 200, x: 45, z: 85, angle: 0 }, 2000001600100]
        }
      },
      {
        command: "service.call",
        args: { service: "parachute", method: "deploy", arguments: ["engine-parachute-60", 2000001600150] }
      },
      {
        command: "service.call",
        args: {
          service: "match-api",
          method: "handleInput",
          arguments: ["engine-parachute-60", { forward: 1 }, 2000001600200]
        }
      },
      { command: "game.step", args: { dt: 0.05, steps: 370, now: 2000001600250 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-60" } },
      {
        command: "service.call",
        args: { service: "parachute", method: "stateFor", arguments: ["engine-parachute-60"] }
      },

      {
        command: "service.call",
        args: {
          service: "parachute",
          method: "launch",
          arguments: ["engine-parachute-60", { altitude: 24, x: 60, z: 8, angle: 0 }, 2000001620000]
        }
      },
      {
        command: "service.call",
        args: { service: "parachute", method: "deploy", arguments: ["engine-parachute-60", 2000001620050] }
      },
      {
        command: "service.call",
        args: {
          service: "match-api",
          method: "handleInput",
          arguments: ["engine-parachute-60", { forward: -0.3 }, 2000001620100]
        }
      },
      { command: "game.step", args: { dt: 0.05, steps: 90, now: 2000001620150 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-60" } },
      {
        command: "service.call",
        args: { service: "parachute", method: "stateFor", arguments: ["engine-parachute-60"] }
      },

      {
        command: "service.call",
        args: {
          service: "parachute",
          method: "launch",
          arguments: ["engine-parachute-60", { altitude: 20, x: 88, z: 0, angle: -1.5707963267948966 }, 2000001625000]
        }
      },
      {
        command: "service.call",
        args: { service: "parachute", method: "deploy", arguments: ["engine-parachute-60", 2000001625050] }
      },
      { command: "game.step", args: { dt: 0.05, steps: 40, now: 2000001625100 } },
      {
        command: "service.call",
        args: {
          service: "movement",
          method: "teleport",
          arguments: ["engine-parachute-60", { x: 76.7, y: 2.2, z: 0, angle: -1.5707963267948966 }]
        }
      },
      {
        command: "service.call",
        args: {
          service: "match-api",
          method: "handleInput",
          arguments: ["engine-parachute-60", { forward: 1 }, 2000001627150]
        }
      },
      { command: "game.step", args: { dt: 0.05, steps: 12, now: 2000001627200 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-60" } },
      {
        command: "service.call",
        args: { service: "parachute", method: "stateFor", arguments: ["engine-parachute-60"] }
      },
      {
        command: "service.call",
        args: { service: "battle-royale", method: "status", arguments: [2000001628000] }
      }
    ]
  },
  requestedAt: "2026-08-26T20:42:00Z"
});