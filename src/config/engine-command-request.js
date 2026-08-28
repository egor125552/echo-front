const START = 2000014100000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 141,
  mode: "battle-royale",
  room: "engine-lab-ragdoll-ground-contexts-141",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [START] } },

      { command: "service.call", args: { service: "ragdoll-tuning", method: "configureReason", arguments: ["parkour-pose", {
        linearDamping: 0.018, angularDamping: 0.018, headAngularDamping: 0.027, friction: 0.40,
        x: 0, y: 0, z: 0, speedMode: "none", scaleMaxExtra: 0
      }] } },
      { command: "entity.spawn", args: { spec: {
        id: "parkour-final-141", kind: "human", name: "Parkour Final", bot: false,
        team: 14101, health: 400, weapons: [], position: { x: 300, y: 0, z: 300, angle: 0 }
      } } },
      { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["parkour-final-141", { x: 300, y: 0, z: 300, angle: 0 }] } },
      { command: "game.step", args: { dt: 0.02, steps: 1, now: START + 20 } },
      { command: "service.call", args: { service: "jump", method: "request", arguments: ["parkour-final-141"] } },
      { command: "game.step", args: { dt: 0.02, steps: 3, now: START + 40 } },
      { command: "service.call", args: { service: "parkour-ragdoll", method: "enterPose", arguments: ["parkour-final-141", { strafe: 1, sprint: true }] } },
      { command: "game.step", args: { dt: 0.02, steps: 60, now: START + 100 } },
      { command: "service.call", args: { service: "ragdoll", method: "stateFor", arguments: ["parkour-final-141"] } },
      { command: "service.call", args: { service: "ragdoll-tuning", method: "stateFor", arguments: ["parkour-final-141"] } },

      { command: "service.call", args: { service: "ragdoll-tuning", method: "configureReason", arguments: ["death", {
        linearDamping: 0.04, angularDamping: 0.08, headAngularDamping: 0.11, friction: 0.58,
        x: 0.75, y: 0.05, z: 0.55, speedMode: "none", scaleMaxExtra: 0
      }] } },
      { command: "entity.spawn", args: { spec: {
        id: "death-final-141", kind: "human", name: "Death Final", bot: false,
        team: 14102, health: 100, weapons: [], position: { x: 120, y: 0, z: 120, angle: 0 }
      } } },
      { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["death-final-141", { x: 120, y: 0, z: 120, angle: 0 }] } },
      { command: "game.step", args: { dt: 0.02, steps: 2, now: START + 1600 } },
      { command: "service.call", args: { service: "health", method: "applyDamage", arguments: ["death-final-141", 150, { now: START + 1640 }] } },
      { command: "game.step", args: { dt: 0.02, steps: 30, now: START + 1660 } },
      { command: "service.call", args: { service: "ragdoll", method: "stateFor", arguments: ["death-final-141"] } },
      { command: "service.call", args: { service: "ragdoll-tuning", method: "stateFor", arguments: ["death-final-141"] } },

      { command: "service.call", args: { service: "ragdoll-tuning", method: "configureReason", arguments: ["building-impact", {
        linearDamping: 0.024, angularDamping: 0.03, headAngularDamping: 0.045, friction: 0.50,
        x: 1.9, y: 0.08, z: 1.35, speedMode: "total",
        scaleStartKph: 12, scaleSpanKph: 45, scaleMaxExtra: 0.70
      }] } },
      { command: "entity.spawn", args: { spec: {
        id: "building-final-141", kind: "human", name: "Building Final", bot: false,
        team: 14103, health: 400, weapons: [], position: { x: 43.2, y: 0, z: 0, angle: 0 }
      } } },
      { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["building-final-141", { x: 43.2, y: 0, z: 0, angle: 0 }] } },
      { command: "game.step", args: { dt: 0.02, steps: 2, now: START + 2500 } },
      { command: "service.call", args: { service: "movement", method: "setInput", arguments: ["building-final-141", { strafe: 1, sprint: true }] } },
      { command: "game.step", args: { dt: 0.02, steps: 20, now: START + 2540 } },
      { command: "service.call", args: { service: "ragdoll", method: "stateFor", arguments: ["building-final-141"] } },
      { command: "service.call", args: { service: "ragdoll-tuning", method: "stateFor", arguments: ["building-final-141"] } },
      { command: "service.call", args: { service: "parkour-ragdoll", method: "summary", arguments: [] } },

      { command: "service.call", args: { service: "ragdoll-stability", method: "assertStable", arguments: [{ maxSpread: 8, maxSpeed: 100 }] } }
    ]
  },
  requestedAt: "2026-08-28T20:34:00Z"
});
