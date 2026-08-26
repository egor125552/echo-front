export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 21,
  mode: "battle-royale",
  room: "engine-lab-roam-baseline-21",
  command: "engine.batch",
  args: {
    commands: [
      { command: "component.patch", args: { entityId: "br-bot-2", component: "Health", patch: { current: 10000, maximum: 10000 } } },
      { command: "game.step", args: { dt: 0.05, steps: 140, now: 1999999800000 } },
      { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["br-bot-2", { x: 80, y: 0, z: 0, angle: -1.5707963267948966 }] } },
      { command: "service.call", args: { service: "bot-interest", method: "assignmentFor", arguments: ["br-bot-2"] } },
      { command: "game.step", args: { dt: 0.05, steps: 40 } },
      { command: "service.call", args: { service: "bot-brain", method: "stateFor", arguments: ["br-bot-2"] } },
      { command: "component.get", args: { entityId: "br-bot-2", component: "Transform" } },
      { command: "component.get", args: { entityId: "br-bot-2", component: "Input" } },
      { command: "service.call", args: { service: "bot-interest", method: "assignmentFor", arguments: ["br-bot-2"] } },
      { command: "game.step", args: { dt: 0.05, steps: 80 } },
      { command: "service.call", args: { service: "bot-brain", method: "stateFor", arguments: ["br-bot-2"] } },
      { command: "component.get", args: { entityId: "br-bot-2", component: "Transform" } },
      { command: "component.get", args: { entityId: "br-bot-2", component: "Input" } },
      { command: "service.call", args: { service: "bot-interest", method: "assignmentFor", arguments: ["br-bot-2"] } },
      { command: "game.step", args: { dt: 0.05, steps: 100 } },
      { command: "service.call", args: { service: "bot-brain", method: "stateFor", arguments: ["br-bot-2"] } },
      { command: "component.get", args: { entityId: "br-bot-2", component: "Transform" } },
      { command: "component.get", args: { entityId: "br-bot-2", component: "Input" } },
      { command: "service.call", args: { service: "bot-interest", method: "assignmentFor", arguments: ["br-bot-2"] } }
    ]
  },
  requestedAt: "2026-08-26T09:18:00Z"
});