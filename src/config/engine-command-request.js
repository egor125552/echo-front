export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 62,
  mode: "battle-royale",
  room: "engine-lab-parachute-62",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      {
        command: "entity.spawn",
        args: {
          spec: {
            id: "engine-parachute-62",
            kind: "human",
            name: "Rapier Flight Pilot",
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
            id: "engine-parachute-sentinel-62",
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
        args: { service: "battle-royale", method: "arm", arguments: [2000001800000] }
      },
      {
        command: "service.call",
        args: {
          service: "parachute",
          method: "launch",
          arguments: ["engine-parachute-sentinel-62", { altitude: 1000, x: -220, z: -220, angle: 0 }, 2000001800010]
        }
      },

      {
        command: "service.call",
        args: {
          service: "parachute",
          method: "launch",
          arguments: ["engine-parachute-62", { altitude: 300, x: 0, z: 100, angle: 0 }, 2000001800100]
        }
      },
      {
        command: "service.call",
        args: { service: "parachute", method: "deploy", arguments: ["engine-parachute-62", 2000001800150] }
      },
      {
        command: "service.call",
        args: {
          service: "match-api",
          method: "handleInput",
          arguments: ["engine-parachute-62", { forward: 1 }, 2000001800200]
        }
      },
      { command: "game.step", args: { dt: 0.05, steps: 80, now: 2000001800250 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-62" } },
      {
        command: "service.call",
        args: { service: "parachute", method: "stateFor", arguments: ["engine-parachute-62"] }
      },

      {
        command: "service.call",
        args: { service: "health", method: "reset", arguments: ["engine-parachute-62"] }
      },
      {
        command: "service.call",
        args: {
          service: "parachute",
          method: "launch",
          arguments: ["engine-parachute-62", { altitude: 29, x: -70, z: -70, angle: 0 }, 2000001810000]
        }
      },
      {
        command: "service.call",
        args: { service: "parachute", method: "deploy", arguments: ["engine-parachute-62", 2000001810050] }
      },
      {
        command: "service.call",
        args: { service: "parachute", method: "cut", arguments: ["engine-parachute-62", 2000001810100] }
      },
      { command: "game.step", args: { dt: 0.05, steps: 80, now: 2000001810150 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-62" } },
      {
        command: "service.call",
        args: { service: "parachute", method: "stateFor", arguments: ["engine-parachute-62"] }
      },

      {
        command: "service.call",
        args: { service: "health", method: "reset", arguments: ["engine-parachute-62"] }
      },
      {
        command: "service.call",
        args: {
          service: "parachute",
          method: "launch",
          arguments: ["engine-parachute-62", { altitude: 50, x: -90, z: -90, angle: 0 }, 2000001820000]
        }
      },
      {
        command: "service.call",
        args: { service: "parachute", method: "deploy", arguments: ["engine-parachute-62", 2000001820050] }
      },
      {
        command: "service.call",
        args: { service: "parachute", method: "cut", arguments: ["engine-parachute-62", 2000001820100] }
      },
      { command: "game.step", args: { dt: 0.05, steps: 110, now: 2000001820150 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-62" } },
      {
        command: "service.call",
        args: { service: "parachute", method: "stateFor", arguments: ["engine-parachute-62"] }
      },

      {
        command: "service.call",
        args: { service: "health", method: "reset", arguments: ["engine-parachute-62"] }
      },
      {
        command: "service.call",
        args: {
          service: "parachute",
          method: "launch",
          arguments: ["engine-parachute-62", { altitude: 100, x: -110, z: -110, angle: 0 }, 2000001830000]
        }
      },
      {
        command: "service.call",
        args: { service: "parachute", method: "deploy", arguments: ["engine-parachute-62", 2000001830050] }
      },
      {
        command: "service.call",
        args: { service: "parachute", method: "cut", arguments: ["engine-parachute-62", 2000001830100] }
      },
      { command: "game.step", args: { dt: 0.05, steps: 180, now: 2000001830150 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-62" } },
      {
        command: "service.call",
        args: { service: "parachute", method: "stateFor", arguments: ["engine-parachute-62"] }
      }
    ]
  },
  requestedAt: "2026-08-27T10:10:00Z"
});