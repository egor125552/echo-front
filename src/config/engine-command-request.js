export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 20,
  mode: "battle-royale",
  room: "engine-lab-fool-bot-20",
  command: "engine.batch",
  args: {
    commands: [
      { command: "service.call", args: { service: "match-api", method: "connectHuman", arguments: ["engine-decoy-20"] } },
      { command: "component.patch", args: { entityId: "br-bot-2", component: "Health", patch: { current: 10000, maximum: 10000 } } },
      { command: "component.patch", args: { entityId: "engine-decoy-20", component: "Health", patch: { current: 10000, maximum: 10000 } } },
      { command: "game.step", args: { dt: 0.05, steps: 140, now: 2000000200000 } },
      { command: "service.call", args: { service: "map", method: "setDoorOpen", arguments: ["warehouse-front-door", false, null, 2000000207000] } },
      { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["engine-decoy-20", { x: 79, y: 0, z: 5, angle: 1.5707963267948966 }] } },
      { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["br-bot-2", { x: 82, y: 0, z: 5, angle: -1.5707963267948966 }] } },
      { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["engine-decoy-20", { "firePressed": true }, 2000000207000] } },
      { command: "component.get", args: { entityId: "br-bot-2", component: "Armor" } },
      { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["engine-decoy-20", { x: 70, y: 0, z: 5, angle: 3.141592653589793 }] } },
      { command: "event.emit", args: { event: "sound:spatial", payload: { entityId: "engine-decoy-20", key: "footstep.concrete.1", gait: "run", radius: 44, x: 70, y: 0, z: 5, now: 2000000207050 } } },
      { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["engine-decoy-20", { x: -300, y: 0, z: -300, angle: 0 }] } },
      { command: "game.step", args: { dt: 0.05, steps: 20, now: 2000000207050 } },
      { command: "service.call", args: { service: "bot-brain", method: "stateFor", arguments: ["br-bot-2"] } },
      { command: "component.get", args: { entityId: "br-bot-2", component: "Transform" } },
      { command: "service.call", args: { service: "bot-interest", method: "heardFor", arguments: ["br-bot-2"] } },
      { command: "game.step", args: { dt: 0.05, steps: 80 } },
      { command: "service.call", args: { service: "bot-brain", method: "stateFor", arguments: ["br-bot-2"] } },
      { command: "component.get", args: { entityId: "br-bot-2", component: "Transform" } },
      { command: "service.call", args: { service: "map", method: "locationAt", arguments: [{ x: 70, y: 0, z: 5 }] } },
      { command: "game.step", args: { dt: 0.05, steps: 100 } },
      { command: "service.call", args: { service: "bot-brain", method: "stateFor", arguments: ["br-bot-2"] } },
      { command: "component.get", args: { entityId: "br-bot-2", component: "Transform" } },
      { command: "component.get", args: { entityId: "br-bot-2", component: "Input" } },
      { command: "service.call", args: { service: "bot-interest", method: "heardFor", arguments: ["br-bot-2"] } }
    ]
  },
  requestedAt: "2026-08-26T09:15:00Z"
});