export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 42,
  mode: "battle-royale",
  room: "engine-lab-parachute-42",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      {
        command: "entity.spawn",
        args: {
          spec: {
            id: "engine-parachute-42",
            kind: "human",
            name: "Parachute Pilot",
            bot: false,
            team: 999999,
            health: 100000,
            weapons: ["pistol"],
            position: { x: 250, y: 0, z: -250, angle: 0 }
          }
        }
      },
      {
        command: "service.call",
        args: {
          service: "battle-royale",
          method: "arm",
          arguments: [2000000000000]
        }
      },
      { command: "game.step", args: { dt: 0.05, steps: 1, now: 2000000006501 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-42" } },
      { command: "game.step", args: { dt: 0.05, steps: 60 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-42" } },
      {
        command: "service.call",
        args: {
          service: "match-api",
          method: "handleInput",
          arguments: ["engine-parachute-42", { parachutePressed: true, forward: 1 }, 2000000009600]
        }
      },
      { command: "game.step", args: { dt: 0.05, steps: 40 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-42" } },
      {
        command: "service.call",
        args: {
          service: "match-api",
          method: "handleInput",
          arguments: ["engine-parachute-42", { forward: 1, strafe: 1 }, 2000000011600]
        }
      },
      { command: "game.step", args: { dt: 0.05, steps: 20 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-42" } },
      {
        command: "service.call",
        args: {
          service: "match-api",
          method: "handleInput",
          arguments: ["engine-parachute-42", { parachutePressed: true, forward: 1 }, 2000000012600]
        }
      },
      { command: "game.step", args: { dt: 0.05, steps: 10 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-42" } },
      {
        command: "service.call",
        args: {
          service: "match-api",
          method: "handleInput",
          arguments: ["engine-parachute-42", { parachutePressed: true, forward: 1 }, 2000000013150]
        }
      },
      { command: "game.step", args: { dt: 0.05, steps: 40 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-42" } },
      {
        command: "service.call",
        args: {
          service: "match-api",
          method: "handleInput",
          arguments: ["engine-parachute-42", {}, 2000000015100]
        }
      },
      { command: "game.step", args: { dt: 0.05, steps: 100 } },
      { command: "entity.inspect", args: { entityId: "engine-parachute-42" } },
      {
        command: "service.call",
        args: {
          service: "parachute",
          method: "stateFor",
          arguments: ["engine-parachute-42"]
        }
      }
    ]
  },
  requestedAt: "2026-08-26T19:16:00Z"
});
