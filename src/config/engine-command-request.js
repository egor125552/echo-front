export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 90,
  mode: "battle-royale",
  room: "engine-lab-ragdoll-20kg-90",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [2000009000000] } },
      { command: "entity.spawn", args: { spec: {
        id: "ragdoll-20kg-driver-90",
        kind: "test-human",
        name: "20 kg Ragdoll Throw Probe",
        bot: false,
        team: 99900,
        health: 200,
        weapons: [],
        position: { x: 94, y: 0, z: 24, angle: 0 }
      } } },
      { command: "service.call", args: { service: "vehicles", method: "enter", arguments: ["ragdoll-20kg-driver-90", 2000009000100] } },

      // Clear inherited handbrake state, then use the real four-wheel Rapier nitro.
      { command: "service.call", args: { service: "vehicles", method: "setInput", arguments: [
        "ragdoll-20kg-driver-90", { forward: 0, strafe: 0, sprint: false, fireHeld: false }
      ] } },
      { command: "service.call", args: { service: "vehicles", method: "setInput", arguments: [
        "ragdoll-20kg-driver-90", { forward: 1, strafe: 0, sprint: false, fireHeld: true }
      ] } },
      { command: "game.step", args: { dt: 0.05, steps: 50, now: 2000009000200 } },
      { command: "service.call", args: { service: "vehicles", method: "summary", arguments: [] } },
      { command: "service.call", args: { service: "ragdoll", method: "summary", arguments: [] } },

      // Jump out at speed. This uses the real vehicle velocity plus the existing
      // side/up impulse. With a 20 kg proportional ragdoll the same impulse should
      // produce a much larger velocity change than the former 69.4 kg body.
      { command: "service.call", args: { service: "ragdoll", method: "ejectFromVehicle", arguments: [
        "ragdoll-20kg-driver-90", { forward: 1, strafe: -1, sprint: false }, 2000009002750
      ] } },
      { command: "game.step", args: { dt: 0.05, steps: 2, now: 2000009002800 } },
      { command: "service.call", args: { service: "ragdoll", method: "stateFor", arguments: ["ragdoll-20kg-driver-90"] } },
      { command: "service.call", args: { service: "ragdoll", method: "summary", arguments: [] } },

      // Keep solving long enough to prove the lighter body remains a real Rapier
      // ragdoll rather than disappearing or becoming non-finite immediately.
      { command: "game.step", args: { dt: 0.05, steps: 16, now: 2000009002950 } },
      { command: "service.call", args: { service: "ragdoll", method: "stateFor", arguments: ["ragdoll-20kg-driver-90"] } },
      { command: "service.call", args: { service: "ragdoll", method: "summary", arguments: [] } },
      { command: "entity.inspect", args: { entityId: "ragdoll-20kg-driver-90" } }
    ]
  },
  requestedAt: "2026-08-27T21:58:00Z"
});
