export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 92,
  mode: "battle-royale",
  room: "engine-lab-ragdoll-damage-92",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [2000009200000] } },

      // First validate the intended curve directly. Ordinary strong contacts live
      // in the requested 5-15 HP band; only truly severe impacts escalate above it.
      { command: "service.call", args: { service: "ragdoll-damage-model", method: "estimate", arguments: [{ severity: 4.0 }] } },
      { command: "service.call", args: { service: "ragdoll-damage-model", method: "estimate", arguments: [{ severity: 5.0 }] } },
      { command: "service.call", args: { service: "ragdoll-damage-model", method: "estimate", arguments: [{ severity: 8.0 }] } },
      { command: "service.call", args: { service: "ragdoll-damage-model", method: "estimate", arguments: [{ severity: 12.0 }] } },
      { command: "service.call", args: { service: "ragdoll-damage-model", method: "estimate", arguments: [{ severity: 13.9 }] } },
      { command: "service.call", args: { service: "ragdoll-damage-model", method: "estimate", arguments: [{ severity: 18.0 }] } },
      { command: "service.call", args: { service: "ragdoll-damage-model", method: "estimate", arguments: [{ severity: 25.0 }] } },
      { command: "service.call", args: { service: "ragdoll-damage-model", method: "estimate", arguments: [{ severity: 35.0 }] } },
      { command: "service.call", args: { service: "ragdoll-damage-model", method: "estimate", arguments: [{ severity: 45.0 }] } },

      // Then use a real 20 kg Rapier ragdoll and a real ground collision. The body
      // starts just above the forest floor with a hard downward velocity so the
      // damage must travel through ragdoll:impact -> health.applyDamage.
      { command: "entity.spawn", args: { spec: {
        id: "damage-probe-92",
        kind: "test-human",
        name: "Ragdoll Damage Probe",
        bot: false,
        team: 99920,
        health: 200,
        weapons: [],
        position: { x: -80, y: 0, z: -80, angle: 0 }
      } } },
      { command: "service.call", args: { service: "ragdoll", method: "activate", arguments: [
        "damage-probe-92",
        { reason: "damage-test", position: { x: -80, y: 2.0, z: -80 }, velocity: { x: 2, y: -18, z: 0 } },
        2000009200100
      ] } },
      { command: "game.step", args: { dt: 0.05, steps: 20, now: 2000009200150 } },
      { command: "service.call", args: { service: "ragdoll", method: "stateFor", arguments: ["damage-probe-92"] } },
      { command: "service.call", args: { service: "ragdoll-damage-model", method: "summary", arguments: [] } },
      { command: "entity.inspect", args: { entityId: "damage-probe-92" } },
      { command: "service.call", args: { service: "ragdoll-stability", method: "assertStable", arguments: [
        { maxSpread: 8, maxSpeed: 180 }
      ] } }
    ]
  },
  requestedAt: "2026-08-28T06:06:00Z"
});
