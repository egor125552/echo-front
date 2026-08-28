const START = 2000013700000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 137,
  mode: "battle-royale",
  room: "engine-lab-ragdoll-high-fall-137",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [START] } },

      { command: "service.call", args: { service: "ragdoll-tuning", method: "configureReason", arguments: ["high-fall", {
        linearDamping: 0.02, angularDamping: 0.02, headAngularDamping: 0.03, friction: 0.38,
        x: 1.65, y: 0.22, z: 1.28, speedMode: "total",
        scaleStartKph: 25, scaleSpanKph: 100, scaleMaxExtra: 1.6
      }] } },
      { command: "entity.spawn", args: { spec: {
        id: "fall-a-137", kind: "human", name: "Fall A", bot: false,
        team: 13701, health: 400, weapons: [], position: { x: 0, y: 0, z: 200, angle: 0 }
      } } },
      { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["fall-a-137", { x: 0, y: 0, z: 200, angle: 0 }] } },
      { command: "game.step", args: { dt: 0.02, steps: 4, now: START + 20 } },
      { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["fall-a-137", { x: 0, y: 30, z: 200, angle: 0 }] } },
      { command: "game.step", args: { dt: 0.02, steps: 95, now: START + 120 } },
      { command: "service.call", args: { service: "ragdoll", method: "stateFor", arguments: ["fall-a-137"] } },
      { command: "service.call", args: { service: "ragdoll-tuning", method: "stateFor", arguments: ["fall-a-137"] } },

      { command: "service.call", args: { service: "ragdoll-tuning", method: "configureReason", arguments: ["high-fall", {
        linearDamping: 0.018, angularDamping: 0.018, headAngularDamping: 0.028, friction: 0.44,
        x: 2.05, y: 0.12, z: 1.55, speedMode: "vertical",
        scaleStartKph: 35, scaleSpanKph: 95, scaleMaxExtra: 1.15
      }] } },
      { command: "entity.spawn", args: { spec: {
        id: "fall-b-137", kind: "human", name: "Fall B", bot: false,
        team: 13702, health: 400, weapons: [], position: { x: 50, y: 0, z: 200, angle: 0 }
      } } },
      { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["fall-b-137", { x: 50, y: 0, z: 200, angle: 0 }] } },
      { command: "game.step", args: { dt: 0.02, steps: 4, now: START + 2200 } },
      { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["fall-b-137", { x: 50, y: 30, z: 200, angle: 0 }] } },
      { command: "game.step", args: { dt: 0.02, steps: 95, now: START + 2300 } },
      { command: "service.call", args: { service: "ragdoll", method: "stateFor", arguments: ["fall-b-137"] } },
      { command: "service.call", args: { service: "ragdoll-tuning", method: "stateFor", arguments: ["fall-b-137"] } },

      { command: "service.call", args: { service: "ragdoll-stability", method: "assertStable", arguments: [{ maxSpread: 8, maxSpeed: 120 }] } }
    ]
  },
  requestedAt: "2026-08-28T20:14:00Z"
});
