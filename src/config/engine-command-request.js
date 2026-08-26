export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 33,
  mode: "battle-royale",
  room: "engine-lab-warehouse-search-33",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "service.call", args: { service: "match-api", method: "connectHuman", arguments: ["engine-provoker-33"] } },
      { command: "game.step", args: { dt: 0.05, steps: 140 } },
      { command: "service.call", args: { service: "physics", method: "teleport", arguments: ["engine-provoker-33", { x: 60, y: 0, z: 0 }] } },
      { command: "component.patch", args: { entityId: "engine-provoker-33", component: "Transform", patch: { x: 60, y: 0, z: 0, angle: 1.5707963267948966 } } },
      { command: "service.call", args: { service: "physics", method: "teleport", arguments: ["br-bot-2", { x: 82, y: 0, z: 0 }] } },
      { command: "component.patch", args: { entityId: "br-bot-2", component: "Transform", patch: { x: 82, y: 0, z: 0, angle: -1.5707963267948966 } } },
      { command: "service.call", args: { service: "map", method: "setDoorOpen", arguments: ["warehouse-front-door", false, null] } },
      { command: "game.step", args: { dt: 0.05, steps: 1 } },
      { command: "event.emit", args: { event: "sound:spatial", payload: { entityId: "engine-provoker-33", key: "weapon.pistol", x: 60, y: 0, z: 0, radius: 110 } } },
      { command: "bot.inspect", args: { entityId: "br-bot-2" } },
      { command: "game.step", args: { dt: 0.05, steps: 40 } },
      { command: "bot.inspect", args: { entityId: "br-bot-2" } },
      { command: "game.step", args: { dt: 0.05, steps: 100 } },
      { command: "bot.inspect", args: { entityId: "br-bot-2" } },
      { command: "game.step", args: { dt: 0.05, steps: 100 } },
      { command: "bot.inspect", args: { entityId: "br-bot-2" } },
      { command: "game.step", args: { dt: 0.05, steps: 160 } },
      { command: "bot.inspect", args: { entityId: "br-bot-2" } },
      { command: "service.call", args: { service: "br-observer", method: "snapshot", arguments: [{ resetInterval: true, sampleLimit: 64 }] } }
    ]
  },
  requestedAt: "2026-08-26T13:33:00Z"
});