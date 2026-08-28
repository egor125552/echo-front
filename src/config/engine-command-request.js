export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 98,
  mode: "battle-royale",
  room: "engine-lab-supercar-full-nitro-98",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "service.call", args: { service: "world-expansion", method: "assertExpanded", arguments: [{ minHalfSize: 1000 }] } },
      { command: "service.call", args: { service: "vehicles", method: "assertFleet", arguments: [{ minTotal: 12, minSupercars: 4, minOffroad: 8 }] } },
      { command: "entity.spawn", args: { spec: {
        id: "supercar-driver-98", kind: "test-human", name: "Full Nitro Driver",
        bot: false, team: 99802, health: 200, weapons: [],
        position: { x: -90, y: 0, z: 520, angle: 0 }
      } } },
      { command: "service.call", args: { service: "movement", method: "tick", arguments: [0.05, 2000009800050] } },
      { command: "service.call", args: { service: "vehicles", method: "enter", arguments: [
        "supercar-driver-98", 2000009800060, "br-supercar-1"
      ] } },
      { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [2000009800070] } },
      { command: "service.call", args: { service: "vehicles", method: "setInput", arguments: [
        "supercar-driver-98", { forward: 1, strafe: 0, sprint: false, fireHeld: true }
      ] } },
      { command: "game.step", args: { dt: 0.05, steps: 20, now: 2000009800100 } },
      { command: "service.call", args: { service: "vehicles", method: "stateFor", arguments: ["br-supercar-1"] } },
      { command: "game.step", args: { dt: 0.05, steps: 20, now: 2000009801100 } },
      { command: "service.call", args: { service: "vehicles", method: "stateFor", arguments: ["br-supercar-1"] } },
      { command: "game.step", args: { dt: 0.05, steps: 16, now: 2000009802100 } },
      { command: "service.call", args: { service: "vehicles", method: "stateFor", arguments: ["br-supercar-1"] } },
      { command: "service.call", args: { service: "vehicles", method: "assertVehicle", arguments: [
        "br-supercar-1", { kind: "supercar", occupied: true, minSpeedKph: 85 }
      ] } },
      { command: "service.call", args: { service: "vehicles", method: "summary", arguments: [] } },
      { command: "service.call", args: { service: "vehicles", method: "exit", arguments: [
        "supercar-driver-98", 2000009803000, "validation"
      ] } }
    ]
  },
  requestedAt: "2026-08-28T10:54:00Z"
});
