const START = 2000012400000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 124,
  mode: "battle-royale",
  room: "engine-lab-building-impact-124",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [START] } },
      { command: "entity.spawn", args: { spec: {
        id: "wall-test-124",
        kind: "human",
        name: "Wall Test",
        bot: false,
        team: 12401,
        health: 400,
        weapons: [],
        position: { x: 43.2, y: 0, z: 0, angle: 0 }
      } } },
      { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["wall-test-124", { x: 43.2, y: 0, z: 0, angle: 0 }] } },
      { command: "game.step", args: { dt: 0.02, steps: 1, now: START + 20 } },
      { command: "service.call", args: { service: "movement", method: "setInput", arguments: ["wall-test-124", { strafe: 1, sprint: true }] } },
      { command: "game.step", args: { dt: 0.02, steps: 20, now: START + 40 } },
      { command: "service.call", args: { service: "parkour-ragdoll", method: "summary", arguments: [] } },
      { command: "service.call", args: { service: "ragdoll", method: "stateFor", arguments: ["wall-test-124"] } },
      { command: "service.call", args: { service: "ragdoll-stability", method: "assertStable", arguments: [{ maxSpread: 8, maxSpeed: 100 }] } }
    ]
  },
  requestedAt: "2026-08-28T16:00:00Z"
});
