export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 93,
  mode: "battle-royale",
  room: "engine-lab-jump-93",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [2000009300000] } },
      { command: "entity.spawn", args: { spec: {
        id: "jump-probe-93",
        kind: "test-human",
        name: "Jump Probe",
        bot: false,
        team: 99930,
        health: 200,
        weapons: [],
        position: { x: -60, y: 0, z: -60, angle: 0 }
      } } },

      // One real character-controller movement establishes Rapier support contact.
      { command: "service.call", args: { service: "movement", method: "tick", arguments: [0.05, 2000009300050] } },
      { command: "service.call", args: { service: "jump", method: "assertState", arguments: [
        "jump-probe-93", { grounded: true, active: false, maxY: 0.03 }
      ] } },

      // Exercise the actual Space route. The client sends Space as parachutePressed;
      // on foot it becomes a jump, while the existing parachute/ragdoll wrappers
      // retain ownership of Space when airborne in those modes.
      { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: [
        "jump-probe-93",
        { forward: 1, strafe: 0, turn: 0, sprint: true, parachutePressed: true },
        2000009300100
      ] } },
      { command: "service.call", args: { service: "movement", method: "tick", arguments: [0.05, 2000009300150] } },
      { command: "service.call", args: { service: "jump", method: "assertState", arguments: [
        "jump-probe-93", { grounded: false, active: true, minY: 0.20, minVerticalVelocity: 5.0 }
      ] } },
      { command: "entity.inspect", args: { entityId: "jump-probe-93" } },

      // Let the ballistic arc develop, then press Space again in mid-air. The second
      // request must not reset vertical velocity or create a double jump.
      { command: "service.call", args: { service: "movement", method: "tick", arguments: [0.05, 2000009300200] } },
      { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: [
        "jump-probe-93",
        { forward: 1, strafe: 0, turn: 0, sprint: true, parachutePressed: true },
        2000009300210
      ] } },
      { command: "service.call", args: { service: "movement", method: "tick", arguments: [0.05, 2000009300250] } },
      { command: "service.call", args: { service: "jump", method: "assertState", arguments: [
        "jump-probe-93", { grounded: false, active: true, minY: 0.60, maxVerticalVelocity: 3.8, minRise: 0.60 }
      ] } },

      // Complete the same real Rapier arc and require a real grounded landing.
      { command: "service.call", args: { service: "movement", method: "tick", arguments: [0.05, 2000009300300] } },
      { command: "service.call", args: { service: "movement", method: "tick", arguments: [0.05, 2000009300350] } },
      { command: "service.call", args: { service: "movement", method: "tick", arguments: [0.05, 2000009300400] } },
      { command: "service.call", args: { service: "movement", method: "tick", arguments: [0.05, 2000009300450] } },
      { command: "service.call", args: { service: "movement", method: "tick", arguments: [0.05, 2000009300500] } },
      { command: "service.call", args: { service: "movement", method: "tick", arguments: [0.05, 2000009300550] } },
      { command: "service.call", args: { service: "movement", method: "tick", arguments: [0.05, 2000009300600] } },
      { command: "service.call", args: { service: "movement", method: "tick", arguments: [0.05, 2000009300650] } },
      { command: "service.call", args: { service: "movement", method: "tick", arguments: [0.05, 2000009300700] } },
      { command: "service.call", args: { service: "movement", method: "tick", arguments: [0.05, 2000009300750] } },
      { command: "service.call", args: { service: "jump", method: "assertState", arguments: [
        "jump-probe-93", { grounded: true, active: false, maxY: 0.03, maxVerticalVelocity: 0.01 }
      ] } },
      { command: "entity.inspect", args: { entityId: "jump-probe-93" } },

      // It must be possible to jump again after a real landing.
      { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: [
        "jump-probe-93",
        { forward: 0, strafe: 0, turn: 0, sprint: false, parachutePressed: true },
        2000009300800
      ] } },
      { command: "service.call", args: { service: "movement", method: "tick", arguments: [0.05, 2000009300850] } },
      { command: "service.call", args: { service: "jump", method: "assertState", arguments: [
        "jump-probe-93", { grounded: false, active: true, minY: 0.20, minVerticalVelocity: 5.0 }
      ] } },
      { command: "service.call", args: { service: "jump", method: "summary", arguments: ["jump-probe-93"] } }
    ]
  },
  requestedAt: "2026-08-28T06:35:00Z"
});
