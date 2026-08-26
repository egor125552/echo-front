export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 50,
  mode: "battle-royale",
  room: "engine-lab-parachute-50",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      {
        command: "entity.spawn",
        args: {
          spec: {
            id: "engine-parachute-50",
            kind: "human",
            name: "Upper Floor Flight Pilot",
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
        args: { service: "battle-royale", method: "arm", arguments: [2000000600000] }
      },
      {
        command: "service.call",
        args: {
          service: "parachute",
          method: "launch",
          arguments: ["engine-parachute-50", { "altitude": 20, "x": 60, "z": 0, "angle": 0 }, 2000000600050]
        }
      },
      {
        command: "service.call",
        args: {
          service: "match-api",
          method: "handleInput",
          arguments: ["engine-parachute-50", { parachutePressed: true, forward: 1 }, 2000000600100]
        }
      },
      { command: "game.step", args: { dt: 0.05, steps: 55, now: 2000000600150 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-50" } },
      { command: "game.step", args: { dt: 0.05, steps: 25, now: 2000000602900 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-50" } },
      { command: "game.step", args: { dt: 0.05, steps: 20, now: 2000000604150 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-50" } },
      {
        command: "service.call",
        args: {
          service: "parachute",
          method: "launch",
          arguments: ["engine-parachute-50", { "altitude": 15, "x": 55, "z": -4, "angle": 1.57079632679 }, 2000000605150]
        }
      },
      {
        command: "service.call",
        args: {
          service: "match-api",
          method: "handleInput",
          arguments: ["engine-parachute-50", { parachutePressed: true, forward: 1 }, 2000000605200]
        }
      },
      { command: "game.step", args: { dt: 0.05, steps: 30, now: 2000000605250 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-50" } },
      { command: "game.step", args: { dt: 0.05, steps: 18, now: 2000000606750 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-50" } },
      { command: "game.step", args: { dt: 0.05, steps: 18, now: 2000000607650 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-50" } },
      {
        command: "service.call",
        args: { service: "parachute", method: "stateFor", arguments: ["engine-parachute-50"] }
      }
    ]
  },
  requestedAt: "2026-08-26T20:05:00Z"
});
