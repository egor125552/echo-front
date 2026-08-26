export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 23,
  mode: "battle-royale",
  room: "engine-lab-exploration-23",
  command: "engine.batch",
  args: {
    commands: [
      { command: "service.call", args: { service: "match-api", method: "connectHuman", arguments: ["engine-observer-23"] } },
      { command: "component.patch", args: { entityId: "br-bot-2", component: "Health", patch: { current: 10000, maximum: 10000 } } },
      { command: "component.patch", args: { entityId: "engine-observer-23", component: "Health", patch: { current: 10000, maximum: 10000 } } },
      { command: "game.step", args: { dt: 0.05, steps: 140, now: 2000000300000 } },
      { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["engine-observer-23", { x: -300, y: 0, z: -300, angle: 0 }] } },
      { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["br-bot-2", { x: 80, y: 0, z: 0, angle: -1.5707963267948966 }] } },
      { command: "game.step", args: { dt: 0.05, steps: 20 } },
      { command: "service.call", args: { service: "bot-brain", method: "stateFor", arguments: ["br-bot-2"] } },
      { command: "service.call", args: { service: "bot-interest", method: "assignmentFor", arguments: ["br-bot-2"] } },
      { command: "service.call", args: { service: "bot-interest", method: "explorationFor", arguments: ["br-bot-2"] } },
      { command: "component.get", args: { entityId: "br-bot-2", component: "Transform" } },
      { command: "component.get", args: { entityId: "br-bot-2", component: "Input" } },
      { command: "game.step", args: { dt: 0.05, steps: 80 } },
      { command: "service.call", args: { service: "bot-brain", method: "stateFor", arguments: ["br-bot-2"] } },
      { command: "service.call", args: { service: "bot-interest", method: "assignmentFor", arguments: ["br-bot-2"] } },
      { command: "service.call", args: { service: "bot-interest", method: "explorationFor", arguments: ["br-bot-2"] } },
      { command: "component.get", args: { entityId: "br-bot-2", component: "Transform" } },
      { command: "component.get", args: { entityId: "br-bot-2", component: "Input" } },
      { command: "game.step", args: { dt: 0.05, steps: 120 } },
      { command: "service.call", args: { service: "bot-brain", method: "stateFor", arguments: ["br-bot-2"] } },
      { command: "service.call", args: { service: "bot-interest", method: "assignmentFor", arguments: ["br-bot-2"] } },
      { command: "service.call", args: { service: "bot-interest", method: "explorationFor", arguments: ["br-bot-2"] } },
      { command: "component.get", args: { entityId: "br-bot-2", component: "Transform" } },
      { command: "component.get", args: { entityId: "br-bot-2", component: "Input" } }
    ]
  },
  requestedAt: "2026-08-26T10:15:00Z"
});