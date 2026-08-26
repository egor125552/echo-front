export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 48,
  mode: "battle-royale",
  room: "engine-lab-parachute-48",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      {
        command: "entity.spawn",
        args: {
          spec: {
            id: "engine-parachute-48",
            kind: "human",
            name: "Air Door Pilot",
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
        args: { service: "battle-royale", method: "arm", arguments: [2000000400000] }
      },
      {
        command: "service.call",
        args: {
          service: "parachute",
          method: "launch",
          arguments: ["engine-parachute-48", { "altitude": 20, "x": 83.5, "z": 0, "angle": -1.57079632679 }, 2000000400050]
        }
      },
      {
        command: "service.call",
        args: {
          service: "match-api",
          method: "handleInput",
          arguments: ["engine-parachute-48", { parachutePressed: true, forward: 1 }, 2000000400100]
        }
      },
      { command: "game.step", args: { dt: 0.05, steps: 50, now: 2000000400150 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-48" } },
      { command: "game.step", args: { dt: 0.05, steps: 8, now: 2000000402650 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-48" } },
      { command: "game.step", args: { dt: 0.05, steps: 6, now: 2000000403050 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-48" } },
      {
        command: "service.call",
        args: {
          service: "match-api",
          method: "handleInput",
          arguments: ["engine-parachute-48", { forward: 1, interactPressed: true }, 2000000403350]
        }
      },
      { command: "game.step", args: { dt: 0.05, steps: 1, now: 2000000403400 } },
      {
        command: "service.call",
        args: {
          service: "match-api",
          method: "handleInput",
          arguments: ["engine-parachute-48", { forward: 1 }, 2000000403450]
        }
      },
      { command: "game.step", args: { dt: 0.05, steps: 8, now: 2000000403500 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-48" } },
      { command: "game.step", args: { dt: 0.05, steps: 8, now: 2000000403900 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-48" } },
      {
        command: "service.call",
        args: { service: "parachute", method: "stateFor", arguments: ["engine-parachute-48"] }
      }
    ]
  },
  requestedAt: "2026-08-26T19:55:00Z"
});
