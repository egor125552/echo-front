export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 56,
  mode: "battle-royale",
  room: "engine-lab-parachute-56",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      {
        command: "entity.spawn",
        args: {
          spec: {
            id: "engine-parachute-56",
            kind: "human",
            name: "Physics Pilot",
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
            id: "engine-parachute-sentinel-56",
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
        args: { service: "battle-royale", method: "arm", arguments: [2000001200000] }
      },
      {
        command: "service.call",
        args: {
          service: "parachute",
          method: "launch",
          arguments: ["engine-parachute-sentinel-56", { altitude: 1000, x: -200, z: -200, angle: 0 }, 2000001200010]
        }
      },
      { command: "entity.inspect", args: { entityId: "engine-parachute-56" } },

      {
        command: "service.call",
        args: {
          service: "parachute",
          method: "launch",
          arguments: ["engine-parachute-56", { altitude: 12, x: 110, z: 110, angle: 0 }, 2000001200100]
        }
      },
      {
        command: "service.call",
        args: { service: "parachute", method: "deploy", arguments: ["engine-parachute-56", 2000001200150] }
      },
      {
        command: "service.call",
        args: { service: "parachute", method: "cut", arguments: ["engine-parachute-56", 2000001200200] }
      },
      { command: "game.step", args: { dt: 0.05, steps: 80, now: 2000001200250 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-56" } },
      {
        command: "service.call",
        args: { service: "battle-royale", method: "status", arguments: [2000001204300] }
      },

      {
        command: "service.call",
        args: {
          service: "parachute",
          method: "launch",
          arguments: ["engine-parachute-56", { altitude: 20, x: 78.5, z: -4, angle: -1.5707963267948966 }, 2000001204400]
        }
      },
      {
        command: "service.call",
        args: {
          service: "match-api",
          method: "handleInput",
          arguments: ["engine-parachute-56", { parachutePressed: true, forward: 1 }, 2000001204450]
        }
      },
      { command: "game.step", args: { dt: 0.05, steps: 32, now: 2000001204500 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-56" } },
      { command: "game.step", args: { dt: 0.05, steps: 8, now: 2000001206100 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-56" } },
      { command: "game.step", args: { dt: 0.05, steps: 12, now: 2000001206500 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-56" } },
      {
        command: "service.call",
        args: { service: "parachute", method: "stateFor", arguments: ["engine-parachute-56"] }
      },

      {
        command: "service.call",
        args: {
          service: "parachute",
          method: "launch",
          arguments: ["engine-parachute-56", { altitude: 20, x: 60, z: 8, angle: 0 }, 2000001207200]
        }
      },
      {
        command: "service.call",
        args: {
          service: "match-api",
          method: "handleInput",
          arguments: ["engine-parachute-56", { parachutePressed: true, forward: -1 }, 2000001207250]
        }
      },
      { command: "game.step", args: { dt: 0.05, steps: 100, now: 2000001207300 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-56" } },
      {
        command: "service.call",
        args: { service: "parachute", method: "stateFor", arguments: ["engine-parachute-56"] }
      },
      {
        command: "service.call",
        args: { service: "parachute", method: "toggle", arguments: ["engine-parachute-56", 2000001212350] }
      },
      {
        command: "service.call",
        args: { service: "parachute", method: "stateFor", arguments: ["engine-parachute-56"] }
      },
      {
        command: "service.call",
        args: { service: "battle-royale", method: "status", arguments: [2000001212400] }
      }
    ]
  },
  requestedAt: "2026-08-26T20:10:00Z"
});