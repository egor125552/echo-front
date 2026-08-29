const START = 2000016800000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 168,
  mode: "battle-royale",
  room: "engine-lab-navigation-humanity-168",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: { commands: [
    { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [START] } },
    { command: "entity.spawn", args: { spec: { id: "nav-driver-168", kind: "human", name: "Navigation Driver", bot: false, team: 16801, health: 400, weapons: [], position: { x: 94, y: 0, z: 24, angle: 0 } } } },
    { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["nav-driver-168", { x: 94, y: 0, z: 24, angle: 0 }] } },
    { command: "game.step", args: { dt: 0.02, steps: 2, now: START + 20 } },
    { command: "service.call", args: { service: "vehicles", method: "enter", arguments: ["nav-driver-168", START + 70, "br-jeep-1"] } },
    { command: "service.call", args: { service: "navigation", method: "availableTargets", arguments: ["nav-driver-168"] } },
    { command: "service.call", args: { service: "navigation", method: "selectTarget", arguments: ["nav-driver-168", "vehicle:br-jeep-1", START + 80] } },
    { command: "service.call", args: { service: "match-api", method: "snapshotFor", arguments: ["nav-driver-168", START + 90] } },
    { command: "service.call", args: { service: "navigation", method: "selectTarget", arguments: ["nav-driver-168", "warehouse", START + 100] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["nav-driver-168", { navigationFacePressed: true }, START + 110] } },
    { command: "service.call", args: { service: "navigation-face", method: "assertGuidance", arguments: ["nav-driver-168", true, 0] } },
    { command: "service.call", args: { service: "health", method: "applyDamage", arguments: ["nav-driver-168", 9999, { attackerId: null, weaponId: "engine-check", now: START + 120 }] } },
    { command: "service.call", args: { service: "navigation-face", method: "assertGuidance", arguments: ["nav-driver-168", false, 0] } },
    { command: "entity.spawn", args: { spec: { id: "nav-open-168", kind: "human", name: "Open Route Player", bot: false, team: 16802, health: 400, weapons: [], position: { x: -300, y: 0, z: -300, angle: 0 } } } },
    { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["nav-open-168", { x: -300, y: 0, z: -300, angle: 0 }] } },
    { command: "service.call", args: { service: "navigation", method: "selectTarget", arguments: ["nav-open-168", "warehouse", START + 150] } },
    { command: "service.call", args: { service: "navigation", method: "toggle", arguments: ["nav-open-168", START + 160] } },
    { command: "service.call", args: { service: "navigation", method: "assertState", arguments: ["nav-open-168", { active: true, maxCheckpoints: 10 }] } },
    { command: "service.call", args: { service: "navigation", method: "stateFor", arguments: ["nav-open-168", START + 170] } }
  ] },
  requestedAt: "2026-08-29T16:50:00+03:00"
});
