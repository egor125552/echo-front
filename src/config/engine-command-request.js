export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 79,
  mode: "battle-royale",
  room: "engine-lab-shared-rapier-live-queries-79",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [2000003900000] } },
      { command: "entity.spawn", args: { spec: { id: "deployment-sentinel-79", kind: "human", name: "Deployment Sentinel", bot: false, team: 99079, health: 1, weapons: [], position: { x: -390, y: 0, z: -390, angle: 0 } } } },
      { command: "service.call", args: { service: "health", method: "applyDamage", arguments: ["deployment-sentinel-79", 5, { "weaponId": "engine-sentinel", "now": 2000003900050 }] } },
      { command: "entity.spawn", args: { spec: { id: "live-ray-a-79", kind: "test-human", name: "Live Ray A", bot: false, team: 99001, health: 200, weapons: ["pistol"], position: { x: 120, y: 0, z: 100, angle: 0 } } } },
      { command: "entity.spawn", args: { spec: { id: "live-ray-b-79", kind: "test-human", name: "Live Ray B", bot: false, team: 99002, health: 200, weapons: ["pistol"], position: { x: 120, y: 0, z: 90, angle: 3.14159 } } } },
      { command: "service.call", args: { service: "physics", method: "raycast", arguments: [{ "x": 120, "y": 1, "z": 100 }, { "x": 0, "y": 0, "z": -1 }, 25, "live-ray-a-79"] } },
      { command: "service.call", args: { service: "weapons", method: "fire", arguments: ["live-ray-a-79", 2000003900100] } },
      { command: "entity.inspect", args: { entityId: "live-ray-b-79" } },
      { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["live-ray-b-79", { "x": 120, "y": 0, "z": 80, "angle": 3.14159 }] } },
      { command: "service.call", args: { service: "physics", method: "raycast", arguments: [{ "x": 120, "y": 1, "z": 100 }, { "x": 0, "y": 0, "z": -1 }, 30, "live-ray-a-79"] } },
      { command: "service.call", args: { service: "physics", method: "lineOfSight", arguments: [{ "x": 120, "y": 0, "z": 100 }, { "x": 120, "y": 0, "z": 80 }, "live-ray-a-79", "live-ray-b-79"] } },
      { command: "entity.spawn", args: { spec: { id: "vehicle-driver-79", kind: "test-human", name: "Vehicle Driver", bot: false, team: 99003, health: 200, weapons: [], position: { x: 94, y: 0, z: 24, angle: 0 } } } },
      { command: "service.call", args: { service: "vehicles", method: "enter", arguments: ["vehicle-driver-79", 2000003900200] } },
      { command: "service.call", args: { service: "vehicles", method: "setInput", arguments: ["vehicle-driver-79", { "forward": 1, "strafe": 0.55, "sprint": false }] } },
      { command: "game.step", args: { dt: 0.05, steps: 80, now: 2000003900250 } },
      { command: "service.call", args: { service: "vehicles", method: "summary", arguments: [] } },
      { command: "service.call", args: { service: "physics", method: "raycast", arguments: [{ "x": 120, "y": 1, "z": 100 }, { "x": 0, "y": 0, "z": -1 }, 30, "live-ray-a-79"] } },
      { command: "service.call", args: { service: "physics", method: "stats", arguments: [] } }
    ]
  },
  requestedAt: "2026-08-27T17:31:00Z"
});