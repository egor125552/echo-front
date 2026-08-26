export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 54,
  mode: "battle-royale",
  room: "engine-lab-parachute-54",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      {
        command: "entity.spawn",
        args: {
          spec: {
            id: "engine-parachute-54",
            kind: "human",
            name: "Indoor Canopy Pilot",
            bot: false,
            team: 999999,
            health: 200,
            weapons: ["pistol"],
            position: { x: 0, y: 0, z: 0, angle: 0 }
          }
        }
      },
      {
        command: "service.call",
        args: { service: "battle-royale", method: "arm", arguments: [2000001000000] }
      },
      {
        command: "service.call",
        args: { service: "map", method: "setDoorOpen", arguments: ["warehouse-front-door", true, "engine-parachute-54", 2000001000020] }
      },

      {
        command: "service.call",
        args: {
          service: "parachute",
          method: "launch",
          arguments: ["engine-parachute-54", { altitude: 8, x: 60, z: 0, angle: 0 }, 2000001000100]
        }
      },
      {
        command: "service.call",
        args: {
          service: "movement",
          method: "teleport",
          arguments: ["engine-parachute-54", { x: 60, y: 1.45, z: 0, angle: 0 }]
        }
      },
      {
        command: "service.call",
        args: { service: "parachute", method: "stateFor", arguments: ["engine-parachute-54"] }
      },
      {
        command: "service.call",
        args: {
          service: "match-api",
          method: "handleInput",
          arguments: ["engine-parachute-54", { parachutePressed: true }, 2000001000150]
        }
      },
      {
        command: "service.call",
        args: { service: "parachute", method: "stateFor", arguments: ["engine-parachute-54"] }
      },

      {
        command: "service.call",
        args: {
          service: "parachute",
          method: "launch",
          arguments: ["engine-parachute-54", { altitude: 20, x: 90, z: 0, angle: -1.5707963267948966 }, 2000001001000]
        }
      },
      {
        command: "service.call",
        args: { service: "parachute", method: "deploy", arguments: ["engine-parachute-54", 2000001001050] }
      },
      { command: "game.step", args: { dt: 0.05, steps: 40, now: 2000001001100 } },
      {
        command: "service.call",
        args: {
          service: "movement",
          method: "teleport",
          arguments: ["engine-parachute-54", { x: 76.7, y: 1.45, z: 0, angle: -1.5707963267948966 }]
        }
      },
      {
        command: "service.call",
        args: {
          service: "match-api",
          method: "handleInput",
          arguments: ["engine-parachute-54", { forward: 1 }, 2000001003150]
        }
      },
      {
        command: "service.call",
        args: { service: "parachute", method: "stateFor", arguments: ["engine-parachute-54"] }
      },
      { command: "game.step", args: { dt: 0.05, steps: 8, now: 2000001003200 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-54" } },
      {
        command: "service.call",
        args: { service: "parachute", method: "stateFor", arguments: ["engine-parachute-54"] }
      },
      { command: "game.step", args: { dt: 0.05, steps: 12, now: 2000001003600 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-54" } },
      {
        command: "service.call",
        args: { service: "parachute", method: "stateFor", arguments: ["engine-parachute-54"] }
      },

      {
        command: "service.call",
        args: {
          service: "parachute",
          method: "launch",
          arguments: ["engine-parachute-54", { altitude: 12, x: 60, z: 8, angle: 0 }, 2000001004500]
        }
      },
      {
        command: "service.call",
        args: { service: "parachute", method: "deploy", arguments: ["engine-parachute-54", 2000001004550] }
      },
      { command: "game.step", args: { dt: 0.05, steps: 100, now: 2000001004600 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-54" } },
      {
        command: "service.call",
        args: { service: "parachute", method: "toggle", arguments: ["engine-parachute-54", 2000001009650] }
      },
      {
        command: "service.call",
        args: { service: "parachute", method: "stateFor", arguments: ["engine-parachute-54"] }
      },

      {
        command: "service.call",
        args: {
          service: "parachute",
          method: "launch",
          arguments: ["engine-parachute-54", { altitude: 12, x: 110, z: 110, angle: 0 }, 2000001010000]
        }
      },
      {
        command: "service.call",
        args: { service: "parachute", method: "deploy", arguments: ["engine-parachute-54", 2000001010050] }
      },
      {
        command: "service.call",
        args: { service: "parachute", method: "cut", arguments: ["engine-parachute-54", 2000001010100] }
      },
      { command: "game.step", args: { dt: 0.05, steps: 80, now: 2000001010150 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-54" } },
      {
        command: "service.call",
        args: { service: "battle-royale", method: "status", arguments: [2000001014200] }
      }
    ]
  },
  requestedAt: "2026-08-26T20:03:00Z"
});