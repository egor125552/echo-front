export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 51,
  mode: "battle-royale",
  room: "engine-lab-parachute-51",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      {
        command: "entity.spawn",
        args: {
          spec: {
            id: "engine-parachute-51",
            kind: "human",
            name: "Upper Floor Physics Pilot",
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
        args: { service: "battle-royale", method: "arm", arguments: [2000000700000] }
      },
      {
        command: "service.call",
        args: {
          service: "parachute",
          method: "launch",
          arguments: ["engine-parachute-51", { "altitude": 20, "x": 60, "z": 0, "angle": 0 }, 2000000700050]
        }
      },
      {
        command: "service.call",
        args: {
          service: "match-api",
          method: "handleInput",
          arguments: ["engine-parachute-51", { parachutePressed: true, forward: 1 }, 2000000700100]
        }
      },
      { command: "game.step", args: { dt: 0.05, steps: 55, now: 2000000700150 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-51" } },
      { command: "game.step", args: { dt: 0.05, steps: 12, now: 2000000702900 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-51" } },
      { command: "game.step", args: { dt: 0.05, steps: 20, now: 2000000703500 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-51" } },
      {
        command: "service.call",
        args: {
          service: "parachute",
          method: "launch",
          arguments: ["engine-parachute-51", { "altitude": 20, "x": 59.15, "z": -4, "angle": 1.57079632679 }, 2000000704500]
        }
      },
      {
        command: "service.call",
        args: {
          service: "match-api",
          method: "handleInput",
          arguments: ["engine-parachute-51", { parachutePressed: true, forward: 1 }, 2000000704550]
        }
      },
      { command: "game.step", args: { dt: 0.05, steps: 8, now: 2000000704600 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-51" } },
      { command: "game.step", args: { dt: 0.05, steps: 8, now: 2000000705000 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-51" } },
      { command: "game.step", args: { dt: 0.05, steps: 20, now: 2000000705400 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-51" } },
      {
        command: "service.call",
        args: { service: "parachute", method: "stateFor", arguments: ["engine-parachute-51"] }
      }
    ]
  },
  requestedAt: "2026-08-26T20:10:00Z"
});
