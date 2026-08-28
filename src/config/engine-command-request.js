const START = 2000014900000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 149,
  mode: "battle-royale",
  room: "engine-lab-ragdoll-vehicle-crash-149",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: { commands: [
    { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [START] } },
    { command: "service.call", args: { service: "ragdoll-tuning", method: "configureReason", arguments: ["vehicle-crash", { linearDamping: 0.02, angularDamping: 0.028, headAngularDamping: 0.045, friction: 0.48, x: 1.9, y: 0.08, z: 1.4, speedMode: "total", scaleStartKph: 30, scaleSpanKph: 100, scaleMaxExtra: 0.8 }] } },
    { command: "entity.spawn", args: { spec: { id: "crash-driver-149", kind: "human", name: "Crash Driver", bot: false, team: 14901, health: 400, weapons: [], position: { x: 432.4, y: 1.1, z: -650, angle: 0 } } } },
    { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["crash-driver-149", { x: 432.4, y: 1.1, z: -650, angle: 0 }] } },
    { command: "game.step", args: { dt: 0.02, steps: 2, now: START + 20 } },
    { command: "service.call", args: { service: "vehicles", method: "enter", arguments: ["crash-driver-149", START + 60, "br-supercar-2"] } },
    { command: "service.call", args: { service: "vehicles", method: "setInput", arguments: ["crash-driver-149", { forward: 1, fireHeld: true }] } },
    { command: "game.step", args: { dt: 0.02, steps: 480, now: START + 80 } },
    { command: "service.call", args: { service: "vehicles", method: "stateFor", arguments: ["br-supercar-2"] } },
    { command: "service.call", args: { service: "parkour-ragdoll", method: "summary", arguments: [] } },
    { command: "service.call", args: { service: "ragdoll", method: "stateFor", arguments: ["crash-driver-149"] } },
    { command: "service.call", args: { service: "ragdoll-tuning", method: "stateFor", arguments: ["crash-driver-149"] } },
    { command: "service.call", args: { service: "ragdoll-stability", method: "assertStable", arguments: [{ maxSpread: 8, maxSpeed: 100 }] } }
  ] },
  requestedAt: "2026-08-28T21:16:00Z"
});
