const START = 2000018500000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 185,
  mode: "battle-royale",
  room: "engine-play-forest-hut-185",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: { commands: [
    { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [START] } },
    { command: "entity.spawn", args: { spec: { id: "explorer-185", kind: "human", name: "Forest Hut Explorer", bot: false, team: 18501, health: 400, weapons: ["pistol"], position: { x: -115, y: 0, z: -66.5, angle: 0 } } } },
    { command: "game.step", args: { dt: 0.02, steps: 3, now: START + 20 } },

    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["explorer-185", { forward: 1 }, START + 100] } },
    { command: "game.step", args: { dt: 0.02, steps: 45, now: START + 120 } },
    { command: "service.call", args: { service: "match-api", method: "snapshotFor", arguments: ["explorer-185", START + 1100] } },

    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["explorer-185", { strafe: 1 }, START + 1200] } },
    { command: "game.step", args: { dt: 0.02, steps: 70, now: START + 1220 } },
    { command: "service.call", args: { service: "match-api", method: "snapshotFor", arguments: ["explorer-185", START + 2700] } },

    { command: "service.call", args: { service: "map", method: "acousticOcclusionBetween", arguments: [{ x: -110, y: 0, z: -67.2 }, { x: -110, y: 0, z: -75 }] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["explorer-185", { interactPressed: true }, START + 2800] } },
    { command: "service.call", args: { service: "map", method: "acousticOcclusionBetween", arguments: [{ x: -110, y: 0, z: -67.2 }, { x: -110, y: 0, z: -75 }] } },

    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["explorer-185", { forward: 1 }, START + 2900] } },
    { command: "game.step", args: { dt: 0.02, steps: 75, now: START + 2920 } },
    { command: "service.call", args: { service: "match-api", method: "snapshotFor", arguments: ["explorer-185", START + 4500] } },

    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["explorer-185", { strafe: -1 }, START + 4600] } },
    { command: "game.step", args: { dt: 0.02, steps: 32, now: START + 4620 } },
    { command: "service.call", args: { service: "match-api", method: "snapshotFor", arguments: ["explorer-185", START + 5300] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["explorer-185", { interactPressed: true }, START + 5400] } },
    { command: "service.call", args: { service: "match-api", method: "snapshotFor", arguments: ["explorer-185", START + 5500] } },

    { command: "service.call", args: { service: "building-design-validator", method: "validateAll", arguments: [] } },
    { command: "service.call", args: { service: "object-affordances", method: "nearestVehicle", arguments: ["explorer-185"] } }
  ] },
  requestedAt: "2026-08-29T22:34:00+03:00"
});
