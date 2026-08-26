export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 47,
  mode: "battle-royale",
  room: "engine-lab-parachute-47",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      {
        command: "entity.spawn",
        args: {
          spec: {
            id: "engine-parachute-47",
            kind: "human",
            name: "Warehouse Air Entry Pilot",
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
        args: { service: "battle-royale", method: "arm", arguments: [2000000300000] }
      },
      { command: "game.step", args: { dt: 0.05, steps: 1, now: 2000000300050 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-47" } },
      { command: "game.step", args: { dt: 0.05, steps: 100, now: 2000000300100 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-47" } },
      {
        command: "service.call",
        args: {
          service: "match-api",
          method: "handleInput",
          arguments: ["engine-parachute-47", { parachutePressed: true, forward: 1 }, 2000000305100]
        }
      },
      { command: "game.step", args: { dt: 0.05, steps: 50, now: 2000000305150 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-47" } },
      {
        command: "service.call",
        args: { service: "match-api", method: "handleInput", arguments: ["engine-parachute-47", {}, 2000000307650] }
      },
      {
        command: "service.call",
        args: {
          service: "parachute",
          method: "launch",
          arguments: ["engine-parachute-47", { "altitude": 20, "x": 87, "z": 0, "angle": -1.57079632679 }, 2000000307700]
        }
      },
      {
        command: "service.call",
        args: {
          service: "match-api",
          method: "handleInput",
          arguments: ["engine-parachute-47", { parachutePressed: true, forward: 1 }, 2000000307750]
        }
      },
      { command: "game.step", args: { dt: 0.05, steps: 50, now: 2000000307800 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-47" } },
      { command: "game.step", args: { dt: 0.05, steps: 20, now: 2000000310300 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-47" } },
      { command: "game.step", args: { dt: 0.05, steps: 12, now: 2000000311300 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-47" } },
      {
        command: "service.call",
        args: {
          service: "match-api",
          method: "handleInput",
          arguments: ["engine-parachute-47", { forward: 1, interactPressed: true }, 2000000311900]
        }
      },
      { command: "game.step", args: { dt: 0.05, steps: 2, now: 2000000311950 } },
      {
        command: "service.call",
        args: {
          service: "match-api",
          method: "handleInput",
          arguments: ["engine-parachute-47", { forward: 1 }, 2000000312050]
        }
      },
      { command: "game.step", args: { dt: 0.05, steps: 16, now: 2000000312100 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-47" } },
      {
        command: "service.call",
        args: { service: "parachute", method: "stateFor", arguments: ["engine-parachute-47"] }
      },
      {
        command: "service.call",
        args: { service: "battle-royale", method: "status", arguments: [2000000312900] }
      }
    ]
  },
  requestedAt: "2026-08-26T19:50:00Z"
});
