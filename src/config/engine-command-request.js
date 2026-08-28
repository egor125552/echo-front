const START = 2000013800000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 138,
  mode: "battle-royale",
  room: "engine-lab-ragdoll-parkour-138",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [START] } },

      { command: "service.call", args: { service: "ragdoll-tuning", method: "configureReason", arguments: ["parkour-pose", {
        linearDamping: 0.02, angularDamping: 0.02, headAngularDamping: 0.03, friction: 0.38,
        x: 0.70, y: 0.12, z: 0.54, speedMode: "none", scaleMaxExtra: 0
      }] } },
      { command: "entity.spawn", args: { spec: {
        id: "parkour-a-138", kind: "human", name: "Parkour A", bot: false,
        team: 13801, health: 400, weapons: [], position: { x: 300, y: 0, z: 300, angle: 0 }
      } } },
      { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["parkour-a-138", { x: 300, y: 0, z: 300, angle: 0 }] } },
      { command: "game.step", args: { dt: 0.02, steps: 1, now: START + 20 } },
      { command: "service.call", args: { service: "jump", method: "request", arguments: ["parkour-a-138"] } },
      { command: "game.step", args: { dt: 0.02, steps: 3, now: START + 40 } },
      { command: "service.call", args: { service: "parkour-ragdoll", method: "enterPose", arguments: ["parkour-a-138", { strafe: 1, sprint: true }] } },
      { command: "game.step", args: { dt: 0.02, steps: 60, now: START + 100 } },
      { command: "service.call", args: { service: "ragdoll", method: "stateFor", arguments: ["parkour-a-138"] } },
      { command: "service.call", args: { service: "ragdoll-tuning", method: "stateFor", arguments: ["parkour-a-138"] } },

      { command: "service.call", args: { service: "ragdoll-tuning", method: "configureReason", arguments: ["parkour-pose", {
        linearDamping: 0.018, angularDamping: 0.018, headAngularDamping: 0.027, friction: 0.40,
        x: 0.12, y: 0.02, z: 0.08, speedMode: "none", scaleMaxExtra: 0
      }] } },
      { command: "entity.spawn", args: { spec: {
        id: "parkour-b-138", kind: "human", name: "Parkour B", bot: false,
        team: 13802, health: 400, weapons: [], position: { x: 360, y: 0, z: 300, angle: 0 }
      } } },
      { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["parkour-b-138", { x: 360, y: 0, z: 300, angle: 0 }] } },
      { command: "game.step", args: { dt: 0.02, steps: 1, now: START + 1600 } },
      { command: "service.call", args: { service: "jump", method: "request", arguments: ["parkour-b-138"] } },
      { command: "game.step", args: { dt: 0.02, steps: 3, now: START + 1620 } },
      { command: "service.call", args: { service: "parkour-ragdoll", method: "enterPose", arguments: ["parkour-b-138", { strafe: 1, sprint: true }] } },
      { command: "game.step", args: { dt: 0.02, steps: 60, now: START + 1680 } },
      { command: "service.call", args: { service: "ragdoll", method: "stateFor", arguments: ["parkour-b-138"] } },
      { command: "service.call", args: { service: "ragdoll-tuning", method: "stateFor", arguments: ["parkour-b-138"] } },

      { command: "service.call", args: { service: "ragdoll-stability", method: "assertStable", arguments: [{ maxSpread: 8, maxSpeed: 100 }] } }
    ]
  },
  requestedAt: "2026-08-28T20:18:00Z"
});
