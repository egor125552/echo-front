const START = 2000012200000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 122,
  mode: "battle-royale",
  room: "engine-lab-parkour-jump-122",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [START] } },
      { command: "entity.spawn", args: { spec: {
        id: "parkour-test-122",
        kind: "human",
        name: "Parkour Test",
        bot: false,
        team: 12201,
        health: 400,
        weapons: [],
        position: { x: 300, y: 0, z: 300, angle: 0 }
      } } },
      { command: "service.call", args: { service: "physics", method: "position", arguments: ["parkour-test-122"] } },
      { command: "service.call", args: { service: "jump", method: "summary", arguments: ["parkour-test-122"] } },
      { command: "service.call", args: { service: "movement", method: "setInput", arguments: ["parkour-test-122", { forward: 1, strafe: -1, sprint: true }] } },
      { command: "service.call", args: { service: "jump", method: "request", arguments: ["parkour-test-122"] } },
      { command: "game.step", args: { dt: 0.02, steps: 1, now: START + 20 } },
      { command: "service.call", args: { service: "physics", method: "position", arguments: ["parkour-test-122"] } },
      { command: "service.call", args: { service: "jump", method: "summary", arguments: ["parkour-test-122"] } },
      { command: "game.step", args: { dt: 0.02, steps: 1, now: START + 40 } },
      { command: "service.call", args: { service: "jump", method: "summary", arguments: ["parkour-test-122"] } },
      { command: "service.call", args: { service: "parkour-ragdoll", method: "summary", arguments: [] } }
    ]
  },
  requestedAt: "2026-08-28T15:54:00Z"
});
