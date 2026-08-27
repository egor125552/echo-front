export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 85,
  mode: "battle-royale",
  room: "engine-lab-ragdoll-85",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [2000008500000] } },

      { command: "entity.spawn", args: { spec: {
        id: "ragdoll-fall-85",
        kind: "human",
        name: "Ragdoll Fall Probe",
        bot: false,
        team: 99851,
        health: 200,
        weapons: [],
        position: { x: 12, y: 11, z: 8, angle: 0.25 }
      } } },
      { command: "service.call", args: { service: "ragdoll", method: "activate", arguments: [
        "ragdoll-fall-85",
        {
          reason: "engine-control-fall",
          velocity: { x: 2.0, y: -12.0, z: -0.8 },
          impulse: { x: 0.4, y: 0.2, z: 0.7 }
        },
        2000008500050
      ] } },
      { command: "service.call", args: { service: "ragdoll", method: "setInput", arguments: [
        "ragdoll-fall-85",
        { forward: 1, strafe: 0.65, turn: 0.25, sprint: true }
      ] } },
      { command: "game.step", args: { dt: 0.05, steps: 20, now: 2000008500100 } },
      { command: "service.call", args: { service: "ragdoll", method: "stateFor", arguments: ["ragdoll-fall-85"] } },
      { command: "game.step", args: { dt: 0.05, steps: 60, now: 2000008501100 } },
      { command: "service.call", args: { service: "ragdoll", method: "stateFor", arguments: ["ragdoll-fall-85"] } },

      { command: "entity.spawn", args: { spec: {
        id: "ragdoll-driver-85",
        kind: "human",
        name: "Ragdoll Driver Probe",
        bot: false,
        team: 99852,
        health: 200,
        weapons: [],
        position: { x: 94, y: 0, z: 24, angle: 0 }
      } } },
      { command: "entity.spawn", args: { spec: {
        id: "ragdoll-pedestrian-85",
        kind: "human",
        name: "Ragdoll Pedestrian Probe",
        bot: false,
        team: 99853,
        health: 200,
        weapons: [],
        position: { x: 94, y: 0, z: 18.5, angle: 0 }
      } } },
      { command: "service.call", args: { service: "vehicles", method: "enter", arguments: ["ragdoll-driver-85", 2000008504200] } },
      { command: "service.call", args: { service: "vehicles", method: "setInput", arguments: [
        "ragdoll-driver-85",
        { forward: 1, strafe: 0, sprint: false }
      ] } },
      { command: "game.step", args: { dt: 0.05, steps: 70, now: 2000008504250 } },
      { command: "service.call", args: { service: "ragdoll", method: "stateFor", arguments: ["ragdoll-pedestrian-85"] } },
      { command: "service.call", args: { service: "vehicles", method: "summary", arguments: [] } },

      { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: [
        "ragdoll-driver-85",
        { interactPressed: true, strafe: 1, forward: 0, sprint: false },
        2000008507800
      ] } },
      { command: "game.step", args: { dt: 0.05, steps: 35, now: 2000008507850 } },
      { command: "service.call", args: { service: "ragdoll", method: "stateFor", arguments: ["ragdoll-driver-85"] } },

      { command: "service.call", args: { service: "ragdoll", method: "summary", arguments: [] } },
      { command: "service.call", args: { service: "physics", method: "stats", arguments: [] } }
    ]
  },
  requestedAt: "2026-08-27T20:10:00Z"
});
