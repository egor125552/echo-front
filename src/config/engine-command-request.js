const START = 2000012100000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 121,
  mode: "battle-royale",
  room: "engine-lab-parkour-pose-121",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "service.call", args: {
        service: "battle-royale",
        method: "arm",
        arguments: [START]
      } },
      { command: "entity.spawn", args: { spec: {
        id: "parkour-test-121",
        kind: "human",
        name: "Parkour Test",
        bot: false,
        team: 12101,
        health: 400,
        weapons: [],
        position: { x: 300, y: 0, z: 300, angle: 0 }
      } } },
      { command: "service.call", args: {
        service: "movement",
        method: "setInput",
        arguments: ["parkour-test-121", { forward: 1, strafe: -1, sprint: true }]
      } },
      { command: "service.call", args: {
        service: "jump",
        method: "request",
        arguments: ["parkour-test-121"]
      } },
      { command: "game.step", args: { dt: 0.02, steps: 2, now: START + 20 } },
      { command: "service.call", args: {
        service: "jump",
        method: "assertState",
        arguments: ["parkour-test-121", { active: true, minY: 0.05 }]
      } },
      { command: "service.call", args: {
        service: "parkour-ragdoll",
        method: "enterPose",
        arguments: ["parkour-test-121", { forward: 1, strafe: -1, sprint: true }, START + 70]
      } },
      { command: "game.step", args: { dt: 0.02, steps: 10, now: START + 80 } },
      { command: "service.call", args: {
        service: "parkour-ragdoll",
        method: "summary",
        arguments: []
      } },
      { command: "service.call", args: {
        service: "ragdoll",
        method: "stateFor",
        arguments: ["parkour-test-121"]
      } },
      { command: "service.call", args: {
        service: "ragdoll-stability",
        method: "assertStable",
        arguments: [{ maxSpread: 8, maxSpeed: 100 }]
      } }
    ]
  },
  requestedAt: "2026-08-28T15:40:00Z"
});
