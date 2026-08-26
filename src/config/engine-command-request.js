export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 13,
  mode: "battle-royale",
  room: "engine-lab-warehouse-exam-13",
  command: "engine.batch",
  args: {
    commands: [
      { command: "service.call", args: { service: "match-api", method: "connectHuman", arguments: ["engine-search-source-13"] } },
      { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["br-bot-2", { x: 80, y: 0, z: 0, angle: -1.5707963267948966 }] } },
      { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["engine-search-source-13", { x: 54, y: 3.2, z: 5, angle: 1.5707963267948966 }] } },
      { command: "component.patch", args: { entityId: "br-bot-2", component: "Health", patch: { current: 10000, maximum: 10000 } } },
      { command: "component.patch", args: { entityId: "engine-search-source-13", component: "Health", patch: { current: 10000, maximum: 10000 } } },
      { command: "game.step", args: { dt: 0.05, steps: 140 } },
      { command: "event.emit", args: { event: "sound:spatial", payload: { entityId: "engine-search-source-13", key: "weapon.pistol.fire", radius: 110, x: 54, y: 3.2, z: 5 } } },
      { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["engine-search-source-13", { x: -300, y: 0, z: -300, angle: 0 }] } },
      { command: "game.step", args: { dt: 0.05, steps: 40 } },
      { command: "service.call", args: { service: "bot-brain", method: "stateFor", arguments: ["br-bot-2"] } },
      { command: "component.get", args: { entityId: "br-bot-2", component: "Transform" } },
      { command: "component.get", args: { entityId: "br-bot-2", component: "Input" } },
      { command: "game.step", args: { dt: 0.05, steps: 60 } },
      { command: "service.call", args: { service: "bot-brain", method: "stateFor", arguments: ["br-bot-2"] } },
      { command: "component.get", args: { entityId: "br-bot-2", component: "Transform" } },
      { command: "component.get", args: { entityId: "br-bot-2", component: "Input" } },
      { command: "game.step", args: { dt: 0.05, steps: 80 } },
      { command: "service.call", args: { service: "bot-brain", method: "stateFor", arguments: ["br-bot-2"] } },
      { command: "component.get", args: { entityId: "br-bot-2", component: "Transform" } },
      { command: "component.get", args: { entityId: "br-bot-2", component: "Input" } },
      { command: "game.step", args: { dt: 0.05, steps: 100 } },
      { command: "service.call", args: { service: "bot-brain", method: "stateFor", arguments: ["br-bot-2"] } },
      { command: "component.get", args: { entityId: "br-bot-2", component: "Transform" } },
      { command: "component.get", args: { entityId: "br-bot-2", component: "Input" } },
      { command: "service.call", args: { service: "map", method: "locationAt", arguments: [{ x: 54, y: 3.2, z: 5 }] } }
    ]
  },
  requestedAt: "2026-08-26T08:58:00Z"
});