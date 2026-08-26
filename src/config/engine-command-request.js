export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 52,
  mode: "battle-royale",
  room: "engine-lab-parachute-52",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      {
        command: "entity.spawn",
        args: {
          spec: {
            id: "engine-parachute-52",
            kind: "human",
            name: "Upper Floor Edge Pilot",
            bot: false,
            team: 999999,
            health: 200,
            weapons: ["pistol"],
            position: { x: 250, y: 0, z: -250, angle: 0 }
          }
        }
      },
      {
        command: "service.call",
        args: { service: "battle-royale", method: "arm", arguments: [2000000800000] }
      },
      {
        command: "service.call",
        args: {
          service: "parachute",
          method: "launch",
          arguments: ["engine-parachute-52", { "altitude": 20, "x": 60, "z": 0, "angle": 0 }, 2000000800050]
        }
      },
      {
        command: "service.call",
        args: {
          service: "match-api",
          method: "handleInput",
          arguments: ["engine-parachute-52", { parachutePressed: true, forward: 1 }, 2000000800100]
        }
      },
      { command: "game.step", args: { dt: 0.05, steps: 55, now: 2000000800150 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-52" } },
      { command: "game.step", args: { dt: 0.05, steps: 14, now: 2000000802900 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-52" } },
      { command: "game.step", args: { dt: 0.05, steps: 20, now: 2000000803600 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-52" } },

      {
        command: "service.call",
        args: {
          service: "parachute",
          method: "launch",
          arguments: ["engine-parachute-52", { "altitude": 40, "x": 50, "z": -4, "angle": 1.57079632679 }, 2000000804600]
        }
      },
      {
        command: "service.call",
        args: {
          service: "match-api",
          method: "handleInput",
          arguments: ["engine-parachute-52", { parachutePressed: true, forward: 1 }, 2000000804650]
        }
      },
      { command: "game.step", args: { dt: 0.05, steps: 40, now: 2000000804700 } },
      {
        command: "service.call",
        args: {
          service: "movement",
          method: "teleport",
          arguments: ["engine-parachute-52", { "x": 59.15, "y": 5.3, "z": -4, "angle": 1.57079632679 }]
        }
      },
      {
        command: "service.call",
        args: {
          service: "match-api",
          method: "handleInput",
          arguments: ["engine-parachute-52", { forward: 1 }, 2000000806700]
        }
      },
      { command: "game.step", args: { dt: 0.05, steps: 4, now: 2000000806750 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-52" } },
      { command: "game.step", args: { dt: 0.05, steps: 8, now: 2000000806950 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-52" } },
      { command: "game.step", args: { dt: 0.05, steps: 12, now: 2000000807350 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-52" } },
      {
        command: "service.call",
        args: { service: "parachute", method: "stateFor", arguments: ["engine-parachute-52"] }
      }
    ]
  },
  requestedAt: "2026-08-26T20:15:00Z"
});
