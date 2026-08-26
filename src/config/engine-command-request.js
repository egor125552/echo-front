export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 45,
  mode: "battle-royale",
  room: "engine-lab-parachute-45",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      {
        command: "entity.spawn",
        args: {
          spec: {
            id: "engine-parachute-45",
            kind: "human",
            name: "Parachute Safety Pilot",
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
        args: { service: "battle-royale", method: "arm", arguments: [2000000100000] }
      },
      { command: "game.step", args: { dt: 0.05, steps: 1, now: 2000000106501 } },

      { command: "game.step", args: { dt: 0.05, steps: 30, now: 2000000106551 } },
      {
        command: "service.call",
        args: {
          service: "match-api",
          method: "handleInput",
          arguments: ["engine-parachute-45", { parachutePressed: true }, 2000000108051]
        }
      },
      { command: "game.step", args: { dt: 0.05, steps: 36, now: 2000000108101 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-45" } },
      { command: "game.step", args: { dt: 0.05, steps: 80, now: 2000000109901 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-45" } },
      { command: "game.step", args: { dt: 0.05, steps: 40, now: 2000000113901 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-45" } },
      { command: "game.step", args: { dt: 0.05, steps: 160, now: 2000000115901 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-45" } },

      {
        command: "service.call",
        args: { service: "match-api", method: "handleInput", arguments: ["engine-parachute-45", {}, 2000000123901] }
      },
      {
        command: "service.call",
        args: {
          service: "parachute",
          method: "launch",
          arguments: ["engine-parachute-45", { "altitude": 92, "x": -200, "z": -200, "angle": 0 }, 2000000123951]
        }
      },
      { command: "game.step", args: { dt: 0.05, steps: 55, now: 2000000124001 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-45" } },
      { command: "game.step", args: { dt: 0.05, steps: 30, now: 2000000126751 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-45" } },
      { command: "game.step", args: { dt: 0.05, steps: 240, now: 2000000128251 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-45" } },

      {
        command: "service.call",
        args: {
          service: "parachute",
          method: "launch",
          arguments: ["engine-parachute-45", { "altitude": 8, "x": 180, "z": 180, "angle": 0 }, 2000000140251]
        }
      },
      {
        command: "service.call",
        args: { service: "match-api", method: "handleInput", arguments: ["engine-parachute-45", { parachutePressed: true }, 2000000140301] }
      },
      {
        command: "service.call",
        args: { service: "match-api", method: "handleInput", arguments: ["engine-parachute-45", { parachutePressed: true }, 2000000140351] }
      },
      { command: "game.step", args: { dt: 0.05, steps: 50, now: 2000000140401 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-45" } },

      {
        command: "service.call",
        args: {
          service: "parachute",
          method: "launch",
          arguments: ["engine-parachute-45", { "altitude": 60, "x": 200, "z": 200, "angle": 0 }, 2000000142901]
        }
      },
      {
        command: "service.call",
        args: { service: "match-api", method: "handleInput", arguments: ["engine-parachute-45", { parachutePressed: true }, 2000000142951] }
      },
      {
        command: "service.call",
        args: { service: "match-api", method: "handleInput", arguments: ["engine-parachute-45", { parachutePressed: true }, 2000000143001] }
      },
      { command: "game.step", args: { dt: 0.05, steps: 140, now: 2000000143051 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-45" } }
    ]
  },
  requestedAt: "2026-08-26T19:31:00Z"
});
