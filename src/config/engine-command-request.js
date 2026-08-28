const START = 2000013400000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 134,
  mode: "battle-royale",
  room: "engine-lab-parkour-stairs-134",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [START] } },
      { command: "entity.spawn", args: { spec: {
        id: "parkour-stair-test-134",
        kind: "human",
        name: "Parkour Stair Retest",
        bot: false,
        team: 13401,
        health: 400,
        weapons: [],
        position: { x: 66.4, y: 3.2, z: 0, angle: 0 }
      } } },
      { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["parkour-stair-test-134", { x: 66.4, y: 3.2, z: 0, angle: 0 }] } },
      { command: "game.step", args: { dt: 0.02, steps: 1, now: START + 20 } },
      { command: "service.call", args: { service: "movement", method: "setInput", arguments: ["parkour-stair-test-134", { strafe: 1, sprint: true }] } },
      { command: "service.call", args: { service: "jump", method: "request", arguments: ["parkour-stair-test-134"] } },
      { command: "game.step", args: { dt: 0.02, steps: 5, now: START + 40 } },
      { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["parkour-stair-test-134", { strafe: 1, sprint: true, posePressed: true }, START + 140] } },
      { command: "game.step", args: { dt: 0.02, steps: 80, now: START + 160 } },
      { command: "service.call", args: { service: "parkour-ragdoll", method: "summary", arguments: [] } },
      { command: "service.call", args: { service: "ragdoll", method: "stateFor", arguments: ["parkour-stair-test-134"] } },
      { command: "service.call", args: { service: "ragdoll-stability", method: "assertStable", arguments: [{ maxSpread: 8, maxSpeed: 100 }] } }
    ]
  },
  requestedAt: "2026-08-28T17:48:00Z"
});
