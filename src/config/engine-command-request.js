const START = 2000018400000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 184,
  mode: "battle-royale",
  room: "engine-lab-door-normal-movement-184",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: { commands: [
    { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [START] } },
    { command: "entity.spawn", args: { spec: { id: "builder-184", kind: "human", name: "Normal Door Walker", bot: false, team: 18401, health: 400, weapons: ["pistol"], position: { x: 265, y: 0, z: -177, angle: 3.14159265359 } } } },
    { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["builder-184", { x: 265, y: 0, z: -177, angle: 3.14159265359 }] } },
    { command: "game.step", args: { dt: 0.02, steps: 3, now: START + 20 } },
    { command: "service.call", args: { service: "map", method: "setDoorOpen", arguments: ["north-stair-front-door", true, "builder-184", START + 100] } },
    { command: "service.call", args: { service: "movement", method: "setInput", arguments: ["builder-184", { forward: 1 }] } },
    { command: "game.step", args: { dt: 0.02, steps: 50, now: START + 120 } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["builder-184"] } },
    { command: "service.call", args: { service: "map", method: "locationAt", arguments: [{ x: 265, y: 0, z: -173.8 }] } },
    { command: "service.call", args: { service: "toggleable-colliders", method: "disabledCount", arguments: [] } }
  ] },
  requestedAt: "2026-08-29T21:47:00+03:00"
});