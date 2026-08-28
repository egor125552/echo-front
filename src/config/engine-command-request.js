const START = 2000011600000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 116,
  mode: "battle-royale",
  room: "engine-lab-active-ragdoll-116",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "entity.spawn", args: { spec: {
        id: "tumble-bot-116",
        kind: "human",
        name: "Tumble Bot",
        bot: true,
        team: 11601,
        health: 200,
        weapons: [],
        position: { x: 0, y: 0, z: 0, angle: 0 }
      } } },
      { command: "entity.spawn", args: { spec: {
        id: "witness-bot-116",
        kind: "human",
        name: "Witness Bot",
        bot: true,
        team: 11602,
        health: 200,
        weapons: [],
        position: { x: 300, y: 0, z: 300, angle: 0 }
      } } },
      { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [START] } },
      { command: "service.call", args: { service: "ragdoll", method: "activate", arguments: [
        "tumble-bot-116",
        { reason: "vehicle-eject", position: { x: 0, y: 1.2, z: 0 }, angle: 0, velocity: { x: 12, y: 18, z: 6 } },
        START + 10
      ] } },
      { command: "service.call", args: { service: "ragdoll", method: "stateFor", arguments: ["tumble-bot-116"] } },
      { command: "game.step", args: { dt: 0.05, steps: 40, now: START + 20 } },
      { command: "service.call", args: { service: "ragdoll", method: "stateFor", arguments: ["tumble-bot-116"] } },
      { command: "service.call", args: { service: "ragdoll-stability", method: "summary", arguments: [] } },
      { command: "game.step", args: { dt: 0.05, steps: 40 } },
      { command: "service.call", args: { service: "ragdoll", method: "stateFor", arguments: ["tumble-bot-116"] } },
      { command: "service.call", args: { service: "ragdoll-damage-model", method: "summary", arguments: [] } },
      { command: "service.call", args: { service: "ragdoll-stability", method: "summary", arguments: [] } },
      { command: "game.step", args: { dt: 0.05, steps: 40 } },
      { command: "service.call", args: { service: "ragdoll", method: "stateFor", arguments: ["tumble-bot-116"] } },
      { command: "service.call", args: { service: "ragdoll-damage-model", method: "summary", arguments: [] } },
      { command: "service.call", args: { service: "ragdoll-stability", method: "summary", arguments: [] } }
    ]
  },
  requestedAt: "2026-08-28T13:21:00Z"
});
