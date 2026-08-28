export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 94,
  mode: "battle-royale",
  room: "engine-lab-jump-polish-94",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [2000009400000] } },
      { command: "entity.spawn", args: { spec: {
        id: "jump-probe-94",
        kind: "test-human",
        name: "Polished Jump Probe",
        bot: false,
        team: 99940,
        health: 200,
        weapons: [],
        position: { x: -60, y: 0, z: -60, angle: 0 }
      } } },

      // Establish a real Rapier support contact first.
      { command: "service.call", args: { service: "movement", method: "tick", arguments: [0.05, 2000009400050] } },
      { command: "service.call", args: { service: "jump", method: "assertState", arguments: [
        "jump-probe-94", { grounded: true, active: false, maxY: 0.03 }
      ] } },

      // Space on foot must launch a real ballistic character-controller arc.
      { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: [
        "jump-probe-94",
        { forward: 1, strafe: 0, turn: 0, sprint: true, parachutePressed: true },
        2000009400100
      ] } },
      { command: "service.call", args: { service: "movement", method: "tick", arguments: [0.05, 2000009400150] } },
      { command: "service.call", args: { service: "jump", method: "assertState", arguments: [
        "jump-probe-94", {
          grounded: false, active: true, minY: 0.22,
          minVerticalVelocity: 4.7, maxVerticalVelocity: 5.1
        }
      ] } },

      // Release movement in the air. Take-off momentum should keep carrying us.
      { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: [
        "jump-probe-94",
        { forward: 0, strafe: 0, turn: 0, sprint: false },
        2000009400160
      ] } },
      { command: "service.call", args: { service: "movement", method: "tick", arguments: [0.05, 2000009400200] } },

      // A second Space in mid-air must not create a double jump.
      { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: [
        "jump-probe-94",
        { forward: 0, strafe: 0, turn: 0, sprint: false, parachutePressed: true },
        2000009400210
      ] } },
      { command: "service.call", args: { service: "movement", method: "tick", arguments: [0.05, 2000009400250] } },
      { command: "service.call", args: { service: "jump", method: "assertState", arguments: [
        "jump-probe-94", {
          grounded: false, active: true, minY: 0.58,
          minVerticalVelocity: 2.8, maxVerticalVelocity: 3.4
        }
      ] } },

      // Reach the real apex. Configured 0.8 m should measure as roughly 0.8 m.
      { command: "service.call", args: { service: "movement", method: "tick", arguments: [0.05, 2000009400300] } },
      { command: "service.call", args: { service: "movement", method: "tick", arguments: [0.05, 2000009400350] } },
      { command: "service.call", args: { service: "movement", method: "tick", arguments: [0.05, 2000009400400] } },
      { command: "service.call", args: { service: "jump", method: "assertState", arguments: [
        "jump-probe-94", {
          grounded: false, active: true,
          minRise: 0.77, maxRise: 0.83,
          minVerticalVelocity: 0.0, maxVerticalVelocity: 0.7
        }
      ] } },
      { command: "service.call", args: { service: "jump", method: "summary", arguments: ["jump-probe-94"] } },

      // Finish the same arc and require a real landing plus carried sprint momentum.
      { command: "service.call", args: { service: "movement", method: "tick", arguments: [0.05, 2000009400450] } },
      { command: "service.call", args: { service: "movement", method: "tick", arguments: [0.05, 2000009400500] } },
      { command: "service.call", args: { service: "movement", method: "tick", arguments: [0.05, 2000009400550] } },
      { command: "service.call", args: { service: "movement", method: "tick", arguments: [0.05, 2000009400600] } },
      { command: "service.call", args: { service: "movement", method: "tick", arguments: [0.05, 2000009400650] } },
      { command: "service.call", args: { service: "movement", method: "tick", arguments: [0.05, 2000009400700] } },
      { command: "service.call", args: { service: "jump", method: "assertState", arguments: [
        "jump-probe-94", {
          grounded: true, active: false, maxY: 0.03, maxVerticalVelocity: 0.01,
          minRise: 0.77, maxRise: 0.83, minHorizontalDistance: 2.8
        }
      ] } },
      { command: "service.call", args: { service: "jump", method: "lastCompleted", arguments: ["jump-probe-94"] } },
      { command: "entity.inspect", args: { entityId: "jump-probe-94" } },

      // After landing, Space must be available for another ordinary jump.
      { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: [
        "jump-probe-94",
        { forward: 0, strafe: 0, turn: 0, sprint: false, parachutePressed: true },
        2000009400800
      ] } },
      { command: "service.call", args: { service: "movement", method: "tick", arguments: [0.05, 2000009400850] } },
      { command: "service.call", args: { service: "jump", method: "assertState", arguments: [
        "jump-probe-94", {
          grounded: false, active: true, minY: 0.22,
          minVerticalVelocity: 4.7, maxVerticalVelocity: 5.1
        }
      ] } },
      { command: "service.call", args: { service: "jump", method: "summary", arguments: ["jump-probe-94"] } }
    ]
  },
  requestedAt: "2026-08-28T06:40:00Z"
});
