export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 61,
  mode: "battle-royale",
  room: "engine-lab-parachute-61",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      {
        command: "entity.spawn",
        args: {
          spec: {
            id: "engine-parachute-61",
            kind: "human",
            name: "High Warehouse Pilot",
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
            id: "engine-parachute-sentinel-61",
            kind: "human",
            name: "Deployment Sentinel",
            bot: false,
            team: 999998,
            health: 200,
            weapons: ["pistol"],
            position: { x: -220, y: 0, z: -220, angle: 0 }
          }
        }
      },
      {
        command: "service.call",
        args: { service: "battle-royale", method: "arm", arguments: [2000001700000] }
      },
      {
        command: "service.call",
        args: {
          service: "parachute",
          method: "launch",
          arguments: ["engine-parachute-sentinel-61", { altitude: 1000, x: -220, z: -220, angle: 0 }, 2000001700010]
        }
      },
      {
        command: "service.call",
        args: {
          service: "parachute",
          method: "launch",
          arguments: ["engine-parachute-61", { altitude: 200, x: 45, z: 85, angle: 0 }, 2000001700100]
        }
      },
      {
        command: "service.call",
        args: { service: "parachute", method: "deploy", arguments: ["engine-parachute-61", 2000001700150] }
      },
      {
        command: "service.call",
        args: {
          service: "match-api",
          method: "handleInput",
          arguments: ["engine-parachute-61", { forward: 1 }, 2000001700200]
        }
      },
      { command: "game.step", args: { dt: 0.05, steps: 370, now: 2000001700250 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-61" } },
      {
        command: "service.call",
        args: { service: "parachute", method: "stateFor", arguments: ["engine-parachute-61"] }
      },
      {
        command: "service.call",
        args: {
          service: "match-api",
          method: "handleInput",
          arguments: ["engine-parachute-61", { forward: -0.3, strafe: 1 }, 2000001718800]
        }
      },
      { command: "game.step", args: { dt: 0.05, steps: 260, now: 2000001718850 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-61" } },
      {
        command: "service.call",
        args: { service: "parachute", method: "stateFor", arguments: ["engine-parachute-61"] }
      },
      { command: "game.step", args: { dt: 0.05, steps: 100, now: 2000001731850 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-61" } },
      {
        command: "service.call",
        args: { service: "parachute", method: "stateFor", arguments: ["engine-parachute-61"] }
      },
      { command: "game.step", args: { dt: 0.05, steps: 80, now: 2000001736850 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-61" } },
      {
        command: "service.call",
        args: { service: "parachute", method: "stateFor", arguments: ["engine-parachute-61"] }
      },
      {
        command: "service.call",
        args: { service: "battle-royale", method: "status", arguments: [2000001740900] }
      }
    ]
  },
  requestedAt: "2026-08-26T20:50:00Z"
});