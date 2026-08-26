export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 31,
  mode: "battle-royale",
  room: "engine-lab-return-fire-31",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "service.call", args: { service: "match-api", method: "connectHuman", arguments: ["engine-provoker-31"] } },
      { command: "game.step", args: { dt: 0.05, steps: 140 } },
      { command: "service.call", args: { service: "physics", method: "teleport", arguments: ["engine-provoker-31", { x: 300, y: 0, z: 300 }] } },
      { command: "component.patch", args: { entityId: "engine-provoker-31", component: "Transform", patch: { x: 300, y: 0, z: 300, angle: 3.141592653589793 } } },
      { command: "service.call", args: { service: "physics", method: "teleport", arguments: ["br-bot-2", { x: 300, y: 0, z: 312 }] } },
      { command: "component.patch", args: { entityId: "br-bot-2", component: "Transform", patch: { x: 300, y: 0, z: 312, angle: 0 } } },
      { command: "game.step", args: { dt: 0.05, steps: 1 } },
      { command: "bot.inspect", args: { entityId: "br-bot-2" } },
      { command: "event.emit", args: { event: "combat:damage", payload: { targetId: "br-bot-2", attackerId: "engine-provoker-31", weaponId: "pistol", healthApplied: 10, armorAbsorbed: 0, killed: false } } },
      { command: "bot.inspect", args: { entityId: "br-bot-2" } },
      { command: "game.step", args: { dt: 0.05, steps: 5 } },
      { command: "bot.inspect", args: { entityId: "br-bot-2" } },
      { command: "game.step", args: { dt: 0.05, steps: 20 } },
      { command: "bot.inspect", args: { entityId: "br-bot-2" } },
      { command: "service.call", args: { service: "br-observer", method: "snapshot", arguments: [{ resetInterval: true, sampleLimit: 64 }] } }
    ]
  },
  requestedAt: "2026-08-26T13:20:00Z"
});