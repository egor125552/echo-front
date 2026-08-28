const START = 2000013400000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 134,
  mode: "battle-royale",
  room: "engine-lab-ragdoll-supercar-134",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [START] } },

      { command: "service.call", args: { service: "ragdoll-tuning", method: "configure", arguments: [{
        linearDamping: 0.02,
        angularDamping: 0.02,
        headAngularDamping: 0.03,
        friction: 0.38,
        vehicleEjectX: 4.8,
        vehicleEjectY: 0.55,
        vehicleEjectZ: 3.8,
        vehicleEjectScaleStartKph: 10,
        vehicleEjectScaleSpanKph: 70,
        vehicleEjectScaleMaxExtra: 2.5
      }] } },
      { command: "entity.spawn", args: { spec: {
        id: "ragdoll-a-134", kind: "human", name: "Ragdoll A", bot: false,
        team: 13401, health: 400, weapons: [],
        position: { x: -87.6, y: 1.1, z: 520, angle: 0 }
      } } },
      { command: "service.call", args: { service: "vehicles", method: "enter", arguments: ["ragdoll-a-134", START + 100, "br-supercar-1"] } },
      { command: "service.call", args: { service: "vehicles", method: "setInput", arguments: ["ragdoll-a-134", { forward: 1, fireHeld: true }] } },
      { command: "game.step", args: { dt: 0.02, steps: 300, now: START + 120 } },
      { command: "service.call", args: { service: "vehicles", method: "stateFor", arguments: ["br-supercar-1"] } },
      { command: "service.call", args: { service: "ragdoll", method: "ejectFromVehicle", arguments: ["ragdoll-a-134", { strafe: 1 }, START + 6120] } },
      { command: "game.step", args: { dt: 0.02, steps: 60, now: START + 6140 } },
      { command: "service.call", args: { service: "ragdoll", method: "stateFor", arguments: ["ragdoll-a-134"] } },
      { command: "service.call", args: { service: "ragdoll-tuning", method: "stateFor", arguments: ["ragdoll-a-134"] } },

      { command: "service.call", args: { service: "ragdoll-tuning", method: "configure", arguments: [{
        linearDamping: 0.018,
        angularDamping: 0.012,
        headAngularDamping: 0.018,
        friction: 0.34,
        vehicleEjectX: 5.5,
        vehicleEjectY: 0.22,
        vehicleEjectZ: 3.3,
        vehicleEjectScaleStartKph: 25,
        vehicleEjectScaleSpanKph: 100,
        vehicleEjectScaleMaxExtra: 1.8
      }] } },
      { command: "entity.spawn", args: { spec: {
        id: "ragdoll-b-134", kind: "human", name: "Ragdoll B", bot: false,
        team: 13402, health: 400, weapons: [],
        position: { x: 432.4, y: 1.1, z: -650, angle: 0 }
      } } },
      { command: "service.call", args: { service: "vehicles", method: "enter", arguments: ["ragdoll-b-134", START + 8000, "br-supercar-2"] } },
      { command: "service.call", args: { service: "vehicles", method: "setInput", arguments: ["ragdoll-b-134", { forward: 1, fireHeld: true }] } },
      { command: "game.step", args: { dt: 0.02, steps: 300, now: START + 8020 } },
      { command: "service.call", args: { service: "vehicles", method: "stateFor", arguments: ["br-supercar-2"] } },
      { command: "service.call", args: { service: "ragdoll", method: "ejectFromVehicle", arguments: ["ragdoll-b-134", { strafe: 1 }, START + 14020] } },
      { command: "game.step", args: { dt: 0.02, steps: 60, now: START + 14040 } },
      { command: "service.call", args: { service: "ragdoll", method: "stateFor", arguments: ["ragdoll-b-134"] } },
      { command: "service.call", args: { service: "ragdoll-tuning", method: "stateFor", arguments: ["ragdoll-b-134"] } },

      { command: "service.call", args: { service: "ragdoll-tuning", method: "configure", arguments: [{
        linearDamping: 0.012,
        angularDamping: 0.008,
        headAngularDamping: 0.014,
        friction: 0.28,
        vehicleEjectX: 6.2,
        vehicleEjectY: 0.28,
        vehicleEjectZ: 4.1,
        vehicleEjectScaleStartKph: 20,
        vehicleEjectScaleSpanKph: 90,
        vehicleEjectScaleMaxExtra: 2.2
      }] } },
      { command: "entity.spawn", args: { spec: {
        id: "ragdoll-c-134", kind: "human", name: "Ragdoll C", bot: false,
        team: 13403, health: 400, weapons: [],
        position: { x: -647.6, y: 1.1, z: 70, angle: 0 }
      } } },
      { command: "service.call", args: { service: "vehicles", method: "enter", arguments: ["ragdoll-c-134", START + 16000, "br-supercar-3"] } },
      { command: "service.call", args: { service: "vehicles", method: "setInput", arguments: ["ragdoll-c-134", { forward: 1, fireHeld: true }] } },
      { command: "game.step", args: { dt: 0.02, steps: 300, now: START + 16020 } },
      { command: "service.call", args: { service: "vehicles", method: "stateFor", arguments: ["br-supercar-3"] } },
      { command: "service.call", args: { service: "ragdoll", method: "ejectFromVehicle", arguments: ["ragdoll-c-134", { strafe: 1 }, START + 22020] } },
      { command: "game.step", args: { dt: 0.02, steps: 60, now: START + 22040 } },
      { command: "service.call", args: { service: "ragdoll", method: "stateFor", arguments: ["ragdoll-c-134"] } },
      { command: "service.call", args: { service: "ragdoll-tuning", method: "stateFor", arguments: ["ragdoll-c-134"] } }
    ]
  },
  requestedAt: "2026-08-28T19:52:00Z"
});
