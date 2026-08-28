export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 91,
  mode: "battle-royale",
  room: "engine-lab-ragdoll-stability-91",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [2000009100000] } },
      { command: "service.call", args: { service: "ragdoll-stability", method: "resetDiagnostics", arguments: [] } },

      // First: the real gameplay path. Nitro the real Rapier jeep, then eject.
      { command: "entity.spawn", args: { spec: {
        id: "stability-driver-91",
        kind: "test-human",
        name: "Ragdoll Stability Driver",
        bot: false,
        team: 99910,
        health: 200,
        weapons: [],
        position: { x: 94, y: 0, z: 24, angle: 0 }
      } } },
      { command: "service.call", args: { service: "vehicles", method: "enter", arguments: ["stability-driver-91", 2000009100100] } },
      { command: "service.call", args: { service: "vehicles", method: "setInput", arguments: [
        "stability-driver-91", { forward: 0, strafe: 0, sprint: false, fireHeld: false }
      ] } },
      { command: "service.call", args: { service: "vehicles", method: "setInput", arguments: [
        "stability-driver-91", { forward: 1, strafe: 0, sprint: false, fireHeld: true }
      ] } },
      { command: "game.step", args: { dt: 0.05, steps: 70, now: 2000009100200 } },
      { command: "service.call", args: { service: "vehicles", method: "summary", arguments: [] } },
      { command: "service.call", args: { service: "ragdoll", method: "ejectFromVehicle", arguments: [
        "stability-driver-91", { forward: 1, strafe: -1, sprint: false }, 2000009103750
      ] } },
      { command: "service.call", args: { service: "ragdoll-stability", method: "summary", arguments: [] } },
      { command: "game.step", args: { dt: 0.05, steps: 240, now: 2000009103800 } },
      { command: "service.call", args: { service: "ragdoll-stability", method: "summary", arguments: [] } },
      { command: "service.call", args: { service: "ragdoll-stability", method: "assertStable", arguments: [
        { maxSpread: 8, maxSpeed: 180 }
      ] } },

      // Then three independent high-energy ragdolls. They use the same real
      // Rapier bodies/joints and land under gravity for another long solver run.
      { command: "entity.spawn", args: { spec: {
        id: "stability-a-91", kind: "test-human", name: "Stability A", bot: false,
        team: 99911, health: 200, weapons: [], position: { x: -120, y: 0, z: -80, angle: 0 }
      } } },
      { command: "service.call", args: { service: "ragdoll", method: "activate", arguments: [
        "stability-a-91", { reason: "stress", position: { x: -120, y: 45, z: -80 }, velocity: { x: 28, y: 2, z: 6 } }, 2000009116000
      ] } },
      { command: "service.call", args: { service: "ragdoll-stability", method: "applyVelocityDeltaToLatest", arguments: [
        { x: 5, y: 18, z: 0 }, 16
      ] } },

      { command: "entity.spawn", args: { spec: {
        id: "stability-b-91", kind: "test-human", name: "Stability B", bot: false,
        team: 99912, health: 200, weapons: [], position: { x: -40, y: 0, z: -160, angle: 0.7 }
      } } },
      { command: "service.call", args: { service: "ragdoll", method: "activate", arguments: [
        "stability-b-91", { reason: "stress", position: { x: -40, y: 55, z: -160 }, angle: 0.7, velocity: { x: -20, y: -4, z: 20 } }, 2000009116100
      ] } },
      { command: "service.call", args: { service: "ragdoll-stability", method: "applyVelocityDeltaToLatest", arguments: [
        { x: -4, y: 18, z: 3 }, 16
      ] } },

      { command: "entity.spawn", args: { spec: {
        id: "stability-c-91", kind: "test-human", name: "Stability C", bot: false,
        team: 99913, health: 200, weapons: [], position: { x: 120, y: 0, z: 100, angle: -0.5 }
      } } },
      { command: "service.call", args: { service: "ragdoll", method: "activate", arguments: [
        "stability-c-91", { reason: "stress", position: { x: 120, y: 50, z: 100 }, angle: -0.5, velocity: { x: 25, y: -8, z: -16 } }, 2000009116200
      ] } },
      { command: "service.call", args: { service: "ragdoll-stability", method: "applyVelocityDeltaToLatest", arguments: [
        { x: 5, y: 18, z: -2 }, 16
      ] } },

      { command: "service.call", args: { service: "ragdoll-stability", method: "summary", arguments: [] } },
      { command: "game.step", args: { dt: 0.05, steps: 300, now: 2000009116300 } },
      { command: "service.call", args: { service: "ragdoll-stability", method: "summary", arguments: [] } },
      { command: "service.call", args: { service: "ragdoll-stability", method: "assertStable", arguments: [
        { maxSpread: 8, maxSpeed: 180 }
      ] } }
    ]
  },
  requestedAt: "2026-08-28T05:55:00Z"
});
