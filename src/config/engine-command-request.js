const START = 2000017500000;

export const ENGINE_COMMAND_REQUEST = Object.freeze({
  id: 175,
  mode: "battle-royale",
  room: "engine-lab-building-factory-175",
  command: "engine.batch",
  repeat: 1,
  frameEvery: 1,
  args: { commands: [
    { command: "service.call", args: { service: "battle-royale", method: "arm", arguments: [START] } },
    { command: "entity.spawn", args: { spec: { id: "builder-175", kind: "human", name: "Building Test Player", bot: false, team: 17501, health: 400, weapons: ["pistol"], position: { x: -125, y: 0, z: -75, angle: 0 } } } },

    { command: "service.call", args: { service: "building-factory", method: "list", arguments: [] } },
    { command: "service.call", args: { service: "building-navigation", method: "list", arguments: [] } },
    { command: "service.call", args: { service: "navigation", method: "availableTargets", arguments: ["builder-175"] } },

    { command: "service.call", args: { service: "map", method: "locationAt", arguments: [{ x: -110, y: 0, z: -75 }] } },
    { command: "service.call", args: { service: "map", method: "surfaceAt", arguments: [{ x: -110, y: 0, z: -75 }] } },
    { command: "service.call", args: { service: "map", method: "acousticProfileAt", arguments: [{ x: -110, y: 0, z: -75 }] } },
    { command: "service.call", args: { service: "map", method: "acousticOcclusionBetween", arguments: [{ x: -110, y: 0, z: -75 }, { x: -110, y: 0, z: -63 }] } },

    { command: "service.call", args: { service: "map", method: "locationAt", arguments: [{ x: -182, y: 0, z: 95 }] } },
    { command: "service.call", args: { service: "map", method: "acousticProfileAt", arguments: [{ x: -182, y: 0, z: 95 }] } },
    { command: "service.call", args: { service: "map", method: "locationAt", arguments: [{ x: -168, y: 0, z: 95 }] } },
    { command: "service.call", args: { service: "map", method: "acousticProfileAt", arguments: [{ x: -168, y: 0, z: 95 }] } },

    { command: "service.call", args: { service: "map", method: "locationAt", arguments: [{ x: 130, y: 0, z: 120 }] } },
    { command: "service.call", args: { service: "map", method: "locationAt", arguments: [{ x: 130, y: 3.2, z: 120 }] } },
    { command: "service.call", args: { service: "map", method: "acousticProfileAt", arguments: [{ x: 130, y: 3.2, z: 120 }] } },
    { command: "service.call", args: { service: "building-navigation", method: "requiredWaypoints", arguments: [{ x: 130, y: 3.2, z: 120 }, { x: 150, y: 0, z: 120 }] } },
    { command: "service.call", args: { service: "building-navigation", method: "requiredWaypoints", arguments: [{ x: 150, y: 0, z: 120 }, { x: 130, y: 3.2, z: 120 }] } },

    { command: "service.call", args: { service: "match-api", method: "snapshotFor", arguments: ["builder-175", START + 100] } }
  ] },
  requestedAt: "2026-08-29T20:58:00+03:00"
});