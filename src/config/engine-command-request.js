const START = 2000016600000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 166,
  mode: "battle-royale",
  room: "engine-lab-building-navigation-166",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: { commands: [
    { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [START] } },
    { command: "service.call", args: { service: "building-navigation", method: "list", arguments: [] } },
    { command: "service.call", args: { service: "ground-navigation", method: "requiredWaypoints", arguments: [
      { x: 52, y: 3.2, z: 8 }, { x: 77.8, y: 0, z: 0 }
    ] } },
    { command: "entity.spawn", args: { spec: { id: "nav-building-166", kind: "human", name: "Building Navigation Player", bot: false, team: 16601, health: 400, weapons: [], position: { x: 52, y: 3.2, z: 8, angle: -1 } } } },
    { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["nav-building-166", { x: 52, y: 3.2, z: 8, angle: -1 }] } },
    { command: "service.call", args: { service: "map", method: "setDoorOpen", arguments: ["warehouse-upper-room-door", true, "nav-building-166", START + 30] } },
    { command: "service.call", args: { service: "map", method: "setDoorOpen", arguments: ["warehouse-front-door", true, "nav-building-166", START + 40] } },
    { command: "game.step", args: { dt: 0.02, steps: 2, now: START + 50 } },
    { command: "service.call", args: { service: "navigation", method: "selectTarget", arguments: ["nav-building-166", "warehouse", START + 90] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["nav-building-166", { navigationFacePressed: true }, START + 100] } },
    { command: "service.call", args: { service: "navigation", method: "assertState", arguments: ["nav-building-166", { active: true, minSemanticTransitions: 4 }] } },
    { command: "service.call", args: { service: "navigation-face", method: "assertGuidance", arguments: ["nav-building-166", true, 0] } },
    { command: "service.call", args: { service: "navigation", method: "stateFor", arguments: ["nav-building-166", START + 110] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["nav-building-166", { forward: 1, sprint: true }, START + 120] } },
    { command: "game.step", args: { dt: 0.02, steps: 500, now: START + 140 } },
    { command: "service.call", args: { service: "navigation", method: "stateFor", arguments: ["nav-building-166", START + 10150] } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["nav-building-166"] } },
    { command: "game.step", args: { dt: 0.02, steps: 500, now: START + 10160 } },
    { command: "service.call", args: { service: "navigation", method: "assertState", arguments: ["nav-building-166", { active: false }] } },
    { command: "service.call", args: { service: "navigation-face", method: "assertGuidance", arguments: ["nav-building-166", false, 1] } },
    { command: "service.call", args: { service: "navigation-face", method: "stateFor", arguments: ["nav-building-166"] } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["nav-building-166"] } }
  ] },
  requestedAt: "2026-08-29T16:30:00+03:00"
});
