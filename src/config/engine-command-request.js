const START = 2000018200000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 182,
  mode: "battle-royale",
  room: "engine-lab-door-filter-route-182",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: { commands: [
    { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [START] } },
    { command: "entity.spawn", args: { spec: { id: "builder-182", kind: "human", name: "Door Filter Walker", bot: false, team: 18201, health: 400, weapons: ["pistol"], position: { x: 265, y: 3.2, z: -191, angle: 3.14159265359 } } } },
    { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["builder-182", { x: 265, y: 3.2, z: -191, angle: 3.14159265359 }] } },
    { command: "game.step", args: { dt: 0.02, steps: 3, now: START + 20 } },
    { command: "service.call", args: { service: "parachute", method: "stateFor", arguments: ["builder-182"] } },
    { command: "service.call", args: { service: "map", method: "setDoorOpen", arguments: ["north-stair-front-door", true, "builder-182", START + 100] } },
    { command: "service.call", args: { service: "toggleable-colliders", method: "disabledCount", arguments: [] } },
    { command: "service.call", args: { service: "physics", method: "raycastWorld", arguments: [{ x: 265, y: 1, z: -177 }, { x: 0, y: 0, z: 1 }, 6] } },
    { command: "service.call", args: { service: "navigation", method: "registerTarget", arguments: [{ id: "north-stair-outside-test-182", name: "Точка снаружи", kind: "point", order: 1, arriveDistance: 2.5, position: { x: 265, y: 0, z: -172 }, metadata: { verticalTolerance: 1.5 } }] } },
    { command: "service.call", args: { service: "navigation", method: "selectTarget", arguments: ["builder-182", "north-stair-outside-test-182", START + 120] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["builder-182", { navigationFacePressed: true }, START + 130] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["builder-182", { forward: 1 }, START + 140] } },
    { command: "game.step", args: { dt: 0.02, steps: 150, now: START + 200 } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["builder-182"] } },
    { command: "service.call", args: { service: "navigation", method: "stateFor", arguments: ["builder-182", START + 3200] } },
    { command: "game.step", args: { dt: 0.02, steps: 150, now: START + 3300 } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["builder-182"] } },
    { command: "service.call", args: { service: "navigation", method: "stateFor", arguments: ["builder-182", START + 6300] } },
    { command: "game.step", args: { dt: 0.02, steps: 150, now: START + 6400 } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["builder-182"] } },
    { command: "service.call", args: { service: "navigation", method: "stateFor", arguments: ["builder-182", START + 9400] } },
    { command: "game.step", args: { dt: 0.02, steps: 150, now: START + 9500 } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["builder-182"] } },
    { command: "service.call", args: { service: "navigation-face", method: "stateFor", arguments: ["builder-182"] } },
    { command: "service.call", args: { service: "map", method: "locationAt", arguments: [{ x: 265, y: 0, z: -172 }] } }
  ] },
  requestedAt: "2026-08-29T21:39:00+03:00"
});