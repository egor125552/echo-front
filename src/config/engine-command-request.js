export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 14,
  mode: "battle-royale",
  room: "engine-lab-warehouse-exam-13",
  command: "engine.batch",
  args: {
    commands: [
      { command: "service.call", args: { service: "bot-brain", method: "stateFor", arguments: ["br-bot-2"] } },
      { command: "component.get", args: { entityId: "br-bot-2", component: "Transform" } },
      { command: "component.get", args: { entityId: "br-bot-2", component: "Input" } },
      { command: "game.step", args: { dt: 0.05, steps: 20 } },
      { command: "service.call", args: { service: "bot-brain", method: "stateFor", arguments: ["br-bot-2"] } },
      { command: "component.get", args: { entityId: "br-bot-2", component: "Transform" } },
      { command: "component.get", args: { entityId: "br-bot-2", component: "Input" } }
    ]
  },
  requestedAt: "2026-08-26T09:01:00Z"
});