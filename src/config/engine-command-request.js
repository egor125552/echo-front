export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 53,
  mode: "battle-royale",
  room: "engine-lab-parachute-53",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      {
        command: "entity.spawn",
        args: {
          spec: {
            id: "engine-parachute-53",
            kind: "human",
            name: "Full Physics Pilot",
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
        args: { service: "battle-royale", method: "arm", arguments: [2000000900000] }
      },
      { command: "entity.inspect", args: { entityId: "engine-parachute-53" } },
      {
        command: "service.call",
        args: { service: "parachute", method: "stateFor", arguments: ["engine-parachute-53"] }
      },
      { command: "game.step", args: { dt: 0.05, steps: 100, now: 2000000900050 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-53" } },
      {
        command: "service.call",
        args: {
          service: "match-api",
          method: "handleInput",
          arguments: ["engine-parachute-53", { parachutePressed: true, forward: 1 }, 2000000905100]
        }
      },
      { command: "game.step", args: { dt: 0.05, steps: 80, now: 2000000905150 } },
      {
        command: "service.call",
        args: { service: "parachute", method: "stateFor", arguments: ["engine-parachute-53"] }
      },

      {
        command: "service.call",
        args: {
          service: "parachute",
          method: "launch",
          arguments: ["engine-parachute-53", { altitude: 20, x: 78.5, z: -4, angle: -1.5707963267948966 }, 2000000910000]
        }
      },
      {
        command: "service.call",
        args: {
          service: "match-api",
          method: "handleInput",
          arguments: ["engine-parachute-53", { parachutePressed: true, forward: 1 }, 2000000910050]
        }
      },
      { command: "game.step", args: { dt: 0.05, steps: 32, now: 2000000910100 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-53" } },
      { command: "game.step", args: { dt: 0.05, steps: 8, now: 2000000911700 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-53" } },
      { command: "game.step", args: { dt: 0.05, steps: 12, now: 2000000912100 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-53" } },
      {
        command: "service.call",
        args: { service: "parachute", method: "stateFor", arguments: ["engine-parachute-53"] }
      },

      {
        command: "service.call",
        args: {
          service: "parachute",
          method: "launch",
          arguments: ["engine-parachute-53", { altitude: 20, x: 60, z: 8, angle: 0 }, 2000000912800]
        }
      },
      {
        command: "service.call",
        args: {
          service: "match-api",
          method: "handleInput",
          arguments: ["engine-parachute-53", { parachutePressed: true, forward: -1 }, 2000000912850]
        }
      },
      { command: "game.step", args: { dt: 0.05, steps: 100, now: 2000000912900 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-53" } },
      {
        command: "service.call",
        args: { service: "parachute", method: "stateFor", arguments: ["engine-parachute-53"] }
      },
      {
        command: "service.call",
        args: { service: "parachute", method: "toggle", arguments: ["engine-parachute-53", 2000000918000] }
      },

      {
        command: "service.call",
        args: {
          service: "parachute",
          method: "launch",
          arguments: ["engine-parachute-53", { altitude: 12, x: 110, z: 110, angle: 0 }, 2000000918100]
        }
      },
      {
        command: "service.call",
        args: { service: "parachute", method: "deploy", arguments: ["engine-parachute-53", 2000000918150] }
      },
      {
        command: "service.call",
        args: { service: "parachute", method: "cut", arguments: ["engine-parachute-53", 2000000918200] }
      },
      { command: "game.step", args: { dt: 0.05, steps: 80, now: 2000000918250 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-53" } },
      {
        command: "service.call",
        args: { service: "parachute", method: "stateFor", arguments: ["engine-parachute-53"] }
      },
      {
        command: "service.call",
        args: { service: "battle-royale", method: "status", arguments: [2000000922300] }
      }
    ]
  },
  requestedAt: "2026-08-26T20:58:00Z"
});