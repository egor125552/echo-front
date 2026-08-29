const START = 2000019400000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 194,
  mode: "battle-royale",
  room: "engine-play-vehicle-body-194",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: { commands: [
    { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [START] } },
    { command: "entity.spawn", args: { spec: { id: "explorer-194", kind: "human", name: "Vehicle Body Explorer", bot: false, team: 19401, health: 400, weapons: ["pistol"], position: { x: 89.8, y: 0, z: 20.7, angle: 1.57079632679 } } } },
    { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["explorer-194", { x: 89.8, y: 0, z: 20.7, angle: 1.57079632679 }] } },
    { command: "service.call", args: { service: "parachute", method: "finishMovement", arguments: [0.02, START + 20] } },
    { command: "service.call", args: { service: "vehicles", method: "stateFor", arguments: ["br-jeep-1"] } },
    { command: "service.call", args: { service: "object-affordances", method: "nearestVehicle", arguments: ["explorer-194"] } },

    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["explorer-194", { forward: 1 }, START + 100] } },
    { command: "game.step", args: { dt: 0.02, steps: 20, now: START + 120 } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["explorer-194"] } },
    { command: "service.call", args: { service: "object-affordances", method: "nearestVehicle", arguments: ["explorer-194"] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["explorer-194", { interactPressed: true }, START + 600] } },
    { command: "service.call", args: { service: "vehicles", method: "vehicleForDriver", arguments: ["explorer-194"] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["explorer-194", { interactPressed: true }, START + 800] } },

    { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["explorer-194", { x: -92.8, y: 0, z: 516.8, angle: 0.8 }] } },
    { command: "service.call", args: { service: "vehicles", method: "stateFor", arguments: ["br-supercar-1"] } },
    { command: "service.call", args: { service: "object-affordances", method: "nearestVehicle", arguments: ["explorer-194"] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["explorer-194", { interactPressed: true }, START + 1000] } },
    { command: "service.call", args: { service: "vehicles", method: "vehicleForDriver", arguments: ["explorer-194"] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["explorer-194", { interactPressed: true }, START + 1200] } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["explorer-194"] } }
  ] },
  requestedAt: "2026-08-29T22:59:00+03:00"
});
