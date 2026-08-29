const START = 2000016200000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 162,
  mode: "battle-royale",
  room: "engine-lab-navigation-network-162",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: { commands: [
    { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [START] } },
    { command: "entity.spawn", args: { spec: { id: "nav-player-162", kind: "human", name: "Navigation Network Player", bot: false, team: 16201, health: 400, weapons: [], position: { x: 20, y: 0, z: 0, angle: 2.7 } } } },
    { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["nav-player-162", { x: 20, y: 0, z: 0, angle: 2.7 }] } },
    { command: "game.step", args: { dt: 0.02, steps: 2, now: START + 20 } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["nav-player-162", { navigationNextPressed: true }, START + 80] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["nav-player-162", { navigationFacePressed: true }, START + 100] } },
    { command: "service.call", args: { service: "navigation-face", method: "assertGuidance", arguments: ["nav-player-162", true, 0] } },
    { command: "service.call", args: { service: "match-api", method: "enginePendingEvents", arguments: ["navigation:"] } },
    { command: "service.call", args: { service: "match-api", method: "eventsForPlayer", arguments: ["nav-player-162", [
      { event: "navigation:guidance-enabled", payload: { entityId: "nav-player-162", targetName: "Склад", enabled: true } },
      { event: "navigation:guidance-enabled", payload: { entityId: "someone-else", targetName: "Склад", enabled: true } }
    ]] } }
  ] },
  requestedAt: "2026-08-29T14:24:00+03:00"
});
