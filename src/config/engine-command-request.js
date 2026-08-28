const START = 2000011200000;
const DT = 0.1;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 112,
  mode: "battle-royale",
  room: "engine-lab-catapult-ragdoll-112",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "entity.spawn", args: { spec: {
        id: "catapult-driver-112",
        kind: "human",
        name: "Catapult Driver",
        bot: false,
        team: 11201,
        health: 200,
        weapons: [],
        position: { x: -90, y: 0, z: 520, angle: 0 }
      } } },
      { command: "service.call", args: { service: "vehicles", method: "enter", arguments: ["catapult-driver-112", START + 10, "br-supercar-1"] } },
      { command: "service.call", args: { service: "vehicles", method: "setInput", arguments: ["catapult-driver-112", { forward: 1, strafe: 0, sprint: false, fireHeld: true }] } },
      ...Array.from({ length: 20 }, (_, index) => ({
        command: "service.call",
        args: { service: "vehicles", method: "tickPhysics", arguments: [DT, START + 20 + index * 100] },
      })),
      { command: "service.call", args: { service: "vehicles", method: "stateFor", arguments: ["br-supercar-1"] } },
      { command: "service.call", args: { service: "ragdoll", method: "ejectFromVehicle", arguments: ["catapult-driver-112", { strafe: 1 }, START + 2050] } },
      { command: "service.call", args: { service: "ragdoll", method: "stateFor", arguments: ["catapult-driver-112"] } },
      { command: "service.call", args: { service: "ragdoll-tuning", method: "stateFor", arguments: ["catapult-driver-112"] } },
      { command: "service.call", args: { service: "ragdoll-stability", method: "summary", arguments: [] } },
      { command: "service.call", args: { service: "match-api", method: "step", arguments: [0.05, START + 2100] } },
      { command: "service.call", args: { service: "ragdoll", method: "stateFor", arguments: ["catapult-driver-112"] } }
    ]
  },
  requestedAt: "2026-08-28T12:55:00Z"
});
