const START = 2000013500000;
const DT = 1 / 60;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 135,
  mode: "battle-royale",
  room: "engine-lab-vehicle-stress-135",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: {
    commands: [
      { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [START] } },
      { command: "entity.spawn", args: { spec: {
        id: "vehicle-stress-driver-135",
        kind: "human",
        name: "Vehicle Stress Driver",
        bot: false,
        team: 13501,
        health: 1000,
        weapons: [],
        position: { x: 94, y: 0, z: 24, angle: 0 }
      } } },
      { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["vehicle-stress-driver-135", { x: 94, y: 0, z: 24, angle: 0 }] } },
      { command: "game.step", args: { dt: DT, steps: 2, now: START + 40 } },
      { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["vehicle-stress-driver-135", { interactPressed: true }, START + 60] } },
      { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["vehicle-stress-driver-135", { forward: 1 }, START + 80] } },
      { command: "game.step", args: { dt: DT, steps: 100, now: START + 100 } },
      { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["vehicle-stress-driver-135", { forward: 1, strafe: 0.35, fireHeld: true }, START + 1800] } },
      { command: "game.step", args: { dt: DT, steps: 100, now: START + 1820 } },
      { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["vehicle-stress-driver-135", { forward: 1, strafe: -0.35 }, START + 3500] } },
      { command: "game.step", args: { dt: DT, steps: 100, now: START + 3520 } },
      { command: "service.call", args: { service: "vehicles", method: "summary", arguments: [] } },
      { command: "service.call", args: { service: "physics", method: "stats", arguments: [] } },
      { command: "service.call", args: { service: "ragdoll-stability", method: "assertStable", arguments: [{ maxSpread: 12, maxSpeed: 140 }] } }
    ]
  },
  requestedAt: "2026-08-28T17:55:00Z"
});
