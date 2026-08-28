const START = 2000012900000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 129,
  mode: "battle-royale",
  room: "engine-lab-adaptive-wall-air-129",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [START] } },
      { command: "entity.spawn", args: { spec: {
        id: "air-wall-test-129",
        kind: "human",
        name: "Air Wall Test",
        bot: false,
        team: 12901,
        health: 400,
        weapons: [],
        position: { x: 42.2, y: 0, z: 0, angle: 0 }
      } } },
      { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["air-wall-test-129", { x: 42.2, y: 0, z: 0, angle: 0 }] } },
      { command: "game.step", args: { dt: 0.02, steps: 1, now: START + 20 } },
      { command: "service.call", args: { service: "movement", method: "setInput", arguments: ["air-wall-test-129", { strafe: 1, sprint: true }] } },
      { command: "service.call", args: { service: "jump", method: "request", arguments: ["air-wall-test-129"] } },
      { command: "game.step", args: { dt: 0.02, steps: 30, now: START + 40 } },
      { command: "service.call", args: { service: "parkour-ragdoll", method: "summary", arguments: [] } },
      { command: "service.call", args: { service: "ragdoll", method: "stateFor", arguments: ["air-wall-test-129"] } },
      { command: "service.call", args: { service: "ragdoll-stability", method: "assertStable", arguments: [{ maxSpread: 8, maxSpeed: 100 }] } }
    ]
  },
  requestedAt: "2026-08-28T17:06:00Z"
});
