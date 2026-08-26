export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 17,
  mode: "battle-royale",
  room: "engine-lab-hit-trace-17",
  command: "engine.batch",
  args: {
    commands: [
      { command: "service.call", args: { service: "match-api", method: "connectHuman", arguments: ["engine-attacker-17"] } },
      { command: "component.patch", args: { entityId: "br-bot-2", component: "Health", patch: { current: 10000, maximum: 10000 } } },
      { command: "component.patch", args: { entityId: "engine-attacker-17", component: "Health", patch: { current: 10000, maximum: 10000 } } },
      { command: "game.step", args: { dt: 0.05, steps: 140 } },
      { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["engine-attacker-17", { x: 0, y: 0, z: 0, angle: 1.5707963267948966 }] } },
      { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["br-bot-2", { x: 15, y: 0, z: 0, angle: -1.5707963267948966 }] } },
      { command: "service.call", args: { service: "physics", method: "raycast", arguments: [{ x: 0.55, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }, 28, "engine-attacker-17"] } },
      { command: "component.get", args: { entityId: "br-bot-2", component: "Armor" } },
      { command: "service.call", args: { service: "weapons", method: "fire", arguments: ["engine-attacker-17"] } },
      { command: "component.get", args: { entityId: "br-bot-2", component: "Armor" } },
      { command: "component.get", args: { entityId: "br-bot-2", component: "Health" } },
      { command: "service.call", args: { service: "bot-brain", method: "stateFor", arguments: ["br-bot-2"] } },
      { command: "game.step", args: { dt: 0.05, steps: 10 } },
      { command: "service.call", args: { service: "bot-brain", method: "stateFor", arguments: ["br-bot-2"] } },
      { command: "component.get", args: { entityId: "br-bot-2", component: "Input" } },
      { command: "component.get", args: { entityId: "br-bot-2", component: "Weapons" } },
      { command: "component.get", args: { entityId: "engine-attacker-17", component: "Health" } }
    ]
  },
  requestedAt: "2026-08-26T09:07:00Z"
});