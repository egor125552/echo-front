export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 6,
  mode: "battle-royale",
  room: "engine-lab-xstate-warehouse",
  command: "engine.batch",
  args: {
    commands: [
      {
        command: "service.call",
        args: { "service": "match-api", "method": "connectHuman", "arguments": ["engine-warehouse-human"] }
      },
      {
        command: "service.call",
        args: { "service": "movement", "method": "teleport", "arguments": ["br-bot-94", { "x": 80, "y": 0, "z": 0, "angle": -1.5707963267948966 }] }
      },
      {
        command: "service.call",
        args: { "service": "movement", "method": "teleport", "arguments": ["engine-warehouse-human", { "x": 60, "y": 3.2, "z": 0, "angle": 1.5707963267948966 }] }
      },
      { "command": "game.step", "args": { "dt": 0.05, "steps": 140 } },
      {
        command: "event.emit",
        args: {
          "event": "sound:spatial",
          "payload": {
            "entityId": "engine-warehouse-human",
            "key": "weapon.pistol.fire",
            "radius": 110,
            "x": 60,
            "y": 3.2,
            "z": 0
          }
        }
      },
      { "command": "game.step", "args": { "dt": 0.05, "steps": 8 } },
      {
        command: "service.call",
        args: { "service": "bot-brain", "method": "stateFor", "arguments": ["br-bot-94"] }
      },
      { "command": "component.get", "args": { "entityId": "br-bot-94", "component": "Transform" } },
      { "command": "game.step", "args": { "dt": 0.05, "steps": 220 } },
      {
        command: "service.call",
        args: { "service": "bot-brain", "method": "stateFor", "arguments": ["br-bot-94"] }
      },
      { "command": "component.get", "args": { "entityId": "br-bot-94", "component": "Transform" } },
      { "command": "game.step", "args": { "dt": 0.05, "steps": 220 } },
      {
        command: "service.call",
        args: { "service": "bot-brain", "method": "stateFor", "arguments": ["br-bot-94"] }
      },
      { "command": "component.get", "args": { "entityId": "br-bot-94", "component": "Transform" } },
      {
        command: "service.call",
        args: { "service": "map", "method": "locationAt", "arguments": [{ "x": 60, "y": 3.2, "z": 0 }] }
      }
    ]
  },
  requestedAt: "2026-08-26T07:25:00Z"
});
