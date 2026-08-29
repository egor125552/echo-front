const START = 2000018000000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 180,
  mode: "battle-royale",
  room: "engine-lab-building-door-ray-180",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: { commands: [
    { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [START] } },
    { command: "entity.spawn", args: { spec: { id: "builder-180", kind: "human", name: "Door Ray Player", bot: false, team: 18001, health: 400, weapons: ["pistol"], position: { x: 265, y: 0, z: -177, angle: 3.14159265359 } } } },
    { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["builder-180", { x: 265, y: 0, z: -177, angle: 3.14159265359 }] } },
    { command: "game.step", args: { dt: 0.02, steps: 3, now: START + 20 } },
    { command: "service.call", args: { service: "map", method: "setDoorOpen", arguments: ["north-stair-front-door", true, "builder-180", START + 100] } },
    { command: "service.call", args: { service: "physics", method: "raycastWorld", arguments: [{ x: 265, y: 1, z: -177 }, { x: 0, y: 0, z: 1 }, 6] } },
    { command: "service.call", args: { service: "physics", method: "raycastWorld", arguments: [{ x: 264.7, y: 1, z: -177 }, { x: 0, y: 0, z: 1 }, 6] } },
    { command: "service.call", args: { service: "physics", method: "raycastWorld", arguments: [{ x: 266.3, y: 1, z: -177 }, { x: 0, y: 0, z: 1 }, 6] } },
    { command: "service.call", args: { service: "physics", method: "move", arguments: ["builder-180", 0, 3, 0] } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["builder-180"] } },
    { command: "service.call", args: { service: "map", method: "locationAt", arguments: [{ x: 265, y: 0, z: -174 }] } }
  ] },
  requestedAt: "2026-08-29T21:29:00+03:00"
});