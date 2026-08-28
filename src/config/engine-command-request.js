const START = 2000014500000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 145,
  mode: "battle-royale",
  room: "engine-lab-ragdoll-building-impact-145",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [START] } },
      { command: "service.call", args: { service: "ragdoll-tuning", method: "configureReason", arguments: ["building-impact", {
        linearDamping: 0.024, angularDamping: 0.03, headAngularDamping: 0.045, friction: 0.50,
        x: 1.9, y: 0.08, z: 1.35, speedMode: "total",
        scaleStartKph: 12, scaleSpanKph: 45, scaleMaxExtra: 0.70
      }] } },
      { command: "entity.spawn", args: { spec: {
        id: "building-hit-145", kind: "human", name: "Building Hit", bot: false,
        team: 14501, health: 400, weapons: [], position: { x: 41.2, y: 0, z: 6, angle: 1.5707963267948966 }
      } } },
      { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["building-hit-145", { x: 41.2, y: 0, z: 6, angle: 1.5707963267948966 }] } },
      { command: "game.step", args: { dt: 0.02, steps: 2, now: START + 20 } },
      { command: "service.call", args: { service: "movement", method: "setInput", arguments: ["building-hit-145", { forward: 1, sprint: true }] } },
      { command: "service.call", args: { service: "jump", method: "request", arguments: ["building-hit-145"] } },
      { command: "game.step", args: { dt: 0.02, steps: 45, now: START + 80 } },
      { command: "service.call", args: { service: "ragdoll", method: "stateFor", arguments: ["building-hit-145"] } },
      { command: "service.call", args: { service: "ragdoll-tuning", method: "stateFor", arguments: ["building-hit-145"] } },
      { command: "service.call", args: { service: "parkour-ragdoll", method: "summary", arguments: [] } },
      { command: "service.call", args: { service: "ragdoll-stability", method: "assertStable", arguments: [{ maxSpread: 8, maxSpeed: 80 }] } }
    ]
  },
  requestedAt: "2026-08-28T21:01:00Z"
});
