export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 77,
  mode: "tdm",
  room: "engine-lab-shared-rapier-tdm-77",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "service.call", args: { service: "tdm", method: "reset", arguments: [2000003700000] } },
      { command: "entity.spawn", args: { spec: { id: "tdm-human-a-77", kind: "test-human", name: "TDM Human A", bot: false, team: 1, health: 200, weapons: ["pistol"], position: { x: 0, y: 0, z: 0, angle: 0 } } } },
      { command: "entity.spawn", args: { spec: { id: "tdm-human-b-77", kind: "test-human", name: "TDM Human B", bot: false, team: 2, health: 200, weapons: ["pistol"], position: { x: 0, y: 0, z: -8, angle: 3.14159 } } } },
      { command: "entity.inspect", args: { entityId: "tdm-human-a-77" } },
      { command: "entity.inspect", args: { entityId: "tdm-human-b-77" } },
      { command: "service.call", args: { service: "physics", method: "raycast", arguments: [{ "x": 0, "y": 1, "z": 0 }, { "x": 0, "y": 0, "z": -1 }, 20, "tdm-human-a-77"] } },
      { command: "service.call", args: { service: "movement", method: "setInput", arguments: ["tdm-human-a-77", { "forward": 1, "strafe": 0, "turn": 0, "sprint": false }] } },
      { command: "game.step", args: { dt: 0.05, steps: 20, now: 2000003700050 } },
      { command: "entity.inspect", args: { entityId: "tdm-human-a-77" } },
      { command: "service.call", args: { service: "combat", method: "damage", arguments: ["tdm-human-b-77", 60, { "attackerId": "tdm-human-a-77", "weaponId": "pistol", "now": 2000003701100 }] } },
      { command: "entity.inspect", args: { entityId: "tdm-human-b-77" } },
      { command: "service.call", args: { service: "combat", method: "damage", arguments: ["tdm-human-b-77", 500, { "attackerId": "tdm-human-a-77", "weaponId": "pistol", "now": 2000003701200 }] } },
      { command: "service.call", args: { service: "tdm", method: "status", arguments: [2000003701200] } },
      { command: "game.step", args: { dt: 0.05, steps: 70, now: 2000003701250 } },
      { command: "entity.inspect", args: { entityId: "tdm-human-b-77" } },
      { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["tdm-human-a-77", { "x": 49, "y": 0, "z": 0, "angle": 1.57079632679 }] } },
      { command: "service.call", args: { service: "movement", method: "setInput", arguments: ["tdm-human-a-77", { "forward": 1, "strafe": 0, "turn": 0, "sprint": true }] } },
      { command: "game.step", args: { dt: 0.05, steps: 20, now: 2000003705000 } },
      { command: "entity.inspect", args: { entityId: "tdm-human-a-77" } },
      { command: "service.call", args: { service: "physics", method: "stats", arguments: [] } }
    ]
  },
  requestedAt: "2026-08-27T17:20:00Z"
});