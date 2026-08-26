export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 46,
  mode: "battle-royale",
  room: "engine-lab-parachute-46",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      {
        command: "entity.spawn",
        args: {
          spec: {
            id: "engine-parachute-46",
            kind: "human",
            name: "500m Warehouse Pilot",
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
        args: { service: "battle-royale", method: "arm", arguments: [2000000200000] }
      },
      { command: "game.step", args: { dt: 0.05, steps: 1, now: 2000000200050 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-46" } },
      { command: "game.step", args: { dt: 0.05, steps: 100, now: 2000000200100 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-46" } },
      {
        command: "service.call",
        args: {
          service: "match-api",
          method: "handleInput",
          arguments: ["engine-parachute-46", { parachutePressed: true, forward: 1 }, 2000000205100]
        }
      },
      { command: "game.step", args: { dt: 0.05, steps: 40, now: 2000000205150 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-46" } },
      {
        command: "service.call",
        args: {
          service: "match-api",
          method: "handleInput",
          arguments: ["engine-parachute-46", { forward: 1, strafe: 1 }, 2000000207150]
        }
      },
      { command: "game.step", args: { dt: 0.05, steps: 40, now: 2000000207200 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-46" } },
      {
        command: "service.call",
        args: { service: "match-api", method: "handleInput", arguments: ["engine-parachute-46", {}, 2000000209200] }
      },
      {
        command: "service.call",
        args: {
          service: "parachute",
          method: "launch",
          arguments: ["engine-parachute-46", { "altitude": 8, "x": 80, "z": 0, "angle": -1.57079632679 }, 2000000209250]
        }
      },
      {
        command: "service.call",
        args: {
          service: "match-api",
          method: "handleInput",
          arguments: ["engine-parachute-46", { parachutePressed: true, forward: 1 }, 2000000209300]
        }
      },
      { command: "game.step", args: { dt: 0.05, steps: 30, now: 2000000209350 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-46" } },
      { command: "game.step", args: { dt: 0.05, steps: 20, now: 2000000210850 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-46" } },
      {
        command: "service.call",
        args: {
          service: "match-api",
          method: "handleInput",
          arguments: ["engine-parachute-46", { forward: 1, interactPressed: true }, 2000000211850]
        }
      },
      { command: "game.step", args: { dt: 0.05, steps: 6, now: 2000000211900 } },
      {
        command: "service.call",
        args: {
          service: "match-api",
          method: "handleInput",
          arguments: ["engine-parachute-46", { forward: 1 }, 2000000212200]
        }
      },
      { command: "game.step", args: { dt: 0.05, steps: 20, now: 2000000212250 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-46" } },
      {
        command: "service.call",
        args: { service: "parachute", method: "stateFor", arguments: ["engine-parachute-46"] }
      },
      {
        command: "service.call",
        args: { service: "battle-royale", method: "status", arguments: [2000000213250] }
      }
    ]
  },
  requestedAt: "2026-08-26T19:45:00Z"
});
