export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 44,
  mode: "battle-royale",
  room: "engine-lab-parachute-44",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      {
        command: "entity.spawn",
        args: {
          spec: {
            id: "engine-parachute-44",
            kind: "human",
            name: "Parachute Physics Pilot",
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
        args: { service: "battle-royale", method: "arm", arguments: [2000000000000] }
      },
      { command: "game.step", args: { dt: 0.05, steps: 1, now: 2000000006501 } },

      { command: "game.step", args: { dt: 0.05, steps: 30, now: 2000000006551 } },
      {
        command: "service.call",
        args: {
          service: "match-api",
          method: "handleInput",
          arguments: ["engine-parachute-44", { parachutePressed: true, forward: 1 }, 2000000008051]
        }
      },
      { command: "game.step", args: { dt: 0.05, steps: 36, now: 2000000008101 } },
      {
        command: "service.call",
        args: {
          service: "match-api",
          method: "handleInput",
          arguments: ["engine-parachute-44", { forward: 1, strafe: 1 }, 2000000009901]
        }
      },
      { command: "game.step", args: { dt: 0.05, steps: 40, now: 2000000009951 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-44" } },
      {
        command: "service.call",
        args: {
          service: "match-api",
          method: "handleInput",
          arguments: ["engine-parachute-44", {}, 2000000011951]
        }
      },
      { command: "game.step", args: { dt: 0.05, steps: 130, now: 2000000012001 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-44" } },
      { command: "game.step", args: { dt: 0.05, steps: 180, now: 2000000018501 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-44" } },
      {
        command: "service.call",
        args: { service: "parachute", method: "stateFor", arguments: ["engine-parachute-44"] }
      },

      {
        command: "service.call",
        args: {
          service: "parachute",
          method: "launch",
          arguments: ["engine-parachute-44", { "altitude": 35, "x": 56, "z": 0, "angle": 0 }, 2000000027501]
        }
      },
      {
        command: "service.call",
        args: {
          service: "match-api",
          method: "handleInput",
          arguments: ["engine-parachute-44", { parachutePressed: true, forward: -1 }, 2000000027551]
        }
      },
      { command: "game.step", args: { dt: 0.05, steps: 170, now: 2000000027601 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-44" } },
      {
        command: "service.call",
        args: { service: "parachute", method: "stateFor", arguments: ["engine-parachute-44"] }
      },

      {
        command: "service.call",
        args: { service: "match-api", method: "handleInput", arguments: ["engine-parachute-44", {}, 2000000036101] }
      },
      {
        command: "service.call",
        args: {
          service: "parachute",
          method: "launch",
          arguments: ["engine-parachute-44", { "altitude": 92, "x": -200, "z": -200, "angle": 0 }, 2000000036151]
        }
      },
      { command: "game.step", args: { dt: 0.05, steps: 75, now: 2000000036201 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-44" } },
      { command: "game.step", args: { dt: 0.05, steps: 240, now: 2000000039951 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-44" } },

      {
        command: "service.call",
        args: {
          service: "parachute",
          method: "launch",
          arguments: ["engine-parachute-44", { "altitude": 60, "x": 200, "z": 200, "angle": 0 }, 2000000051951]
        }
      },
      {
        command: "service.call",
        args: { service: "match-api", method: "handleInput", arguments: ["engine-parachute-44", { parachutePressed: true }, 2000000052001] }
      },
      {
        command: "service.call",
        args: { service: "match-api", method: "handleInput", arguments: ["engine-parachute-44", { parachutePressed: true }, 2000000052051] }
      },
      { command: "game.step", args: { dt: 0.05, steps: 140, now: 2000000052101 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-44" } },
      {
        command: "service.call",
        args: { service: "parachute", method: "stateFor", arguments: ["engine-parachute-44"] }
      }
    ]
  },
  requestedAt: "2026-08-26T19:28:00Z"
});
