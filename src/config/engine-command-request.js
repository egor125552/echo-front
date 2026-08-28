const START = 2000012300000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 123,
  mode: "battle-royale",
  room: "engine-lab-parkour-pose-123",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [START] } },
      { command: "entity.spawn", args: { spec: {
        id: "parkour-test-123",
        kind: "human",
        name: "Parkour Test",
        bot: false,
        team: 12301,
        health: 400,
        weapons: [],
        position: { x: 300, y: 0, z: 300, angle: 0 }
      } } },
      { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["parkour-test-123", { x: 300, y: 0, z: 300, angle: 0 }] } },
      { command: "game.step", args: { dt: 0.02, steps: 1, now: START + 20 } },
      { command: "service.call", args: { service: "parachute", method: "stateFor", arguments: ["parkour-test-123"] } },
      { command: "service.call", args: { service: "movement", method: "setInput", arguments: ["parkour-test-123", { forward: 1, strafe: -1, sprint: true }] } },
      { command: "service.call", args: { service: "jump", method: "request", arguments: ["parkour-test-123"] } },
      { command: "game.step", args: { dt: 0.02, steps: 2, now: START + 40 } },
      { command: "service.call", args: { service: "jump", method: "assertState", arguments: ["parkour-test-123", { active: true, minY: 0.05 }] } },
      { command: "service.call", args: { service: "parkour-ragdoll", method: "enterPose", arguments: ["parkour-test-123", { forward: 1, strafe: -1, sprint: true }, START + 90] } },
      { command: "game.step", args: { dt: 0.02, steps: 10, now: START + 100 } },
      { command: "service.call", args: { service: "parkour-ragdoll", method: "summary", arguments: [] } },
      { command: "service.call", args: { service: "ragdoll", method: "stateFor", arguments: ["parkour-test-123"] } },
      { command: "service.call", args: { service: "ragdoll-stability", method: "assertStable", arguments: [{ maxSpread: 8, maxSpeed: 100 }] } }
    ]
  },
  requestedAt: "2026-08-28T15:57:00Z"
});
