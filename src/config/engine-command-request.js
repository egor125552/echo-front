const START = 2000018300000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 183,
  mode: "battle-royale",
  room: "engine-lab-door-move-collision-183",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: { commands: [
    { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [START] } },
    { command: "entity.spawn", args: { spec: { id: "builder-183", kind: "human", name: "Door Collision Probe", bot: false, team: 18301, health: 400, weapons: ["pistol"], position: { x: 265, y: 0, z: -177, angle: 3.14159265359 } } } },
    { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["builder-183", { x: 265, y: 0, z: -177, angle: 3.14159265359 }] } },
    { command: "game.step", args: { dt: 0.02, steps: 3, now: START + 20 } },
    { command: "service.call", args: { service: "map", method: "setDoorOpen", arguments: ["north-stair-front-door", true, "builder-183", START + 100] } },
    { command: "service.call", args: { service: "physics", method: "raycastWorld", arguments: [{ x: 265, y: 1, z: -177 }, { x: 0, y: 0, z: 1 }, 6] } },
    { command: "service.call", args: { service: "physics", method: "move", arguments: ["builder-183", 0, 3, 0] } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["builder-183"] } },
    { command: "service.call", args: { service: "physics", method: "move", arguments: ["builder-183", 0.4, 3, 0] } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["builder-183"] } }
  ] },
  requestedAt: "2026-08-29T21:43:00+03:00"
});