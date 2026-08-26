export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 58,
  mode: "battle-royale",
  room: "engine-lab-parachute-58",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      {
        command: "entity.spawn",
        args: {
          spec: {
            id: "engine-parachute-58",
            kind: "human",
            name: "Impact Physics Pilot",
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
            id: "engine-parachute-sentinel-58",
            kind: "human",
            name: "Deployment Sentinel",
            bot: false,
            team: 999998,
            health: 200,
            weapons: ["pistol"],
            position: { x: -200, y: 0, z: -200, angle: 0 }
          }
        }
      },
      {
        command: "service.call",
        args: { service: "battle-royale", method: "arm", arguments: [2000001400000] }
      },
      {
        command: "service.call",
        args: {
          service: "parachute",
          method: "launch",
          arguments: ["engine-parachute-sentinel-58", { altitude: 1000, x: -200, z: -200, angle: 0 }, 2000001400010]
        }
      },

      {
        command: "service.call",
        args: {
          service: "parachute",
          method: "launch",
          arguments: ["engine-parachute-58", { altitude: 20, x: 78.5, z: -4, angle: -1.5707963267948966 }, 2000001400100]
        }
      },
      {
        command: "service.call",
        args: {
          service: "match-api",
          method: "handleInput",
          arguments: ["engine-parachute-58", { parachutePressed: true, forward: 1 }, 2000001400150]
        }
      },
      { command: "game.step", args: { dt: 0.05, steps: 52, now: 2000001400200 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-58" } },
      { command: "game.step", args: { dt: 0.05, steps: 10, now: 2000001402800 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-58" } },

      {
        command: "service.call",
        args: {
          service: "parachute",
          method: "launch",
          arguments: ["engine-parachute-58", { altitude: 8, x: 120, z: 120, angle: 0 }, 2000001403400]
        }
      },
      {
        command: "service.call",
        args: { service: "parachute", method: "deploy", arguments: ["engine-parachute-58", 2000001403450] }
      },
      {
        command: "service.call",
        args: { service: "parachute", method: "cut", arguments: ["engine-parachute-58", 2000001403500] }
      },
      { command: "game.step", args: { dt: 0.05, steps: 40, now: 2000001403550 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-58" } },
      {
        command: "service.call",
        args: { service: "health", method: "reset", arguments: ["engine-parachute-58"] }
      },

      {
        command: "service.call",
        args: {
          service: "parachute",
          method: "launch",
          arguments: ["engine-parachute-58", { altitude: 20, x: 130, z: 130, angle: 0 }, 2000001405700]
        }
      },
      {
        command: "service.call",
        args: { service: "parachute", method: "deploy", arguments: ["engine-parachute-58", 2000001405750] }
      },
      {
        command: "service.call",
        args: { service: "parachute", method: "cut", arguments: ["engine-parachute-58", 2000001405800] }
      },
      { command: "game.step", args: { dt: 0.05, steps: 60, now: 2000001405850 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-58" } },
      {
        command: "service.call",
        args: { service: "health", method: "reset", arguments: ["engine-parachute-58"] }
      },

      {
        command: "service.call",
        args: {
          service: "parachute",
          method: "launch",
          arguments: ["engine-parachute-58", { altitude: 25, x: 140, z: 140, angle: 0 }, 2000001409000]
        }
      },
      {
        command: "service.call",
        args: { service: "parachute", method: "deploy", arguments: ["engine-parachute-58", 2000001409050] }
      },
      {
        command: "service.call",
        args: { service: "parachute", method: "cut", arguments: ["engine-parachute-58", 2000001409100] }
      },
      { command: "game.step", args: { dt: 0.05, steps: 70, now: 2000001409150 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-58" } },
      {
        command: "service.call",
        args: { service: "battle-royale", method: "status", arguments: [2000001412700] }
      }
    ]
  },
  requestedAt: "2026-08-26T20:15:00Z"
});