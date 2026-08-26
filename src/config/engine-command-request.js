export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 59,
  mode: "battle-royale",
  room: "engine-lab-parachute-59",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      {
        command: "entity.spawn",
        args: {
          spec: {
            id: "engine-parachute-59",
            kind: "human",
            name: "Advanced Parachute Pilot",
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
            id: "engine-parachute-sentinel-59",
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
        args: { service: "battle-royale", method: "arm", arguments: [2000001500000] }
      },
      {
        command: "service.call",
        args: {
          service: "parachute",
          method: "launch",
          arguments: ["engine-parachute-sentinel-59", { altitude: 1000, x: -220, z: -220, angle: 0 }, 2000001500010]
        }
      },
      {
        command: "service.call",
        args: { service: "map", method: "setDoorOpen", arguments: ["warehouse-front-door", true, "engine-parachute-59", 2000001500020] }
      },

      {
        command: "service.call",
        args: {
          service: "parachute",
          method: "launch",
          arguments: ["engine-parachute-59", { altitude: 180, x: 60, z: 105, angle: 0 }, 2000001500100]
        }
      },
      {
        command: "service.call",
        args: { service: "parachute", method: "deploy", arguments: ["engine-parachute-59", 2000001500150] }
      },
      {
        command: "service.call",
        args: {
          service: "match-api",
          method: "handleInput",
          arguments: ["engine-parachute-59", { forward: 1 }, 2000001500200]
        }
      },
      { command: "game.step", args: { dt: 0.05, steps: 180, now: 2000001500250 } },
      {
        command: "service.call",
        args: { service: "parachute", method: "stateFor", arguments: ["engine-parachute-59"] }
      },
      { command: "game.step", args: { dt: 0.05, steps: 160, now: 2000001509250 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-59" } },

      {
        command: "service.call",
        args: {
          service: "parachute",
          method: "launch",
          arguments: ["engine-parachute-59", { altitude: 80, x: 20, z: 60, angle: 0 }, 2000001518000]
        }
      },
      {
        command: "service.call",
        args: { service: "parachute", method: "deploy", arguments: ["engine-parachute-59", 2000001518050] }
      },
      {
        command: "service.call",
        args: {
          service: "match-api",
          method: "handleInput",
          arguments: ["engine-parachute-59", { forward: -1 }, 2000001518100]
        }
      },
      { command: "game.step", args: { dt: 0.05, steps: 110, now: 2000001518150 } },
      {
        command: "service.call",
        args: { service: "parachute", method: "stateFor", arguments: ["engine-parachute-59"] }
      },
      {
        command: "service.call",
        args: {
          service: "match-api",
          method: "handleInput",
          arguments: ["engine-parachute-59", { forward: 1 }, 2000001523650]
        }
      },
      { command: "game.step", args: { dt: 0.05, steps: 70, now: 2000001523700 } },
      {
        command: "service.call",
        args: { service: "parachute", method: "stateFor", arguments: ["engine-parachute-59"] }
      },

      {
        command: "service.call",
        args: {
          service: "parachute",
          method: "launch",
          arguments: ["engine-parachute-59", { altitude: 25, x: 88, z: 0, angle: -1.5707963267948966 }, 2000001528000]
        }
      },
      {
        command: "service.call",
        args: { service: "parachute", method: "deploy", arguments: ["engine-parachute-59", 2000001528050] }
      },
      {
        command: "service.call",
        args: {
          service: "match-api",
          method: "handleInput",
          arguments: ["engine-parachute-59", { forward: 1 }, 2000001528100]
        }
      },
      { command: "game.step", args: { dt: 0.05, steps: 35, now: 2000001528150 } },
      {
        command: "service.call",
        args: { service: "parachute", method: "stateFor", arguments: ["engine-parachute-59"] }
      },
      { command: "entity.inspect", args: { entityId: "engine-parachute-59" } },

      {
        command: "service.call",
        args: {
          service: "parachute",
          method: "launch",
          arguments: ["engine-parachute-59", { altitude: 12, x: 130, z: 130, angle: 0 }, 2000001531000]
        }
      },
      {
        command: "service.call",
        args: { service: "parachute", method: "deploy", arguments: ["engine-parachute-59", 2000001531050] }
      },
      {
        command: "service.call",
        args: { service: "parachute", method: "cut", arguments: ["engine-parachute-59", 2000001531100] }
      },
      { command: "game.step", args: { dt: 0.05, steps: 60, now: 2000001531150 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-59" } },
      {
        command: "service.call",
        args: { service: "battle-royale", method: "status", arguments: [2000001534200] }
      }
    ]
  },
  requestedAt: "2026-08-26T20:35:00Z"
});