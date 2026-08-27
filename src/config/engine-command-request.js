export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 89,
  mode: "battle-royale",
  room: "engine-lab-nitro-parachute-89",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [2000008900000] } },

      { command: "entity.spawn", args: { spec: {
        id: "nitro-driver-89",
        kind: "test-human",
        name: "Nitro Driver Probe",
        bot: false,
        team: 99890,
        health: 200,
        weapons: [],
        position: { x: 94, y: 0, z: 24, angle: 0 }
      } } },
      { command: "service.call", args: { service: "vehicles", method: "enter", arguments: ["nitro-driver-89", 2000008900100] } },
      { command: "service.call", args: { service: "vehicles", method: "setInput", arguments: [
        "nitro-driver-89", { forward: 0, strafe: 0, sprint: false, fireHeld: false }
      ] } },

      // Hold X together with full throttle. Nitro must accelerate through the real
      // Rapier wheel controller and remain active during its 2.5 second charge.
      { command: "service.call", args: { service: "vehicles", method: "setInput", arguments: [
        "nitro-driver-89", { forward: 1, strafe: 0, sprint: false, fireHeld: true }
      ] } },
      { command: "game.step", args: { dt: 0.05, steps: 20, now: 2000008900200 } },
      { command: "service.call", args: { service: "vehicles", method: "summary", arguments: [] } },

      // Keep holding past the charge. The boost must stop and enter cooldown.
      { command: "game.step", args: { dt: 0.05, steps: 40, now: 2000008901250 } },
      { command: "service.call", args: { service: "vehicles", method: "summary", arguments: [] } },

      // Release X and park while the ten-second recharge elapses.
      { command: "service.call", args: { service: "vehicles", method: "setInput", arguments: [
        "nitro-driver-89", { forward: 0, strafe: 0, sprint: true, fireHeld: false }
      ] } },
      { command: "game.step", args: { dt: 0.05, steps: 205, now: 2000008903300 } },
      { command: "service.call", args: { service: "vehicles", method: "summary", arguments: [] } },

      // The next X press after recharge must start a fresh nitro burst.
      { command: "service.call", args: { service: "vehicles", method: "setInput", arguments: [
        "nitro-driver-89", { forward: 1, strafe: 0, sprint: false, fireHeld: true }
      ] } },
      { command: "game.step", args: { dt: 0.05, steps: 8, now: 2000008913600 } },
      { command: "service.call", args: { service: "vehicles", method: "summary", arguments: [] } },

      // Use a real human for the existing parachute service. The active BR spawn
      // launches it normally; then an explicit real Rapier ragdoll replaces that
      // character in mid-air before Space is routed through match-api input.
      { command: "entity.spawn", args: { spec: {
        id: "ragdoll-parachute-89",
        kind: "human",
        name: "Ragdoll Parachute Probe",
        bot: false,
        team: 99891,
        health: 200,
        weapons: [],
        position: { x: -50, y: 0, z: -50, angle: 0.4 }
      } } },
      { command: "service.call", args: { service: "ragdoll", method: "activate", arguments: [
        "ragdoll-parachute-89",
        {
          reason: "engine-control-parachute-handoff",
          position: { x: -50, y: 250, z: -50 },
          angle: 0.4,
          velocity: { x: 4, y: -30, z: 2 }
        },
        2000008914100
      ] } },
      { command: "game.step", args: { dt: 0.05, steps: 2, now: 2000008914150 } },
      { command: "service.call", args: { service: "ragdoll", method: "stateFor", arguments: ["ragdoll-parachute-89"] } },

      // Space arrives as parachutePressed from the actual client parachute input.
      { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: [
        "ragdoll-parachute-89", { parachutePressed: true }, 2000008914300
      ] } },
      { command: "service.call", args: { service: "ragdoll", method: "stateFor", arguments: ["ragdoll-parachute-89"] } },
      { command: "service.call", args: { service: "parachute", method: "stateFor", arguments: ["ragdoll-parachute-89"] } },
      { command: "service.call", args: { service: "ragdoll", method: "summary", arguments: [] } },
      { command: "entity.inspect", args: { entityId: "ragdoll-parachute-89" } },
      { command: "game.step", args: { dt: 0.05, steps: 24, now: 2000008914350 } },
      { command: "service.call", args: { service: "parachute", method: "stateFor", arguments: ["ragdoll-parachute-89"] } },
      { command: "entity.inspect", args: { entityId: "ragdoll-parachute-89" } }
    ]
  },
  requestedAt: "2026-08-27T21:15:00Z"
});
