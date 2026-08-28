const START = 2000013000000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 130,
  mode: "battle-royale",
  room: "engine-lab-adaptive-stair-walk-130",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [START] } },
      { command: "entity.spawn", args: { spec: {
        id: "stair-walk-test-130",
        kind: "human",
        name: "Stair Walk Test",
        bot: false,
        team: 13001,
        health: 400,
        weapons: [],
        position: { x: 73.6, y: 0, z: 0, angle: 0 }
      } } },
      { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["stair-walk-test-130", { x: 73.6, y: 0, z: 0, angle: 0 }] } },
      { command: "game.step", args: { dt: 0.02, steps: 1, now: START + 20 } },
      { command: "service.call", args: { service: "movement", method: "setInput", arguments: ["stair-walk-test-130", { strafe: -1, sprint: true }] } },
      { command: "game.step", args: { dt: 0.02, steps: 70, now: START + 40 } },
      { command: "service.call", args: { service: "parkour-ragdoll", method: "summary", arguments: [] } },
      { command: "service.call", args: { service: "ragdoll", method: "stateFor", arguments: ["stair-walk-test-130"] } },
      { command: "entity.get", args: { entityId: "stair-walk-test-130" } }
    ]
  },
  requestedAt: "2026-08-28T17:18:00Z"
});
