export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 86,
  mode: "battle-royale",
  room: "engine-lab-ragdoll-grounded-86",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [2000008600000] } },

      { command: "entity.spawn", args: { spec: {
        id: "ragdoll-fall-86",
        kind: "test-human",
        name: "Grounded Ragdoll Probe",
        bot: false,
        team: 99861,
        health: 200,
        weapons: [],
        position: { x: 12, y: 4, z: 8, angle: 0.25 }
      } } },
      { command: "service.call", args: { service: "ragdoll", method: "activate", arguments: [
        "ragdoll-fall-86",
        {
          reason: "engine-control-ground-impact",
          position: { x: 12, y: 4, z: 8 },
          angle: 0.25,
          velocity: { x: 1.5, y: -4.0, z: -0.4 },
          impulse: { x: 0.35, y: 0.15, z: 0.55 }
        },
        2000008600050
      ] } },
      { command: "service.call", args: { service: "ragdoll", method: "setInput", arguments: [
        "ragdoll-fall-86",
        { forward: 1, strafe: 0.65, turn: 0.25, sprint: true }
      ] } },
      { command: "game.step", args: { dt: 0.05, steps: 12, now: 2000008600100 } },
      { command: "service.call", args: { service: "ragdoll", method: "stateFor", arguments: ["ragdoll-fall-86"] } },
      { command: "entity.inspect", args: { entityId: "ragdoll-fall-86" } },
      { command: "service.call", args: { service: "ragdoll", method: "summary", arguments: [] } },
      { command: "service.call", args: { service: "ragdoll", method: "setInput", arguments: [
        "ragdoll-fall-86",
        { forward: 0, strafe: 0, turn: 0, sprint: false }
      ] } },
      { command: "game.step", args: { dt: 0.05, steps: 60, now: 2000008600700 } },
      { command: "service.call", args: { service: "ragdoll", method: "stateFor", arguments: ["ragdoll-fall-86"] } },
      { command: "entity.inspect", args: { entityId: "ragdoll-fall-86" } },
      { command: "service.call", args: { service: "ragdoll", method: "summary", arguments: [] } },

      { command: "entity.spawn", args: { spec: {
        id: "ragdoll-driver-86",
        kind: "test-human",
        name: "Ragdoll Driver Probe",
        bot: false,
        team: 99862,
        health: 200,
        weapons: [],
        position: { x: 94, y: 0, z: 24, angle: 0 }
      } } },
      { command: "service.call", args: { service: "vehicles", method: "enter", arguments: ["ragdoll-driver-86", 2000008603800] } },
      { command: "service.call", args: { service: "vehicles", method: "setInput", arguments: [
        "ragdoll-driver-86",
        { forward: 1, strafe: 0, sprint: false }
      ] } },
      { command: "game.step", args: { dt: 0.05, steps: 60, now: 2000008603850 } },
      { command: "service.call", args: { service: "vehicles", method: "summary", arguments: [] } },
      { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: [
        "ragdoll-driver-86",
        { interactPressed: true, strafe: 1, forward: 0, sprint: false },
        2000008606900
      ] } },
      { command: "service.call", args: { service: "ragdoll", method: "stateFor", arguments: ["ragdoll-driver-86"] } },
      { command: "game.step", args: { dt: 0.05, steps: 35, now: 2000008606950 } },
      { command: "service.call", args: { service: "ragdoll", method: "stateFor", arguments: ["ragdoll-driver-86"] } },

      { command: "service.call", args: { service: "ragdoll", method: "summary", arguments: [] } },
      { command: "service.call", args: { service: "physics", method: "stats", arguments: [] } }
    ]
  },
  requestedAt: "2026-08-27T20:30:00Z"
});
