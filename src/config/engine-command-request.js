const START = 2000012800000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 128,
  mode: "battle-royale",
  room: "engine-lab-adaptive-wall-ground-128",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [START] } },
      { command: "entity.spawn", args: { spec: {
        id: "ground-wall-test-128",
        kind: "human",
        name: "Ground Wall Test",
        bot: false,
        team: 12801,
        health: 400,
        weapons: [],
        position: { x: 43.2, y: 0, z: 0, angle: 0 }
      } } },
      { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["ground-wall-test-128", { x: 43.2, y: 0, z: 0, angle: 0 }] } },
      { command: "game.step", args: { dt: 0.02, steps: 1, now: START + 20 } },
      { command: "service.call", args: { service: "movement", method: "setInput", arguments: ["ground-wall-test-128", { strafe: 1, sprint: true }] } },
      { command: "game.step", args: { dt: 0.02, steps: 25, now: START + 40 } },
      { command: "service.call", args: { service: "parkour-ragdoll", method: "summary", arguments: [] } },
      { command: "service.call", args: { service: "ragdoll", method: "stateFor", arguments: ["ground-wall-test-128"] } }
    ]
  },
  requestedAt: "2026-08-28T16:35:00Z"
});
