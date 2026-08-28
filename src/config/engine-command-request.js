const START = 2000014000000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 140,
  mode: "battle-royale",
  room: "engine-lab-ragdoll-coherent-fall-140",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [START] } },

      { command: "service.call", args: { service: "ragdoll-tuning", method: "configureReason", arguments: ["high-fall", {
        linearDamping: 0.02, angularDamping: 0.025, headAngularDamping: 0.04, friction: 0.44,
        x: 1.7, y: 0.08, z: 1.3, speedMode: "vertical",
        scaleStartKph: 35, scaleSpanKph: 110, scaleMaxExtra: 0.9
      }] } },
      { command: "entity.spawn", args: { spec: {
        id: "fall-a-140", kind: "human", name: "Fall A", bot: false,
        team: 14001, health: 400, weapons: [], position: { x: 0, y: 0, z: 250, angle: 0 }
      } } },
      { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["fall-a-140", { x: 0, y: 0, z: 250, angle: 0 }] } },
      { command: "game.step", args: { dt: 0.02, steps: 4, now: START + 20 } },
      { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["fall-a-140", { x: 0, y: 30, z: 250, angle: 0 }] } },
      { command: "game.step", args: { dt: 0.02, steps: 95, now: START + 120 } },
      { command: "service.call", args: { service: "ragdoll", method: "stateFor", arguments: ["fall-a-140"] } },
      { command: "service.call", args: { service: "ragdoll-tuning", method: "stateFor", arguments: ["fall-a-140"] } },

      { command: "service.call", args: { service: "ragdoll-tuning", method: "configureReason", arguments: ["high-fall", {
        linearDamping: 0.018, angularDamping: 0.022, headAngularDamping: 0.035, friction: 0.46,
        x: 2.4, y: 0.08, z: 1.8, speedMode: "vertical",
        scaleStartKph: 35, scaleSpanKph: 115, scaleMaxExtra: 0.75
      }] } },
      { command: "entity.spawn", args: { spec: {
        id: "fall-b-140", kind: "human", name: "Fall B", bot: false,
        team: 14002, health: 400, weapons: [], position: { x: 50, y: 0, z: 250, angle: 0 }
      } } },
      { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["fall-b-140", { x: 50, y: 0, z: 250, angle: 0 }] } },
      { command: "game.step", args: { dt: 0.02, steps: 4, now: START + 2200 } },
      { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["fall-b-140", { x: 50, y: 30, z: 250, angle: 0 }] } },
      { command: "game.step", args: { dt: 0.02, steps: 95, now: START + 2300 } },
      { command: "service.call", args: { service: "ragdoll", method: "stateFor", arguments: ["fall-b-140"] } },
      { command: "service.call", args: { service: "ragdoll-tuning", method: "stateFor", arguments: ["fall-b-140"] } },

      { command: "service.call", args: { service: "ragdoll-stability", method: "assertStable", arguments: [{ maxSpread: 8, maxSpeed: 120 }] } }
    ]
  },
  requestedAt: "2026-08-28T20:31:00Z"
});
