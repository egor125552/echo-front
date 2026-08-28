export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 95,
  mode: "battle-royale",
  room: "engine-lab-world-fleet-supercar-95",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "service.call", args: { service: "world-expansion", method: "assertExpanded", arguments: [{ minHalfSize: 1000 }] } },
      { command: "service.call", args: { service: "vehicles", method: "assertFleet", arguments: [{ minTotal: 12, minSupercars: 4, minOffroad: 8 }] } },
      { command: "service.call", args: { service: "battle-royale", method: "zoneRadiusAt", arguments: [2000009500000] } },

      // Prove that the new ground is physically real near a former impossible corner.
      { command: "entity.spawn", args: { spec: {
        id: "expanded-edge-probe-95",
        kind: "test-human",
        name: "Expanded World Edge Probe",
        bot: false,
        team: 99501,
        health: 200,
        weapons: [],
        position: { x: 900, y: 0, z: 900, angle: 0 }
      } } },
      { command: "service.call", args: { service: "movement", method: "tick", arguments: [0.05, 2000009500050] } },
      { command: "service.call", args: { service: "jump", method: "assertState", arguments: [
        "expanded-edge-probe-95", { grounded: true, active: false, maxY: 0.03 }
      ] } },

      // Enter one of the rare sport cars and accelerate it only through the real
      // Rapier ray-cast vehicle controller: tires, suspension and engine force.
      { command: "entity.spawn", args: { spec: {
        id: "supercar-driver-95",
        kind: "test-human",
        name: "Supercar Driver",
        bot: false,
        team: 99502,
        health: 200,
        weapons: [],
        position: { x: -90, y: 0, z: 520, angle: 0 }
      } } },
      { command: "service.call", args: { service: "movement", method: "tick", arguments: [0.05, 2000009500100] } },
      { command: "service.call", args: { service: "vehicles", method: "enter", arguments: [
        "supercar-driver-95", 2000009500110, "br-supercar-1"
      ] } },
      { command: "service.call", args: { service: "vehicles", method: "assertVehicle", arguments: [
        "br-supercar-1", { kind: "supercar", occupied: true }
      ] } },
      { command: "service.call", args: { service: "vehicles", method: "setInput", arguments: [
        "supercar-driver-95", { forward: 1, strafe: 0, sprint: false, fireHeld: false }
      ] } },

      { command: "service.call", args: { service: "vehicles", method: "tickPhysics", arguments: [0.1, 2000009500200] } },
      { command: "service.call", args: { service: "vehicles", method: "tickPhysics", arguments: [0.1, 2000009500300] } },
      { command: "service.call", args: { service: "vehicles", method: "tickPhysics", arguments: [0.1, 2000009500400] } },
      { command: "service.call", args: { service: "vehicles", method: "tickPhysics", arguments: [0.1, 2000009500500] } },
      { command: "service.call", args: { service: "vehicles", method: "tickPhysics", arguments: [0.1, 2000009500600] } },
      { command: "service.call", args: { service: "vehicles", method: "tickPhysics", arguments: [0.1, 2000009500700] } },
      { command: "service.call", args: { service: "vehicles", method: "tickPhysics", arguments: [0.1, 2000009500800] } },
      { command: "service.call", args: { service: "vehicles", method: "tickPhysics", arguments: [0.1, 2000009500900] } },
      { command: "service.call", args: { service: "vehicles", method: "tickPhysics", arguments: [0.1, 2000009501000] } },
      { command: "service.call", args: { service: "vehicles", method: "tickPhysics", arguments: [0.1, 2000009501100] } },
      { command: "service.call", args: { service: "vehicles", method: "tickPhysics", arguments: [0.1, 2000009501200] } },
      { command: "service.call", args: { service: "vehicles", method: "tickPhysics", arguments: [0.1, 2000009501300] } },
      { command: "service.call", args: { service: "vehicles", method: "tickPhysics", arguments: [0.1, 2000009501400] } },
      { command: "service.call", args: { service: "vehicles", method: "tickPhysics", arguments: [0.1, 2000009501500] } },
      { command: "service.call", args: { service: "vehicles", method: "tickPhysics", arguments: [0.1, 2000009501600] } },
      { command: "service.call", args: { service: "vehicles", method: "tickPhysics", arguments: [0.1, 2000009501700] } },
      { command: "service.call", args: { service: "vehicles", method: "tickPhysics", arguments: [0.1, 2000009501800] } },
      { command: "service.call", args: { service: "vehicles", method: "tickPhysics", arguments: [0.1, 2000009501900] } },
      { command: "service.call", args: { service: "vehicles", method: "tickPhysics", arguments: [0.1, 2000009502000] } },
      { command: "service.call", args: { service: "vehicles", method: "tickPhysics", arguments: [0.1, 2000009502100] } },
      { command: "service.call", args: { service: "vehicles", method: "assertVehicle", arguments: [
        "br-supercar-1", { kind: "supercar", occupied: true, minSpeedKph: 35 }
      ] } },

      // Give the sport car one second of nitro and require a higher real speed.
      { command: "service.call", args: { service: "vehicles", method: "setInput", arguments: [
        "supercar-driver-95", { forward: 1, strafe: 0, sprint: false, fireHeld: true }
      ] } },
      { command: "service.call", args: { service: "vehicles", method: "tickPhysics", arguments: [0.1, 2000009502200] } },
      { command: "service.call", args: { service: "vehicles", method: "tickPhysics", arguments: [0.1, 2000009502300] } },
      { command: "service.call", args: { service: "vehicles", method: "tickPhysics", arguments: [0.1, 2000009502400] } },
      { command: "service.call", args: { service: "vehicles", method: "tickPhysics", arguments: [0.1, 2000009502500] } },
      { command: "service.call", args: { service: "vehicles", method: "tickPhysics", arguments: [0.1, 2000009502600] } },
      { command: "service.call", args: { service: "vehicles", method: "tickPhysics", arguments: [0.1, 2000009502700] } },
      { command: "service.call", args: { service: "vehicles", method: "tickPhysics", arguments: [0.1, 2000009502800] } },
      { command: "service.call", args: { service: "vehicles", method: "tickPhysics", arguments: [0.1, 2000009502900] } },
      { command: "service.call", args: { service: "vehicles", method: "tickPhysics", arguments: [0.1, 2000009503000] } },
      { command: "service.call", args: { service: "vehicles", method: "tickPhysics", arguments: [0.1, 2000009503100] } },
      { command: "service.call", args: { service: "vehicles", method: "assertVehicle", arguments: [
        "br-supercar-1", { kind: "supercar", occupied: true, minSpeedKph: 65 }
      ] } },
      { command: "service.call", args: { service: "vehicles", method: "vehicleForDriver", arguments: ["supercar-driver-95"] } },
      { command: "service.call", args: { service: "vehicles", method: "summary", arguments: [] } },
      { command: "service.call", args: { service: "world-expansion", method: "summary", arguments: [] } },
      { command: "service.call", args: { service: "vehicles", method: "exit", arguments: [
        "supercar-driver-95", 2000009503200, "validation"
      ] } },
      { command: "service.call", args: { service: "vehicles", method: "assertVehicle", arguments: [
        "br-supercar-1", { kind: "supercar", occupied: false }
      ] } }
    ]
  },
  requestedAt: "2026-08-28T10:45:00Z"
});
