export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 49,
  mode: "battle-royale",
  room: "engine-lab-parachute-49",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      {
        command: "entity.spawn",
        args: {
          spec: {
            id: "engine-parachute-49",
            kind: "human",
            name: "Upper Floor Pilot",
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
        args: { service: "battle-royale", method: "arm", arguments: [2000000500000] }
      },
      {
        command: "service.call",
        args: {
          service: "parachute",
          method: "launch",
          arguments: ["engine-parachute-49", { "altitude": 20, "x": 60, "z": 0, "angle": 0 }, 2000000500050]
        }
      },
      {
        command: "service.call",
        args: {
          service: "match-api",
          method: "handleInput",
          arguments: ["engine-parachute-49", { parachutePressed: true, forward: -1 }, 2000000500100]
        }
      },
      { command: "game.step", args: { dt: 0.05, steps: 60, now: 2000000500150 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-49" } },
      { command: "game.step", args: { dt: 0.05, steps: 40, now: 2000000503150 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-49" } },
      {
        command: "service.call",
        args: { service: "parachute", method: "stateFor", arguments: ["engine-parachute-49"] }
      },
      {
        command: "service.call",
        args: { service: "battle-royale", method: "status", arguments: [2000000505150] }
      }
    ]
  },
  requestedAt: "2026-08-26T20:00:00Z"
});
