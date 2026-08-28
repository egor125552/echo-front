const START = 2000013200000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 132,
  mode: "battle-royale",
  room: "engine-lab-adaptive-stair-air-132",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [START] } },
      { command: "entity.spawn", args: { spec: {
        id: "stair-air-test-132",
        kind: "human",
        name: "Stair Air Test",
        bot: false,
        team: 13201,
        health: 400,
        weapons: [],
        position: { x: 66.4, y: 3.2, z: 0, angle: 0 }
      } } },
      { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["stair-air-test-132", { x: 66.4, y: 3.2, z: 0, angle: 0 }] } },
      { command: "game.step", args: { dt: 0.02, steps: 1, now: START + 20 } },
      { command: "service.call", args: { service: "movement", method: "setInput", arguments: ["stair-air-test-132", { strafe: 1, sprint: true }] } },
      { command: "service.call", args: { service: "jump", method: "request", arguments: ["stair-air-test-132"] } },
      { command: "game.step", args: { dt: 0.02, steps: 70, now: START + 40 } },
      { command: "service.call", args: { service: "parkour-ragdoll", method: "summary", arguments: [] } },
      { command: "service.call", args: { service: "ragdoll", method: "stateFor", arguments: ["stair-air-test-132"] } },
      { command: "service.call", args: { service: "ragdoll-stability", method: "assertStable", arguments: [{ maxSpread: 8, maxSpeed: 100 }] } }
    ]
  },
  requestedAt: "2026-08-28T17:31:00Z"
});
