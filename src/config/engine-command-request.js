const START = 2000017800000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 178,
  mode: "battle-royale",
  room: "engine-lab-building-interactions-178",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: { commands: [
    { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [START] } },
    { command: "entity.spawn", args: { spec: { id: "builder-178", kind: "human", name: "Building Interaction Player", bot: false, team: 17801, health: 400, weapons: ["pistol"], position: { x: -110, y: 0, z: -68.4, angle: 0 } } } },
    { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["builder-178", { x: -110, y: 0, z: -68.4, angle: 0 }] } },
    { command: "game.step", args: { dt: 0.02, steps: 3, now: START + 20 } },
    { command: "service.call", args: { service: "parachute", method: "stateFor", arguments: ["builder-178"] } },

    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["builder-178", { interactPressed: true }, START + 100] } },
    { command: "service.call", args: { service: "map", method: "setDoorOpen", arguments: ["forest-hut-front-door", true, "builder-178", START + 110] } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["builder-178", { forward: 1 }, START + 120] } },
    { command: "game.step", args: { dt: 0.02, steps: 65, now: START + 140 } },
    { command: "service.call", args: { service: "physics", method: "position", arguments: ["builder-178"] } },
    { command: "service.call", args: { service: "match-api", method: "snapshotFor", arguments: ["builder-178", START + 1500] } },

    { command: "service.call", args: { service: "movement", method: "teleport", arguments: ["builder-178", { x: -112.5, y: 0, z: -73.2, angle: 0 }] } },
    { command: "game.step", args: { dt: 0.02, steps: 2, now: START + 1600 } },
    { command: "service.call", args: { service: "match-api", method: "handleInput", arguments: ["builder-178", { interactPressed: true }, START + 1700] } },
    { command: "service.call", args: { service: "map", method: "interact", arguments: [{ entityId: "builder-178", x: -112.5, y: 0, z: -73.2, now: START + 1800 }] } },
    { command: "service.call", args: { service: "match-api", method: "snapshotFor", arguments: ["builder-178", START + 1900] } }
  ] },
  requestedAt: "2026-08-29T21:20:00+03:00"
});