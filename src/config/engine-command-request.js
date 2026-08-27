export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 88,
  mode: "battle-royale",
  room: "engine-lab-vehicle-handbrake-88",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [2000008800000] } },
      { command: "entity.spawn", args: { spec: {
        id: "vehicle-handbrake-88",
        kind: "test-human",
        name: "Inherited Handbrake Probe",
        bot: false,
        team: 99880,
        health: 200,
        weapons: [],
        position: { x: 94, y: 0, z: 24, angle: 0 }
      } } },
      { command: "service.call", args: { service: "vehicles", method: "enter", arguments: ["vehicle-handbrake-88", 2000008800100] } },

      // Reproduce the real journal failure: sprint/Shift is already true on the
      // first driving input. The jeep must ignore that inherited state and move.
      { command: "service.call", args: { service: "vehicles", method: "setInput", arguments: [
        "vehicle-handbrake-88",
        { forward: 1, strafe: 0, sprint: true }
      ] } },
      { command: "game.step", args: { dt: 0.05, steps: 40, now: 2000008800150 } },
      { command: "service.call", args: { service: "vehicles", method: "summary", arguments: [] } },

      // Once a real release is observed, Shift becomes a normal handbrake again.
      { command: "service.call", args: { service: "vehicles", method: "setInput", arguments: [
        "vehicle-handbrake-88",
        { forward: 0, strafe: 0, sprint: false }
      ] } },
      { command: "game.step", args: { dt: 0.05, steps: 4, now: 2000008802200 } },
      { command: "service.call", args: { service: "vehicles", method: "setInput", arguments: [
        "vehicle-handbrake-88",
        { forward: 0, strafe: 0, sprint: true }
      ] } },
      { command: "game.step", args: { dt: 0.05, steps: 12, now: 2000008802450 } },
      { command: "service.call", args: { service: "vehicles", method: "summary", arguments: [] } }
    ]
  },
  requestedAt: "2026-08-27T19:56:00Z"
});
