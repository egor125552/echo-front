export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 7,
  mode: "battle-royale",
  room: "engine-lab-xstate-ordinary",
  command: "engine.batch",
  args: {
    commands: [
      {
        command: "service.call",
        args: { "service": "match-api", "method": "connectHuman", "arguments": ["engine-ordinary-human"] }
      },
      {
        command: "service.call",
        args: { "service": "movement", "method": "teleport", "arguments": ["br-bot-2", { "x": 80, "y": 0, "z": 0, "angle": -1.5707963267948966 }] }
      },
      {
        command: "service.call",
        args: { "service": "movement", "method": "teleport", "arguments": ["engine-ordinary-human", { "x": 60, "y": 3.2, "z": 0, "angle": 1.5707963267948966 }] }
      },
      { "command": "component.patch", "args": { "entityId": "br-bot-2", "component": "Health", "patch": { "current": 10000, "maximum": 10000 } } },
      { "command": "component.patch", "args": { "entityId": "engine-ordinary-human", "component": "Health", "patch": { "current": 10000, "maximum": 10000 } } },
      { "command": "game.step", "args": { "dt": 0.05, "steps": 140 } },
      {
        command: "event.emit",
        args: {
          "event": "sound:spatial",
          "payload": {
            "entityId": "engine-ordinary-human",
            "key": "weapon.pistol.fire",
            "radius": 110,
            "x": 60,
            "y": 3.2,
            "z": 0
          }
        }
      },
      { "command": "game.step", "args": { "dt": 0.05, "steps": 8 } },
      { "command": "service.call", "args": { "service": "bot-brain", "method": "stateFor", "arguments": ["br-bot-2"] } },
      { "command": "service.call", "args": { "service": "bot-interest", "method": "heardFor", "arguments": ["br-bot-2"] } },
      { "command": "component.get", "args": { "entityId": "br-bot-2", "component": "Transform" } },
      { "command": "game.step", "args": { "dt": 0.05, "steps": 220 } },
      { "command": "service.call", "args": { "service": "bot-brain", "method": "stateFor", "arguments": ["br-bot-2"] } },
      { "command": "component.get", "args": { "entityId": "br-bot-2", "component": "Transform" } },
      { "command": "game.step", "args": { "dt": 0.05, "steps": 220 } },
      { "command": "service.call", "args": { "service": "bot-brain", "method": "stateFor", "arguments": ["br-bot-2"] } },
      { "command": "component.get", "args": { "entityId": "br-bot-2", "component": "Transform" } },
      { "command": "service.call", "args": { "service": "map", "method": "locationAt", "arguments": [{ "x": 60, "y": 3.2, "z": 0 }] } }
    ]
  },
  requestedAt: "2026-08-26T08:24:00Z"
});