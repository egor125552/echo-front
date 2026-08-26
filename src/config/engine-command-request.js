export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 5,
  mode: "battle-royale",
  room: "engine-lab-xstate-2",
  command: "engine.batch",
  args: {
    commands: [
      {
        command: "service.call",
        args: { "service": "match-api", "method": "connectHuman", "arguments": ["engine-xstate-human-2"] }
      },
      {
        command: "service.call",
        args: { "service": "movement", "method": "teleport", "arguments": ["br-bot-94", { "x": 0, "y": 0, "z": 0, "angle": 0 }] }
      },
      {
        command: "service.call",
        args: { "service": "movement", "method": "teleport", "arguments": ["engine-xstate-human-2", { "x": 0, "y": 0, "z": -9, "angle": 3.141592653589793 }] }
      },
      { "command": "game.step", "args": { "dt": 0.05, "steps": 140 } },
      {
        command: "event.emit",
        args: { "event": "combat:damage", "payload": { "targetId": "br-bot-94", "attackerId": "engine-xstate-human-2" } }
      },
      { "command": "game.step", "args": { "dt": 0.05, "steps": 5 } },
      {
        command: "service.call",
        args: { "service": "bot-brain", "method": "stateFor", "arguments": ["br-bot-94"] }
      },
      { "command": "component.get", "args": { "entityId": "br-bot-94", "component": "Input" } },
      { "command": "component.get", "args": { "entityId": "engine-xstate-human-2", "component": "Health" } },
      { "command": "game.step", "args": { "dt": 0.05, "steps": 20 } },
      {
        command: "service.call",
        args: { "service": "bot-brain", "method": "stateFor", "arguments": ["br-bot-94"] }
      },
      { "command": "component.get", "args": { "entityId": "engine-xstate-human-2", "component": "Health" } },
      { "command": "component.get", "args": { "entityId": "engine-xstate-human-2", "component": "Armor" } }
    ]
  },
  requestedAt: "2026-08-26T07:23:00Z"
});
