const START = 2000011700000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 117,
  mode: "battle-royale",
  room: "engine-lab-world-wall-117",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "entity.spawn", args: { spec: {
        id: "edge-bot-117",
        kind: "human",
        name: "Edge Bot",
        bot: true,
        team: 11701,
        health: 400,
        weapons: [],
        position: { x: 992, y: 0, z: 0, angle: 0 }
      } } },
      { command: "entity.spawn", args: { spec: {
        id: "witness-bot-117",
        kind: "human",
        name: "Witness Bot",
        bot: true,
        team: 11702,
        health: 400,
        weapons: [],
        position: { x: 300, y: 0, z: 300, angle: 0 }
      } } },
      { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [START] } },
      { command: "service.call", args: { service: "world-expansion", method: "summary", arguments: [] } },
      { command: "service.call", args: { service: "ragdoll", method: "activate", arguments: [
        "edge-bot-117",
        { reason: "vehicle-eject", position: { x: 992, y: 1.2, z: 0 }, angle: 0, velocity: { x: 55, y: 30, z: 0 } },
        START + 10
      ] } },
      { command: "game.step", args: { dt: 0.02, steps: 100, now: START + 20 } },
      { command: "service.call", args: { service: "ragdoll", method: "stateFor", arguments: ["edge-bot-117"] } },
      { command: "service.call", args: { service: "ragdoll-stability", method: "summary", arguments: [] } },
      { command: "service.call", args: { service: "ragdoll-damage-model", method: "summary", arguments: [] } },
      { command: "entity.inspect", args: { entityId: "edge-bot-117" } }
    ]
  },
  requestedAt: "2026-08-28T13:25:00Z"
});
