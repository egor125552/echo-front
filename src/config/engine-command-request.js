const START = 2000011400000;
const DT = 0.1;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 114,
  mode: "battle-royale",
  room: "engine-lab-jeep-safety-114",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "entity.spawn", args: { spec: {
        id: "jeep-driver-114",
        kind: "human",
        name: "Jeep Driver",
        bot: false,
        team: 11401,
        health: 200,
        weapons: [],
        position: { x: -260, y: 0, z: -200, angle: 0 }
      } } },
      { command: "service.call", args: { service: "vehicles", method: "enter", arguments: ["jeep-driver-114", START + 10, "br-jeep-2"] } },
      { command: "service.call", args: { service: "vehicles", method: "setInput", arguments: ["jeep-driver-114", { forward: 1, strafe: 0, sprint: false, fireHeld: true }] } },
      ...Array.from({ length: 20 }, (_, index) => ({
        command: "service.call",
        args: { service: "vehicles", method: "tickPhysics", arguments: [DT, START + 20 + index * 100] },
      })),
      { command: "service.call", args: { service: "vehicles", method: "stateFor", arguments: ["br-jeep-2"] } },
      { command: "service.call", args: { service: "ragdoll", method: "ejectFromVehicle", arguments: ["jeep-driver-114", { strafe: 1 }, START + 2050] } },
      { command: "service.call", args: { service: "ragdoll", method: "stateFor", arguments: ["jeep-driver-114"] } },
      { command: "service.call", args: { service: "ragdoll-tuning", method: "stateFor", arguments: ["jeep-driver-114"] } },
      { command: "service.call", args: { service: "ragdoll-stability", method: "summary", arguments: [] } },
      { command: "entity.spawn", args: { spec: {
        id: "lost-parachute-114",
        kind: "human",
        name: "Lost Parachute",
        bot: false,
        team: 11402,
        health: 200,
        weapons: [],
        position: { x: 0, y: 0, z: 0, angle: 0 }
      } } },
      { command: "service.call", args: { service: "parachute", method: "launch", arguments: ["lost-parachute-114", { x: 1013, z: -1013, altitude: 30, angle: 0 }, START + 2200] } },
      { command: "service.call", args: { service: "parachute", method: "stateFor", arguments: ["lost-parachute-114"] } },
      { command: "service.call", args: { service: "world-safety", method: "summary", arguments: [] } }
    ]
  },
  requestedAt: "2026-08-28T13:14:00Z"
});
