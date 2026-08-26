export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 55,
  mode: "battle-royale",
  room: "engine-lab-parachute-55",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      {
        command: "entity.spawn",
        args: {
          spec: {
            id: "engine-parachute-55",
            kind: "human",
            name: "Doorway Canopy Pilot",
            bot: false,
            team: 999999,
            health: 200,
            weapons: ["pistol"],
            position: { x: 0, y: 0, z: 0, angle: 0 }
          }
        }
      },
      {
        command: "service.call",
        args: { service: "battle-royale", method: "arm", arguments: [2000001100000] }
      },
      {
        command: "service.call",
        args: { service: "map", method: "setDoorOpen", arguments: ["warehouse-front-door", true, "engine-parachute-55", 2000001100020] }
      },
      {
        command: "service.call",
        args: {
          service: "parachute",
          method: "launch",
          arguments: ["engine-parachute-55", { altitude: 20, x: 90, z: 0, angle: -1.5707963267948966 }, 2000001100100]
        }
      },
      {
        command: "service.call",
        args: { service: "parachute", method: "deploy", arguments: ["engine-parachute-55", 2000001100150] }
      },
      {
        command: "service.call",
        args: {
          service: "match-api",
          method: "handleInput",
          arguments: ["engine-parachute-55", { forward: 1 }, 2000001100200]
        }
      },
      { command: "game.step", args: { dt: 0.05, steps: 40, now: 2000001100250 } },
      {
        command: "service.call",
        args: {
          service: "movement",
          method: "teleport",
          arguments: ["engine-parachute-55", { x: 75.1, y: 2.2, z: 0, angle: -1.5707963267948966 }]
        }
      },
      {
        command: "service.call",
        args: { service: "parachute", method: "stateFor", arguments: ["engine-parachute-55"] }
      },
      {
        command: "service.call",
        args: {
          service: "physics",
          method: "raycastWorld",
          arguments: [{ x: 74.7, y: 2.25, z: 0 }, { x: 0, y: 1, z: 0 }, 3.6]
        }
      },
      { command: "game.step", args: { dt: 0.05, steps: 2, now: 2000001102300 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-55" } },
      {
        command: "service.call",
        args: { service: "parachute", method: "stateFor", arguments: ["engine-parachute-55"] }
      },
      { command: "game.step", args: { dt: 0.05, steps: 4, now: 2000001102400 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-55" } },
      {
        command: "service.call",
        args: { service: "parachute", method: "stateFor", arguments: ["engine-parachute-55"] }
      },
      { command: "game.step", args: { dt: 0.05, steps: 8, now: 2000001102600 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-55" } },
      {
        command: "service.call",
        args: { service: "parachute", method: "stateFor", arguments: ["engine-parachute-55"] }
      }
    ]
  },
  requestedAt: "2026-08-26T20:08:00Z"
});