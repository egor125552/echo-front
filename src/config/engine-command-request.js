export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 35,
  mode: "battle-royale",
  room: "engine-lab-decoy-search-35",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "service.call", args: { service: "match-api", method: "connectHuman", arguments: ["engine-provoker-35"] } },
      { command: "game.step", args: { dt: 0.05, steps: 140 } },
      { command: "service.call", args: { service: "physics", method: "teleport", arguments: ["engine-provoker-35", { x: 60, y: 0, z: 0 }] } },
      { command: "component.patch", args: { entityId: "engine-provoker-35", component: "Transform", patch: { x: 60, y: 0, z: 0, angle: 1.5707963267948966 } } },
      { command: "service.call", args: { service: "physics", method: "teleport", arguments: ["br-bot-2", { x: 82, y: 0, z: 0 }] } },
      { command: "component.patch", args: { entityId: "br-bot-2", component: "Transform", patch: { x: 82, y: 0, z: 0, angle: -1.5707963267948966 } } },
      { command: "service.call", args: { service: "physics", method: "teleport", arguments: ["br-bot-3", { x: 94, y: 0, z: 8 }] } },
      { command: "component.patch", args: { entityId: "br-bot-3", component: "Transform", patch: { x: 94, y: 0, z: 8, angle: -1.5707963267948966 } } },
      { command: "service.call", args: { service: "map", method: "setDoorOpen", arguments: ["warehouse-front-door", false, null] } },
      { command: "game.step", args: { dt: 0.05, steps: 1 } },
      { command: "event.emit", args: { event: "sound:spatial", payload: { entityId: "engine-provoker-35", key: "weapon.pistol", x: 60, y: 0, z: 0, radius: 110 } } },
      { command: "game.step", args: { dt: 0.05, steps: 30 } },
      { command: "bot.inspect", args: { entityId: "br-bot-2" } },
      { command: "event.emit", args: { event: "sound:spatial", payload: { entityId: "br-bot-3", key: "weapon.pistol", x: 94, y: 0, z: 8, radius: 110 } } },
      { command: "game.step", args: { dt: 0.05, steps: 20 } },
      { command: "bot.inspect", args: { entityId: "br-bot-2" } },
      { command: "event.emit", args: { event: "sound:spatial", payload: { entityId: "br-bot-3", key: "weapon.rifle", x: 93, y: 0, z: 9, radius: 110 } } },
      { command: "game.step", args: { dt: 0.05, steps: 80 } },
      { command: "bot.inspect", args: { entityId: "br-bot-2" } },
      { command: "game.step", args: { dt: 0.05, steps: 120 } },
      { command: "bot.inspect", args: { entityId: "br-bot-2" } },
      { command: "game.step", args: { dt: 0.05, steps: 120 } },
      { command: "bot.inspect", args: { entityId: "br-bot-2" } },
      { command: "service.call", args: { service: "br-observer", method: "snapshot", arguments: [{ resetInterval: true, sampleLimit: 64 }] } }
    ]
  },
  requestedAt: "2026-08-26T13:45:00Z"
});
