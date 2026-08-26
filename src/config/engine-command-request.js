export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 16,
  mode: "battle-royale",
  room: "engine-lab-return-fire-16",
  command: "engine.batch",
  args: {
    commands: [
      { command: "service.call", args: { service: "match-api", method: "connectHuman", arguments: ["engine-attacker-16"] } },
      { command: "component.patch", args: { entityId: "br-bot-2", component: "Health", patch: { current: 10000, maximum: 10000 } } },
      { command: "component.patch", args: { entityId: "engine-attacker-16", component: "Health", patch: { current: 10000, maximum: 10000 } } },
      { command: "game.step", args: { dt: 0.05, steps: 140 } },
      { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["engine-attacker-16", { x: 0, y: 0, z: 0, angle: 1.5707963267948966 }] } },
      { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["br-bot-2", { x: 15, y: 0, z: 0, angle: -1.5707963267948966 }] } },
      { command: "component.get", args: { entityId: "br-bot-2", component: "Weapons" } },
      { command: "component.get", args: { entityId: "engine-attacker-16", component: "Health" } },
      { command: "service.call", args: { service: "weapons", method: "fire", arguments: ["engine-attacker-16"] } },
      { command: "component.get", args: { entityId: "br-bot-2", component: "Health" } },
      { command: "game.step", args: { dt: 0.05, steps: 10 } },
      { command: "service.call", args: { service: "bot-brain", method: "stateFor", arguments: ["br-bot-2"] } },
      { command: "component.get", args: { entityId: "br-bot-2", component: "Input" } },
      { command: "component.get", args: { entityId: "br-bot-2", component: "Weapons" } },
      { command: "component.get", args: { entityId: "engine-attacker-16", component: "Health" } },
      { command: "game.step", args: { dt: 0.05, steps: 20 } },
      { command: "service.call", args: { service: "bot-brain", method: "stateFor", arguments: ["br-bot-2"] } },
      { command: "component.get", args: { entityId: "br-bot-2", component: "Input" } },
      { command: "component.get", args: { entityId: "br-bot-2", component: "Weapons" } },
      { command: "component.get", args: { entityId: "engine-attacker-16", component: "Health" } }
    ]
  },
  requestedAt: "2026-08-26T09:06:00Z"
});