export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 87,
  mode: "battle-royale",
  room: "engine-lab-ragdoll-recovery-87",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [2000008700000] } },

      { command: "entity.spawn", args: { spec: {
        id: "ragdoll-fall-87",
        kind: "test-human",
        name: "Ground Impact Probe",
        bot: false,
        team: 99871,
        health: 200,
        weapons: [],
        position: { x: 12, y: 4, z: 8, angle: 0.25 }
      } } },
      { command: "service.call", args: { service: "ragdoll", method: "activate", arguments: [
        "ragdoll-fall-87",
        {
          reason: "engine-control-ground-impact",
          position: { x: 12, y: 4, z: 8 },
          angle: 0.25,
          velocity: { x: 1.5, y: -4, z: -0.4 },
          impulse: { x: 0.35, y: 0.15, z: 0.55 }
        },
        2000008700050
      ] } },
      { command: "service.call", args: { service: "ragdoll", method: "setInput", arguments: [
        "ragdoll-fall-87",
        { forward: 1, strafe: 0.65, turn: 0.25, sprint: true }
      ] } },
      { command: "game.step", args: { dt: 0.05, steps: 12, now: 2000008700100 } },
      { command: "service.call", args: { service: "ragdoll", method: "stateFor", arguments: ["ragdoll-fall-87"] } },
      { command: "service.call", args: { service: "ragdoll", method: "setInput", arguments: [
        "ragdoll-fall-87",
        { forward: 0, strafe: 0, turn: 0, sprint: false }
      ] } },
      { command: "game.step", args: { dt: 0.05, steps: 80, now: 2000008700700 } },
      { command: "service.call", args: { service: "ragdoll", method: "stateFor", arguments: ["ragdoll-fall-87"] } },
      { command: "entity.inspect", args: { entityId: "ragdoll-fall-87" } },
      { command: "service.call", args: { service: "ragdoll", method: "summary", arguments: [] } },

      { command: "entity.spawn", args: { spec: {
        id: "ragdoll-driver-87",
        kind: "test-human",
        name: "Vehicle Eject Probe",
        bot: false,
        team: 99872,
        health: 200,
        weapons: [],
        position: { x: 94, y: 0, z: 24, angle: 0 }
      } } },
      { command: "service.call", args: { service: "vehicles", method: "enter", arguments: ["ragdoll-driver-87", 2000008704800] } },
      { command: "service.call", args: { service: "vehicles", method: "setInput", arguments: [
        "ragdoll-driver-87",
        { forward: 1, strafe: 0, sprint: false }
      ] } },
      { command: "game.step", args: { dt: 0.05, steps: 60, now: 2000008704850 } },
      { command: "service.call", args: { service: "vehicles", method: "summary", arguments: [] } },
      { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: [
        "ragdoll-driver-87",
        { interactPressed: true, strafe: 1, forward: 0, sprint: false },
        2000008707900
      ] } },
      { command: "service.call", args: { service: "ragdoll", method: "stateFor", arguments: ["ragdoll-driver-87"] } },
      { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: [
        "ragdoll-driver-87",
        { forward: 1, strafe: -0.75, turn: 0.55, sprint: true },
        2000008707950
      ] } },
      { command: "game.step", args: { dt: 0.05, steps: 18, now: 2000008708000 } },
      { command: "service.call", args: { service: "ragdoll", method: "stateFor", arguments: ["ragdoll-driver-87"] } },
      { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: [
        "ragdoll-driver-87",
        { forward: 0, strafe: 0, turn: 0, sprint: false },
        2000008708950
      ] } },
      { command: "game.step", args: { dt: 0.05, steps: 70, now: 2000008709000 } },
      { command: "service.call", args: { service: "ragdoll", method: "stateFor", arguments: ["ragdoll-driver-87"] } },
      { command: "entity.inspect", args: { entityId: "ragdoll-driver-87" } },

      { command: "entity.spawn", args: { spec: {
        id: "ragdoll-air-87",
        kind: "test-human",
        name: "Midair Timeout Probe",
        bot: false,
        team: 99873,
        health: 200,
        weapons: [],
        position: { x: -40, y: 1000, z: -40, angle: 0 }
      } } },
      { command: "service.call", args: { service: "ragdoll", method: "activate", arguments: [
        "ragdoll-air-87",
        {
          reason: "engine-control-midair-timeout",
          position: { x: -40, y: 1000, z: -40 },
          velocity: { x: 0.5, y: 0, z: 0 }
        },
        2000008712550
      ] } },
      { command: "game.step", args: { dt: 0.05, steps: 250, now: 2000008712600 } },
      { command: "service.call", args: { service: "ragdoll", method: "stateFor", arguments: ["ragdoll-air-87"] } },

      { command: "service.call", args: { service: "ragdoll", method: "summary", arguments: [] } },
      { command: "service.call", args: { service: "physics", method: "stats", arguments: [] } }
    ]
  },
  requestedAt: "2026-08-27T20:45:00Z"
});
