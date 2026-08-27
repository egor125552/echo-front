export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 80,
  mode: "tdm",
  room: "engine-lab-tdm-kill-respawn-80",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "entity.spawn", args: { spec: { id: "tdm-shooter-80", kind: "test-human", name: "TDM Shooter", bot: false, team: 1, health: 100, weapons: ["pistol"], spawnProtectionMs: 1, position: { x: 0, y: 0, z: 0, angle: 0 } } } },
      { command: "entity.spawn", args: { spec: { id: "tdm-target-80", kind: "test-human", name: "TDM Target", bot: false, team: 2, health: 100, weapons: ["pistol"], spawnProtectionMs: 1, position: { x: 0, y: 0, z: -10, angle: 3.14159 } } } },
      { command: "service.call", args: { service: "spawn-protection", method: "clear", arguments: ["tdm-target-80"] } },
      { command: "service.call", args: { service: "physics", method: "raycast", arguments: [{ "x": 0, "y": 1, "z": 0 }, { "x": 0, "y": 0, "z": -1 }, 20, "tdm-shooter-80"] } },
      { command: "service.call", args: { service: "weapons", method: "fire", arguments: ["tdm-shooter-80", 2000004000000] } },
      { command: "service.call", args: { service: "weapons", method: "fire", arguments: ["tdm-shooter-80", 2000004000250] } },
      { command: "service.call", args: { service: "weapons", method: "fire", arguments: ["tdm-shooter-80", 2000004000500] } },
      { command: "service.call", args: { service: "weapons", method: "fire", arguments: ["tdm-shooter-80", 2000004000750] } },
      { command: "service.call", args: { service: "weapons", method: "fire", arguments: ["tdm-shooter-80", 2000004001000] } },
      { command: "entity.inspect", args: { entityId: "tdm-target-80" } },
      { command: "service.call", args: { service: "tdm", method: "status", arguments: [2000004001100] } },
      { command: "service.call", args: { service: "respawn", method: "respawnNow", arguments: ["tdm-target-80", 2000004001200, "engine-control"] } },
      { command: "entity.inspect", args: { entityId: "tdm-target-80" } },
      { command: "service.call", args: { service: "physics", method: "stats", arguments: [] } }
    ]
  },
  requestedAt: "2026-08-27T17:40:00Z"
});