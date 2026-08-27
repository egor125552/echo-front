export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 81,
  mode: "battle-royale",
  room: "engine-lab-shared-rapier-occlusion-81",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [2000004100000] } },
      { command: "entity.spawn", args: { spec: { id: "deployment-sentinel-81", kind: "human", name: "Deployment Sentinel", bot: false, team: 99181, health: 1, weapons: [], position: { x: -390, y: 0, z: -390, angle: 0 } } } },
      { command: "service.call", args: { service: "health", method: "applyDamage", arguments: ["deployment-sentinel-81", 5, { "weaponId": "engine-sentinel", "now": 2000004100050 }] } },
      { command: "entity.spawn", args: { spec: { id: "wall-ray-a-81", kind: "test-human", name: "Wall Ray A", bot: false, team: 99101, health: 200, weapons: ["pistol"], position: { x: 40, y: 0, z: 0, angle: 1.57079632679 } } } },
      { command: "entity.spawn", args: { spec: { id: "wall-ray-b-81", kind: "test-human", name: "Wall Ray B", bot: false, team: 99102, health: 200, weapons: ["pistol"], position: { x: 50, y: 0, z: 0, angle: -1.57079632679 } } } },
      { command: "service.call", args: { service: "physics", method: "raycast", arguments: [{ "x": 40, "y": 1, "z": 0 }, { "x": 1, "y": 0, "z": 0 }, 20, "wall-ray-a-81"] } },
      { command: "service.call", args: { service: "physics", method: "lineOfSight", arguments: [{ "x": 40, "y": 0, "z": 0 }, { "x": 50, "y": 0, "z": 0 }, "wall-ray-a-81", "wall-ray-b-81"] } },
      { command: "entity.spawn", args: { spec: { id: "car-ray-a-81", kind: "test-human", name: "Car Ray A", bot: false, team: 99103, health: 200, weapons: ["pistol"], position: { x: 84, y: 0, z: 24, angle: 1.57079632679 } } } },
      { command: "entity.spawn", args: { spec: { id: "car-ray-b-81", kind: "test-human", name: "Car Ray B", bot: false, team: 99104, health: 200, weapons: ["pistol"], position: { x: 104, y: 0, z: 24, angle: -1.57079632679 } } } },
      { command: "game.step", args: { dt: 0.05, steps: 1, now: 2000004100100 } },
      { command: "service.call", args: { service: "physics", method: "raycast", arguments: [{ "x": 84, "y": 1.25, "z": 24 }, { "x": 1, "y": 0, "z": 0 }, 30, "car-ray-a-81"] } },
      { command: "service.call", args: { service: "physics", method: "lineOfSight", arguments: [{ "x": 84, "y": 0.25, "z": 24 }, { "x": 104, "y": 0.25, "z": 24 }, "car-ray-a-81", "car-ray-b-81"] } },
      { command: "service.call", args: { service: "physics", method: "stats", arguments: [] } }
    ]
  },
  requestedAt: "2026-08-27T17:43:00Z"
});