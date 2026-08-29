const START = 2000016700000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 167,
  mode: "battle-royale",
  room: "engine-lab-building-navigation-167",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: { commands: [
    { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [START] } },
    { command: "service.call", args: { service: "building-navigation", method: "list", arguments: [] } },
    { command: "service.call", args: { service: "ground-navigation", method: "requiredWaypoints", arguments: [
      { x: 52, y: 3.2, z: 8 }, { x: 77.8, y: 0, z: 0 }
    ] } },
    { command: "entity.spawn", args: { spec: { id: "nav-building-167", kind: "human", name: "Building Navigation Player", bot: false, team: 16701, health: 400, weapons: [], position: { x: 52, y: 3.2, z: 8, angle: -1 } } } },
    { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["nav-building-167", { x: 52, y: 3.2, z: 8, angle: -1 }] } },
    { command: "service.call", args: { service: "map", method: "setDoorOpen", arguments: ["warehouse-upper-room-door", true, "nav-building-167", START + 30] } },
    { command: "service.call", args: { service: "map", method: "setDoorOpen", arguments: ["warehouse-front-door", true, "nav-building-167", START + 40] } },
    { command: "game.step", args: { dt: 0.02, steps: 2, now: START + 50 } },
    { command: "service.call", args: { service: "navigation", method: "selectTarget", arguments: ["nav-building-167", "warehouse", START + 90] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["nav-building-167", { navigationFacePressed: true }, START + 100] } },
    { command: "service.call", args: { service: "navigation", method: "assertState", arguments: ["nav-building-167", { active: true, minSemanticTransitions: 4 }] } },
    { command: "service.call", args: { service: "navigation-face", method: "assertGuidance", arguments: ["nav-building-167", true, 0] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["nav-building-167", { forward: 1, sprint: true }, START + 120] } },
    { command: "game.step", args: { dt: 0.02, steps: 500, now: START + 140 } },
    { command: "service.call", args: { service: "navigation", method: "stateFor", arguments: ["nav-building-167", START + 10150] } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["nav-building-167"] } },
    { command: "game.step", args: { dt: 0.02, steps: 500, now: START + 10160 } },
    { command: "service.call", args: { service: "navigation", method: "stateFor", arguments: ["nav-building-167", START + 20170] } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["nav-building-167"] } },
    { command: "service.call", args: { service: "navigation", method: "assertState", arguments: ["nav-building-167", { active: false }] } },
    { command: "service.call", args: { service: "navigation-face", method: "assertGuidance", arguments: ["nav-building-167", false, 1] } },
    { command: "service.call", args: { service: "match-api", method: "enginePendingEvents", arguments: ["navigation:"] } }
  ] },
  requestedAt: "2026-08-29T16:40:00+03:00"
});
