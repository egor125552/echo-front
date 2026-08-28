const START = 2000013600000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 136,
  mode: "battle-royale",
  room: "engine-lab-ragdoll-fall-death-136",
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
        id: "fall-a-136", kind: "human", name: "Fall A", bot: false,
        team: 13601, health: 400, weapons: [], position: { x: 0, y: 30, z: 0, angle: 0 }
      } } },
      { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["fall-a-136", { x: 0, y: 30, z: 0, angle: 0 }] } },
      { command: "game.step", args: { dt: 0.02, steps: 70, now: START + 20 } },
      { command: "service.call", args: { service: "ragdoll", method: "stateFor", arguments: ["fall-a-136"] } },
      { command: "service.call", args: { service: "ragdoll-tuning", method: "stateFor", arguments: ["fall-a-136"] } },

      { command: "service.call", args: { service: "ragdoll-tuning", method: "configureReason", arguments: ["high-fall", {
        linearDamping: 0.018, angularDamping: 0.016, headAngularDamping: 0.024, friction: 0.42,
        x: 2.25, y: 0.16, z: 1.65, speedMode: "vertical",
        scaleStartKph: 30, scaleSpanKph: 90, scaleMaxExtra: 1.15
      }] } },
      { command: "entity.spawn", args: { spec: {
        id: "fall-b-136", kind: "human", name: "Fall B", bot: false,
        team: 13602, health: 400, weapons: [], position: { x: 50, y: 30, z: 0, angle: 0 }
      } } },
      { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["fall-b-136", { x: 50, y: 30, z: 0, angle: 0 }] } },
      { command: "game.step", args: { dt: 0.02, steps: 70, now: START + 1600 } },
      { command: "service.call", args: { service: "ragdoll", method: "stateFor", arguments: ["fall-b-136"] } },
      { command: "service.call", args: { service: "ragdoll-tuning", method: "stateFor", arguments: ["fall-b-136"] } },

      { command: "service.call", args: { service: "ragdoll-tuning", method: "configureReason", arguments: ["death", {
        linearDamping: 0.035, angularDamping: 0.055, headAngularDamping: 0.08, friction: 0.52,
        x: 0.55, y: 0.10, z: 0.42, speedMode: "none", scaleMaxExtra: 0
      }] } },
      { command: "entity.spawn", args: { spec: {
        id: "death-a-136", kind: "human", name: "Death A", bot: false,
        team: 13603, health: 100, weapons: [], position: { x: 100, y: 0, z: 0, angle: 0 }
      } } },
      { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["death-a-136", { x: 100, y: 0, z: 0, angle: 0 }] } },
      { command: "game.step", args: { dt: 0.02, steps: 2, now: START + 3200 } },
      { command: "service.call", args: { service: "health", method: "applyDamage", arguments: ["death-a-136", 150, { now: START + 3240 }] } },
      { command: "game.step", args: { dt: 0.02, steps: 20, now: START + 3260 } },
      { command: "service.call", args: { service: "ragdoll", method: "stateFor", arguments: ["death-a-136"] } },
      { command: "service.call", args: { service: "ragdoll-tuning", method: "stateFor", arguments: ["death-a-136"] } },

      { command: "service.call", args: { service: "ragdoll-tuning", method: "configureReason", arguments: ["death", {
        linearDamping: 0.03, angularDamping: 0.045, headAngularDamping: 0.07, friction: 0.50,
        x: 0.82, y: 0.08, z: 0.62, speedMode: "none", scaleMaxExtra: 0
      }] } },
      { command: "entity.spawn", args: { spec: {
        id: "death-b-136", kind: "human", name: "Death B", bot: false,
        team: 13604, health: 100, weapons: [], position: { x: 120, y: 0, z: 0, angle: 0 }
      } } },
      { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["death-b-136", { x: 120, y: 0, z: 0, angle: 0 }] } },
      { command: "game.step", args: { dt: 0.02, steps: 2, now: START + 4000 } },
      { command: "service.call", args: { service: "health", method: "applyDamage", arguments: ["death-b-136", 150, { now: START + 4040 }] } },
      { command: "game.step", args: { dt: 0.02, steps: 20, now: START + 4060 } },
      { command: "service.call", args: { service: "ragdoll", method: "stateFor", arguments: ["death-b-136"] } },
      { command: "service.call", args: { service: "ragdoll-tuning", method: "stateFor", arguments: ["death-b-136"] } },

      { command: "service.call", args: { service: "ragdoll-stability", method: "assertStable", arguments: [{ maxSpread: 8, maxSpeed: 120 }] } }
    ]
  },
  requestedAt: "2026-08-28T20:08:00Z"
});
