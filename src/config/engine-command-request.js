const START = 2000011500000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 115,
  mode: "battle-royale",
  room: "engine-lab-long-ragdoll-115",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "entity.spawn", args: { spec: {
        id: "tumble-human-115",
        kind: "human",
        name: "Tumble Human",
        bot: false,
        team: 11501,
        health: 200,
        weapons: [],
        position: { x: 0, y: 0, z: 0, angle: 0 }
      } } },
      { command: "service.call", args: { service: "ragdoll", method: "activate", arguments: [
        "tumble-human-115",
        { reason: "vehicle-eject", position: { x: 0, y: 1.2, z: 0 }, angle: 0, velocity: { x: 12, y: 18, z: 6 } },
        START + 10
      ] } },
      { command: "service.call", args: { service: "ragdoll", method: "stateFor", arguments: ["tumble-human-115"] } },
      { command: "game.step", args: { dt: 0.05, steps: 40, now: START + 20 } },
      { command: "service.call", args: { service: "ragdoll", method: "stateFor", arguments: ["tumble-human-115"] } },
      { command: "entity.inspect", args: { entityId: "tumble-human-115" } },
      { command: "game.step", args: { dt: 0.05, steps: 40 } },
      { command: "service.call", args: { service: "ragdoll", method: "stateFor", arguments: ["tumble-human-115"] } },
      { command: "entity.inspect", args: { entityId: "tumble-human-115" } },
      { command: "service.call", args: { service: "ragdoll-damage-model", method: "summary", arguments: [] } },
      { command: "service.call", args: { service: "ragdoll-stability", method: "summary", arguments: [] } },
      { command: "game.step", args: { dt: 0.05, steps: 40 } },
      { command: "service.call", args: { service: "ragdoll", method: "stateFor", arguments: ["tumble-human-115"] } },
      { command: "entity.inspect", args: { entityId: "tumble-human-115" } },
      { command: "service.call", args: { service: "ragdoll-damage-model", method: "summary", arguments: [] } },
      { command: "service.call", args: { service: "ragdoll-stability", method: "summary", arguments: [] } }
    ]
  },
  requestedAt: "2026-08-28T13:17:00Z"
});
