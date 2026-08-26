export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 57,
  mode: "battle-royale",
  room: "engine-lab-parachute-57",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      {
        command: "entity.spawn",
        args: {
          spec: {
            id: "engine-parachute-57",
            kind: "human",
            name: "Warehouse Landing Pilot",
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
            id: "engine-parachute-sentinel-57",
            kind: "human",
            name: "Deployment Sentinel",
            bot: false,
            team: 999998,
            health: 200,
            weapons: ["pistol"],
            position: { x: -200, y: 0, z: -200, angle: 0 }
          }
        }
      },
      {
        command: "service.call",
        args: { service: "battle-royale", method: "arm", arguments: [2000001300000] }
      },
      {
        command: "service.call",
        args: {
          service: "parachute",
          method: "launch",
          arguments: ["engine-parachute-sentinel-57", { altitude: 1000, x: -200, z: -200, angle: 0 }, 2000001300010]
        }
      },

      {
        command: "service.call",
        args: {
          service: "parachute",
          method: "launch",
          arguments: ["engine-parachute-57", { altitude: 30, x: 67, z: 0, angle: 0 }, 2000001300100]
        }
      },
      {
        command: "service.call",
        args: {
          service: "match-api",
          method: "handleInput",
          arguments: ["engine-parachute-57", { parachutePressed: true, forward: -1 }, 2000001300150]
        }
      },
      { command: "game.step", args: { dt: 0.05, steps: 120, now: 2000001300200 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-57" } },
      {
        command: "service.call",
        args: { service: "parachute", method: "stateFor", arguments: ["engine-parachute-57"] }
      },
      {
        command: "service.call",
        args: { service: "parachute", method: "toggle", arguments: ["engine-parachute-57", 2000001306250] }
      },
      {
        command: "service.call",
        args: { service: "parachute", method: "stateFor", arguments: ["engine-parachute-57"] }
      },

      {
        command: "service.call",
        args: { service: "map", method: "setDoorOpen", arguments: ["warehouse-front-door", true, "engine-parachute-57", 2000001306300] }
      },
      {
        command: "service.call",
        args: {
          service: "parachute",
          method: "launch",
          arguments: ["engine-parachute-57", { altitude: 45, x: 120, z: 0, angle: -1.5707963267948966 }, 2000001306400]
        }
      },
      {
        command: "service.call",
        args: {
          service: "match-api",
          method: "handleInput",
          arguments: ["engine-parachute-57", { parachutePressed: true, forward: 1 }, 2000001306450]
        }
      },
      { command: "game.step", args: { dt: 0.05, steps: 120, now: 2000001306500 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-57" } },
      { command: "game.step", args: { dt: 0.05, steps: 40, now: 2000001312500 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-57" } },
      { command: "game.step", args: { dt: 0.05, steps: 40, now: 2000001314500 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-57" } },
      {
        command: "service.call",
        args: { service: "parachute", method: "stateFor", arguments: ["engine-parachute-57"] }
      },
      {
        command: "service.call",
        args: { service: "battle-royale", method: "status", arguments: [2000001316550] }
      }
    ]
  },
  requestedAt: "2026-08-26T20:12:00Z"
});