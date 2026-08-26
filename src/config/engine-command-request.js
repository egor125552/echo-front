export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 26,
  mode: "battle-royale",
  room: "engine-lab-return-fire-26",
  command: "engine.batch",
  args: {
    commands: [
      { command: "service.call", args: { service: "match-api", method: "connectHuman", arguments: ["engine-attacker-26"] } },
      { command: "component.patch", args: { entityId: "br-bot-2", component: "Health", patch: { current: 10000, maximum: 10000 } } },
      { command: "component.patch", args: { entityId: "engine-attacker-26", component: "Health", patch: { current: 10000, maximum: 10000 } } },
      { command: "game.step", args: { dt: 0.05, steps: 140, now: 2000000600000 } },
      { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["engine-attacker-26", { x: 0, y: 0, z: 0, angle: 0 }] } },
      { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["br-bot-2", { x: 0, y: 0, z: -18, angle: 3.141592653589793 }] } },
      { command: "event.emit", args: { event: "entity:respawned", payload: { entityId: "br-bot-2" } } },
      { command: "game.step", args: { dt: 0.05, steps: 4 } },
      { command: "component.get", args: { entityId: "engine-attacker-26", component: "Health" } },
      { command: "event.emit", args: { event: "combat:damage", payload: { targetId: "br-bot-2", attackerId: "engine-attacker-26", amount: 25, weaponId: "pistol", now: 2000000607200 } } },
      { command: "game.step", args: { dt: 0.05, steps: 2 } },
      { command: "service.call", args: { service: "bot-brain", method: "stateFor", arguments: ["br-bot-2"] } },
      { command: "component.get", args: { entityId: "br-bot-2", component: "Input" } },
      { command: "game.step", args: { dt: 0.05, steps: 12 } },
      { command: "service.call", args: { service: "bot-brain", method: "stateFor", arguments: ["br-bot-2"] } },
      { command: "component.get", args: { entityId: "br-bot-2", component: "Input" } },
      { command: "component.get", args: { entityId: "engine-attacker-26", component: "Health" } },
      { command: "game.step", args: { dt: 0.05, steps: 30 } },
      { command: "service.call", args: { service: "bot-brain", method: "stateFor", arguments: ["br-bot-2"] } },
      { command: "component.get", args: { entityId: "br-bot-2", component: "Input" } },
      { command: "component.get", args: { entityId: "engine-attacker-26", component: "Health" } }
    ]
  },
  requestedAt: "2026-08-26T10:42:00Z"
});