export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 97,
  mode: "battle-royale",
  room: "engine-lab-world-fleet-supercar-97",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "service.call", args: { service: "world-expansion", method: "assertExpanded", arguments: [{ minHalfSize: 1000 }] } },
      { command: "service.call", args: { service: "vehicles", method: "assertFleet", arguments: [{ minTotal: 12, minSupercars: 4, minOffroad: 8 }] } },
      { command: "service.call", args: { service: "battle-royale", method: "zoneRadiusAt", arguments: [2000009700000] } },
      { command: "entity.spawn", args: { spec: {
        id: "expanded-edge-probe-97", kind: "test-human", name: "Expanded World Edge Probe",
        bot: false, team: 99701, health: 200, weapons: [],
        position: { x: 900, y: 0, z: 900, angle: 0 }
      } } },
      { command: "service.call", args: { service: "movement", method: "tick", arguments: [0.05, 2000009700050] } },
      { command: "service.call", args: { service: "jump", method: "assertState", arguments: [
        "expanded-edge-probe-97", { grounded: true, active: false, maxY: 0.03 }
      ] } },
      { command: "entity.spawn", args: { spec: {
        id: "supercar-driver-97", kind: "test-human", name: "Supercar Driver",
        bot: false, team: 99702, health: 200, weapons: [],
        position: { x: -90, y: 0, z: 520, angle: 0 }
      } } },
      { command: "service.call", args: { service: "movement", method: "tick", arguments: [0.05, 2000009700100] } },
      { command: "service.call", args: { service: "vehicles", method: "enter", arguments: [
        "supercar-driver-97", 2000009700110, "br-supercar-1"
      ] } },
      { command: "service.call", args: { service: "vehicles", method: "assertVehicle", arguments: [
        "br-supercar-1", { kind: "supercar", occupied: true }
      ] } },
      { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [2000009700120] } },
      { command: "service.call", args: { service: "vehicles", method: "setInput", arguments: [
        "supercar-driver-97", { forward: 1, strafe: 0, sprint: false, fireHeld: false }
      ] } },
      { command: "game.step", args: { dt: 0.05, steps: 40, now: 2000009700200 } },
      { command: "service.call", args: { service: "vehicles", method: "stateFor", arguments: ["br-supercar-1"] } },
      { command: "service.call", args: { service: "vehicles", method: "assertVehicle", arguments: [
        "br-supercar-1", { kind: "supercar", occupied: true, minSpeedKph: 25 }
      ] } },
      { command: "service.call", args: { service: "vehicles", method: "setInput", arguments: [
        "supercar-driver-97", { forward: 1, strafe: 0, sprint: false, fireHeld: true }
      ] } },
      { command: "game.step", args: { dt: 0.05, steps: 20, now: 2000009702200 } },
      { command: "service.call", args: { service: "vehicles", method: "stateFor", arguments: ["br-supercar-1"] } },
      { command: "service.call", args: { service: "vehicles", method: "assertVehicle", arguments: [
        "br-supercar-1", { kind: "supercar", occupied: true, minSpeedKph: 65 }
      ] } },
      { command: "service.call", args: { service: "vehicles", method: "vehicleForDriver", arguments: ["supercar-driver-97"] } },
      { command: "service.call", args: { service: "vehicles", method: "summary", arguments: [] } },
      { command: "service.call", args: { service: "world-expansion", method: "summary", arguments: [] } },
      { command: "service.call", args: { service: "vehicles", method: "exit", arguments: [
        "supercar-driver-97", 2000009703300, "validation"
      ] } },
      { command: "service.call", args: { service: "vehicles", method: "assertVehicle", arguments: [
        "br-supercar-1", { kind: "supercar", occupied: false }
      ] } }
    ]
  },
  requestedAt: "2026-08-28T10:51:00Z"
});
