const START = 2000014200000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 142,
  mode: "battle-royale",
  room: "engine-lab-ragdoll-vehicles-142",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [START] } },

      { command: "service.call", args: { service: "ragdoll-tuning", method: "configureReason", arguments: ["vehicle-eject", {
        linearDamping: 0.018, angularDamping: 0.025, headAngularDamping: 0.04, friction: 0.42,
        x: 1.8, y: 0.06, z: 1.3, speedMode: "horizontal",
        scaleStartKph: 50, scaleSpanKph: 160, scaleMaxExtra: 1.0
      }] } },
      { command: "entity.spawn", args: { spec: {
        id: "eject-final-142", kind: "human", name: "Eject Final", bot: false,
        team: 14201, health: 400, weapons: [], position: { x: -87.6, y: 1.1, z: 520, angle: 0 }
      } } },
      { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["eject-final-142", { x: -87.6, y: 1.1, z: 520, angle: 0 }] } },
      { command: "game.step", args: { dt: 0.02, steps: 2, now: START + 20 } },
      { command: "service.call", args: { service: "vehicles", method: "enter", arguments: ["eject-final-142", START + 60, "br-supercar-1"] } },
      { command: "service.call", args: { service: "vehicles", method: "setInput", arguments: ["eject-final-142", { forward: 1, fireHeld: true }] } },
      { command: "game.step", args: { dt: 0.02, steps: 300, now: START + 80 } },
      { command: "service.call", args: { service: "vehicles", method: "stateFor", arguments: ["br-supercar-1"] } },
      { command: "service.call", args: { service: "ragdoll", method: "ejectFromVehicle", arguments: ["eject-final-142", { strafe: 1 }, START + 6080] } },
      { command: "game.step", args: { dt: 0.02, steps: 60, now: START + 6100 } },
      { command: "service.call", args: { service: "ragdoll", method: "stateFor", arguments: ["eject-final-142"] } },
      { command: "service.call", args: { service: "ragdoll-tuning", method: "stateFor", arguments: ["eject-final-142"] } },

      { command: "service.call", args: { service: "ragdoll-tuning", method: "configureReason", arguments: ["vehicle-hit", {
        linearDamping: 0.02, angularDamping: 0.028, headAngularDamping: 0.045, friction: 0.50,
        x: 1.8, y: 0.08, z: 1.3, speedMode: "total",
        scaleStartKph: 20, scaleSpanKph: 100, scaleMaxExtra: 0.9
      }] } },
      { command: "entity.spawn", args: { spec: {
        id: "driver-hit-142", kind: "human", name: "Hit Driver", bot: false,
        team: 14202, health: 400, weapons: [], position: { x: 432.4, y: 1.1, z: -650, angle: 0 }
      } } },
      { command: "entity.spawn", args: { spec: {
        id: "victim-hit-142", kind: "human", name: "Hit Victim", bot: false,
        team: 14203, health: 400, weapons: [], position: { x: 430, y: 0, z: -700, angle: 0 }
      } } },
      { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["driver-hit-142", { x: 432.4, y: 1.1, z: -650, angle: 0 }] } },
      { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["victim-hit-142", { x: 430, y: 0, z: -700, angle: 0 }] } },
      { command: "game.step", args: { dt: 0.02, steps: 2, now: START + 8000 } },
      { command: "service.call", args: { service: "vehicles", method: "enter", arguments: ["driver-hit-142", START + 8040, "br-supercar-2"] } },
      { command: "service.call", args: { service: "vehicles", method: "setInput", arguments: ["driver-hit-142", { forward: 1 }] } },
      { command: "game.step", args: { dt: 0.02, steps: 160, now: START + 8060 } },
      { command: "service.call", args: { service: "vehicles", method: "stateFor", arguments: ["br-supercar-2"] } },
      { command: "service.call", args: { service: "ragdoll", method: "stateFor", arguments: ["victim-hit-142"] } },
      { command: "service.call", args: { service: "ragdoll-tuning", method: "stateFor", arguments: ["victim-hit-142"] } },
      { command: "service.call", args: { service: "ragdoll-stability", method: "assertStable", arguments: [{ maxSpread: 8, maxSpeed: 140 }] } }
    ]
  },
  requestedAt: "2026-08-28T20:40:00Z"
});
