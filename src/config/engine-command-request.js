const START = 2000013500000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 135,
  mode: "battle-royale",
  room: "engine-lab-ragdoll-supercar-135",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [START] } },

      { command: "service.call", args: { service: "ragdoll-tuning", method: "configureReason", arguments: ["vehicle-eject", {
        linearDamping: 0.02, angularDamping: 0.02, headAngularDamping: 0.03, friction: 0.38,
        x: 4.8, y: 0.55, z: 3.8,
        speedMode: "horizontal", scaleStartKph: 10, scaleSpanKph: 70, scaleMaxExtra: 2.5
      }] } },
      { command: "entity.spawn", args: { spec: {
        id: "ragdoll-a-135", kind: "human", name: "Ragdoll A", bot: false,
        team: 13501, health: 400, weapons: [], position: { x: -87.6, y: 1.1, z: 520, angle: 0 }
      } } },
      { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["ragdoll-a-135", { x: -87.6, y: 1.1, z: 520, angle: 0 }] } },
      { command: "game.step", args: { dt: 0.02, steps: 2, now: START + 20 } },
      { command: "service.call", args: { service: "vehicles", method: "enter", arguments: ["ragdoll-a-135", START + 60, "br-supercar-1"] } },
      { command: "service.call", args: { service: "vehicles", method: "setInput", arguments: ["ragdoll-a-135", { forward: 1, fireHeld: true }] } },
      { command: "game.step", args: { dt: 0.02, steps: 300, now: START + 80 } },
      { command: "service.call", args: { service: "vehicles", method: "stateFor", arguments: ["br-supercar-1"] } },
      { command: "service.call", args: { service: "ragdoll", method: "ejectFromVehicle", arguments: ["ragdoll-a-135", { strafe: 1 }, START + 6080] } },
      { command: "game.step", args: { dt: 0.02, steps: 60, now: START + 6100 } },
      { command: "service.call", args: { service: "ragdoll", method: "stateFor", arguments: ["ragdoll-a-135"] } },
      { command: "service.call", args: { service: "ragdoll-tuning", method: "stateFor", arguments: ["ragdoll-a-135"] } },
      { command: "service.call", args: { service: "ragdoll-stability", method: "assertStable", arguments: [{ maxSpread: 8, maxSpeed: 140 }] } },

      { command: "service.call", args: { service: "ragdoll-tuning", method: "configureReason", arguments: ["vehicle-eject", {
        linearDamping: 0.015, angularDamping: 0.014, headAngularDamping: 0.022, friction: 0.34,
        x: 3.6, y: 0.24, z: 2.7,
        speedMode: "horizontal", scaleStartKph: 25, scaleSpanKph: 95, scaleMaxExtra: 1.65
      }] } },
      { command: "entity.spawn", args: { spec: {
        id: "ragdoll-b-135", kind: "human", name: "Ragdoll B", bot: false,
        team: 13502, health: 400, weapons: [], position: { x: 432.4, y: 1.1, z: -650, angle: 0 }
      } } },
      { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["ragdoll-b-135", { x: 432.4, y: 1.1, z: -650, angle: 0 }] } },
      { command: "game.step", args: { dt: 0.02, steps: 2, now: START + 8000 } },
      { command: "service.call", args: { service: "vehicles", method: "enter", arguments: ["ragdoll-b-135", START + 8040, "br-supercar-2"] } },
      { command: "service.call", args: { service: "vehicles", method: "setInput", arguments: ["ragdoll-b-135", { forward: 1, fireHeld: true }] } },
      { command: "game.step", args: { dt: 0.02, steps: 300, now: START + 8060 } },
      { command: "service.call", args: { service: "vehicles", method: "stateFor", arguments: ["br-supercar-2"] } },
      { command: "service.call", args: { service: "ragdoll", method: "ejectFromVehicle", arguments: ["ragdoll-b-135", { strafe: 1 }, START + 14060] } },
      { command: "game.step", args: { dt: 0.02, steps: 60, now: START + 14080 } },
      { command: "service.call", args: { service: "ragdoll", method: "stateFor", arguments: ["ragdoll-b-135"] } },
      { command: "service.call", args: { service: "ragdoll-tuning", method: "stateFor", arguments: ["ragdoll-b-135"] } },
      { command: "service.call", args: { service: "ragdoll-stability", method: "assertStable", arguments: [{ maxSpread: 8, maxSpeed: 140 }] } }
    ]
  },
  requestedAt: "2026-08-28T20:03:00Z"
});
