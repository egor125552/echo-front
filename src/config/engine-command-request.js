export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 27,
  mode: "battle-royale",
  room: "engine-lab-hidden-shot-27",
  command: "engine.batch",
  args: {
    commands: [
      { command: "service.call", args: { service: "match-api", method: "connectHuman", arguments: ["engine-decoy-27"] } },
      { command: "component.patch", args: { entityId: "br-bot-2", component: "Health", patch: { current: 10000, maximum: 10000 } } },
      { command: "component.patch", args: { entityId: "engine-decoy-27", component: "Health", patch: { current: 10000, maximum: 10000 } } },
      { command: "game.step", args: { dt: 0.05, steps: 140, now: 2000000700000 } },
      { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["br-bot-2", { x: 82, y: 0, z: 6, angle: -1.5707963267948966 }] } },
      { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["engine-decoy-27", { x: 66, y: 0, z: 6, angle: 0 }] } },
      { command: "event.emit", args: { event: "entity:respawned", payload: { entityId: "br-bot-2" } } },
      { command: "game.step", args: { dt: 0.05, steps: 2 } },
      { command: "event.emit", args: { event: "sound:spatial", payload: { entityId: "engine-decoy-27", key: "weapon.pistol", radius: 110, x: 66, y: 0, z: 6, now: 2000000707100 } } },
      { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["engine-decoy-27", { x: -300, y: 0, z: -300, angle: 0 }] } },
      { command: "game.step", args: { dt: 0.05, steps: 4 } },
      { command: "service.call", args: { service: "bot-interest", method: "heardFor", arguments: ["br-bot-2"] } },
      { command: "service.call", args: { service: "bot-brain", method: "stateFor", arguments: ["br-bot-2"] } },
      { command: "component.get", args: { entityId: "br-bot-2", component: "Transform" } },
      { command: "game.step", args: { dt: 0.05, steps: 120 } },
      { command: "service.call", args: { service: "bot-brain", method: "stateFor", arguments: ["br-bot-2"] } },
      { command: "component.get", args: { entityId: "br-bot-2", component: "Transform" } },
      { command: "component.get", args: { entityId: "br-bot-2", component: "Input" } },
      { command: "game.step", args: { dt: 0.05, steps: 160 } },
      { command: "service.call", args: { service: "bot-brain", method: "stateFor", arguments: ["br-bot-2"] } },
      { command: "component.get", args: { entityId: "br-bot-2", component: "Transform" } },
      { command: "component.get", args: { entityId: "br-bot-2", component: "Input" } },
      { command: "game.step", args: { dt: 0.05, steps: 200 } },
      { command: "service.call", args: { service: "bot-brain", method: "stateFor", arguments: ["br-bot-2"] } },
      { command: "component.get", args: { entityId: "br-bot-2", component: "Transform" } },
      { command: "component.get", args: { entityId: "br-bot-2", component: "Input" } }
    ]
  },
  requestedAt: "2026-08-26T10:45:00Z"
});