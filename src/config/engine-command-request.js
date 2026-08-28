const START = 2000014700000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 147,
  mode: "battle-royale",
  room: "engine-lab-ragdoll-vehicle-hit-147",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: { commands: [
    { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [START] } },
    { command: "service.call", args: { service: "ragdoll-tuning", method: "configureReason", arguments: ["vehicle-hit", { linearDamping: 0.02, angularDamping: 0.028, headAngularDamping: 0.045, friction: 0.50, x: 1.8, y: 0.08, z: 1.3, speedMode: "total", scaleStartKph: 20, scaleSpanKph: 100, scaleMaxExtra: 0.9 }] } },
    { command: "entity.spawn", args: { spec: { id: "driver-hit-147", kind: "human", name: "Hit Driver", bot: false, team: 14701, health: 400, weapons: [], position: { x: 432.4, y: 1.1, z: -650, angle: 0 } } } },
    { command: "entity.spawn", args: { spec: { id: "victim-hit-147", kind: "human", name: "Hit Victim", bot: false, team: 14702, health: 400, weapons: [], position: { x: 430, y: 0, z: -658, angle: 0 } } } },
    { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["driver-hit-147", { x: 432.4, y: 1.1, z: -650, angle: 0 }] } },
    { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["victim-hit-147", { x: 430, y: 0, z: -658, angle: 0 }] } },
    { command: "game.step", args: { dt: 0.02, steps: 2, now: START + 20 } },
    { command: "service.call", args: { service: "vehicles", method: "enter", arguments: ["driver-hit-147", START + 60, "br-supercar-2"] } },
    { command: "service.call", args: { service: "vehicles", method: "setInput", arguments: ["driver-hit-147", { forward: 1 }] } },
    { command: "game.step", args: { dt: 0.02, steps: 80, now: START + 80 } },
    { command: "service.call", args: { service: "fleet-pedestrian-ragdoll", method: "summary", arguments: [] } },
    { command: "service.call", args: { service: "ragdoll", method: "stateFor", arguments: ["victim-hit-147"] } },
    { command: "service.call", args: { service: "ragdoll-tuning", method: "stateFor", arguments: ["victim-hit-147"] } },
    { command: "service.call", args: { service: "ragdoll-stability", method: "assertStable", arguments: [{ maxSpread: 8, maxSpeed: 100 }] } }
  ] },
  requestedAt: "2026-08-28T21:12:00Z"
});
